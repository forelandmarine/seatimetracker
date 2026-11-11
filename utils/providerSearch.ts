import { courseLabel } from '@/utils/courseChecklist';
import { OFFERED_COURSES } from '@/constants/offeredCourses';

/**
 * Search for "Find a course". Kept free of Expo imports so scripts/search-eval.ts
 * and the backend tests can run it against the directory the backend serves.
 *
 * Works like a small search engine: every word of the query has to be found in
 * one course the provider runs (or its name, approvals or address), so
 * "advanced navigation" doesn't match a school with Advanced Powerboat and
 * Essential Navigation. Crew shorthand is indexed with each course, close
 * misspellings still match, and a town, region or country in the query sorts
 * results by distance from it instead of needing the word in the address.
 */

export interface Provider {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postcode: string | null;
  country: string;
  /** English country name, e.g. "United Kingdom". */
  countryName: string;
  region: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  approvals: string[];
  sectors: string[];
  courses: string[];
  coursePages: Record<string, string>;
  datesUrl: string | null;
}

export interface ProviderFilters {
  query: string;
  course: string | null;
  sector: string | null;
  approval: string | null;
  origin: { lat: number; lng: number } | null;
  radiusKm: number | null;
  /**
   * The user's home country (see searchHomeCountry): a town named in the query
   * is taken as the one in this country, and without a location its providers
   * come first.
   */
  homeCountry?: string | null;
  /**
   * Providers with an upcoming published date for the chosen course. They rank
   * a little higher: ahead of equal matches, or as if 25 km closer by distance.
   */
  dated?: Set<string> | null;
}

/** The country each maritime authority issues for, as an ISO region code. */
export const AUTHORITY_COUNTRY: Record<string, string> = {
  mca: 'GB',
  uscg: 'US',
  amsa: 'AU',
  mnz: 'NZ',
  samsa: 'ZA',
};

/**
 * The home country for a search: the user's maritime authority's country when
 * they have one (an MCA seafarer on a US phone still means Falmouth, Cornwall),
 * otherwise the phone's region.
 */
export function searchHomeCountry(authority: string | null | undefined, deviceRegion: string | null | undefined): string | null {
  const fromAuthority = authority ? AUTHORITY_COUNTRY[authority.toLowerCase()] : undefined;
  return fromAuthority ?? (deviceRegion ? deviceRegion.toUpperCase() : null);
}

