// Runs the MSN 1837 Annex 1 sweep fixture through the classifier and prints a pass/fail table.
//   npx tsx scripts/harbour-areas/run-sweep.ts [--fail] [--md=out.md]
import fs from 'node:fs';
import { createClassifierFromFiles } from '../../src/utils/seaAreas/load.js';

type Row = { area: string; expect: string; season: 'summer' | 'winter' | 'any'; lat: number; lon: number; source: string; uncertain?: string };
const rows: Row[] = JSON.parse(fs.readFileSync('tests/fixtures/msn1837-sweep.json', 'utf8'));
const c = createClassifierFromFiles();
const onlyFail = process.argv.includes('--fail');
const md = process.argv.find((a) => a.startsWith('--md='))?.slice(5);

let pass = 0;
const lines: string[] = ['| Annex 1 area | Point | Season | Expected | Got | Basis |', '|---|---|---|---|---|---|'];
for (const r of rows) {
  const seasons = r.season === 'any' ? (['summer', 'winter'] as const) : [r.season];
  for (const season of seasons) {
    const res = c.classifyPoint({ lat: r.lat, lon: r.lon }, { season });
    const got = res.areaCategory ?? (res.atSea ? 'none' : 'unclassified');
    const ok = got === r.expect;
    if (ok) pass++;
    if (!ok || !onlyFail) {
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.area.padEnd(52)} ${season.padEnd(6)} want ${r.expect.padEnd(4)} got ${got.padEnd(12)} ${r.lat},${r.lon}  ${res.basis}`);
    }
    lines.push(`| ${r.area} | ${r.lat}, ${r.lon} | ${season} | ${r.expect} | ${ok ? got : `**${got}**`} | ${res.basis} |`);
  }
}
const total = lines.length - 2;
console.log(`\n${pass}/${total} checks pass`);
if (md) fs.writeFileSync(md, lines.join('\n') + '\n');
