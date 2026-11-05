// Find a course, a pass as a new starter on a Thames tug working up to a
// master's ticket, by both routes: the river (Boatmasters' Licence, towing
// endorsement, PLA local knowledge) and the seagoing tug route (Tug Watch
// Rating to Master (Tug)). Based at Gravesend, phone set to the UK, MCA user.
//   npx tsx scripts/search-eval-thames-tug.ts   (exits 1 if any query fails)
import { CHECKLISTS } from '@/constants/courseChecklists';
import { searchProviders, providerCodesFor, defaultApproval, type Provider } from '@/utils/providerSearch';
import { TRAINING_PROVIDERS_JSON } from '@/backend/src/data/training-providers';

const list: Provider[] = JSON.parse(TRAINING_PROVIDERS_JSON).providers;
const HOME: [number, number] = [51.44, 0.37]; // Gravesend
const PLACES: Record<string, [number, number]> = {
  gravesend: HOME, tilbury: [51.46, 0.36], greenwich: [51.48, 0.0], london: [51.5, -0.1], kent: [51.2, 1.0], essex: [51.75, 0.6],
  medway: [51.39, 0.54], thames: [51.47, 0.2],
};
const STCW = ['pst', 'fpff', 'efa', 'pssr', 'stcw_basic_refresher'];
const BML = ['boatmaster', 'bml_fire_safety', 'bml_pswt', 'bml_first_aid_restricted', 'bml_ancillary_safety', 'bml_fire_safety_restricted', 'bml_pswt_restricted'];
// First run left out uscg_rfpnw, which is the same STCW A-II/4 rating.
const NWR = ['nav_watch_rating', 'nwr_special_route', 'rating_nav_watch', 'uscg_rfpnw'];

// [query, right answers, how to judge]
//   'near'  the query names a place: first row must be close to it
//   'none'  no provider runs this (an assessment, not a course): pass on 0 rows,
//           or if the first rows are the related right answers given
type How = 'near' | 'none' | undefined;
const STAGES: [string, [string, string[], How?][]][] = [
  ['1 New starter, deckhand at Gravesend', [
    ['stcw basic gravesend', STCW, 'near'], ['eng1 gravesend', ['eng1'], 'near'], ['ml5 medical kent', ['eng1'], 'near'],
    ['pdsd essex', ['dsd'], 'near'], ['sea survival tilbury', ['pst', 'rya_sea_survival', 'bml_pswt', 'bml_pswt_restricted'], 'near'],
    ['deckhand course london', ['yacht_rating', 'nav_watch_rating', 'edh', 'boatmaster', 'amsa_gph'], 'near'],
  ]],
  ['2 Boatmasters Licence Tier 1 Level 2', [
    ['boatmasters licence', ['boatmaster']], ['BML level 2', BML], ['tier 1 level 2 boatmaster', ['boatmaster']],
    ['BML fire safety course', ['bml_fire_safety', 'bml_fire_safety_restricted']], ['bml first aid', ['bml_first_aid_restricted', 'efa']],
    ['bml personal survival', ['bml_pswt', 'bml_pswt_restricted']], ['boatmaster fire course london', ['bml_fire_safety', 'bml_fire_safety_restricted'], 'near'],
    ['boatmaster thames', BML, 'near'],
  ]],
  ['3 Level 1 and the towing endorsement', [
    ['boatmaster level 1', ['boatmaster']], ['bml towing endorsement', ['boatmaster']], ['towing endorsement thames', ['boatmaster'], 'near'],
  ]],
  ['4 PLA local knowledge (an assessment, not a course)', [
    ['pla local knowledge', ['boatmaster'], 'none'], ['LKE thames', ['boatmaster'], 'none'], ['local knowledge endorsement', ['boatmaster'], 'none'],
  ]],
  ['5 Seagoing route: Tug Watch Rating', [
    ['NWR', NWR], ['navigational watch rating course', NWR], ['tug watch rating', NWR], ['efficient deck hand london', ['edh'], 'near'], ['EDH', ['edh']],
    ['pscrb gravesend', ['pscrb', 'pscrb_otl'], 'near'], ['proficiency in survival craft', ['pscrb', 'pscrb_otl', 'pscrb_refresher', 'pscrb_otl_refresher']],
  ]],
  ['6 Tug Able Seafarer', [
    ['able seafarer deck', ['able_seafarer_deck']], ['AB tug', ['able_seafarer_deck']], ['tug msq units', [], 'none'],
  ]],
  ['7 OOW (Tug)', [
    ['OOW tug', ['tug_master_prep']], ['tug mate course', ['tug_master_prep']], ['GMDSS ROC', ['gmdss_roc']], ['ROC course london', ['gmdss_roc'], 'near'],
    ['HELM operational', ['helm_op']], ['NAEST operational', ['naest_op']], ['advanced fire fighting essex', ['aff'], 'near'],
    ['medical first aid kent', ['mfa'], 'near'], ['signals certificate', [], 'none'],
  ]],
  ['8 Master (Tug)', [
    ['tug master', ['tug_master_prep']], ['master tug 500', ['tug_master_prep']], ['medical care course', ['medical_care']], ['NAEST management', ['naest_mgmt']],
    ['HELM management', ['helm_mgmt']], ['ROC refresher', ['gmdss_refresher']],
  ]],
  ['9 Useful on a tug', [
    ['banksman', ['banksman_slinger']], ['slinger signaller', ['banksman_slinger', 'gwo_slinger_signaller']], ['ship handling course', ['ship_handling_manned_models']],
    ['pilot ladder', ['pilot_ladder_transfer']], ['confined space', ['confined_space_entry']], ['radar course kent', ['rya_radar', 'radar_arpa_op', 'wbc3_nav_radar'], 'near'],
  ]],
];