export interface ProviderHit {
  provider: Provider;
  distanceKm: number | null;
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export const APPROVAL_LABELS: Record<string, string> = {
  mca: 'MCA',
  uscg: 'USCG',
  amsa: 'AMSA',
  mnz: 'Maritime NZ',
  samsa: 'SAMSA',
  mso_ireland: 'Ireland MSO',
  transport_canada: 'Transport Canada',
  transport_malta: 'Transport Malta',
  nzqa: 'NZQA',
  rya: 'RYA',
  iyt: 'IYT',
  gwo: 'GWO',
  opito: 'OPITO',
};

// National administrations arrive as "other:<body>_<country>", e.g. other:dgmm_spain.
const COUNTRY_WORDS = new Set([
  'spain',
  'france',
  'italy',
  'india',
  'singapore',
  'croatia',
  'portugal',
  'netherlands',
  'denmark',
  'finland',
  'cyprus',
  'greece',
  'malta',
  'philippines',
  'nigeria',
  'kenya',
  'brazil',
  'chile',
  'argentina',
  'ireland',
  'canada',
  'kong',
  'hong',
]);
export const approvalLabel = (a: string): string => {
  if (APPROVAL_LABELS[a]) return APPROVAL_LABELS[a];
  if (!a.startsWith('other:')) return a.toUpperCase();
  return a
    .slice(6)
    .trim()
    .split(/[_\s]+/)
    .map((w) =>
      COUNTRY_WORDS.has(w.toLowerCase())
        ? w[0].toUpperCase() + w.slice(1)
        : w.length <= 5
          ? w.toUpperCase()
          : w[0].toUpperCase() + w.slice(1),
    )
    .join(' ');
};

/** Lower-cases and drops accents and punctuation, so "ENG-1" reads "eng 1" and "Côte" reads "cote". */
export function normaliseSearch(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// What crew type for a course that its label doesn't say: abbreviations,
// slang, older names and the certificate the course leads to.
const STCW_BASIC = 'stcw basic safety training stcw95 bst';
const COURSE_SEARCH_WORDS: Record<string, string> = {
  eng1: 'seafarer seafarers seaman seamans medical approved doctor doctors examination exam ml5',
  pst: `${STCW_BASIC} sea survival`,
  fpff: `${STCW_BASIC} firefighting`,
  efa: `${STCW_BASIC} bml boatmaster`,
  pssr: `${STCW_BASIC}`,
  stcw_basic_refresher: `${STCW_BASIC} update updating revalidation firefighting fire fighting sea survival`,
  amsa_continued_competence: 'stcw refresher update revalidation',
  chief_second_eng_unlimited: 'class1 class2 chief second engineer unlimited ekg engineering knowledge motor management iii',
  oew_unlimited: 'class4 class 4 eoow',
  pst_refresher: 'stcw refresher update sea survival',
  fpff_refresher: 'stcw refresher update firefighting',
  uscg_basic_training: `${STCW_BASIC}`,
  amsa_cst: `${STCW_BASIC}`,
  tc_med: `${STCW_BASIC}`,
  dsd: 'pdsd proficiency',
  aff: 'firefighting',
  aff_refresher: 'firefighting update',
  gwo_fire_awareness: 'firefighting fighting',
  bml_fire_safety: 'firefighting fighting',
  bml_fire_safety_restricted: 'firefighting fighting',
  powerboat_l1: 'pb1',
  competent_crew: 'learn sail sailing beginner beginners start novice intro introduction',
  essential_navigation: 'beginner beginners intro introduction',
  day_skipper: 'sail sailing',
  coastal_skipper: 'mile miles building builder sail sailing passage',
  powerboat_l2: 'pb2 powerboat2 tender driver driving',
  powerboat_intermediate: 'pb3',
  rya_tender_operator: 'tender driver driving',
  yacht_tender_ops: 'tender driver driving operator',
  src: 'vhf radio licence license dsc',
  amsa_vhf: 'radio licence license',
  amsa_vhf_hf: 'radio licence license',
  nz_maritime_vhf: 'radio licence license',
  lrc: 'gmdss radio',
  rya_diesel_engine: 'marine',
  is_basic_marine_engine: 'diesel',
  yacht_rating: 'deckhand deck hand superyacht crew greencrew greendeckhand',
  iyt_superyacht_deck_crew: 'deckhand greencrew greendeckhand',
  iyt_superyacht_crew: 'deckhand greencrew greendeckhand greenstew',
  iyt_international_crew: 'deckhand greencrew greendeckhand',
  amsa_gph: 'deckhand deck hand',
  mt_general_purpose_hand: 'gph',
  guest: 'stew stewardess steward interior superyacht crew hospitality greenstew',
  yacht_interior: 'stew stewardess steward interior superyacht crew hospitality greenstew',
  junior_steward: 'stew stewardess interior superyacht crew hospitality greenstew',
  iyt_superyacht_hospitality: 'stew stewardess steward interior',
  iyt_superyacht_chef: 'chef cook',
  ship_cook: 'chef cook yacht superyacht',
  nav_watch_rating: 'nwr tug',
  tug_master_prep: 'mate oow officer 500 3000 towage',
  rating_nav_watch: 'nwr',
  nwr_special_route: 'nwr',
  uscg_rfpnw: 'nwr navigational watch rating',
  able_seafarer_deck: 'ab able seaman tug',
  able_seafarer_engine: 'ab engine rating',
  uscg_able_seaman: 'ab deck',
  uscg_able_seafarer_deck: 'ab able seaman',
  er_watch_rating: 'engine rating',
  rating_engine_watch: 'engine rating',
  uscg_rfpew: 'engine rating',
  pscrb: 'survival craft lifeboat lifeboatman',
  pscrb_otl: 'survival craft lifeboat',
  pscrb_refresher: 'survival craft lifeboat update',
  pscrb_otl_refresher: 'survival craft lifeboat',
  uscg_lifeboatman_limited: 'lifeboat lifeboatman',
  ym_coastal: 'yachtmaster yacht master ym fast track zero hero prep preparation mile miles building builder',
  ym_offshore:
    'ctvskipper yachtmaster yacht master ym fast track zero hero prep preparation mile miles building builder offshore passage sail sailing',
  ym_ocean: 'yachtmaster yacht master ym ocean passage sail sailing',
  ym_offshore_sb: 'yachtmaster yacht master ym theory',
  ym_ocean_sb: 'yachtmaster yacht master ym theory celestial astro astronavigation navigation sextant sights',
  irish_sailing_yachtmaster: 'yacht master',
  iyt_master_of_yachts: 'yachtmaster yacht master',
  iyt_master_yachts_unlimited: 'yachtmaster yacht master',
  oow_yachts_gsk: 'oow 3000 oow3000 yacht gsk',
  oow_yachts_nav_radar: 'oow 3000 oow3000 yacht nav',
  oow_yachts_oral_prep: 'oow 3000 oow3000 yacht',
  wbc3_nav_radar: 'nav workboat code ctvskipper ctvmaster',
  wbc3_stability: 'workboat ctvskipper ctvmaster',
  aec1: 'aec yacht engineer y4 meol small vessel sv ctvengineer workboat',
  aec2: 'aec yacht engineer y4 meol small vessel sv ctvengineer workboat',
  sv_eng_marine_diesel: 'small vessel sv engineer engineering y3 eoow ctvengineer workboat',
  sv_eng_op_procedures: 'small vessel sv engineer engineering y3 eoow ctvengineer workboat',
  sv_eng_applied_me: 'small vessel sv engineer engineering y2 y1',
  sv_eng_aux1: 'small vessel sv engineer engineering y3 eoow',
  sv_eng_aux2: 'small vessel sv engineer engineering y2 y1',
  sv_eng_aux_equipment_1: 'small vessel sv engineer engineering y3 eoow',
  sv_eng_chief_stat_ops: 'small vessel sv engineer engineering y2 y1',
  sv_eng_ges: 'small vessel sv engineer engineering y2 y1',
  sv_eng_workshop_skills: 'small vessel sv engineer engineering y4 y3',
  master_yachts_business_law: 'master yachts yacht 500 3000 master500 master3000',
  master_yachts_celestial: 'master yachts yacht 500 3000 master500 master3000 astro astronavigation sextant sights',
  master_yachts_nav: 'master yachts yacht 500 3000 master500 master3000',
  master_yachts_seamanship: 'master yachts yacht 500 3000 master500 master3000',
  master_yachts_stability: 'master yachts yacht 500 3000 master500 master3000',
  master_500gt_prep: '500 master500 workboat',
  fr_capitaine_500: 'master 500 master500',
  fr_capitaine_3000: 'master 3000 master3000',
  master_200gt_prep: '200 master200 workboat ctvskipper ctvmaster',
  fr_capitaine_200: 'master 200 master200',
  crowd_mgmt: 'passenger ship',
  crisis_mgmt: 'passenger ship',
  pax_cargo_hull_safety: 'ship',
  tc_psm: 'ship',
  polar_basic: 'polar code',
  polar_adv: 'polar code',
  polar_advanced: 'polar code',
  workboat_ops: 'code ctv crew transfer vessel ctvskipper ctvmaster master workboats 500 master500',
  gwo_bst: 'ctv crew transfer vessel wind farm turbine ctvdeckhand ctvcrew basic safety',
  gwo_bst_onshore: 'basic safety',
  helm_op: 'human element leadership operational',
  helm_mgmt: 'human element leadership management',
  ecdis: 'electronic chart display information system',
  passenger_ship_training: 'crowd crisis management',
  gwo_bst_refresher: 'ctv crew transfer vessel wind farm turbine ctvdeckhand ctvcrew basic safety',
  gwo_sea_survival: 'ctv crew transfer vessel wind farm turbine ctvdeckhand ctvcrew offshore',
  marine_transfer: 'ctv crew transfer vessel wind farm turbine ctvdeckhand ctvcrew',
  dp_induction: 'dynamic positioning',
  dp_simulator: 'dynamic positioning',
  opito_bosiet: 'huet helicopter underwater escape offshore survival safety induction emergency',
  opito_tbosiet: 'huet helicopter underwater escape offshore survival safety induction emergency tropical',
  opito_foet: 'huet helicopter underwater escape offshore survival emergency bosiet refresher further',
  opito_tfoet: 'huet helicopter underwater escape offshore survival emergency bosiet refresher tropical',
  boatmaster: 'bml tier1 level2 tier1 level1 tier2 towing tow endorsement',
  huet: 'helicopter underwater escape',
  tanker_oil_chem_basic: 'familiarisation familiarization tff',
  tanker_basic_oil_chem: 'familiarisation familiarization tff',
  tanker_gas_basic: 'lng gas familiarisation familiarization',
  tanker_basic_gas: 'lng gas familiarisation familiarization',
  uscg_tank_barge_ff: 'tanker',
  tanker_gas_adv: 'lng gas',
  tanker_advanced_gas: 'lng gas',
  igf_basic: 'lng',
  igf_adv: 'lng',
  igf_advanced: 'lng',
  tc_cadet_deck: 'cadetship',
  tc_cadet_engine: 'cadetship',
  uscg_celestial_nav: 'astro astronavigation sextant sights',
  uscg_oupv: 'six pack 6 captain captains license licence charter',
  uscg_master_100: 'captain captains license licence 100 ton tons',
  uscg_master_200: 'captain captains license licence ton tons',
  uscg_master_limited: 'captain captains license licence',
  amsa_coxswain_g1: 'cox1 cox skipper',
  amsa_coxswain_g2: 'cox2 cox',
  amsa_coxswain_g3: 'cox3 cox',
  amsa_master_24m: '24m skipper',
  amsa_master_45m: '45m',
  mnz_me6: 'mec6 mec',
  mnz_me5: 'mec5 mec',
  mnz_me4: 'mec4 mec',
  mnz_me3: 'mec3 mec',
};

// Country words the country name doesn't cover.
const COUNTRY_SEARCH_WORDS: Record<string, string> = {
  GB: 'uk britain england scotland wales',
  US: 'usa america',
  AE: 'uae emirates',
  NL: 'holland',
};

// Words that describe the search rather than narrow it ("ENG1 providers near Southampton").
const FILLER = new Set([
  'a',
  'an',
  'and',
  's',
  'the',
  'in',
  'at',
  'for',
  'of',
  'on',
  'near',
  'around',
  'me',
  'nearest',
  'find',
  'where',
  'to',
  'get',
  'my',
  'provider',
  'providers',
  'course',
  'courses',
  'training',
  'school',
  'schools',
  'centre',
  'centres',
  'center',
  'centers',
  'less',
  'than',
  'under',
  'up',
  'with',
  'i',
  'need',
  'want',
  'book',
  'booking',
]);

// Words that add detail but shouldn't rule a course out when its label doesn't
// use them ("proficiency in medical care", "helm operational level").
const OPTIONAL = new Set([
  'level',
  'proficiency',
  'certificate',
  'certificates',
  'cert',
  'certification',
  'licence',
  'license',
  'ticket',
  'qualification',
  'programme',
  'program',
  'module',
  'modules',
  'exam',
  'preparation',
  'prep',
  'endorsement',
  'metres',
  'meters',
  'metre',
  'meter',
  'gt',
  'grt',
  'gross',
  'ton',
  'tons',
  'tonnes',
  'kw',
  'm',
  'generic',
  'online',
  'lvl',
  'week',
  // Every school in this directory is marine, maritime or about boats: those words rank, not filter.
  'marine',
  'maritime',
  'boat',
  'boats',
  'weeks',
  'intensive',
]);

// Shorthand for words the labels spell out.
const ABBREVIATIONS: Record<string, string[][]> = {
  nav: [['navigation']],
  aux: [['auxiliary']],
  navs: [['navigation']],
  mgmt: [['management']],
  mgt: [['management']],
  man: [['management']],
  adv: [['advanced']],
  ops: [['operational'], ['operations']],
  op: [['operational']],
  intro: [['introduction']],
  sb: [['shore', 'based']],
  elec: [['electrical']],
  tech: [['technical']],
  eng: [['engine'], ['engineering'], ['engineer']],
  refresh: [['refresher']],
  reval: [['revalidation']],
  stab: [['stability']],
  met: [['meteorology']],
  cel: [['celestial']],
};

const PHRASES = new Set([
  'ctv deckhand',
  'ctv crew',
  'ctv skipper',
  'ctv master',
  'ctv engineer',
  'green crew',
  'green deckhand',
  'green stew',
]);
const PHRASE_TOKENS = new Set(Array.from(PHRASES, (p) => p.replace(' ', '')));

// "eng one", "powerboat level two".
const NUMBER_WORDS: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
};

// Places crew name that aren't a provider's town: islands, coasts, regions.
const EXTRA_PLACES: Record<string, [number, number]> = {
  mallorca: [39.57, 2.65],
  majorca: [39.57, 2.65],
  ibiza: [38.91, 1.43],
  menorca: [39.89, 4.26],
  riviera: [43.58, 7.12],
  'french riviera': [43.58, 7.12],
  'south of france': [43.58, 7.12],
  sof: [43.58, 7.12],
  'cote d azur': [43.58, 7.12],
  solent: [50.85, -1.3],
  florida: [26.12, -80.14],
  'ft lauderdale': [26.12, -80.14],
  'gold coast': [-27.97, 153.4],
  'sunshine coast': [-26.65, 153.07],
  whitsundays: [-20.27, 148.72],
  kiel: [54.32, 10.13],
  piraeus: [37.94, 23.64],
  athens: [37.98, 23.73],
  marmaris: [36.85, 28.27],
  bodrum: [37.03, 27.43],
  limassol: [34.68, 33.04],
  valletta: [35.9, 14.51],
  'los angeles': [33.74, -118.27],
  'san diego': [32.72, -117.16],
  'new york': [40.71, -74.0],
  phuket: [7.88, 98.39],
  tahiti: [-17.54, -149.57],
  papeete: [-17.54, -149.57],
  'abu dhabi': [24.45, 54.38],
  caribbean: [17.0, -61.76],
  'st maarten': [18.03, -63.05],
  'sint maarten': [18.03, -63.05],
  newport: [41.49, -71.31],
  hornsea: [53.91, -0.17],
  bridlington: [54.08, -0.19],
  scarborough: [54.28, -0.4],
  humber: [53.7, -0.4],
  'east yorkshire': [53.84, -0.43],
  lincolnshire: [53.2, -0.3],
  'east anglia': [52.6, 1.3],
  thames: [51.47, 0.2],
  'river thames': [51.47, 0.2],
  gravesend: [51.44, 0.37],
  tilbury: [51.46, 0.36],
  greenwich: [51.48, 0.0],
  woolwich: [51.49, 0.07],
  erith: [51.48, 0.18],
  dartford: [51.45, 0.22],
  purfleet: [51.48, 0.24],
  medway: [51.39, 0.54],
  chatham: [51.38, 0.53],
  sheerness: [51.44, 0.76],
  southend: [51.54, 0.71],
  nz: [-36.85, 174.76],
  uk: [52.5, -1.5],
  usa: [26.12, -80.14],
  uae: [25.08, 55.14],
  aus: [-27.97, 153.4],
  oz: [-27.97, 153.4],
  hampshire: [50.95, -1.3],
  dorset: [50.72, -2.1],
  devon: [50.5, -3.8],
  cornwall: [50.3, -5.0],
  kent: [51.2, 1.0],
  essex: [51.75, 0.6],
  norfolk: [52.65, 1.3],
  suffolk: [52.2, 1.2],
  yorkshire: [53.9, -1.3],
  sussex: [50.85, -0.2],
  'isle of wight': [50.69, -1.3],
  queensland: [-27.47, 153.03],
  'new south wales': [-33.87, 151.21],
  'western australia': [-32.05, 115.75],
  brisbane: [-27.47, 153.03],
  palma: [39.57, 2.65],
  'palma de mallorca': [39.57, 2.65],
  antibes: [43.58, 7.12],
  'cape town': [-33.92, 18.42],
  'great yarmouth': [52.6, 1.73],
  hull: [53.74, -0.33],
  aberdeen: [57.15, -2.1],
  genoa: [44.41, 8.93],
  genova: [44.41, 8.93],
};

// Pathway checklists and the provider directory came from separate research and
// sometimes name the same course differently. Checklist code -> directory codes.
const PROVIDER_CODES: Record<string, string[]> = {
  sv_eng_aux_equip_1: ['sv_eng_aux1', 'sv_eng_aux_equipment_1'],
  sv_eng_aux_equip_2: ['sv_eng_aux2'],
  sv_eng_ops_hotel_construction: ['sv_eng_op_procedures'],
  sv_eng_ce_statutory_ops: ['sv_eng_chief_stat_ops'],
  sv_eng_applied_marine_eng: ['sv_eng_applied_me'],
  sv_eng_ges_1_2: ['sv_eng_ges'],
  sv_eng_workshop_initial: ['sv_eng_workshop_skills', 'ews'],
  sv_eng_workshop_additional: ['sv_eng_workshop_skills', 'ews'],
  samsa_workshop_skills: ['sv_eng_workshop_skills', 'ews'],
  eto_workshop_skills: ['ews'],
  eto_fd_hnd: ['eto_cadetship'],
  samsa_able_seafarer_deck: ['able_seafarer_deck'],
  samsa_able_seafarer_engine: ['able_seafarer_engine'],
  samsa_ens_op: ['radar_arpa_op', 'ecdis'],
  samsa_ens_mgmt: ['radar_arpa_mgmt', 'ecdis'],
  samsa_ens_non_stcw: ['radar_arpa_op', 'rya_radar'],
  sv_firefighting_1day: ['fpff_1day_small_vessel', 'samsa_fire_small_vessels'],
  sv_firefighting_2day: ['samsa_fire_small_vessels', 'fpff'],
  sv_first_aid: ['efa', 'marine_first_aid'],
  sv_liferaft: ['pst', 'rya_sea_survival'],
  sv_rt_restricted: ['src'],
  // MCA "Accepted Equivalent to BML Approved Ancillary Safety Training" (REV/OCT24). The UK has
  // no MCA-approved BML first aid providers, so the equivalents are the only route there.
  // Seafish Sea Survival is also accepted but has no code in the directory.
  bml_first_aid: ['bml_first_aid_restricted', 'efa', 'rya_first_aid', 'seafish_basic_first_aid'],
  bml_pswt: ['bml_pswt_restricted', 'pst', 'rya_sea_survival'],
  bml_fire_safety: ['bml_fire_safety_restricted', 'fpff', 'seafish_fire_fighting'],
  // MCA approved doctors also carry out ML5 examinations.
  ml5: ['eng1'],
};

const OFFERED = new Set(OFFERED_COURSES);
/** Directory course codes that answer a checklist or picker code; empty when nobody runs it. */
export function providerCodesFor(code: string): string[] {
  return [code, ...(PROVIDER_CODES[code] ?? [])].filter((c) => OFFERED.has(c));
}

// --- Index -------------------------------------------------------------------

interface Doc {
  words: Set<string>;
  compact: string;
  /** Normalised words with single spaces, for word-order checks. */
  text: string;
}
// "General Engineering Science I and II" answers "GES 1 and 2".
const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4' };
const doc = (text: string): Doc => {
  const n = normaliseSearch(text)
    .split(' ')
    .map((w) => ROMAN[w] ?? w)
    .join(' ');
  return {
    words: new Set(n.split(' ').filter(Boolean)),
    // Phrase tokens ("ctvdeckhand") stay out, or "deckhand" would be found inside them.
    compact: n
      .split(' ')
      .filter((w) => !PHRASE_TOKENS.has(w))
      .join(''),
    text: ` ${n} `,
  };
};

const courseDocs = new Map<string, Doc>();
function courseDoc(code: string): Doc {
  let d = courseDocs.get(code);
  if (!d) {
    // "... no sea survival" in a label must not match "sea survival".
    d = doc(`${courseLabel(code).replace(/\bno [^;,)]+/gi, ' ')} ${code.replace(/_/g, ' ')} ${COURSE_SEARCH_WORDS[code] ?? ''}`);
    courseDocs.set(code, d);
  }
  return d;
}

const keywordDocs = new Map<string, Doc | null>();
function keywordDoc(code: string): Doc | null {
  if (!keywordDocs.has(code)) keywordDocs.set(code, COURSE_SEARCH_WORDS[code] ? doc(COURSE_SEARCH_WORDS[code]) : null);
  return keywordDocs.get(code)!;
}

interface Entry {
  p: Provider;
  name: Doc;
  approvals: Doc;
  place: Doc;
}
interface Index {
  entries: Entry[];
  vocab: string[];
  courseVocab: Set<string>;
  places: Map<string, { country: string; lat: number; lng: number; n: number }[]>;
  approvalPhrases: string[][];
  /** Words in so many provider names and towns ("sea", "marine") that they can't be required. */
  common: Set<string>;
  /** Middle of each country's providers, to order other countries by how far away they are. */
  centres: Map<string, { lat: number; lng: number }>;
}
const indexes = new WeakMap<Provider[], Index>();

function buildIndex(list: Provider[]): Index {
  const vocab = new Set<string>();
  const courseVocab = new Set<string>();
  const entries = list.map((p) => {
    const e: Entry = {
      p,
      name: doc(p.name),
      approvals: doc(p.approvals.map((a) => `${approvalLabel(a)} ${a}`).join(' ')),
      place: doc(
        [p.address, p.city, p.region, p.postcode, p.country, p.countryName, COUNTRY_SEARCH_WORDS[p.country]].filter(Boolean).join(' '),
      ),
    };
    for (const d of [e.name, e.approvals, e.place]) d.words.forEach((w) => vocab.add(w));
    for (const c of p.courses) courseDoc(c).words.forEach((w) => (vocab.add(w), courseVocab.add(w)));
    return e;
  });
  // Towns, regions and countries the directory covers, plus a few crew places.
  const acc = new Map<string, Map<string, { lats: number[]; lngs: number[] }>>();
  const add = (name: string | null, country: string, lat: number, lng: number) => {
    const k = name ? normaliseSearch(name) : '';
    if (!k || k.length < 3) return;
    const byCountry = acc.get(k) ?? new Map();
    const cur = byCountry.get(country) ?? { lats: [], lngs: [] };
    cur.lats.push(lat);
    cur.lngs.push(lng);
    byCountry.set(country, cur);
    acc.set(k, byCountry);
  };
  // Median, so one stray pin doesn't move a whole town.
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  for (const p of list) {
    if (p.lat == null || p.lng == null) continue;
    add(p.city, p.country, p.lat, p.lng);
    add(p.region, p.country, p.lat, p.lng);
    add(p.countryName, p.country, p.lat, p.lng);
  }
  const places = new Map<string, { country: string; lat: number; lng: number; n: number }[]>();
  acc.forEach((byCountry, k) =>
    places.set(
      k,
      Array.from(byCountry, ([country, v]) => ({
        country,
        lat: median(v.lats),
        lng: median(v.lngs),
        n: v.lats.length,
      })),
    ),
  );
  for (const [k, [lat, lng]] of Object.entries(EXTRA_PLACES)) if (!places.has(k)) places.set(k, [{ country: '', lat, lng, n: 1 }]);
  const approvalPhrases = Array.from(new Set(list.flatMap((p) => p.approvals.map((a) => normaliseSearch(approvalLabel(a))))))
    .map((s) => s.split(' '))
    .filter((w) => w.length > 1);
  const df = new Map<string, number>();
  for (const e of entries) new Set([...e.name.words, ...e.place.words]).forEach((w) => df.set(w, (df.get(w) ?? 0) + 1));
  const common = new Set(
    Array.from(df)
      .filter(([w, n]) => n > list.length * 0.06 && w.length > 2)
      .map(([w]) => w),
  );
  const centres = new Map<string, { lat: number; lng: number }>();
  const byCountry = new Map<string, Provider[]>();
  for (const p of list) if (p.lat != null && p.lng != null) byCountry.set(p.country, [...(byCountry.get(p.country) ?? []), p]);
  byCountry.forEach((ps, cc) => centres.set(cc, { lat: median(ps.map((p) => p.lat!)), lng: median(ps.map((p) => p.lng!)) }));
  return {
    entries,
    vocab: Array.from(vocab),
    courseVocab,
    places,
    approvalPhrases,
    common,
    centres,
  };
}

function indexFor(list: Provider[]): Index {
  let ix = indexes.get(list);
  if (!ix) {
    ix = buildIndex(list);
    indexes.set(list, ix);
  }
  return ix;
}

// --- Query -------------------------------------------------------------------

/** Damerau-Levenshtein distance, stopping early once it passes max. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

interface Part {
  text: string;
  /** Vocabulary word -> match quality (1 exact, 0.9 prefix, 0.7 typo). */
  quality: Map<string, number>;
}
interface Term {
  /** Spellings that count, e.g. "oow3000" and the pair "oow" + "3000". */
  forms: Part[][];
  /** Adds to the score when found, never rules a provider out. */
  optional?: boolean;
}

