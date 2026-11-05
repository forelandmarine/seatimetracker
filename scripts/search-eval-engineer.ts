// Find a course, ten passes as one person: a UK yacht engineer working from
// AEC 1 to an unlimited ticket on bigger yachts around the world. Each pass is a
// career stage in a port: what they type, plus the pathway "Find a course" links
// for that stage opened from that port with the MCA default.
//   npx tsx scripts/search-eval-engineer.ts   (exits 1 if any query fails)
import { CHECKLISTS } from '@/constants/courseChecklists';
import { searchProviders, providerCodesFor, type Provider } from '@/utils/providerSearch';
import { TRAINING_PROVIDERS_JSON } from '@/backend/src/data/training-providers';

const list: Provider[] = JSON.parse(TRAINING_PROVIDERS_JSON).providers;
type Place = [number, number, string];
const STCW = ['pst', 'fpff', 'efa', 'pssr', 'stcw_basic_refresher'];
const STCW_UPDATE = ['stcw_basic_refresher', 'pst_refresher', 'fpff_refresher', 'amsa_continued_competence'];
const SV1 = ['sv_eng_marine_diesel', 'sv_eng_aux1', 'sv_eng_aux_equipment_1', 'sv_eng_op_procedures'];
const SV_CE = ['sv_eng_aux2', 'sv_eng_chief_stat_ops', 'sv_eng_applied_me', 'sv_eng_ges'];
// Run 1 also counted OOW-unlimited and cadetship courses here; a III/2 candidate
// coming from SV Chief needs the Chief and Second Engineer programme only.
const UNLTD = ['chief_second_eng_unlimited'];
const ENG_ANY = ['chief_second_eng_unlimited', 'oew_unlimited', 'merch_eng_cadetship', 'sv_eng_marine_diesel', 'sv_eng_aux1', 'sv_eng_aux2', 'sv_eng_op_procedures', 'sv_eng_chief_stat_ops', 'sv_eng_applied_me', 'sv_eng_ges', 'sv_eng_workshop_skills', 'aec1', 'aec2', 'hv_op', 'hv_mgmt', 'erm', 'eto_cadetship'];

