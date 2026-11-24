-- READ ONLY. Overlapping / duplicate AIS-detected ("Movement detected") entries per vessel.
-- One row per overlapping pair; category says what the proposed cleanup does with it.
--   duplicate_start  : same vessel, same start_time (Sealion pattern)        -> later-created copies rejected
--   midnight_overlap : both open, later entry starts inside earlier one and
--                      runs past it, overlap <= 3 h (day-split pattern)        -> later entry trimmed to start at earlier end
--   contained_open   : open entry wholly inside another open one             -> manual review
--   confirmed        : either side confirmed / off_board                     -> manual review (user has signed off)
with e as (
  select * from sea_time_entries
  where status <> 'rejected' and end_time is not null and notes like 'Movement detected%'
), p as (
  select e1.user_id, e1.vessel_id,
    e1.id earlier_id, e1.status earlier_status, e1.start_time earlier_start, e1.end_time earlier_end, e1.created_at earlier_created,
    e2.id later_id,   e2.status later_status,   e2.start_time later_start,   e2.end_time later_end,   e2.created_at later_created,
    round((extract(epoch from (least(e1.end_time, e2.end_time) - e2.start_time)) / 3600)::numeric, 2) overlap_h
  from e e1 join e e2
    on e1.vessel_id = e2.vessel_id and e1.id <> e2.id
   and (e1.start_time, e1.created_at, e1.id) < (e2.start_time, e2.created_at, e2.id)
   and e2.start_time < e1.end_time
)
select u.email, v.vessel_name,
  case
    when earlier_status not in ('pending','checking') or later_status not in ('pending','checking') then 'confirmed'
    when earlier_start = later_start then 'duplicate_start'
    when later_end > earlier_end and overlap_h <= 3 then 'midnight_overlap'
    else 'contained_open'
  end category,
  p.*
from p join "user" u on u.id = p.user_id join vessels v on v.id = p.vessel_id
order by category, u.email, earlier_start;