function termFor(w: string, vocab: string[]): Term {
  // "oow3000" may be typed as one word or two; "200gt" is 200 whatever the unit.
  const split = w.match(/^([a-z]+)(\d+)$/);
  const unit = w.match(/^(\d+)(gt|grt|m|kw|t|ton|tons|nm)$/);
  const forms = split
    ? [[w], OPTIONAL.has(split[1]) ? [split[2]] : [split[1], split[2]]]
    : unit
      ? [[w], [unit[1]]]
      : [[w], ...(ABBREVIATIONS[w] ?? [])];
  return {
    forms: forms.map((f) => f.map((text) => ({ text, quality: wordQuality(text, vocab) }))),
    optional: OPTIONAL.has(w),
  };
}

// Typing adds a letter at a time, so most words were looked up a keystroke ago.
const qualityCache = new WeakMap<string[], Map<string, Map<string, number>>>();

function wordQuality(token: string, vocab: string[]): Map<string, number> {
  let byToken = qualityCache.get(vocab);
  if (!byToken) qualityCache.set(vocab, (byToken = new Map()));
  const hit = byToken.get(token);
  if (hit) return hit;
  const q = computeQuality(token, vocab);
  if (byToken.size > 500) byToken.clear();
  byToken.set(token, q);
  return q;
}