interface Pass { n: number; stage: string; at: Place; region: string; pathway?: string; queries: [string, string[], boolean?, string?][] }
// [query, right answers, true = a place is named so the first row must be near it, provider name expected first]
const PASSES: Pass[] = [
  { n: 1, stage: 'Deckhand turning engineer, home in Southampton', at: [50.9, -1.4, 'Southampton'], region: 'GB', queries: [
    ['stcw basic southampton', STCW, true], ['eng1 southampton', ['eng1'], true], ['AEC1', ['aec1']], ['aec 1 course', ['aec1']],
    ['approved engine course hampshire', ['aec1', 'aec2'], true], ['pdsd', ['dsd']], ['rya diesel engine', ['rya_diesel_engine']], ['powerboat 2 solent', ['powerboat_l2'], true],
  ] },
  { n: 2, stage: 'Junior engineer on a 40 m, Palma', at: [39.57, 2.65, 'Palma'], region: 'GB', pathway: 'meol-sv', queries: [
    ['aec 2 palma', ['aec2'], true], ['AEC2', ['aec2']], ['MEOL', ['aec1', 'aec2']], ['meol y4 palma', ['aec1', 'aec2'], true],
    ['pscrb mallorca', ['pscrb', 'pscrb_otl'], true], ['advanced fire fighting palma', ['aff'], true], ['mfa palma', ['mfa'], true], ['eng1 doctor palma', ['eng1'], true],
  ] },
  { n: 3, stage: 'Third engineer on a 55 m, Antibes, studying for SV EOOW (Y3)', at: [43.58, 7.12, 'Antibes'], region: 'GB', pathway: 'eoow-sv', queries: [
    ['SV EOOW', SV1], ['Y3 engineer', SV1], ['eoow small vessel modules', SV1], ['marine diesel engineering module', ['sv_eng_marine_diesel']],
    ['aux equipment 1', ['sv_eng_aux1', 'sv_eng_aux_equipment_1']], ['operational procedures hotel services', ['sv_eng_op_procedures']], ['helm operational antibes', ['helm_op'], true],
    ['high voltage operational', ['hv_op']], ['workshop skills training', ['sv_eng_workshop_skills', 'ews']],
  ] },
  { n: 4, stage: 'Winter in Fort Lauderdale before an Atlantic crossing', at: [26.12, -80.14, 'Fort Lauderdale'], region: 'GB', queries: [
    ['eng1 fort lauderdale', ['eng1'], true], ['stcw refresher florida', STCW_UPDATE, true], ['fire fighting refresher fort lauderdale', ['fpff_refresher', 'aff_refresher', 'stcw_basic_refresher'], true],
    ['pscrb refresher', ['pscrb_refresher', 'pscrb_otl_refresher']], ['medical first aid florida', ['mfa'], true], ['ERM', ['erm', 'uscg_erm']], ['engine room resource management', ['erm', 'uscg_erm']],
  ] },
  { n: 5, stage: 'Caribbean season, Antigua', at: [17.0, -61.76, 'Antigua'], region: 'GB', queries: [
    ['eng1 antigua', ['eng1'], true], ['first aid antigua', ['efa', 'mfa', 'rya_first_aid', 'marine_first_aid'], true], ['stcw caribbean', STCW, true],
    ['sea survival refresher st maarten', ['pst_refresher', 'stcw_basic_refresher', 'pst'], true],
  ] },
  { n: 6, stage: 'Pacific season, Tahiti then Auckland refit', at: [-36.85, 174.76, 'Auckland'], region: 'GB', queries: [
    ['eng1 auckland', ['eng1'], true], ['eng1 tahiti', ['eng1'], true], ['stcw auckland', STCW, true], ['advanced firefighting new zealand', ['aff'], true],
    ['medical first aid auckland', ['mfa'], true], ['high voltage course nz', ['high_voltage', 'hv_op', 'hv_mgmt', 'marine_hv_authorisation'], true],
  ] },
  { n: 7, stage: 'Second engineer on a 65 m, refit on the Gold Coast', at: [-27.97, 153.4, 'Gold Coast'], region: 'GB', queries: [
    ['eng1 gold coast', ['eng1'], true], ['stcw refresher brisbane', STCW_UPDATE, true], ['high voltage australia', ['high_voltage', 'hv_op', 'hv_mgmt', 'marine_hv_authorisation'], true],
    ['helm management australia', ['helm_mgmt', 'leadership_mgmt'], true], ['aec australia', ['aec1', 'aec2'], true],
  ] },
  { n: 8, stage: 'Asia: Phuket and Singapore', at: [1.29, 103.85, 'Singapore'], region: 'GB', queries: [
    ['eng1 phuket', ['eng1'], true], ['stcw singapore', STCW, true], ['high voltage management singapore', ['hv_mgmt'], true],
    ['helm management singapore', ['helm_mgmt', 'leadership_mgmt'], true], ['ERM singapore', ['erm', 'uscg_erm'], true],
  ] },
  { n: 9, stage: 'Chief on an 80 m via Dubai: SV Chief Engineer (Y2, Y1)', at: [25.08, 55.14, 'Dubai'], region: 'GB', pathway: 'chief-engineer-sv-3000gt', queries: [
    ['aux equipment part 2', ['sv_eng_aux2']], ['chief engineer statutory', ['sv_eng_chief_stat_ops']], ['chief eng stat and ops', ['sv_eng_chief_stat_ops']],
    ['applied marine engineering', ['sv_eng_applied_me']], ['general engineering science', ['sv_eng_ges']], ['GES 1 and 2', ['sv_eng_ges']], ['Y2 engineer', SV_CE], ['y1 modules', SV_CE],
    ['HELM management', ['helm_mgmt']], ['hv management dubai', ['hv_mgmt'], true], ['chief engineer 3000gt', SV_CE], ['eng1 dubai', ['eng1'], true],
  ] },
  { n: 10, stage: 'Back to the UK for the unlimited ticket (III/2 then Chief Unlimited)', at: [54.99, -1.43, 'South Shields'], region: 'GB', queries: [
    ['second engineer unlimited', UNLTD], ['chief engineer unlimited', UNLTD], ['class 1 engineer', UNLTD], ['class 2 motor', UNLTD],
    ['engineering knowledge general', UNLTD], ['EKG motor exam prep', UNLTD], ['workshop skills 3 months', ['sv_eng_workshop_skills', 'ews']],
    ['south shields', [], true], ['warsash engineer', ENG_ANY, false, 'Warsash Maritime'], ['glasgow college engineering', ENG_ANY, false, 'City of Glasgow College'],
    ['hv management south shields', ['hv_mgmt'], true],
  ] },
];

