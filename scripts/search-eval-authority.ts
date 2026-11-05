// Find a course: the town in a query is the one in the user's maritime
// authority's country, not the phone's region. A UK seafarer (MCA) on a phone
// set to the US typing "eng 1 falmouth" means Falmouth, Cornwall. With no
// authority the phone's region still decides.
//   npx tsx scripts/search-eval-authority.ts      (exits 1 if any check fails)
// Before the fix (2026-11-05) the MCA-on-a-US-phone cases found Florida doctors.
import { searchProviders, searchHomeCountry } from '@/utils/providerSearch';
import { TRAINING_PROVIDERS_JSON } from '@/backend/src/data/training-providers';
const list = JSON.parse(TRAINING_PROVIDERS_JSON).providers as any[];

// [query, authority, phone region, country the top result must be in]
const CASES: [string, string | null, string | null, string][] = [
  ['eng 1 falmouth', 'mca', 'US', 'GB'],
  ['eng1 falmouth', 'mca', 'US', 'GB'],
  ['falmouth', 'mca', 'US', 'GB'],
  ['eng 1 falmouth', 'mca', 'GB', 'GB'],
  ['eng 1 falmouth', 'mca', null, 'GB'],
  // No authority: the phone's region decides, as before
  ['eng 1 falmouth', null, 'GB', 'GB'],
  ['eng 1 falmouth', null, 'US', 'US'],
  // A USCG seafarer on a UK phone means Falmouth, Massachusetts
  ['eng 1 falmouth', 'uscg', 'GB', 'US'],
];

let fail = 0;
const unit: [string | null, string | null, string | null][] = [
  ['mca', 'US', 'GB'], ['MCA', 'US', 'GB'], ['uscg', 'GB', 'US'], ['amsa', 'GB', 'AU'], ['mnz', null, 'NZ'],
  ['samsa', 'GB', 'ZA'], [null, 'us', 'US'], [null, null, null], ['unknown', 'FR', 'FR'],
];
for (const [a, r, want] of unit) {
  const got = searchHomeCountry(a, r);
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} searchHomeCountry(${a}, ${r}) = ${got} (want ${want})`);
}
for (const [q, authority, region, want] of CASES) {
  const homeCountry = searchHomeCountry(authority, region);
  const hits = searchProviders(list, { query: q, course: null, sector: null, approval: null, origin: null, radiusKm: null, homeCountry });
  const top = hits[0]?.provider;
  const ok = !!top && top.country === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} "${q}" authority ${authority ?? '-'} phone ${region ?? '-'}: ${hits.length} rows, top ${top ? `${top.name} (${top.city}, ${top.country})` : 'none'} ${hits[0]?.distanceKm != null ? `${Math.round(hits[0].distanceKm)} km` : ''}`);
}
console.log(`\nauthority pass: ${unit.length + CASES.length - fail}/${unit.length + CASES.length}`);
process.exit(fail ? 1 : 0);