const stemOf = (w: string) => w.replace(/(ings|ing|ers|er|ies|es|s|ed|ion|ions)$/, '');

function computeQuality(token: string, vocab: string[]): Map<string, number> {
  const q = new Map<string, number>([[token, 1]]);
  // Short tokens (PER, SRL, AB) only match whole words, or they match half the directory.
  if (token.length < 4) return q;
  const maxEdits = token.length >= 9 ? 2 : token.length >= 5 ? 1 : 0;
  const stem = stemOf(token);
  for (const w of vocab) {
    if (w === token) continue;
    if (w.startsWith(token)) q.set(w, 0.9);
    // "engineering" finds "engineer", "certificates" finds "certificate".
    else if (stem.length >= 4 && (stem === w || stemOf(w) === stem || stemOf(w) === token)) q.set(w, 0.85);
    else if (maxEdits && editDistance(token, w, maxEdits) <= maxEdits) q.set(w, 0.7);
  }
  return q;
}

/** Query words, with fillers dropped and "eng 1" joined back to "eng1". */
export function queryWords(q: string): string[] {
  const raw = normaliseSearch(q)
    .split(' ')
    .filter(Boolean)
    .map((w, i, all) =>
      NUMBER_WORDS[w] && !(w === 'six' && all[i + 1] === 'pack') ? NUMBER_WORDS[w] : ROMAN[w] && w !== 'i' ? ROMAN[w] : w,
    );
  const joined: string[] = [];
  for (const w of raw) {
    const prev = joined[joined.length - 1];
    if (prev && /^\d+$/.test(w) && /[a-z]$/.test(prev) && !FILLER.has(prev)) joined[joined.length - 1] = prev + w;
    else joined.push(w);
  }
  // Role phrases that only mean something together ("CTV deckhand" is GWO and transfer training).
  for (let i = 0; i < joined.length - 1; i++) {
    const pair = `${joined[i]} ${joined[i + 1]}`;
    if (PHRASES.has(pair)) joined.splice(i, 2, pair.replace(' ', ''));
  }
  const words = joined.filter((w) => !FILLER.has(w));
  // "Training centre" on its own still means something.
  return words.length ? words : joined;
}

