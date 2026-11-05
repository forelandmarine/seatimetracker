// Find a course, a pass as CTV (crew transfer vessel) crew working out of
// Hull: new deckhand to CTV master, plus the CTV engineer branch and the
// refreshers, with the Workboat Code and master pathway links opened from Hull.
//   npx tsx scripts/search-eval-ctv-hull.ts   (exits 1 if any query fails)
import { CHECKLISTS } from '@/constants/courseChecklists';
import { searchProviders, providerCodesFor, defaultApproval, type Provider } from '@/utils/providerSearch';
import { TRAINING_PROVIDERS_JSON } from '@/backend/src/data/training-providers';

const list: Provider[] = JSON.parse(TRAINING_PROVIDERS_JSON).providers;
const HOME: [number, number] = [53.74, -0.33]; // Hull
const PLACES: Record<string, [number, number]> = {
  hull: HOME, grimsby: [53.57, -0.08], immingham: [53.61, -0.22], humber: [53.7, -0.4], hornsea: [53.91, -0.17], bridlington: [54.08, -0.19],
  'great yarmouth': [52.6, 1.73], lowestoft: [52.48, 1.75], 'east yorkshire': [53.84, -0.43], lincolnshire: [53.2, -0.3],
};
const STCW = ['pst', 'fpff', 'efa', 'pssr', 'stcw_basic_refresher'];
const GWO_BST = ['gwo_bst', 'gwo_bst_refresher', 'gwo_bst_onshore', 'gwo_sea_survival', 'gwo_first_aid', 'gwo_manual_handling', 'gwo_working_at_heights', 'gwo_fire_awareness'];

// First run expected only Master 200 GT prep and Workboat Operations for "ctv master course";
// the Workboat Code nav and radar and stability courses are master requirements too.
type How = 'near' | 'none' | undefined;
const STAGES: [string, [string, string[], How?][]][] = [
  ['1 New CTV deckhand in Hull', [
    ['stcw basic hull', STCW, 'near'], ['gwo bst hull', GWO_BST, 'near'], ['gwo grimsby', GWO_BST.concat(['gwo_art', 'gwo_efa', 'gwo_slinger_signaller', 'gwo_btt', 'gwo_sea_survival_refresher']), 'near'],
    ['eng1 hull', ['eng1'], 'near'], ['ctv deckhand course', ['gwo_bst', 'gwo_sea_survival', 'marine_transfer', 'workboat_ops', 'gwo_bst_refresher']],
    ['crew transfer vessel training hull', ['gwo_bst', 'gwo_sea_survival', 'marine_transfer', 'workboat_ops', 'gwo_bst_refresher'], 'near'],
    ['powerboat level 2 humber', ['powerboat_l2'], 'near'], ['vhf src hull', ['src'], 'near'], ['pdsd hull', ['dsd'], 'near'],
    ['working at heights grimsby', ['gwo_working_at_heights'], 'near'], ['sea survival immingham', ['pst', 'rya_sea_survival', 'gwo_sea_survival', 'offshore_personal_survival'], 'near'],
  ]],
  ['2 Experienced deckhand', [
    ['edh hull', ['edh'], 'near'], ['efficient deck hand', ['edh']], ['pscrb hull', ['pscrb', 'pscrb_otl'], 'near'], ['fast rescue boat', ['frb', 'frb_refresher', 'opito_frc']],
    ['banksman slinger grimsby', ['banksman_slinger', 'gwo_slinger_signaller'], 'near'], ['marine transfer', ['marine_transfer']], ['vessel to turbine transfer', ['marine_transfer']],
    ['1 day firefighting small vessels', ['fpff_1day_small_vessel']], ['gwo advanced rescue', ['gwo_art']],
  ]],
  ['3 Mate', [
    ['yachtmaster offshore hull', ['ym_offshore', 'ym_offshore_sb'], 'near'], ['commercial endorsement', ['rya_ppr', 'rya_commercial_endorsement']],
    ['workboat code stability', ['wbc3_stability']], ['workboat nav and radar', ['wbc3_nav_radar']], ['small ships navigation and radar', ['wbc3_nav_radar']],
    ['stability course humber', ['wbc3_stability', 'master_yachts_stability', 'seafish_stability'], 'near'], ['helm operational hull', ['helm_op'], 'near'],
    ['gmdss roc', ['gmdss_roc']], ['radar course', ['rya_radar', 'radar_arpa_op', 'radar_arpa_mgmt', 'wbc3_nav_radar', 'oow_yachts_nav_radar', 'uscg_radar_observer', 'uscg_arpa']],
  ]],
  ['4 CTV master', [
    ['ctv skipper', ['master_200gt_prep', 'workboat_ops', 'ym_offshore', 'wbc3_nav_radar', 'wbc3_stability']], ['ctv master course', ['master_200gt_prep', 'workboat_ops', 'wbc3_nav_radar', 'wbc3_stability']],
    ['master 200gt workboat', ['master_200gt_prep']], ['master code 200', ['master_200gt_prep']], ['workboat operations module', ['workboat_ops']],
    ['master workboat 500', ['workboat_ops', 'master_500gt_prep']], ['yachtmaster ocean theory hull', ['ym_ocean_sb'], 'near'],
    ['master yachts modules', ['master_yachts_business_law', 'master_yachts_celestial', 'master_yachts_nav', 'master_yachts_seamanship', 'master_yachts_stability']],
    ['helm management hull', ['helm_mgmt'], 'near'], ['gmdss goc', ['gmdss_goc']], ['ecdis hull', ['ecdis'], 'near'], ['medical care hull', ['medical_care'], 'near'],
    ['advanced fire fighting hull', ['aff'], 'near'],
  ]],
  ['5 CTV engineer', [
    ['aec1 hull', ['aec1'], 'near'], ['approved engine course', ['aec1', 'aec2']], ['ctv engineer course', ['aec1', 'aec2', 'sv_eng_marine_diesel', 'sv_eng_op_procedures']],
    ['meol small vessel', ['aec1', 'aec2']], ['diesel engine course humber', ['rya_diesel_engine', 'is_basic_marine_engine'], 'near'],
  ]],
  ['6 Refreshers and offshore extras', [
    ['gwo refresher hull', ['gwo_bst_refresher', 'gwo_sea_survival_refresher'], 'near'], ['gwo sea survival refresher', ['gwo_sea_survival_refresher']],
    ['stcw refresher hull', ['stcw_basic_refresher', 'pst_refresher', 'fpff_refresher'], 'near'], ['bosiet hull', ['opito_bosiet', 'opito_tbosiet'], 'near'],
    ['huet', ['huet', 'opito_bosiet', 'opito_foet', 'opito_tbosiet', 'opito_tfoet']], ['ca-ebs hull', ['ebs'], 'near'], ['enhanced first aid gwo', ['gwo_efa']],
    ['gwo great yarmouth', GWO_BST.concat(['gwo_art', 'gwo_efa', 'gwo_slinger_signaller', 'gwo_btt', 'gwo_sea_survival_refresher']), 'near'], ['gwo lowestoft', GWO_BST.concat(['gwo_art', 'gwo_efa', 'gwo_slinger_signaller', 'gwo_btt', 'gwo_sea_survival_refresher']), 'near'],
    ['hornsea wind farm training', GWO_BST.concat(['gwo_art', 'gwo_efa', 'gwo_wla', 'marine_transfer']), 'near'],
  ]],
];

