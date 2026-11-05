// Find a course, a pass as a crew member starting out in Australia: first
// domestic tickets (GPH, Coxswain, Marine Engine Driver, Master <24 m) around
// Sydney, the Gold Coast, Cairns, the Whitsundays, Perth, Darwin and Hobart, the
// STCW and superyacht side, and the step up. Phone set to Australia, AMSA user.
// Each search runs twice: with no approval filter, and with the filter the
// screen starts on for an AMSA user opening Find a course without a course.
//   npx tsx scripts/search-eval-australia.ts   (exits 1 if any query fails)
import { searchProviders, defaultApproval, hiddenByApproval, type Provider } from '@/utils/providerSearch';
import { TRAINING_PROVIDERS_JSON } from '@/backend/src/data/training-providers';

const list: Provider[] = JSON.parse(TRAINING_PROVIDERS_JSON).providers;
const PLACES: Record<string, [number, number]> = {
  sydney: [-33.87, 151.21], brisbane: [-27.47, 153.03], 'gold coast': [-27.97, 153.4], cairns: [-16.92, 145.77], 'airlie beach': [-20.27, 148.72],
  whitsundays: [-20.27, 148.72], fremantle: [-32.05, 115.75], perth: [-31.95, 115.86], broome: [-17.96, 122.24], darwin: [-12.46, 130.84],
  hobart: [-42.88, 147.33], melbourne: [-37.81, 144.96], adelaide: [-34.93, 138.6], qld: [-27.47, 153.03], 'western australia': [-31.95, 115.86],
  australia: [-27.97, 153.4], townsville: [-19.26, 146.82],
};
const STCW_AU = ['amsa_cst', 'pst', 'fpff', 'efa', 'pssr'];
const COX = ['amsa_coxswain_g1', 'amsa_coxswain_g2', 'amsa_coxswain_g3'];

type How = 'near' | undefined;
const STAGES: [string, [string, string[], How?][]][] = [
  ['1 Starting out in Sydney', [
    ['deckhand course sydney', ['amsa_gph'], 'near'], ['general purpose hand sydney', ['amsa_gph'], 'near'], ['gph course', ['amsa_gph']],
    ['elements of shipboard safety', ['amsa_shipboard_safety']], ['shipboard safety skill set', ['amsa_shipboard_safety']],
    ['sea safety course sydney', ['amsa_shipboard_safety', 'amsa_cst', 'pst', 'rya_sea_survival'], 'near'], ['marine radio licence', ['amsa_vhf', 'amsa_vhf_hf', 'src', 'nz_maritime_vhf']],
    ['mrovcp sydney', ['amsa_vhf'], 'near'], ['first aid course sydney', ['efa', 'rya_first_aid', 'marine_first_aid', 'mfa', 'amsa_mecc'], 'near'],
  ]],
  ['2 First commercial tickets, Brisbane and the Gold Coast', [
    ['coxswain grade 3 gold coast', ['amsa_coxswain_g3'], 'near'], ['cox 3 brisbane', ['amsa_coxswain_g3'], 'near'], ['coxswain gold coast', COX, 'near'],
    ['marine engine driver 3 brisbane', ['amsa_med3'], 'near'], ['med 3 qld', ['amsa_med3'], 'near'], ['stcw basic gold coast', STCW_AU, 'near'],
    ['certificate of safety training', ['amsa_cst']], ['cst course brisbane', ['amsa_cst'], 'near'],
  ]],
  ['3 Reef and tourism jobs: Cairns and the Whitsundays', [
    ['coxswain cairns', COX, 'near'], ['gph airlie beach', ['amsa_gph'], 'near'], ['master 24m cairns', ['amsa_master_24m'], 'near'], ['med 2 whitsundays', ['amsa_med2'], 'near'],
    ['boat skipper course whitsundays', ['amsa_master_24m', 'amsa_coxswain_g1', 'day_skipper', 'coastal_skipper'], 'near'], ['coxswain townsville', COX, 'near'],
  ]],
  ['4 West and north: Perth, Fremantle, Broome, Darwin', [
    ['master 24 metres fremantle', ['amsa_master_24m'], 'near'], ['coxswain darwin', COX, 'near'], ['cox 1 broome', ['amsa_coxswain_g1'], 'near'], ['gph perth', ['amsa_gph'], 'near'],
    ['marine engine driver western australia', ['amsa_med1', 'amsa_med2', 'amsa_med3'], 'near'],
  ]],
  ['5 Stepping up', [
    ['master 45m hobart', ['amsa_master_45m'], 'near'], ['master less than 45 m', ['amsa_master_45m']], ['med 1 melbourne', ['amsa_med1'], 'near'], ['mrocp adelaide', ['amsa_vhf_hf'], 'near'],
    ['amsa revalidation', ['amsa_continued_competence']], ['stcw refresher australia', ['amsa_continued_competence', 'stcw_basic_refresher'], 'near'], ['gmdss australia', ['gmdss_goc', 'gmdss_roc', 'lrc'], 'near'],
    ['ecdis sydney', ['ecdis'], 'near'], ['watchkeeper deck', ['amsa_watchkeeper_deck', 'mnz_watchkeeper_deck', 'mnz_watchkeeper_deck_nc500']], ['engineer watchkeeper', ['amsa_engineer_watchkeeper']],
    ['integrated rating course', ['amsa_integrated_rating', 'amsa_chief_integrated_rating', 'mnz_integrated_rating']], ['advanced fire fighting australia', ['aff'], 'near'], ['medical care australia', ['medical_care'], 'near'],
  ]],
  ['6 The superyacht side from Australia', [
    ['superyacht crew course australia', ['yacht_rating', 'iyt_superyacht_crew', 'iyt_superyacht_deck_crew', 'iyt_international_crew', 'amsa_gph'], 'near'],
    ['rya competent crew sydney', ['competent_crew'], 'near'], ['yachtmaster sydney', ['ym_coastal', 'ym_offshore', 'ym_ocean', 'ym_offshore_sb', 'ym_ocean_sb'], 'near'],
    ['powerboat level 2 gold coast', ['powerboat_l2'], 'near'], ['eng1 australia', ['eng1'], 'near'], ['eng1 brisbane', ['eng1'], 'near'], ['pdsd australia', ['dsd'], 'near'],
  ]],
];

