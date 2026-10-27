// Finds which providers' dates pages carry machine-readable dates (schema.org
// Event / CourseInstance JSON-LD) and writes src/data/course-date-sources.json.
//   npx tsx scripts/probe-course-dates.ts "<.../2.4.0 Additions/providers/merged-directory.json>"
// One request per provider, 1.5 s apart.
import fs from 'fs';
import { parseJsonLd } from '../src/services/courseDates.js';

const dir = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) as { id: string; datesUrl: string | null; website: string | null }[];
const UA = 'SeaTimeTrackerCourseDates/1.0 (+https://forelandmarine.com; course dates for seafarers)';
const out: { provider_id: string; dates_url: string; parser: 'jsonld'; found: number }[] = [];
let n = 0;
for (const p of dir) {
  const url = p.datesUrl;
  if (!url) continue;
  n++;
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const found = parseJsonLd(await res.text(), url).length;
      if (found > 0) out.push({ provider_id: p.id, dates_url: url, parser: 'jsonld', found });
    }
  } catch {
    // unreachable: skip
  }
  if (n % 25 === 0) console.log('probed', n, 'with dates', out.length);
  await new Promise((r) => setTimeout(r, 1500));
}
fs.writeFileSync(new URL('../src/data/course-date-sources.json', import.meta.url), JSON.stringify(out.map(({ found, ...s }) => s), null, 1));
console.log(`probed ${n}; ${out.length} publish machine-readable dates (${out.reduce((a, b) => a + b.found, 0)} upcoming dates)`);