// Place queries name their own place; this is where it is (for scoring only).
const PLACES: Record<string, [number, number]> = {
  southampton: [50.9, -1.4], hampshire: [51.0, -1.3], solent: [50.85, -1.3], palma: [39.57, 2.65], mallorca: [39.57, 2.65], antibes: [43.58, 7.12],
  'fort lauderdale': [26.12, -80.14], florida: [26.12, -80.14], antigua: [17.0, -61.76], caribbean: [17.0, -61.76], 'st maarten': [18.03, -63.05],
  auckland: [-36.85, 174.76], tahiti: [-17.54, -149.57], 'new zealand': [-36.85, 174.76], nz: [-36.85, 174.76], 'gold coast': [-27.97, 153.4], brisbane: [-27.47, 153.03],
  australia: [-27.97, 153.4], phuket: [7.88, 98.39], singapore: [1.29, 103.85], dubai: [25.08, 55.14], 'south shields': [54.99, -1.43],
};
const placeIn = (q: string) => Object.keys(PLACES).filter((k) => q.toLowerCase().includes(k)).sort((a, b) => b.length - a.length)[0];
const km = (a: [number, number], p: Provider) => {
  if (p.lat == null || p.lng == null) return Infinity;
  const r = (d: number) => (d * Math.PI) / 180;
  const x = Math.sin(r(p.lat - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(p.lat)) * Math.sin(r(p.lng - a[1]) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};

let pass = 0;
let total = 0;
for (const ps of PASSES) {
  console.log(`\n## Pass ${ps.n}: ${ps.stage}`);
  for (const [q, codes, placed, name] of ps.queries) {
    total++;
    const near = placed ? PLACES[placeIn(q)] : undefined;
    const hits = searchProviders(list, { query: q, course: null, sector: null, approval: null, origin: null, radiusKm: null, homeCountry: ps.region });
    const truth = list.filter((p) => !codes.length || p.courses.some((c) => codes.includes(c)));
    const nearest = near ? Math.min(...truth.map((p) => km(near, p))) : 0;
    // Where right answers are sparse (thousands of km), allow half as far again.
    const window = Math.max(300, nearest * 1.5 + 100);
    const truthNear = near ? truth.filter((p) => km(near, p) <= window) : truth;
    const top = hits.slice(0, 10);
    const good = top.filter((h) => truthNear.some((t) => t.id === h.provider.id)).length;
    const p10 = top.length ? good / Math.min(top.length, Math.max(truthNear.length, 1)) : 0;
    const recall = codes.length && !near && !name ? hits.filter((h) => truth.some((t) => t.id === h.provider.id)).length / truth.length : 1;
    const firstKm = near && hits[0] ? km(near, hits[0].provider) : 0;
    // A country or state ("australia", "nz") is a big target: near the closest right answer will do.
    const big = near && ['australia', 'new zealand', 'nz', 'caribbean', 'florida'].includes(placeIn(q));
    const firstOk = !near || firstKm <= Math.max(60, big ? nearest * 1.2 + 200 : nearest + 30);
    const nameOk = !name || (hits[0]?.provider.name ?? '').includes(name);
    const ok = hits.length > 0 && (name ? nameOk : p10 >= 0.8 && recall >= 0.8 && firstOk);
    if (ok) pass++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(q).padEnd(42)} ${String(hits.length).padStart(4)} rows  top10 ${(p10 * 100).toFixed(0).padStart(3)}%  recall ${(recall * 100).toFixed(0).padStart(3)}%` +
        (near ? `  first ${Math.round(firstKm)} km (nearest right answer ${Math.round(nearest)} km)` : '') +
        (ok ? '' : `  | ${top.slice(0, 3).map((h) => h.provider.name.slice(0, 26)).join('; ')}`),
    );
  }
  if (ps.pathway) {
    const rows: string[] = [];
    for (const it of CHECKLISTS[ps.pathway].items) {
      if (['manual', 'sea_service', 'prerequisite_coc'].includes(it.type)) continue;
      if (!providerCodesFor(it.code).length) {
        rows.push(`${it.code}: no link (no provider in the directory)`);
        continue;
      }
      const hits = searchProviders(list, { query: '', course: it.code, sector: null, approval: 'mca', origin: { lat: ps.at[0], lng: ps.at[1] }, radiusKm: null, homeCountry: ps.region });
      const d = hits[0]?.distanceKm;
      rows.push(`${it.code}: ${hits.length} MCA providers, nearest ${d == null ? '-' : Math.round(d) + ' km'}${hits[0] ? ` (${hits[0].provider.name.slice(0, 30)}, ${hits[0].provider.city ?? hits[0].provider.countryName})` : ''}`);
    }
    console.log(`  Pathway ${ps.pathway} from ${ps.at[2]}:\n    ${rows.join('\n    ')}`);
  }
}
console.log(`\nengineer passes: ${pass}/${total} queries pass`);
if (pass < total) process.exit(1);
