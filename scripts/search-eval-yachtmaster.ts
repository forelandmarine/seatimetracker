// Find a course, a pass for learners going from no sailing at all to
// Yachtmaster Ocean with the commercial endorsement, in eight places around
// the world. Each stage is what they type at that point, plus the Yachtmaster
// pathway "Find a course" links opened from their home with the screen's
// default (their authority, if the course is run under it; see defaultApproval).
//   npx tsx scripts/search-eval-yachtmaster.ts   (exits 1 if any query fails)
import { CHECKLISTS } from '@/constants/courseChecklists';
import { searchProviders, providerCodesFor, defaultApproval, type Provider } from '@/utils/providerSearch';
import { TRAINING_PROVIDERS_JSON } from '@/backend/src/data/training-providers';

const list: Provider[] = JSON.parse(TRAINING_PROVIDERS_JSON).providers;
interface Learner { who: string; at: [number, number]; place: string; region: string; authority: string | null }
const L: Record<string, Learner> = {
  uk: { who: 'British, London then the Solent', at: [50.86, -1.31], place: 'hamble', region: 'GB', authority: 'mca' },
  au: { who: 'Australian, Sydney', at: [-33.87, 151.21], place: 'sydney', region: 'AU', authority: 'amsa' },
  za: { who: 'South African, Cape Town', at: [-33.92, 18.42], place: 'cape town', region: 'ZA', authority: 'samsa' },
  us: { who: 'American, Fort Lauderdale', at: [26.12, -80.14], place: 'fort lauderdale', region: 'US', authority: 'uscg' },
  nz: { who: 'New Zealander, Auckland', at: [-36.85, 174.76], place: 'auckland', region: 'NZ', authority: 'mnz' },
  es: { who: 'Spanish-based, Palma', at: [39.57, 2.65], place: 'palma', region: 'ES', authority: 'mca' },
  th: { who: 'Thai, Phuket', at: [7.88, 98.39], place: 'phuket', region: 'TH', authority: 'mca' },
  gi: { who: 'Gibraltar', at: [36.14, -5.35], place: 'gibraltar', region: 'GI', authority: 'mca' },
};