interface Parsed {
  terms: Term[];
  place: { lat: number; lng: number } | null;
  /** The words taken as the place, kept so "Warsash" still finds Warsash Maritime School. */
  placeWords: string[];
  /** Country of that place ('' for a crew place such as "Solent"). */
  placeCountry: string;
  /** Makes very common words optional; false when there were none to relax. */
  relax: () => boolean;
}

function parseQuery(q: string, ix: Index, homeCountry: string | null | undefined): Parsed {
  let tokens = normaliseSearch(q).split(' ').filter(Boolean);
  // Find a place: the longest run of words naming a town, region or country,
  // unless those words are part of a body's name ("Transport Malta").
  const inApproval = new Set<number>();
  ix.approvalPhrases.forEach((ph) => {
    for (let i = 0; i + ph.length <= tokens.length; i++)
      if (ph.every((w, k) => tokens[i + k] === w)) for (let k = 0; k < ph.length; k++) inApproval.add(i + k);
  });
  let place: Parsed['place'] = null;
  let placeWords: string[] = [];
  let placeCountry = '';
  const meaningful = tokens.filter((t) => !FILLER.has(t)).length;
  outer: for (let n = 3; n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      if (Array.from({ length: n }, (_, k) => i + k).some((k) => inApproval.has(k))) continue;
      const phrase = tokens.slice(i, i + n).join(' ');
      const hits = ix.places.get(phrase);
      if (!hits) continue;
      // A lone word that is also course vocabulary ("hull") is only a place next to other words.
      if (n === 1 && ix.courseVocab.has(phrase) && meaningful <= 1) continue;
      const home = hits.find((h) => h.country && h.country === homeCountry?.toUpperCase());
      const best = home ?? hits.reduce((a, b) => (b.n > a.n ? b : a));
      place = { lat: best.lat, lng: best.lng };
      placeCountry = best.country;
      placeWords = tokens.slice(i, i + n);
      tokens = [...tokens.slice(0, i), ...tokens.slice(i + n)];
      break outer;
    }
  }
  const words = queryWords(tokens.join(' '));
  const terms = words.map((w) => termFor(w, ix.vocab));
  // "First aid at sea": "sea" is in a third of the directory's names. If the
  // strict search finds next to nothing, it ranks instead of filtering.
  const relax = () => {
    if (!terms.some((t, i) => !t.optional && !ix.common.has(words[i]))) return false;
    let changed = false;
    terms.forEach((t, i) => ix.common.has(words[i]) && !t.optional && (t.optional = changed = true));
    return changed;
  };
  // A query of only optional words ("certificate") still has to match.
  if (terms.every((t) => t.optional)) terms.forEach((t) => (t.optional = false));
  return {
    terms: tokens.length && !words.length ? [] : terms,
    place,
    placeWords,
    placeCountry,
    relax,
  };
}