const km = (a: [number, number], p: Provider) => {
  if (p.lat == null || p.lng == null) return Infinity;
  const r = (d: number) => (d * Math.PI) / 180;
  const x = Math.sin(r(p.lat - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(p.lat)) * Math.sin(r(p.lng - a[1]) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
const placeIn = (q: string) => Object.keys(PLACES).sort((a, b) => b.length - a.length).find((k) => q.toLowerCase().includes(k));

let pass = 0;
let total = 0;
for (const [stage, qs] of STAGES) {
  console.log(`\n## ${stage}`);
  for (const [q, codes, how] of qs) {
    total++;
    const hits = searchProviders(list, { query: q, course: null, sector: null, approval: null, origin: null, radiusKm: null, homeCountry: 'GB' });
    const truth = list.filter((p) => p.courses.some((c) => codes.includes(c)));
    const top = hits.slice(0, 10);
    const near = how === 'near' ? PLACES[placeIn(q)!] : undefined;
    const nearest = near ? Math.min(...truth.map((p) => km(near, p))) : 0;
    const good = top.filter((h) => truth.some((t) => t.id === h.provider.id)).length;
    const p10 = top.length ? good / Math.min(top.length, Math.max(truth.length, 1)) : 0;
    const recall = !near ? hits.filter((h) => truth.some((t) => t.id === h.provider.id)).length / Math.max(truth.length, 1) : 1;
    const firstKm = near && hits[0] ? km(near, hits[0].provider) : 0;
    const ok = hits.length > 0 && truth.length > 0 && p10 >= 0.8 && recall >= 0.8 && (!near || firstKm <= Math.max(60, nearest + 30));
    if (ok) pass++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(q).padEnd(40)} ${hits.length} rows  top10 ${(p10 * 100).toFixed(0)}%  recall ${(recall * 100).toFixed(0)}%` +
        (near ? `  first ${Math.round(firstKm)} km (nearest right answer ${Math.round(nearest)} km)` : '') +
        (ok ? '' : `  | ${top.slice(0, 3).map((h) => h.provider.name.slice(0, 24)).join('; ')}`),
    );
  }
}

console.log('\n## Pathway links from Hull (MCA user, screen default)');
const pathways = ['navigational-watch-rating', 'efficient-deck-hand', 'able-seafarer-deck', 'master-code-200gt-150nm', 'master-workboat-500gt-from-master-code'];
let links = 0;
let linkPass = 0;
for (const pw of pathways) {
  const row: string[] = [];
  for (const it of CHECKLISTS[pw].items) {
    if (['manual', 'sea_service', 'prerequisite_coc'].includes(it.type)) continue;
    if (!providerCodesFor(it.code).length) {
      row.push(`${it.code}: no link`);
      continue;
    }
    links++;
    const approval = defaultApproval(list, it.code, 'mca');
    const hits = searchProviders(list, { query: '', course: it.code, sector: null, approval, origin: { lat: HOME[0], lng: HOME[1] }, radiusKm: null, homeCountry: 'GB' });
    const all = searchProviders(list, { query: '', course: it.code, sector: null, approval: null, origin: { lat: HOME[0], lng: HOME[1] }, radiusKm: null, homeCountry: 'GB' });
    const d = hits[0]?.distanceKm ?? Infinity;
    const dAll = all[0]?.distanceKm ?? Infinity;
    const ok = hits.length > 0 && d <= Math.max(dAll + 100, dAll * 1.5);
    if (ok) linkPass++;
    row.push(`${ok ? '' : 'FAIL '}${it.code} (${approval ?? 'any'}) ${Number.isFinite(d) ? Math.round(d) : '-'} km${d !== dAll ? ` (any approval ${Math.round(dAll)} km)` : ''}`);
  }
  console.log(`${pw}: ${row.join(' | ')}`);
}
console.log(`\nctv hull pass: ${pass}/${total} queries, ${linkPass}/${links} pathway links`);
if (pass < total || linkPass < links) process.exit(1);