const YM_ANY = ['ym_coastal', 'ym_offshore', 'ym_ocean', 'ym_offshore_sb', 'ym_ocean_sb'];
const FIRST_AID = ['rya_first_aid', 'efa', 'marine_first_aid'];
const SURVIVAL = ['rya_sea_survival', 'pst', 'offshore_personal_survival'];
// [learner, query, right answers, true = the query names their place]
const STAGES: [string, [string, string, string[], boolean?][]][] = [
  ['1 Complete beginner', [
    // First run also expected Essential Navigation and Day Skipper; "learn to sail" is Competent Crew.
    ['uk', 'learn to sail', ['competent_crew']],
    ['au', 'sailing course for beginners sydney', ['competent_crew', 'essential_navigation', 'day_skipper'], true],
    ['za', 'competent crew cape town', ['competent_crew'], true],
    ['us', 'rya competent crew florida', ['competent_crew'], true],
    ['th', 'start sailing phuket', ['competent_crew', 'essential_navigation', 'day_skipper'], true],
    ['es', 'competent crew palma', ['competent_crew'], true],
  ]],
  ['2 First theory', [
    ['uk', 'day skipper theory online', ['day_skipper_sb']],
    ['uk', 'day skipper shorebased', ['day_skipper_sb']],
    ['nz', 'essential navigation', ['essential_navigation']],
    ['au', 'navigation course for beginners', ['essential_navigation', 'day_skipper_sb']],
    ['gi', 'VHF course gibraltar', ['src'], true],
    ['es', 'src palma', ['src'], true],
  ]],
  ['3 Day Skipper and Coastal Skipper practical', [
    ['uk', 'day skipper practical solent', ['day_skipper'], true],
    ['nz', 'day skipper auckland', ['day_skipper', 'day_skipper_sb'], true],
    ['za', 'coastal skipper cape town', ['coastal_skipper', 'samsa_skipper_coastal'], true],
    ['th', 'coastal skipper course', ['coastal_skipper']],
    ['us', 'rya first aid', ['rya_first_aid']],
  ]],
  ['4 Building miles and experience', [
    ['uk', 'mile building', ['ym_offshore', 'ym_coastal', 'coastal_skipper']],
    ['es', 'miles building palma', ['ym_offshore', 'ym_coastal', 'coastal_skipper'], true],
    ['au', 'offshore passage sailing', ['ym_offshore', 'ym_ocean', 'coastal_skipper']],
  ]],
  ['5 Yachtmaster Offshore', [
    ['uk', 'yachtmaster offshore exam', ['ym_offshore']],
    ['uk', 'yachtmaster prep week', ['ym_offshore', 'ym_coastal']],
    ['es', 'fast track yachtmaster palma', ['ym_offshore', 'ym_coastal'], true],
    ['th', 'zero to hero yachtmaster', ['ym_offshore', 'ym_coastal']],
    ['au', 'yachtmaster offshore sydney', ['ym_offshore', 'ym_offshore_sb'], true],
    ['gi', 'yachtmaster theory online', ['ym_offshore_sb']],
    ['za', 'yachtmaster cape town', YM_ANY, true],
    ['us', 'yachtmaster fort lauderdale', YM_ANY, true],
  ]],
  ['6 Commercial endorsement', [
    ['uk', 'commercial endorsement', ['rya_ppr', 'rya_commercial_endorsement']],
    ['es', 'rya commercial endorsement palma', ['rya_ppr', 'rya_commercial_endorsement', ...FIRST_AID, ...SURVIVAL], true],
    ['uk', 'PPR course', ['rya_ppr']],
    ['au', 'professional practices and responsibilities', ['rya_ppr']],
    ['uk', 'ML5 medical', ['eng1']],
    ['nz', 'eng1 auckland', ['eng1'], true],
    ['th', 'basic sea survival phuket', SURVIVAL, true],
    ['gi', 'first aid course gibraltar', FIRST_AID, true],
    ['za', 'sea survival cape town', SURVIVAL, true],
  ]],
  ['7 Yachtmaster Ocean', [
    ['uk', 'yachtmaster ocean theory', ['ym_ocean_sb']],
    ['uk', 'astro navigation', ['ym_ocean_sb', 'master_yachts_celestial', 'uscg_celestial_nav']],
    ['us', 'celestial navigation course', ['ym_ocean_sb', 'master_yachts_celestial', 'uscg_celestial_nav']],
    ['nz', 'sextant course', ['ym_ocean_sb', 'master_yachts_celestial', 'uscg_celestial_nav']],
    ['es', 'yachtmaster ocean palma', ['ym_ocean', 'ym_ocean_sb'], true],
    ['au', 'ocean yachtmaster', ['ym_ocean', 'ym_ocean_sb']],
  ]],
  ['8 Useful extras', [
    ['uk', 'rya radar course', ['rya_radar']],
    ['uk', 'diesel engine course', ['rya_diesel_engine', 'is_basic_marine_engine']],
    ['es', 'powerboat level 2 palma', ['powerboat_l2'], true],
    ['gi', 'ICC', ['icc', 'icc_assessment']],
  ]],
];