/** The country whose providers sit nearest a point, by the middle of each country's providers. */
export function nearestCountry(list: Provider[], at: { lat: number; lng: number }): string | null {
  const ix = indexFor(list);
  let best: string | null = null;
  let bestKm = Infinity;
  for (const p of list) {
    if (p.lat == null || p.lng == null) continue;
    const km = haversineKm(at.lat, at.lng, p.lat, p.lng);
    if (km < bestKm) [best, bestKm] = [p.country, km];
  }
  // A point far from every provider (mid ocean) says nothing about a country.
  return best && bestKm <= 500 && ix.centres.has(best) ? best : null;
}

/**
 * The town, region or country typed in a search, as a country code, and the
 * words taken as it. Null when the query names no place.
 */
export function queryPlaceCountry(
  list: Provider[],
  query: string,
  homeCountry?: string | null,
): { country: string | null; words: string[] } | null {
  const ix = indexFor(list);
  const { place, placeWords, placeCountry } = parseQuery(query, ix, homeCountry);
  if (!place) return null;
  return { country: placeCountry || nearestCountry(list, place), words: placeWords };
}

function termInDoc(t: Term, d: Doc): number {
  let best = 0;
  for (const form of t.forms) {
    let formQ = 1;
    for (const part of form) {
      let q = 0;
      d.words.forEach((w) => (q = Math.max(q, part.quality.get(w) ?? 0)));
      // Joined spellings: "firefighting" in "Fire Fighting", "pscrbotl" in "PSCRB-OTL".
      if (q < 0.8 && part.text.length >= 5 && d.compact.includes(part.text)) q = 0.8;
      formQ = Math.min(formQ, q);
    }
    best = Math.max(best, formQ);
  }
  return best;
}

