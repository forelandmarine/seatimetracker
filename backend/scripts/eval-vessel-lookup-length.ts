/**
 * Live eval for the vessel lookup length fallback. Makes ONE real Datalastic
 * vessel_find per case (name + length window: about 1 credit per row returned)
 * and runs the search flow with an index that only holds the wrong-length rows.
 *
 *   DATALASTIC_API_KEY=... npx bun scripts/eval-vessel-lookup-length.ts
 *
 * Case 1 is the 24 Nov 2026 trial cancellation: YOLO at 39.63 m must give
 * MMSI 339331000 (40 m, Jamaica) first.
 */
import { runVesselLookup } from '../src/services/vesselLookupSearch.js';
import { findVesselsByNameAndLength } from '../src/services/vesselFind.js';
import type { RawCandidate } from '../src/utils/vesselLookup.js';

const log = { warn: (o: any, m?: string) => console.warn(m, o), info: () => {} };

const CASES: { name: string; lengthM: number; index: RawCandidate[]; expectFirst: string }[] = [
  {
    name: 'YOLO',
    lengthM: 39.63,
    index: [
      { mmsi: '319123400', name: 'YOLO', flag_iso: 'KY', length_m: 34.11, source: 'web' },
      { mmsi: '225123400', name: 'YOLO', flag_iso: 'ES', length_m: 20, source: 'web' },
      { mmsi: '268123400', name: 'YOLO', flag_iso: 'SM', length_m: 12, source: 'web' },
      { mmsi: '428123400', name: 'YOLO', flag_iso: 'IL', length_m: 11, source: 'web' },
      { mmsi: '367123400', name: 'YOLO', flag_iso: 'US', length_m: 11, source: 'web' },
    ],
    expectFirst: '339331000',
  },
];

let failed = 0;
for (const c of CASES) {
  let credits = 0;
  const res = await runVesselLookup(
    { typedName: c.name, length: c.lengthM, unit: 'm', lengthMetres: c.lengthM, limit: 5 },
    {
      searchOwn: async () => c.index,
      searchWeb: async () => ({ status: 'no', rows: [], fresh: false }),
      findByLength: async () => {
        const r = await findVesselsByNameAndLength(c.name, c.lengthM, log);
        credits = r.rows.length;
        return { status: r.status === 'ok' ? 'yes' : r.status, rows: r.rows };
      },
      save: async () => {},
    },
  );
  const first = res.candidates[0]?.mmsi;
  const ok = first === c.expectFirst;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name} ${c.lengthM} m: first ${first} (want ${c.expectFirst}), find=${res.find}, ~${credits} credit(s)`);
  for (const v of res.candidates) console.log(`   ${v.mmsi}  ${v.name}  ${v.length_metres ?? '?'} m  ${v.flag_iso ?? ''}  ${v.source}`);
}
process.exit(failed ? 1 : 0);
