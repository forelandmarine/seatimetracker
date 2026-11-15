-- PROPOSED cleanup of duplicate / overlapping AIS-detected entries (2026-11-15).
-- NOT RUN. Needs Dan's OK. Run in one session; it ends in ROLLBACK so a dry run
-- changes nothing. Read the verification output, then re-run with COMMIT.
-- Only open entries (pending / checking) are touched. Confirmed and off-board
-- overlaps are left for manual review (category 'confirmed' in the report).
-- Every row touched is copied to sea_time_entries_backup_20261115 first.

BEGIN;

create or replace function pg_temp.nm(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric) returns numeric
language sql immutable as $$
  select round((3440.065 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2))))::numeric, 2)
$$;

-- Recompute duration, distance, MCA flag and stationary flag after times/positions change.
create or replace function pg_temp.recalc(ids uuid[]) returns void language sql as $$
  update sea_time_entries set
    duration_hours = round((extract(epoch from (end_time - start_time)) / 3600)::numeric, 2),
    distance_nm = pg_temp.nm(start_latitude::numeric, start_longitude::numeric, end_latitude::numeric, end_longitude::numeric),
    mca_compliant = extract(epoch from (end_time - start_time)) / 3600 >= 4,
    is_stationary = pg_temp.nm(start_latitude::numeric, start_longitude::numeric, end_latitude::numeric, end_longitude::numeric) < 0.5
  where id = any(ids)
$$;

-- ---------------------------------------------------------------------------
-- Snapshot of every open live entry that overlaps another open live entry.
create temp table affected as
select distinct x.id from sea_time_entries x
join sea_time_entries y on y.vessel_id = x.vessel_id and y.id <> x.id
 and y.status in ('pending','checking') and y.end_time is not null and y.notes like 'Movement detected%'
 and x.start_time < y.end_time and y.start_time < x.end_time
where x.status in ('pending','checking') and x.end_time is not null and x.notes like 'Movement detected%';

create table sea_time_entries_backup_20261115 as
select now() as backed_up_at, s.* from sea_time_entries s where s.id in (select id from affected);

select count(*) as rows_backed_up from sea_time_entries_backup_20261115;

-- ---------------------------------------------------------------------------
-- 1. Stop-then-duplicates pattern, fixed by hand (each guarded on current values).
--    The first passage of the day was wrongly stretched over a stop and the
--    rest of the next passage; give it back its pre-stop end, and give the
--    stolen tail to the longest of the duplicate copies.

-- Sealion, 13 Nov: 47220308 ends at 10:41:48 alongside Gibraltar;
-- c018f9ed (16:42 departure) runs on to 01:49:06 on 14 Nov.
update sea_time_entries s set end_time = a.check_time, end_latitude = a.latitude, end_longitude = a.longitude
from ais_checks a where a.vessel_id = s.vessel_id and s.id = '47220308-87a4-4c1f-8051-fdd1cbc4113e'
  and s.status = 'pending' and s.end_time > '2026-11-14 01:49:00' and s.end_time < '2026-11-14 01:50:00'
  and a.check_time between '2026-11-13 10:41:47' and '2026-11-13 10:41:49';
update sea_time_entries s set end_time = a.check_time, end_latitude = a.latitude, end_longitude = a.longitude
from ais_checks a where a.vessel_id = s.vessel_id and s.id = 'c018f9ed-bc0a-4549-b4e7-09fcc437a2f4'
  and s.status = 'pending' and s.end_time < '2026-11-14 00:17:00'
  and a.check_time between '2026-11-14 01:49:05' and '2026-11-14 01:49:07';

-- MSC Eva, 11 Oct (times UTC): 56fe1bba ends at 03:04:48 (vessel stopped until 09:04);
-- cee95561 (09:04 departure) runs on to 01:56:17 on 12 Oct.
update sea_time_entries s set end_time = a.check_time, end_latitude = a.latitude, end_longitude = a.longitude
from ais_checks a where a.vessel_id = s.vessel_id and s.id = '56fe1bba-e68c-45a1-bd30-41e07e6a6596'
  and s.status = 'pending' and s.end_time > '2026-10-12 01:56:00' and s.end_time < '2026-10-12 01:57:00'
  and a.check_time between '2026-10-11 03:04:47' and '2026-10-11 03:04:49';
