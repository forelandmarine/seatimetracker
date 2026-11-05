// Find a course, a pass as a South African yacht rating fresh out of IYT
// training in Cape Town, moving to the South of France for a first job:
// last courses before flying, then what a green deckhand or stew looks for in
// Antibes and along the coast, then the first steps up. Pathway links (Yacht
// Rating, OOW Yachts) opened from Antibes as an MCA user; the SAMSA setting is
// reported alongside.
//   npx tsx scripts/search-eval-sa-to-sof.ts   (exits 1 if any query fails)
import { CHECKLISTS } from '@/constants/courseChecklists';
import { searchProviders, providerCodesFor, defaultApproval, closerUnderOtherApprovals, type Provider } from '@/utils/providerSearch';
import { TRAINING_PROVIDERS_JSON } from '@/backend/src/data/training-providers';

const list: Provider[] = JSON.parse(TRAINING_PROVIDERS_JSON).providers;
const ANTIBES: [number, number] = [43.58, 7.12];
const PLACES: Record<string, [number, number]> = {
  'cape town': [-33.92, 18.42], durban: [-29.86, 31.03], antibes: ANTIBES, cannes: [43.55, 7.01], nice: [43.7, 7.27], monaco: [43.74, 7.42],
  'golfe juan': [43.57, 7.08], 'la ciotat': [43.17, 5.6], 'south of france': ANTIBES, sof: ANTIBES, riviera: ANTIBES, "cote d'azur": ANTIBES,
};
const STCW = ['pst', 'fpff', 'efa', 'pssr', 'stcw_basic_refresher'];
const GREEN = ['yacht_rating', 'iyt_superyacht_crew', 'iyt_superyacht_deck_crew', 'iyt_international_crew'];
const STEW = ['guest', 'yacht_interior', 'junior_steward', 'iyt_superyacht_hospitality'];
const IYT = ['iyt_international_crew', 'iyt_superyacht_crew', 'iyt_superyacht_deck_crew', 'iyt_superyacht_hospitality', 'iyt_rib_master', 'iyt_sprm', 'iyt_bareboat_skipper', 'iyt_flotilla_skipper', 'iyt_master_of_yachts', 'iyt_superyacht_chef'];

type How = 'near' | 'none' | `name:${string}` | undefined;
const STAGES: [string, string, [string, string[], How?][]][] = [
  ['1 Finishing up in Cape Town before flying', 'ZA', [
    ['iyt cape town', IYT, 'near'], ['superyacht crew course cape town', GREEN, 'near'], ['stcw cape town', STCW, 'near'], ['eng1 cape town', ['eng1'], 'near'],
    ['pdsd cape town', ['dsd'], 'near'], ['powerboat level 2 cape town', ['powerboat_l2'], 'near'], ['src cape town', ['src'], 'near'],
    ['iyt rib master', ['iyt_rib_master']], ['eng1 durban', ['eng1'], 'near'],
  ]],
  ['2 Arriving in Antibes, job hunting', 'ZA', [
    ['eng1 antibes', ['eng1'], 'near'], ['stcw antibes', STCW, 'near'], ['pdsd antibes', ['dsd'], 'near'], ['powerboat 2 antibes', ['powerboat_l2'], 'near'],
    ['tender driving antibes', ['rya_tender_operator', 'powerboat_l2', 'yacht_tender_ops'], 'near'], ['jet ski course antibes', ['pwc'], 'near'], ['vhf antibes', ['src'], 'near'],
    ['eng1 south of france', ['eng1'], 'near'], ['stcw sof', STCW, 'near'], ['eng1 monaco', ['eng1'], 'near'], ['stcw nice', STCW, 'near'],
  ]],
  ['3 Green deckhand', 'ZA', [
    ['yacht rating antibes', ['yacht_rating'], 'near'], // First run left out EDH, a real deckhand course (Efficient Deck Hand).
    ['deckhand course antibes', GREEN.concat(['amsa_gph', 'edh']), 'near'], ['green crew course', GREEN],
    ['efficient deck hand antibes', ['edh'], 'near'], ['pscrb riviera', ['pscrb', 'pscrb_otl'], 'near'], ['yacht rating course', ['yacht_rating']],
  ]],
  ['4 Green stew', 'ZA', [
    ['stew course antibes', STEW, 'near'], ['guest course', ['guest']], ['interior course riviera', STEW, 'near'], ['food hygiene course', ['food_hygiene']],
    // First run expected nothing for "wine course"; Leiths School of Food and Wine is a right answer.
    ['silver service', [], 'none'], ['wine course', [], 'name:Leiths'], ['superyacht hospitality', ['iyt_superyacht_hospitality', 'guest', 'yacht_interior', 'junior_steward']],
  ]],
  ['5 First steps up', 'ZA', [
    ['day skipper antibes', ['day_skipper', 'day_skipper_sb'], 'near'], ['yachtmaster antibes', ['ym_coastal', 'ym_offshore', 'ym_ocean', 'ym_offshore_sb', 'ym_ocean_sb'], 'near'],
    ['pwc cannes', ['pwc'], 'near'], ['advanced powerboat antibes', ['powerboat_advanced'], 'near'], ['rya first aid nice', ['rya_first_aid', 'efa'], 'near'],
    ['aec antibes', ['aec1', 'aec2'], 'near'], ['iyt master of yachts', ['iyt_master_of_yachts', 'iyt_master_yachts_unlimited']], ['oow yachts antibes', ['oow_yachts_gsk', 'oow_yachts_nav_radar', 'oow_yachts_oral_prep'], 'near'],
  ]],
];

