// One-off backfill for 2.5.0 workboat sea areas.
//
// For commercial-sector work (vessel commercial, workboat or tug, or the user chose
// the commercial sector) since 2026-10-20, when the classifier went live:
//   1. Re-classify the AIS fixes with the 2.5.0 classifier (tidal only in UK waters,
//      'sea' for fixes at sea, harbour-edge snapping, Barrow/Leith/Ardrossan areas,
//      Morecambe Bay summer-only, and the Annex 1 harbour, inland and WFD fixes in
//      harbour-overrides.geojson).
//   2. Roll each entry's fixes up onto sea_time_entries.area_category, is_tidal and
//      is_categorised_water (most exposed wins: sea > D > C > B > A).
// Confirmed entries that already have values (a user correction) are left alone.
//
// Dry run by default: prints what would change and writes nothing.
//   TZ=UTC DATABASE_URL=... npx tsx scripts/backfill-entry-sea-areas.ts
//   TZ=UTC DATABASE_URL=... npx tsx scripts/backfill-entry-sea-areas.ts --apply
// Options: --since=YYYY-MM-DD (default 2026-10-20)
import postgres from 'postgres';
import { createClassifierFromFiles } from '../src/utils/seaAreas/load.js';
import { seasonForDate } from '../src/utils/seaAreas/areaClassification.js';
import { aggregateFixClassifications } from '../src/utils/seaAreas/aggregate.js';

const APPLY = process.argv.includes('--apply');
const since = process.argv.find((a) => a.startsWith('--since='))?.slice(8) ?? '2026-10-20';
if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error(`Bad --since: ${since}`);
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Nothing done.');
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });
const classifier = createClassifierFromFiles();


// Everything runs in one transaction. A dry run's is READ ONLY (Supabase's transaction pooler
// drops session settings, so it has to be per transaction), so it cannot write even by mistake.
try {
  await sql.begin(APPLY ? 'read write' : 'read only', async (tx) => {
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: commercial work since ${since}`);
  const COMMERCIAL = tx`(v.sector = 'commercial' or v.is_workboat = true or v.is_tug = true or u.vessel_sector = 'commercial')`;
  if (!APPLY) console.log('transaction read only:', (await tx`show transaction_read_only`)[0].transaction_read_only);

  const entries = await tx<{
    id: string; vessel_id: string; start_time: Date; end_time: Date | null; status: string;
    area_category: string | null; is_tidal: boolean | null; is_categorised_water: boolean | null;
  }[]>`
    select e.id, e.vessel_id, e.start_time, e.end_time, e.status, e.area_category, e.is_tidal, e.is_categorised_water
    from sea_time_entries e
    join vessels v on v.id = e.vessel_id
    left join "user" u on u.id = e.user_id
    where e.start_time >= ${since}::date and e.status <> 'rejected' and ${COMMERCIAL}
    order by e.start_time`;
  const vesselIds = [...new Set(entries.map((e) => e.vessel_id))];
  console.log(`entries: ${entries.length} on ${vesselIds.length} vessels`);
  if (entries.length === 0) return;

  // 1. Re-classify fixes
  const fixes = await tx<{ id: string; vessel_id: string; check_time: Date; latitude: string | null; longitude: string | null; area_category: string | null; is_tidal: boolean | null; season: string | null }[]>`
    select id, vessel_id, check_time, latitude, longitude, area_category, is_tidal, season
    from ais_checks
    where vessel_id in ${tx(vesselIds)} and check_time >= ${since}::date
      and latitude is not null and longitude is not null`;
  const fixChanges: { id: string; area_category: string | null; is_tidal: boolean | null; season: string }[] = [];
  const byVessel = new Map<string, typeof fixes>();
  for (const f of fixes) {
    const lat = Number(f.latitude);
    const lon = Number(f.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const r = classifier.classifyPoint({ lat, lon }, { date: f.check_time });
      const next = { area_category: r.areaCategory ?? (r.atSea ? 'sea' : null), is_tidal: r.isTidal, season: seasonForDate(f.check_time) };
      if (next.area_category !== f.area_category || next.is_tidal !== f.is_tidal || next.season !== f.season) {
        fixChanges.push({ id: f.id, ...next });
      }
      Object.assign(f, next);
    }
    const list = byVessel.get(f.vessel_id) ?? [];
    list.push(f);
    byVessel.set(f.vessel_id, list);
  }
  console.log(`fixes: ${fixes.length} read, ${fixChanges.length} change`);

  // 2. Roll up entries
  const entryChanges: { id: string; area_category: string | null; is_tidal: boolean | null; is_categorised_water: boolean | null }[] = [];
  let kept = 0;
  for (const e of entries) {
    if (e.status === 'confirmed' && (e.area_category != null || e.is_tidal != null)) {
      kept++;
      continue;
    }
    const start = e.start_time.getTime();
    const end = (e.end_time ?? e.start_time).getTime();
    const inWindow = (byVessel.get(e.vessel_id) ?? []).filter((f) => {
      const t = f.check_time.getTime();
      return t >= start && t <= end;
    });
    const agg = aggregateFixClassifications(inWindow);
    if (agg.area_category === null && agg.is_tidal === null && agg.is_categorised_water === null) continue;
    if (agg.area_category !== e.area_category || agg.is_tidal !== e.is_tidal || agg.is_categorised_water !== e.is_categorised_water) {
      entryChanges.push({ id: e.id, ...agg });
    }
  }
  const tally: Record<string, number> = {};
  for (const c of entryChanges) tally[`${c.area_category ?? 'none'}/${c.is_tidal ?? 'null'}`] = (tally[`${c.area_category ?? 'none'}/${c.is_tidal ?? 'null'}`] ?? 0) + 1;
  console.log(`entries: ${entryChanges.length} change, ${kept} confirmed with values kept`);
  console.log('new entry values (area/tidal):', tally);
  console.log('sample:', entryChanges.slice(0, 5));

  if (!APPLY) {
    console.log('Dry run: nothing written. Re-run with --apply to write.');
  } else {
    for (const c of fixChanges) {
      await tx`update ais_checks set area_category = ${c.area_category}, is_tidal = ${c.is_tidal}, season = ${c.season} where id = ${c.id}`;
    }
    for (const c of entryChanges) {
      await tx`update sea_time_entries set area_category = ${c.area_category}, is_tidal = ${c.is_tidal}, is_categorised_water = ${c.is_categorised_water} where id = ${c.id}`;
    }
    console.log(`Written: ${fixChanges.length} fixes, ${entryChanges.length} entries.`);
  }
  });
} finally {
  await sql.end();
}