update sea_time_entries s set end_time = a.check_time, end_latitude = a.latitude, end_longitude = a.longitude
from ais_checks a where a.vessel_id = s.vessel_id and s.id = 'cee95561-4009-495e-ad1e-ad52532f18fb'
  and s.status = 'pending' and s.end_time < '2026-10-11 16:39:00'
  and a.check_time between '2026-10-12 01:56:16' and '2026-10-12 01:56:18';

select pg_temp.recalc(array['47220308-87a4-4c1f-8051-fdd1cbc4113e','c018f9ed-bc0a-4549-b4e7-09fcc437a2f4',
                            '56fe1bba-e68c-45a1-bd30-41e07e6a6596','cee95561-4009-495e-ad1e-ad52532f18fb']::uuid[]);

-- ---------------------------------------------------------------------------
-- 2. Same vessel + same start_time copies: keep the one that ends latest,
--    reject the rest (Sealion x3, MSC Eva x3, Traiano Knutsen x3 today).
with ranked as (
  select id, row_number() over (partition by vessel_id, start_time order by end_time desc, created_at desc) rn
  from sea_time_entries
  where status in ('pending','checking') and notes like 'Movement detected%' and end_time is not null
)
update sea_time_entries s set status = 'rejected'
from ranked r where r.id = s.id and r.rn > 1
returning s.id, s.vessel_id, s.start_time, s.end_time, 'rejected_duplicate' as action;

-- ---------------------------------------------------------------------------
-- 3. Midnight overlaps: an open entry that starts inside an earlier open entry
--    and runs on past it starts instead where the earlier one ends, from that
--    end position. Contained entries (not trimmed by this) are listed below.
create temp table trims as
select e2.id, max(e1.end_time) as new_start
from sea_time_entries e1
join sea_time_entries e2 on e2.vessel_id = e1.vessel_id and e2.id <> e1.id
 and e2.start_time >= e1.start_time and e2.start_time < e1.end_time and e2.end_time > e1.end_time
 and (e2.start_time, e2.created_at, e2.id) > (e1.start_time, e1.created_at, e1.id)
where e1.status in ('pending','checking') and e2.status in ('pending','checking')
  and e1.notes like 'Movement detected%' and e2.notes like 'Movement detected%'
  and extract(epoch from (e1.end_time - e2.start_time)) <= 3 * 3600
group by e2.id;

update sea_time_entries s set
  start_time = t.new_start,
  start_latitude = p.end_latitude,
  start_longitude = p.end_longitude
from trims t
join lateral (
  select e1.end_latitude, e1.end_longitude from sea_time_entries e1
  where e1.vessel_id = (select vessel_id from sea_time_entries where id = t.id)
    and e1.end_time = t.new_start and e1.status in ('pending','checking') limit 1
) p on true
where s.id = t.id;

select pg_temp.recalc(array(select id from trims));
select count(*) as trimmed from trims;

-- ---------------------------------------------------------------------------
-- Verification: open live overlaps left (should be only manual-review cases).
select u.email, v.vessel_name, e1.id earlier, e1.start_time, e1.end_time, e2.id later, e2.start_time, e2.end_time
from sea_time_entries e1
join sea_time_entries e2 on e2.vessel_id = e1.vessel_id and e2.id <> e1.id
 and (e1.start_time, e1.created_at, e1.id) < (e2.start_time, e2.created_at, e2.id) and e2.start_time < e1.end_time
join "user" u on u.id = e1.user_id join vessels v on v.id = e1.vessel_id
where e1.status in ('pending','checking') and e2.status in ('pending','checking')
  and e1.notes like 'Movement detected%' and e2.notes like 'Movement detected%'
order by 1, 4;

-- Sealion and MSC Eva after the fix
select id, status, start_time, end_time, duration_hours, distance_nm from sea_time_entries
where vessel_id in (select vessel_id from sea_time_entries where id in ('47220308-87a4-4c1f-8051-fdd1cbc4113e','56fe1bba-e68c-45a1-bd30-41e07e6a6596'))
  and (start_time between '2026-11-13' and '2026-11-15' or start_time between '2026-10-10' and '2026-10-13')
order by start_time, status;

ROLLBACK;  -- change to COMMIT once Dan has approved the dry-run output
-- Undo after a COMMIT: restore from sea_time_entries_backup_20261115 (all columns), then drop it.