const km = (a: [number, number], p: Provider) => {
  if (p.lat == null || p.lng == null) return Infinity;
  const r = (d: number) => (d * Math.PI) / 180;
  const x = Math.sin(r(p.lat - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(p.lat)) * Math.sin(r(p.lng - a[1]) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
const placeIn = (q: string) => Object.keys(PLACES).sort((a, b) => b.length - a.length).find((k) => new RegExp(`\\b${k}\\b`).test(q.toLowerCase()));

let pass = 0;
let total = 0;
for (const [stage, region, qs] of STAGES) {
  console.log(`\n## ${stage}`);
  for (const [q, codes, how] of qs) {
    total++;
    const hits = searchProviders(list, { query: q, course: null, sector: null, approval: null, origin: null, radiusKm: null, homeCountry: region });
    const truth = list.filter((p) => p.courses.some((c) => codes.includes(c)));
    const top = hits.slice(0, 10);
    let ok: boolean;
    let note: string;
    if (how?.startsWith('name:')) {
      ok = (hits[0]?.provider.name ?? '').includes(how.slice(5));
      note = hits.length ? `first: ${hits[0].provider.name}` : 'no rows';
    } else if (how === 'none') {
      ok = hits.length === 0;
      note = hits.length ? `${hits.length} rows: ${top.slice(0, 3).map((h) => h.provider.name.slice(0, 22)).join('; ')}` : 'no rows';
    } else {
      const near = how === 'near' ? PLACES[placeIn(q)!] : undefined;
      const nearest = near ? Math.min(...truth.map((p) => km(near, p))) : 0;
      const good = top.filter((h) => truth.some((t) => t.id === h.provider.id)).length;
      const p10 = top.length ? good / Math.min(top.length, Math.max(truth.length, 1)) : 0;
      const recall = !near ? hits.filter((h) => truth.some((t) => t.id === h.provider.id)).length / Math.max(truth.length, 1) : 1;
      const firstKm = near && hits[0] ? km(near, hits[0].provider) : 0;
      ok = hits.length > 0 && truth.length > 0 && p10 >= 0.8 && recall >= 0.8 && (!near || firstKm <= Math.max(60, nearest + 30));
      note =
        `${hits.length} rows  top10 ${(p10 * 100).toFixed(0)}%  recall ${(recall * 100).toFixed(0)}%` +
        (near ? `  first ${Math.round(firstKm)} km (nearest right answer ${Math.round(nearest)} km)` : '') +
        (ok ? '' : `  | ${top.slice(0, 3).map((h) => h.provider.name.slice(0, 24)).join('; ')}`);
    }
    if (ok) pass++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(q).padEnd(38)} ${note}`);
  }
}

console.log('\n## Pathway links from Antibes');
let links = 0;
let linkPass = 0;
for (const pw of ['yacht-rating', 'oow-yachts-3000gt']) {
  for (const authority of ['mca', 'samsa']) {
    const row: string[] = [];
    for (const it of CHECKLISTS[pw].items) {
      if (['manual', 'sea_service', 'prerequisite_coc'].includes(it.type) || !providerCodesFor(it.code).length) continue;
      const approval = defaultApproval(list, it.code, authority);
      const hits = searchProviders(list, { query: '', course: it.code, sector: null, approval, origin: { lat: ANTIBES[0], lng: ANTIBES[1] }, radiusKm: null, homeCountry: 'ZA' });
      const all = searchProviders(list, { query: '', course: it.code, sector: null, approval: null, origin: { lat: ANTIBES[0], lng: ANTIBES[1] }, radiusKm: null, homeCountry: 'ZA' });
      const d = hits[0]?.distanceKm ?? Infinity;
      const dAll = all[0]?.distanceKm ?? Infinity;
      // Fine if the filter costs little, or the screen says closer schools exist under other approvals.
      const hint = approval ? closerUnderOtherApprovals(list, { query: '', course: it.code, sector: null, approval, origin: { lat: ANTIBES[0], lng: ANTIBES[1] }, radiusKm: null }) : { count: 0 };
      const ok = hits.length > 0 && (d <= Math.max(dAll + 100, dAll * 1.5) || hint.count > 0);
      // Only the MCA user is scored: the SAMSA setting is reported, since whether a
      // SAMSA candidate may use a French STCW school is SAMSA's call, not search's.
      if (authority === 'mca') {
        links++;
        if (ok) linkPass++;
      }
      row.push(`${ok ? '' : authority === 'mca' ? 'FAIL ' : 'FAR '}${it.code} (${approval ?? 'any'}) ${Number.isFinite(d) ? Math.round(d) : '-'} km${d !== dAll ? ` (any ${Math.round(dAll)} km)` : ''}${hint.count ? ` [hint: ${hint.count} closer]` : ''}`);
    }
    console.log(`${pw} as ${authority.toUpperCase()}: ${row.join(' | ')}`);
  }
}
console.log(`\nsa to sof pass: ${pass}/${total} queries, ${linkPass}/${links} MCA pathway links`);
if (pass < total || linkPass < links) process.exit(1);
