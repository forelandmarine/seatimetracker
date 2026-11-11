// Seed vessel_index (2.5.0 vessel lookup) from the vessels users have added:
// name (AIS name if known), MMSI, IMO, length, type, flag, call sign. One row per
// MMSI. Safe to run twice: existing index rows are only gap-filled (source
// 'vessels' never overwrites a web or Datalastic row's details).
// Needs 2026-11-11_vessel_index.sql applied first.
//
// Dry run by default: prints what it would do and writes nothing.
//   TZ=UTC DATABASE_URL=... npx tsx scripts/seed-vessel-index.ts
//   TZ=UTC DATABASE_URL=... npx tsx scripts/seed-vessel-index.ts --apply
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { upsertVesselIndex } from '../src/services/vesselIndex.js';
import { cleanVesselName, isImo, isShipMmsi } from '../src/utils/vesselLookup.js';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Nothing done.');
  process.exit(1);
}

const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client);
const logger = { warn: (o: any, m?: string) => console.warn(m ?? '', o?.err?.message ?? '') };

try {
  const table = await client`select to_regclass('public.vessel_index') as t`;
  if (!table[0]?.t) {
    console.error('vessel_index does not exist. Apply backend/src/db/manual-migrations/2026-11-11_vessel_index.sql first.');
    process.exit(1);
  }

  const vessels = await client`
    select distinct on (mmsi) mmsi, vessel_name, ais_name, imo_number, callsign, flag, type, length_metres
    from vessels
    where mmsi ~ '^[0-9]{9}$'
    order by mmsi, (ais_name is not null) desc, (imo_number is not null) desc
  `;
  const existing = new Set((await client`select mmsi from vessel_index`).map((r) => String(r.mmsi)));

  let added = 0, filled = 0, skipped = 0;
  for (const v of vessels) {
    const mmsi = String(v.mmsi);
    const name = cleanVesselName(String(v.ais_name || v.vessel_name || ''));
    if (!isShipMmsi(mmsi) || !name) { skipped++; continue; }
    const imo = String(v.imo_number ?? '').replace(/\D/g, '');
    const row = {
      mmsi,
      name,
      imo: isImo(imo) ? imo : null,
      call_sign: v.callsign ?? null,
      flag: v.flag ?? null,
      type: v.type ?? null,
      length_m: v.length_metres != null ? Number(v.length_metres) : null,
      source: 'vessels' as const,
    };
    if (existing.has(mmsi)) filled++; else added++;
    if (APPLY) {
      const ok = await upsertVesselIndex(db as any, row, 'vessels', logger);
      if (!ok) console.warn(`Not saved: ${mmsi} ${name}`);
    } else if (added + filled <= 20) {
      console.log(`${existing.has(mmsi) ? 'fill' : 'add '} ${mmsi} ${name}${row.imo ? ` IMO ${row.imo}` : ''}${row.length_m ? ` ${row.length_m} m` : ''}`);
    }
  }
  console.log(`${APPLY ? 'APPLIED' : 'DRY RUN'}: ${vessels.length} distinct MMSIs in vessels; ${added} new, ${filled} already indexed (gap-filled), ${skipped} skipped.`);
} finally {
  await client.end();
}