/**
 * How well a provider answers the terms. Every term must be found in one of
 * its courses or in its name, approvals or address. Course matches weigh most;
 * tier 2 means one course on its own answered the whole query.
 */
function scoreEntry(e: Entry, terms: Term[]): { score: number; tier: number } | null {
  if (!terms.length) return { score: 0, tier: 0 };
  const meta = terms.map((t) => Math.max(termInDoc(t, e.name) * 2, termInDoc(t, e.approvals) * 1.5, termInDoc(t, e.place)));
  let best: { score: number; tier: number } | null = null;
  let matchedCourses = 0;
  const consider = (score: number, tier: number) => {
    if (!best || tier > best.tier || (tier === best.tier && score > best.score)) best = { score, tier };
  };
  const required = terms.filter((t) => !t.optional).length;
  for (const c of e.p.courses) {
    const d = courseDoc(c);
    const kw = keywordDoc(c);
    const code = c.replace(/_/g, '');
    let score = 0;
    let inCourse = 0;
    let missing = 0;
    for (let i = 0; i < terms.length; i++) {
      // Crew shorthand indexed for the course counts a little more than a word that happens to be in a label.
      const qc = Math.max(termInDoc(terms[i], d) * 3, kw ? termInDoc(terms[i], kw) * 3.05 : 0);
      const q = Math.max(qc, meta[i]);
      if (!q) {
        if (!terms[i].optional) missing++;
        continue;
      }
      if (qc && qc >= meta[i] && !terms[i].optional) inCourse++;
      // An optional word only nudges the order.
      score += terms[i].optional ? q * 0.1 : q;
      // Typing the course's own code ("EFA", "AEC1") beats it appearing inside another code.
      if (terms[i].forms.some((f) => f.map((x) => x.text).join('') === code)) score += 1.5;
      // Words in the order typed: "master yachts" is Master (Yachts), not Yachtmaster's "yacht master".
      if (i > 0 && d.text.includes(` ${terms[i - 1].forms[0][0].text} ${terms[i].forms[0][0].text} `)) score += 1;
    }
    // GWO and OPITO courses answer "sea survival" too, but only count for wind and
    // offshore work: they follow the STCW and RYA ones unless the scheme is named.
    if (/^(gwo|opito)_/.test(c) && !terms.some((t) => ['gwo', 'opito', 'wind', 'offshore'].some((w) => t.forms[0][0].text === w)))
      score -= 1;
    if (!missing) {
      consider(score, inCourse === required ? 2 : 1);
      if (inCourse === required) matchedCourses++;
    } else if (missing === 1 && required >= 3 && inCourse === required - 1) {
      // Near miss on a long query ("basic sea survival" -> RYA Sea Survival): shown after every full match.
      consider(score, 0.5);
    }
  }
  // Provider name, body or town on their own ("Seascope", "Warsash").
  if (meta.every((m, i) => m > 0 || terms[i].optional))
    consider(
      meta.reduce((a, b) => a + b, 0),
      1,
    );
  // A centre running several matching courses (all of STCW basic) beats one that runs one.
  const b = best as { score: number; tier: number } | null;
  return b ? { score: b.score + Math.min(matchedCourses - 1, 5) * 0.1, tier: b.tier } : null;
}

export function matchesQuery(p: Provider, q: string): boolean {
  return (
    searchProviders([p], {
      query: q,
      course: null,
      sector: null,
      approval: null,
      origin: null,
      radiusKm: null,
    }).length > 0
  );
}

/** Matches a picker label (and its code) to what the user typed, spacing, punctuation and small typos ignored. */
export function labelMatches(label: string, code: string, q: string): boolean {
  const words = queryWords(q);
  if (!words.length) return true;
  const d = doc(`${label} ${code.replace(/_/g, ' ')} ${COURSE_SEARCH_WORDS[code] ?? ''}`);
  const vocab = Array.from(d.words);
  return words.every((w) => termInDoc(termFor(w, vocab), d) > 0);
}

// The Channel Islands and Isle of Man count as home for UK phones.
const HOME_GROUPS: Record<string, string[]> = { GB: ['GB', 'JE', 'GG', 'IM'] };

// How much closer a provider with published dates for the course counts as.
const DATED_KM = 25;