const km = (a: [number, number], p: Provider) => {
  if (p.lat == null || p.lng == null) return Infinity;
  const r = (d: number) => (d * Math.PI) / 180;
  const x = Math.sin(r(p.lat - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(p.lat)) * Math.sin(r(p.lng - a[1]) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
const placeIn = (q: string) => Object.keys(PLACES).sort((a, b) => b.length - a.length).find((k) => q.toLowerCase().includes(k));
const screenDefault = defaultApproval(list, null, 'amsa');

function judge(q: string, codes: string[], how: How, approval: string | null) {
  const hits = searchProviders(list, { query: q, course: null, sector: null, approval, origin: null, radiusKm: null, homeCountry: 'AU' });
  // With a filter on, the right answers are the ones it lets through; the rest must be signposted.
  const truthAll = list.filter((p) => p.courses.some((c) => codes.includes(c)));
  const truth = approval ? truthAll.filter((p) => p.approvals.includes(approval)) : truthAll;
  const top = hits.slice(0, 10);
  const near = how === 'near' ? PLACES[placeIn(q)!] : undefined;
  const nearest = near ? Math.min(...truth.map((p) => km(near, p))) : 0;
  const good = top.filter((h) => truth.some((t) => t.id === h.provider.id)).length;
  const p10 = top.length ? good / Math.min(top.length, Math.max(truth.length, 1)) : 0;
  const recall = !near ? hits.filter((h) => truth.some((t) => t.id === h.provider.id)).length / Math.max(truth.length, 1) : 1;
  const firstKm = near && hits[0] ? km(near, hits[0].provider) : 0;
  // A whole country (first run used a Gold Coast point for "australia"): the first row just has to be in it.
  const country = placeIn(q) === 'australia';
  // A state: the first row has to be in that state.
  const state = ({ qld: 'QLD', 'western australia': 'WA' } as Record<string, string>)[placeIn(q) ?? ''];
  const firstOk =
    !near ||
    (country
      ? hits[0]?.provider.country === 'AU' || nearest > 4000
      : state
        ? hits[0]?.provider.region === state
        : firstKm <= Math.max(60, nearest + 30));
  const found = hits.length > 0 && truth.length > 0 && p10 >= 0.8 && recall >= 0.8 && firstOk;
  // Nothing the filter allows: fine if the screen says what it hides (the banner when empty, the count line otherwise).
  const told = approval != null && truthAll.length > truth.length && (hits.length === 0 || hiddenByApproval(list, { query: q, course: null, sector: null, approval, origin: null, radiusKm: null, homeCountry: 'AU' }) > 0);
  const ok = found || (truth.length === 0 && told);
  const note =
    `${hits.length} rows  top10 ${(p10 * 100).toFixed(0)}%  recall ${(recall * 100).toFixed(0)}%` +
    (near ? `  first ${Math.round(firstKm)} km (nearest right answer ${Math.round(nearest)} km)` : '') +
    (ok ? '' : `  | ${top.slice(0, 3).map((h) => h.provider.name.slice(0, 24)).join('; ')}`);
  return { ok, note };
}

let pass = 0;
let passDefault = 0;
let total = 0;
for (const [stage, qs] of STAGES) {
  console.log(`\n## ${stage}`);
  for (const [q, codes, how] of qs) {
    total++;
    const a = judge(q, codes, how, null);
    const b = judge(q, codes, how, screenDefault);
    if (a.ok) pass++;
    if (b.ok) passDefault++;
    console.log(`${a.ok ? 'PASS' : 'FAIL'} ${JSON.stringify(q).padEnd(42)} ${a.note}`);
    if (!b.ok) console.log(`     with the AMSA default filter: FAIL ${b.note}`);
  }
}
console.log(`\naustralia pass: ${pass}/${total} queries, ${passDefault}/${total} with the screen's AMSA default (${screenDefault ?? 'none'})`);
if (pass < total || passDefault < total) process.exit(1);