const km = (a: [number, number], p: Provider) => {
  if (p.lat == null || p.lng == null) return Infinity;
  const r = (d: number) => (d * Math.PI) / 180;
  const x = Math.sin(r(p.lat - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(p.lat)) * Math.sin(r(p.lng - a[1]) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
const placeIn = (q: string) => Object.keys(PLACES).find((k) => q.toLowerCase().includes(k));

let pass = 0;
let total = 0;
for (const [stage, qs] of STAGES) {
  console.log(`\n## ${stage}`);
  for (const [q, codes, how] of qs) {
    total++;
    const hits = searchProviders(list, { query: q, course: null, sector: null, approval: null, origin: null, radiusKm: null, homeCountry: 'GB' });
    const truth = list.filter((p) => p.courses.some((c) => codes.includes(c)));
    const top = hits.slice(0, 10);
    let ok: boolean;
    let note = '';
    if (how === 'none') {
      // Nothing to book: no rows, or the related right answers first (never a stranger's course).
      const first3 = hits.slice(0, 3);
      ok = hits.length === 0 || (codes.length > 0 && first3.every((h) => truth.some((t) => t.id === h.provider.id)));
      note = hits.length ? `first: ${first3.map((h) => h.provider.name.slice(0, 22)).join('; ')}` : 'no rows';
    } else {
      const near = how === 'near' ? PLACES[placeIn(q)!] : undefined;
      const nearest = near ? Math.min(...truth.map((p) => km(near, p))) : 0;
      const good = top.filter((h) => truth.some((t) => t.id === h.provider.id)).length;
      const p10 = top.length ? good / Math.min(top.length, Math.max(truth.length, 1)) : 0;
      const recall = !near ? hits.filter((h) => truth.some((t) => t.id === h.provider.id)).length / Math.max(truth.length, 1) : 1;
      const firstKm = near && hits[0] ? km(near, hits[0].provider) : 0;
      ok = hits.length > 0 && truth.length > 0 && p10 >= 0.8 && recall >= 0.8 && (!near || firstKm <= Math.max(60, nearest + 30));
      note = `${hits.length} rows  top10 ${(p10 * 100).toFixed(0)}%  recall ${(recall * 100).toFixed(0)}%` + (near ? `  first ${Math.round(firstKm)} km (nearest right answer ${Math.round(nearest)} km)` : '');
      if (!ok) note += `  | ${top.slice(0, 3).map((h) => h.provider.name.slice(0, 24)).join('; ')}`;
    }
    if (ok) pass++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(q).padEnd(36)} ${note}`);
  }
}

console.log('\n## Pathway links from Gravesend (MCA user, screen default)');
const pathways = ['bml-tier1-level2', 'bml-tier1-level1', 'bml-towing-tidal', 'tug-watch-rating', 'tug-able-seafarer', 'oow-tug-500gt-nc', 'master-tug-500gt-nc', 'master-tug-3000gt-nc'];
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
console.log(`\nthames tug pass: ${pass}/${total} queries, ${linkPass}/${links} pathway links`);
if (pass < total || linkPass < links) process.exit(1);