export function searchProviders(list: Provider[], f: ProviderFilters): ProviderHit[] {
  const ix = indexFor(list);
  const hc = f.homeCountry?.toUpperCase();
  const home = new Set(hc ? (HOME_GROUPS[hc] ?? [hc]) : []);
  const homeCentre = hc ? ix.centres.get(hc) : undefined;
  const away = new Map<string, number>();
  const awayFromHome = (p: Provider) => {
    if (!homeCentre) return 0;
    let d = away.get(p.country);
    if (d == null) {
      const c = ix.centres.get(p.country);
      d = c ? Math.round(haversineKm(homeCentre.lat, homeCentre.lng, c.lat, c.lng) / 500) : 99;
      away.set(p.country, d);
    }
    return d;
  };
  const { terms, place, placeWords, relax } = parseQuery(f.query, ix, hc);
  const placeAsName = placeWords.length ? placeWords.map((w) => termFor(w, ix.vocab)) : null;
  const courseCodes = f.course ? [f.course, ...(PROVIDER_CODES[f.course] ?? [])] : null;
  const dated = f.course && f.dated?.size ? f.dated : null;
  // A place typed in the search box wins over the phone's location for ordering.
  const from = place ?? f.origin;
  const run = () => {
    const scored: (ProviderHit & { score: number; tier: number })[] = [];
    for (const e of ix.entries) {
      const p = e.p;
      if (courseCodes && !p.courses.some((c) => courseCodes.includes(c))) continue;
      if (f.sector && !p.sectors.includes(f.sector)) continue;
      if (f.approval && !p.approvals.includes(f.approval)) continue;
      const s = scoreEntry(e, terms);
      if (!s) continue;
      const originKm = f.origin && p.lat != null && p.lng != null ? haversineKm(f.origin.lat, f.origin.lng, p.lat, p.lng) : null;
      // A typed place replaces "near me", so its radius doesn't apply.
      if (!place && f.origin && f.radiusKm != null && (originKm == null || originKm > f.radiusKm)) continue;
      const distanceKm = from && p.lat != null && p.lng != null ? haversineKm(from.lat, from.lng, p.lat, p.lng) : null;
      // "Warsash", "Bluewater Antibes": a provider named after the place comes first.
      const named = placeAsName && placeAsName.every((t) => termInDoc(t, e.name) >= 0.9);
      scored.push({
        provider: p,
        distanceKm,
        score: s.score,
        tier: s.tier + (named ? 1 : 0),
      });
    }
    return scored;
  };
  let scored = run();
  if (scored.filter((h) => h.tier >= 1).length < 3 && relax()) scored = run();
  // A typed place: something that answers the query within 1,000 km beats an exact
  // match on the far side of the world ("sea survival refresher St Maarten").
  // Far results drop below the best nearby kind of match but keep their own order.
  const nearBest = place
    ? Math.max(0, ...scored.filter((h) => h.tier > 0 && h.distanceKm != null && h.distanceKm <= 1000).map((h) => h.tier))
    : 0;
  if (nearBest > 0)
    scored.forEach((h) => {
      if (h.distanceKm == null || h.distanceKm > 1000) h.tier = Math.min(h.tier, nearBest - 0.5 + h.tier / 10);
    });
  // Only a place was typed ("Palma"): keep what's around it.
  let hits = scored;
  if (place && !terms.length) {
    const close = scored.filter((h) => h.tier > 0 || (h.distanceKm != null && h.distanceKm <= 150));
    hits = close.length
      ? close
      : scored
          .filter((h) => h.distanceKm != null)
          .sort((a, b) => a.distanceKm! - b.distanceKm!)
          .slice(0, 30);
  }
  hits.sort((a, b) => {
    if (a.tier !== b.tier) return b.tier - a.tier;
    if (from) {
      // Distance, with each point of match quality worth 40 km: a full STCW centre
      // 20 km away beats a tanker school next door for "STCW Sydney".
      const da = a.distanceKm != null ? a.distanceKm - a.score * 40 - (dated?.has(a.provider.id) ? DATED_KM : 0) : null;
      const db = b.distanceKm != null ? b.distanceKm - b.score * 40 - (dated?.has(b.provider.id) ? DATED_KM : 0) : null;
      if (da != null && db != null && Math.abs(da - db) >= 1) return da - db;
      if (a.distanceKm != null && b.distanceKm == null) return -1;
      if (b.distanceKm != null && a.distanceKm == null) return 1;
    }
    // Whole points of score first (a better kind of match), then home country, then the rest.
    return (
      Math.floor(b.score) - Math.floor(a.score) ||
      Number(!home.has(a.provider.country)) - Number(!home.has(b.provider.country)) ||
      Number(!dated?.has(a.provider.id)) - Number(!dated?.has(b.provider.id)) ||
      b.score - a.score ||
      // Other countries nearest to the user's own first (a UK user sees Ireland before Australia).
      awayFromHome(a.provider) - awayFromHome(b.provider) ||
      a.provider.country.localeCompare(b.provider.country) ||
      a.provider.name.localeCompare(b.provider.name)
    );
  });
  return hits.map(({ provider, distanceKm }) => ({ provider, distanceKm }));
}

// Bodies that run their own course schemes worldwide. A course mostly taught
// under one of these (RYA Yachtmaster, SRC, PPR) isn't an authority's course.
const SCHEME_BODIES = ['rya', 'iyt', 'gwo', 'opito'];

/**
 * The approval "Find a course" starts on for a user of this authority: their
 * own, unless nobody runs the course under it (ENG1 for a USCG user) or it is
 * a scheme course mostly run under the RYA, IYT, GWO or OPITO (Yachtmaster
 * theory, SRC, PPR), where an authority filter would hide most of the schools.
 */
export function defaultApproval(list: Provider[], course: string | null, authority: string | null): string | null {
  if (!authority || !list.some((p) => p.approvals.includes(authority))) return null;
  if (!course) return authority;
  const codes = [course, ...(PROVIDER_CODES[course] ?? [])];
  const runs = list.filter((p) => p.courses.some((c) => codes.includes(c)));
  if (!runs.some((p) => p.approvals.includes(authority))) return null;
  const scheme = SCHEME_BODIES.some((b) => b !== authority && runs.filter((p) => p.approvals.includes(b)).length >= runs.length * 0.6);
  return scheme ? null : authority;
}

/**
 * When the approval filter puts the nearest provider far away, how many run the
 * course under other approvals closer than that (PSCRB on the Riviera for an MCA
 * user, STCW in Antibes for a SAMSA user). 0 when the filter costs little.
 */
export function closerUnderOtherApprovals(list: Provider[], f: ProviderFilters): { count: number; nearestKm: number | null } {
  // Distances come from "near me" or a place typed in the search; without either there is nothing to compare.
  if (!f.approval) return { count: 0, nearestKm: null };
  const own = searchProviders(list, { ...f, radiusKm: null });
  const ownKm = own[0]?.distanceKm ?? null;
  const all = searchProviders(list, { ...f, approval: null, radiusKm: null });
  const allKm = all[0]?.distanceKm ?? null;
  if (allKm == null || (ownKm != null && ownKm <= Math.max(allKm * 3, allKm + 100))) return { count: 0, nearestKm: ownKm };
  const count = all.filter(
    (h) => h.distanceKm != null && (ownKm == null || h.distanceKm < ownKm) && !h.provider.approvals.includes(f.approval!),
  ).length;
  return { count, nearestKm: ownKm };
}

/** How many providers the approval filter is hiding for this search or course (0 when there is no query or course). */
export function hiddenByApproval(list: Provider[], f: ProviderFilters): number {
  if (!f.approval || (!f.query.trim() && !f.course)) return 0;
  const shown = searchProviders(list, f).length;
  return searchProviders(list, { ...f, approval: null }).length - shown;
}