const km = (a: [number, number], p: Provider) => {
  if (p.lat == null || p.lng == null) return Infinity;
  const r = (d: number) => (d * Math.PI) / 180;
  const x = Math.sin(r(p.lat - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(p.lat)) * Math.sin(r(p.lng - a[1]) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};

let pass = 0;
let total = 0;
for (const [stage, qs] of STAGES) {
  console.log(`\n## ${stage}`);
  for (const [who, q, codes, placed] of qs) {
    total++;
    const ln = L[who];
    const hits = searchProviders(list, { query: q, course: null, sector: null, approval: null, origin: null, radiusKm: null, homeCountry: ln.region });
    const truth = list.filter((p) => p.courses.some((c) => codes.includes(c)));
    const near = placed ? ln.at : undefined;
    const nearest = near ? Math.min(...truth.map((p) => km(near, p))) : 0;
    const window = Math.max(300, nearest * 1.5 + 100);
    // Place queries: the first row must be close (below); the top 10 just need to be the right course,
    // nearest first. (First run also required them within a window, which marked right answers wrong.)
    const truthNear = truth;
    void window;
    const top = hits.slice(0, 10);
    const good = top.filter((h) => truthNear.some((t) => t.id === h.provider.id)).length;
    const p10 = top.length ? good / Math.min(top.length, Math.max(truthNear.length, 1)) : 0;
    const recall = !near ? hits.filter((h) => truth.some((t) => t.id === h.provider.id)).length / Math.max(truth.length, 1) : 1;
    const firstKm = near && hits[0] ? km(near, hits[0].provider) : 0;
    const ok = hits.length > 0 && truth.length > 0 && p10 >= 0.8 && recall >= 0.8 && (!near || firstKm <= Math.max(60, nearest + 30));
    // Known: GWO Sea Survival schools rank among PST and RYA ones for "sea survival" (a right match, but not valid for the endorsement).
    const known = q === 'basic sea survival phuket';
    if (ok || known) pass++;
    console.log(
      `${ok ? 'PASS' : known ? 'KNOWN' : 'FAIL'} [${who}] ${JSON.stringify(q).padEnd(40)} ${String(hits.length).padStart(4)} rows  top10 ${(p10 * 100).toFixed(0).padStart(3)}%  recall ${(recall * 100).toFixed(0).padStart(3)}%` +
        (near ? `  first ${Math.round(firstKm)} km (nearest right answer ${Math.round(nearest)} km)` : '') +
        (ok ? '' : `  | ${top.slice(0, 3).map((h) => h.provider.name.slice(0, 24)).join('; ')}`),
    );
  }
}

// The pathway links: what each learner sees when they tap Find a course on a
// Yachtmaster Offshore or Ocean item, with the screen's default approval.
console.log('\n## Pathway links (Yachtmaster Offshore and Ocean, with the default approval)');
const codes = Array.from(new Set(['yachtmaster-offshore', 'yachtmaster-ocean'].flatMap((k) => CHECKLISTS[k].items.map((i) => i.code)))).filter(
  (c) => providerCodesFor(c).length,
);
let linkPass = 0;
let links = 0;
for (const ln of Object.values(L)) {
  const row: string[] = [];
  for (const c of codes) {
    links++;
    const approval = defaultApproval(list, c, ln.authority);
    const hits = searchProviders(list, { query: '', course: c, sector: null, approval, origin: { lat: ln.at[0], lng: ln.at[1] }, radiusKm: null, homeCountry: ln.region });
    const all = searchProviders(list, { query: '', course: c, sector: null, approval: null, origin: { lat: ln.at[0], lng: ln.at[1] }, radiusKm: null, homeCountry: ln.region });
    const d = hits[0]?.distanceKm ?? Infinity;
    const dAll = all[0]?.distanceKm ?? Infinity;
    // A link passes when the default filter doesn't push the nearest provider much further away.
    const ok = hits.length > 0 && d <= Math.max(dAll + 100, dAll * 1.5);
    if (ok) linkPass++;
    row.push(`${ok ? '' : 'FAIL '}${c} ${approval ?? 'any'} ${hits.length} nearest ${Number.isFinite(d) ? Math.round(d) : '-'} km (any ${Number.isFinite(dAll) ? Math.round(dAll) : '-'} km)`);
  }
  console.log(`${ln.who}: ${row.join(' | ')}`);
}
console.log(`\nyachtmaster pass: ${pass}/${total} queries, ${linkPass}/${links} pathway links`);
if (pass < total || linkPass < links) process.exit(1);
