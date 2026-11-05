// Find a course search evaluation: runs the way crew actually search, bottom
// rung to top, yacht and commercial, every certifying body, as personas drawn
// from the user base (nationality, authority, where their vessels are).
//   npx tsx scripts/search-eval.ts [--fail-only] [--json out.json]
// Scores each typed query against the providers that really run the course:
// recall (did we find them), precision of the first 10 rows, and for "course
// + place" searches whether the first row is near the place.
import fs from 'fs';
import { CHECKLISTS } from '@/constants/courseChecklists';
import { searchProviders, providerCodesFor, type Provider } from '@/utils/providerSearch';
import { TRAINING_PROVIDERS_JSON } from '@/backend/src/data/training-providers';

const list: Provider[] = JSON.parse(TRAINING_PROVIDERS_JSON).providers;
const failOnly = process.argv.includes('--fail-only');

type Place = [number, number, string];
const P: Record<string, Place> = {
  palma: [39.57, 2.65, 'Palma'], antibes: [43.58, 7.12, 'Antibes'], genoa: [44.41, 8.93, 'Genoa'],
  barcelona: [41.38, 2.18, 'Barcelona'], lisbon: [38.72, -9.14, 'Lisbon'], malta: [35.9, 14.5, 'Malta'],
  athens: [37.94, 23.64, 'Piraeus'], marmaris: [36.85, 28.27, 'Marmaris'], limassol: [34.68, 33.04, 'Limassol'],
  southampton: [50.9, -1.4, 'Southampton'], falmouth: [50.15, -5.07, 'Falmouth'], hull: [53.74, -0.33, 'Hull'],
  yarmouth: [52.6, 1.73, 'Great Yarmouth'], aberdeen: [57.15, -2.1, 'Aberdeen'], london: [51.5, -0.1, 'London'],
  liverpool: [53.4, -2.98, 'Liverpool'], cork: [51.9, -8.47, 'Cork'], kiel: [54.32, 10.13, 'Kiel'],
  rotterdam: [51.92, 4.48, 'Rotterdam'], ftl: [26.12, -80.14, 'Fort Lauderdale'], newport: [41.49, -71.31, 'Newport'],
  la: [33.74, -118.27, 'Los Angeles'], morehead: [34.72, -76.73, 'Morehead City'], seattle: [47.6, -122.33, 'Seattle'],
  goldcoast: [-27.97, 153.4, 'Gold Coast'], sydney: [-33.87, 151.21, 'Sydney'], fremantle: [-32.05, 115.75, 'Fremantle'],
  auckland: [-36.85, 174.76, 'Auckland'], capetown: [-33.92, 18.42, 'Cape Town'], durban: [-29.86, 31.03, 'Durban'],
  phuket: [7.88, 98.39, 'Phuket'], singapore: [1.29, 103.85, 'Singapore'], dubai: [25.08, 55.14, 'Dubai'],
  tahiti: [-17.54, -149.57, 'Papeete'], halifax: [44.65, -63.57, 'Halifax'], vancouver: [49.28, -123.12, 'Vancouver'],
  split: [43.51, 16.44, 'Split'], manila: [14.59, 120.98, 'Manila'], lagos: [6.45, 3.4, 'Lagos'], mumbai: [18.94, 72.84, 'Mumbai'],
  shanghai: [31.23, 121.47, 'Shanghai'], antigua: [17.0, -61.76, 'Antigua'],
};

// Every query: what someone types, the course codes that count as a right
// answer, and the place they mean (if any). Ordered bottom rung first.
interface Q { q: string; codes: string[]; near?: Place; tier: string; }
const STCW_BASIC = ['pst', 'fpff', 'efa', 'pssr', 'stcw_basic_refresher', 'uscg_basic_training', 'amsa_cst', 'tc_med'];
const Qs: Q[] = [
  // Entry: medicals and STCW basic training
  { tier: '0 entry', q: 'ENG1', codes: ['eng1'] },
  { tier: '0 entry', q: 'eng 1 medical', codes: ['eng1'] },
  { tier: '0 entry', q: 'seafarer medical', codes: ['eng1'] },
  { tier: '0 entry', q: 'ML5', codes: ['eng1'] },
  { tier: '0 entry', q: 'ENG1 Palma', codes: ['eng1'], near: P.palma },
  { tier: '0 entry', q: 'eng1 antibes', codes: ['eng1'], near: P.antibes },
  { tier: '0 entry', q: 'ENG1 Fort Lauderdale', codes: ['eng1'], near: P.ftl },
  { tier: '0 entry', q: 'STCW basic safety', codes: STCW_BASIC },
  { tier: '0 entry', q: 'STCW 95', codes: STCW_BASIC },
  { tier: '0 entry', q: 'STCW basic training', codes: STCW_BASIC },
  { tier: '0 entry', q: 'basic safety training', codes: STCW_BASIC },
  { tier: '0 entry', q: 'stcw basic saftey', codes: STCW_BASIC },
  { tier: '0 entry', q: 'STCW Palma', codes: STCW_BASIC, near: P.palma },
  { tier: '0 entry', q: 'STCW basic Antibes', codes: STCW_BASIC, near: P.antibes },
  { tier: '0 entry', q: 'STCW Fort Lauderdale', codes: STCW_BASIC, near: P.ftl },
  { tier: '0 entry', q: 'STCW Cape Town', codes: STCW_BASIC, near: P.capetown },
  { tier: '0 entry', q: 'STCW Gold Coast', codes: STCW_BASIC, near: P.goldcoast },
  { tier: '0 entry', q: 'STCW Phuket', codes: STCW_BASIC, near: P.phuket },
  { tier: '0 entry', q: 'STCW Dubai', codes: STCW_BASIC, near: P.dubai },
  { tier: '0 entry', q: 'STCW Malta', codes: STCW_BASIC, near: P.malta },
  { tier: '0 entry', q: 'STCW Auckland', codes: STCW_BASIC, near: P.auckland },
  { tier: '0 entry', q: 'STCW Singapore', codes: STCW_BASIC, near: P.singapore },
  { tier: '0 entry', q: 'sea survival', codes: ['pst', 'rya_sea_survival', 'gwo_sea_survival', 'offshore_personal_survival'] },
  { tier: '0 entry', q: 'personal survival techniques', codes: ['pst'] },
  { tier: '0 entry', q: 'PST', codes: ['pst', 'pst_refresher'] },
  { tier: '0 entry', q: 'fire fighting', codes: ['fpff', 'fpff_refresher', 'aff', 'fpff_1day_small_vessel', 'bml_fire_safety', 'samsa_fire_small_vessels', 'gwo_fire_awareness', 'tanker_ff', 'seafish_fire_fighting'] },
  { tier: '0 entry', q: 'firefighting', codes: ['fpff', 'fpff_refresher', 'aff', 'fpff_1day_small_vessel', 'bml_fire_safety', 'samsa_fire_small_vessels', 'gwo_fire_awareness', 'tanker_ff', 'seafish_fire_fighting'] },
  { tier: '0 entry', q: 'fire figting', codes: ['fpff', 'fpff_refresher', 'aff', 'fpff_1day_small_vessel', 'bml_fire_safety', 'samsa_fire_small_vessels', 'gwo_fire_awareness', 'tanker_ff', 'seafish_fire_fighting'] },
  { tier: '0 entry', q: 'FPFF', codes: ['fpff', 'fpff_refresher'] },
  { tier: '0 entry', q: 'elementary first aid', codes: ['efa', 'efa_refresher'] },
  { tier: '0 entry', q: 'EFA', codes: ['efa', 'efa_refresher'] },
  { tier: '0 entry', q: 'first aid', codes: ['efa', 'efa_refresher', 'mfa', 'rya_first_aid', 'gwo_first_aid', 'gwo_efa', 'marine_first_aid', 'first_aid_responder', 'uscg_first_aid_cpr', 'tc_marine_basic_first_aid', 'tc_marine_advanced_first_aid', 'bml_first_aid_restricted', 'seafish_basic_first_aid', 'hse_offshore_first_aid', 'medical_care', 'mfa_refresher'] },
  { tier: '0 entry', q: 'PSSR', codes: ['pssr'] },
  { tier: '0 entry', q: 'social responsibilities', codes: ['pssr'] },
  { tier: '0 entry', q: 'PSA', codes: ['psa'] },
  { tier: '0 entry', q: 'security awareness', codes: ['psa'] },
  { tier: '0 entry', q: 'PDSD', codes: ['dsd'] },
  { tier: '0 entry', q: 'designated security duties', codes: ['dsd'] },
  { tier: '0 entry', q: 'STCW refresher', codes: ['stcw_basic_refresher', 'pst_refresher', 'fpff_refresher'] },
  { tier: '0 entry', q: 'STCW update', codes: ['stcw_basic_refresher', 'pst_refresher', 'fpff_refresher'] },
  // Entry: yacht and small boat
  { tier: '1 small boat', q: 'powerboat level 2', codes: ['powerboat_l2'] },
  { tier: '1 small boat', q: 'PB2', codes: ['powerboat_l2'] },
  { tier: '1 small boat', q: 'RYA PB2 Palma', codes: ['powerboat_l2'], near: P.palma },
  { tier: '1 small boat', q: 'powerbaot level 2', codes: ['powerboat_l2'] },
  { tier: '1 small boat', q: 'tender driver', codes: ['rya_tender_operator', 'powerboat_l2', 'yacht_tender_ops'] },
  { tier: '1 small boat', q: 'tender operator', codes: ['rya_tender_operator', 'yacht_tender_ops'] },
  { tier: '1 small boat', q: 'jet ski', codes: ['pwc'] },
  { tier: '1 small boat', q: 'PWC', codes: ['pwc'] },
  { tier: '1 small boat', q: 'VHF', codes: ['src', 'amsa_vhf', 'amsa_vhf_hf', 'nz_maritime_vhf'] },
  { tier: '1 small boat', q: 'VHF radio licence', codes: ['src', 'amsa_vhf', 'amsa_vhf_hf', 'nz_maritime_vhf'] },
  { tier: '1 small boat', q: 'SRC', codes: ['src'] },
  { tier: '1 small boat', q: 'short range certificate', codes: ['src'] },
  { tier: '1 small boat', q: 'competent crew', codes: ['competent_crew'] },
  { tier: '1 small boat', q: 'day skipper', codes: ['day_skipper', 'day_skipper_sb', 'samsa_skipper_day_9m'] },
  { tier: '1 small boat', q: 'ICC', codes: ['icc', 'icc_assessment'] },
  { tier: '1 small boat', q: 'RYA first aid', codes: ['rya_first_aid'] },
  { tier: '1 small boat', q: 'diesel engine course', codes: ['rya_diesel_engine', 'is_basic_marine_engine'] },
  // Ratings, yacht and commercial
  { tier: '2 rating', q: 'yacht rating', codes: ['yacht_rating'] },
  { tier: '2 rating', q: 'deckhand course', codes: ['yacht_rating', 'iyt_superyacht_deck_crew', 'iyt_superyacht_crew', 'iyt_international_crew', 'amsa_gph'] },
  { tier: '2 rating', q: 'superyacht crew', codes: ['iyt_superyacht_crew', 'iyt_superyacht_deck_crew', 'iyt_superyacht_hospitality', 'yacht_interior', 'guest', 'yacht_rating'] },
  { tier: '2 rating', q: 'stew course', codes: ['guest', 'yacht_interior', 'junior_steward', 'iyt_superyacht_hospitality'] },
  { tier: '2 rating', q: 'interior', codes: ['guest', 'yacht_interior', 'junior_steward', 'iyt_superyacht_hospitality'] },
  { tier: '2 rating', q: 'GUEST', codes: ['guest'] },
  { tier: '2 rating', q: 'yacht chef', codes: ['iyt_superyacht_chef', 'ship_cook'] },
  { tier: '2 rating', q: "ship's cook", codes: ['ship_cook'] },
  { tier: '2 rating', q: 'food hygiene', codes: ['food_hygiene'] },
  { tier: '2 rating', q: 'NWR', codes: ['nav_watch_rating', 'nwr_special_route', 'rating_nav_watch', 'uscg_rfpnw'] },
  { tier: '2 rating', q: 'navigational watch rating', codes: ['nav_watch_rating', 'nwr_special_route', 'rating_nav_watch', 'uscg_rfpnw'] },
  { tier: '2 rating', q: 'EDH', codes: ['edh'] },
  { tier: '2 rating', q: 'efficient deck hand', codes: ['edh'] },
  { tier: '2 rating', q: 'able seafarer deck', codes: ['able_seafarer_deck', 'uscg_able_seafarer_deck'] },
  { tier: '2 rating', q: 'AB course', codes: ['able_seafarer_deck', 'able_seafarer_engine', 'uscg_able_seaman', 'uscg_able_seafarer_deck'] },
  { tier: '2 rating', q: 'engine rating', codes: ['er_watch_rating', 'rating_engine_watch', 'uscg_rfpew', 'able_seafarer_engine', 'tc_engine_room_rating', 'es_marinero_maquinas'] },
  { tier: '2 rating', q: 'PSCRB', codes: ['pscrb', 'pscrb_otl', 'pscrb_refresher', 'pscrb_otl_refresher'] },
  { tier: '2 rating', q: 'survival craft', codes: ['pscrb', 'pscrb_otl', 'pscrb_refresher', 'pscrb_otl_refresher', 'uscg_lifeboatman_limited'] },
  { tier: '2 rating', q: 'PSCRB Palma', codes: ['pscrb', 'pscrb_otl'], near: P.palma },
  { tier: '2 rating', q: 'PSCRB Mallorca', codes: ['pscrb', 'pscrb_otl'], near: P.palma },
  { tier: '2 rating', q: 'PSCRB Southampton', codes: ['pscrb', 'pscrb_otl'], near: P.southampton },
  { tier: '2 rating', q: 'lifeboatman', codes: ['uscg_lifeboatman_limited', 'pscrb'] },
  { tier: '2 rating', q: 'fast rescue boat', codes: ['frb', 'frb_refresher', 'opito_frc'] },
  { tier: '2 rating', q: 'FRB', codes: ['frb', 'frb_refresher'] },
  // Officer of the watch / skipper, yacht
  { tier: '3 OOW yacht', q: 'yachtmaster', codes: ['ym_coastal', 'ym_offshore', 'ym_ocean', 'ym_offshore_sb', 'ym_ocean_sb', 'irish_sailing_yachtmaster'] },
  { tier: '3 OOW yacht', q: 'yacht master', codes: ['ym_coastal', 'ym_offshore', 'ym_ocean', 'ym_offshore_sb', 'ym_ocean_sb', 'irish_sailing_yachtmaster', 'iyt_master_of_yachts', 'iyt_master_yachts_unlimited'] },
  { tier: '3 OOW yacht', q: 'yatchmaster offshore', codes: ['ym_offshore', 'ym_offshore_sb'] },
  { tier: '3 OOW yacht', q: 'yachtmaster offshore', codes: ['ym_offshore', 'ym_offshore_sb'] },
  { tier: '3 OOW yacht', q: 'YM offshore', codes: ['ym_offshore', 'ym_offshore_sb'] },
  { tier: '3 OOW yacht', q: 'yachtmaster offshore Antibes', codes: ['ym_offshore', 'ym_offshore_sb'], near: P.antibes },
  { tier: '3 OOW yacht', q: 'yachtmaster Auckland', codes: ['ym_coastal', 'ym_offshore', 'ym_ocean', 'ym_offshore_sb', 'ym_ocean_sb'], near: P.auckland },
  { tier: '3 OOW yacht', q: 'yachtmaster ocean', codes: ['ym_ocean', 'ym_ocean_sb'] },
  { tier: '3 OOW yacht', q: 'coastal skipper', codes: ['coastal_skipper', 'samsa_skipper_coastal'] },
  { tier: '3 OOW yacht', q: 'OOW 3000', codes: ['oow_yachts_gsk', 'oow_yachts_nav_radar', 'oow_yachts_oral_prep'] },
  { tier: '3 OOW yacht', q: 'OOW yachts', codes: ['oow_yachts_gsk', 'oow_yachts_nav_radar', 'oow_yachts_oral_prep'] },
  { tier: '3 OOW yacht', q: 'general ship knowledge', codes: ['oow_yachts_gsk'] },
  { tier: '3 OOW yacht', q: 'GSK', codes: ['oow_yachts_gsk', 'no_gsk', 'no_gsk_refresher', 'tc_deck_modules'] },
  { tier: '3 OOW yacht', q: 'nav and radar', codes: ['oow_yachts_nav_radar', 'wbc3_nav_radar'] },
  { tier: '3 OOW yacht', q: 'radar', codes: ['rya_radar', 'oow_yachts_nav_radar', 'radar_arpa_op', 'radar_arpa_mgmt', 'uscg_radar_observer', 'uscg_radar_observer_renewal', 'uscg_arpa', 'wbc3_nav_radar'] },
  { tier: '3 OOW yacht', q: 'GMDSS', codes: ['gmdss_goc', 'gmdss_roc', 'gmdss_refresher', 'lrc'] },
  { tier: '3 OOW yacht', q: 'GOC', codes: ['gmdss_goc'] },
  { tier: '3 OOW yacht', q: 'GMDSS GOC Palma', codes: ['gmdss_goc'], near: P.palma },
  { tier: '3 OOW yacht', q: 'ROC', codes: ['gmdss_roc'] },
  { tier: '3 OOW yacht', q: 'long range certificate', codes: ['lrc'] },
  { tier: '3 OOW yacht', q: 'HELM operational', codes: ['helm_op'] },
  { tier: '3 OOW yacht', q: 'HELM op', codes: ['helm_op'] },
  { tier: '3 OOW yacht', q: 'helm managment', codes: ['helm_mgmt'] },
  { tier: '3 OOW yacht', q: 'HELM', codes: ['helm_op', 'helm_mgmt'] },
  { tier: '3 OOW yacht', q: 'ECDIS', codes: ['ecdis'] },
  { tier: '3 OOW yacht', q: 'ecids', codes: ['ecdis'] },
  { tier: '3 OOW yacht', q: 'ECDIS Antibes', codes: ['ecdis'], near: P.antibes },
  { tier: '3 OOW yacht', q: 'medical first aid', codes: ['mfa', 'mfa_refresher'] },
  { tier: '3 OOW yacht', q: 'MFA', codes: ['mfa', 'mfa_refresher'] },
  { tier: '3 OOW yacht', q: 'advanced fire fighting', codes: ['aff', 'aff_refresher'] },
  { tier: '3 OOW yacht', q: 'AFF', codes: ['aff', 'aff_refresher'] },
  { tier: '3 OOW yacht', q: 'advanced firefighting Palma', codes: ['aff'], near: P.palma },
  { tier: '3 OOW yacht', q: 'SSO', codes: ['sso'] },
  { tier: '3 OOW yacht', q: 'ship security officer', codes: ['sso'] },
  { tier: '3 OOW yacht', q: 'IYT master of yachts', codes: ['iyt_master_of_yachts', 'iyt_master_yachts_unlimited'] },
  // Engineering, yacht and small vessel
  { tier: '3 engineer', q: 'AEC', codes: ['aec1', 'aec2'] },
  { tier: '3 engineer', q: 'AEC 1', codes: ['aec1'] },
  { tier: '3 engineer', q: 'AEC2', codes: ['aec2'] },
  { tier: '3 engineer', q: 'approved engine course', codes: ['aec1', 'aec2'] },
  { tier: '3 engineer', q: 'AEC Antibes', codes: ['aec1', 'aec2'], near: P.antibes },
  { tier: '3 engineer', q: 'AEC Palma', codes: ['aec1', 'aec2'], near: P.palma },
  { tier: '3 engineer', q: 'MEOL', codes: ['aec2', 'sv_eng_marine_diesel', 'sv_eng_op_procedures'] },
  { tier: '3 engineer', q: 'small vessel engineer', codes: ['sv_eng_applied_me', 'sv_eng_aux1', 'sv_eng_aux2', 'sv_eng_aux_equipment_1', 'sv_eng_chief_stat_ops', 'sv_eng_ges', 'sv_eng_marine_diesel', 'sv_eng_op_procedures', 'sv_eng_workshop_skills'] },
  { tier: '3 engineer', q: 'SV engineering', codes: ['sv_eng_applied_me', 'sv_eng_aux1', 'sv_eng_aux2', 'sv_eng_aux_equipment_1', 'sv_eng_chief_stat_ops', 'sv_eng_ges', 'sv_eng_marine_diesel', 'sv_eng_op_procedures', 'sv_eng_workshop_skills'] },
  { tier: '3 engineer', q: 'marine diesel', codes: ['sv_eng_marine_diesel', 'rya_diesel_engine'] },
  { tier: '3 engineer', q: 'auxiliary equipment', codes: ['sv_eng_aux1', 'sv_eng_aux2', 'sv_eng_aux_equipment_1'] },
  { tier: '3 engineer', q: 'workshop skills', codes: ['sv_eng_workshop_skills', 'ews'] },
  { tier: '3 engineer', q: 'high voltage', codes: ['high_voltage', 'hv_op', 'hv_mgmt', 'marine_hv_authorisation'] },
  { tier: '3 engineer', q: 'ERM', codes: ['erm', 'uscg_erm'] },
  { tier: '3 engineer', q: 'engine room resource management', codes: ['erm', 'uscg_erm'] },
  { tier: '3 engineer', q: 'ETO', codes: ['eto_cadetship', 'hv_mgmt'] },
  { tier: '3 engineer', q: 'electro technical officer', codes: ['eto_cadetship'] },
  { tier: '3 engineer', q: 'electric propulsion', codes: ['aepc1'] },
  // Management, yacht
  { tier: '4 master yacht', q: 'master 500', codes: ['master_500gt_prep', 'master_yachts_business_law', 'master_yachts_celestial', 'master_yachts_nav', 'master_yachts_seamanship', 'master_yachts_stability', 'fr_capitaine_500', 'be_yacht_master_500gt', 'hr_zapovjednik_jahte_b'] },
  { tier: '4 master yacht', q: 'master 3000', codes: ['master_yachts_business_law', 'master_yachts_celestial', 'master_yachts_nav', 'master_yachts_seamanship', 'master_yachts_stability', 'fr_capitaine_3000'] },
  { tier: '4 master yacht', q: 'master yachts', codes: ['master_yachts_business_law', 'master_yachts_celestial', 'master_yachts_nav', 'master_yachts_seamanship', 'master_yachts_stability', 'iyt_master_of_yachts', 'iyt_master_yachts_unlimited'] },
  // Yachtmaster Ocean theory is celestial navigation too (added 2026-11-05 with the Yachtmaster pass).
  { tier: '4 master yacht', q: 'celestial navigation', codes: ['master_yachts_celestial', 'uscg_celestial_nav', 'ym_ocean_sb'] },
  { tier: '4 master yacht', q: 'stability', codes: ['master_yachts_stability', 'wbc3_stability', 'seafish_stability', 'uscg_fishing_stability'] },
  { tier: '4 master yacht', q: 'business and law', codes: ['master_yachts_business_law'] },
  { tier: '4 master yacht', q: 'seamanship and meteorology', codes: ['master_yachts_seamanship'] },
  { tier: '4 master yacht', q: 'advanced navigation', codes: ['master_yachts_nav'] },
  { tier: '4 master yacht', q: 'medical care', codes: ['medical_care', 'medical_care_refresher'] },
  { tier: '4 master yacht', q: 'medical care Palma', codes: ['medical_care'], near: P.palma },
  { tier: '4 master yacht', q: 'HELM management', codes: ['helm_mgmt'] },
  { tier: '4 master yacht', q: 'NAEST', codes: ['naest_op', 'naest_mgmt'] },
  { tier: '4 master yacht', q: 'NAEST management', codes: ['naest_mgmt'] },
  { tier: '4 master yacht', q: 'chief mate', codes: ['master_chief_mate_unlimited', 'mnz_chief_mate_yacht', 'uscg_deck_mgmt_modules'] },
  { tier: '4 master yacht', q: 'helideck', codes: ['yacht_helideck', 'helideck_safety', 'opito_hlo', 'opito_hert'] },
  { tier: '4 master yacht', q: 'crowd management', codes: ['crowd_mgmt', 'passenger_ship_training'] },
  { tier: '4 master yacht', q: 'crisis management', codes: ['crisis_mgmt', 'passenger_ship_training'] },
  { tier: '4 master yacht', q: 'passenger ship', codes: ['passenger_ship_training', 'crowd_mgmt', 'crisis_mgmt', 'passenger_familiarisation', 'pax_cargo_hull_safety', 'tc_psm'] },
  { tier: '4 master yacht', q: 'polar code', codes: ['polar_basic', 'polar_adv', 'polar_advanced'] },
  // Commercial: workboat, CTV, tug, inland, offshore
  { tier: 'C workboat', q: 'workboat', codes: ['workboat_ops', 'wbc3_nav_radar', 'wbc3_stability', 'master_200gt_prep'] },
  { tier: 'C workboat', q: 'workboat code', codes: ['wbc3_nav_radar', 'wbc3_stability', 'workboat_ops'] },
  { tier: 'C workboat', q: 'master 200', codes: ['master_200gt_prep', 'uscg_master_200', 'fr_capitaine_200', 'samsa_master_nc', 'hr_master_200gt'] },
  { tier: 'C workboat', q: 'CTV', codes: ['gwo_bst', 'gwo_sea_survival', 'marine_transfer', 'workboat_ops', 'gwo_bst_refresher'] },
  { tier: 'C workboat', q: 'crew transfer vessel', codes: ['gwo_bst', 'gwo_sea_survival', 'marine_transfer', 'workboat_ops', 'gwo_bst_refresher'] },
  { tier: 'C workboat', q: 'GWO', codes: ['gwo_bst', 'gwo_bst_refresher', 'gwo_sea_survival', 'gwo_sea_survival_refresher', 'gwo_art', 'gwo_btt', 'gwo_efa', 'gwo_fire_awareness', 'gwo_first_aid', 'gwo_manual_handling', 'gwo_working_at_heights', 'gwo_slinger_signaller', 'gwo_wla', 'gwo_bst_onshore'] },
  { tier: 'C workboat', q: 'GWO BST', codes: ['gwo_bst', 'gwo_bst_refresher', 'gwo_bst_onshore', 'gwo_fire_awareness', 'gwo_first_aid', 'gwo_manual_handling', 'gwo_working_at_heights'] },
  { tier: 'C workboat', q: 'GWO sea survival', codes: ['gwo_sea_survival', 'gwo_sea_survival_refresher'] },
  { tier: 'C workboat', q: 'GWO Hull', codes: ['gwo_bst', 'gwo_sea_survival', 'gwo_bst_refresher', 'gwo_sea_survival_refresher', 'gwo_art', 'gwo_btt', 'gwo_efa', 'gwo_fire_awareness', 'gwo_first_aid', 'gwo_manual_handling', 'gwo_working_at_heights', 'gwo_slinger_signaller', 'gwo_wla', 'gwo_bst_onshore'], near: P.hull },
  { tier: 'C workboat', q: 'GWO Great Yarmouth', codes: ['gwo_bst', 'gwo_sea_survival', 'gwo_bst_refresher', 'gwo_sea_survival_refresher', 'gwo_art', 'gwo_btt', 'gwo_efa', 'gwo_fire_awareness', 'gwo_first_aid', 'gwo_manual_handling', 'gwo_working_at_heights', 'gwo_slinger_signaller', 'gwo_wla', 'gwo_bst_onshore'], near: P.yarmouth },
  { tier: 'C workboat', q: 'GWO Kiel', codes: ['gwo_bst', 'gwo_sea_survival', 'gwo_bst_refresher', 'gwo_sea_survival_refresher', 'gwo_art', 'gwo_btt', 'gwo_efa', 'gwo_fire_awareness', 'gwo_first_aid', 'gwo_manual_handling', 'gwo_working_at_heights', 'gwo_slinger_signaller', 'gwo_wla', 'gwo_bst_onshore'], near: P.kiel },
  { tier: 'C workboat', q: 'working at heights', codes: ['gwo_working_at_heights'] },
  { tier: 'C workboat', q: 'manual handling', codes: ['gwo_manual_handling'] },
  { tier: 'C workboat', q: 'slinger signaller', codes: ['gwo_slinger_signaller', 'banksman_slinger'] },
  { tier: 'C workboat', q: 'banksman', codes: ['banksman_slinger'] },
  { tier: 'C workboat', q: 'confined space', codes: ['confined_space_entry'] },
  { tier: 'C workboat', q: 'DP induction', codes: ['dp_induction'] },
  { tier: 'C workboat', q: 'dynamic positioning', codes: ['dp_induction', 'dp_simulator'] },
  { tier: 'C offshore', q: 'BOSIET', codes: ['opito_bosiet', 'opito_tbosiet'] },
  { tier: 'C offshore', q: 'BOSIET Aberdeen', codes: ['opito_bosiet', 'opito_tbosiet'], near: P.aberdeen },
  { tier: 'C offshore', q: 'HUET', codes: ['huet', 'opito_bosiet', 'opito_foet', 'opito_tbosiet', 'opito_tfoet'] },
  { tier: 'C offshore', q: 'FOET', codes: ['opito_foet', 'opito_tfoet'] },
  { tier: 'C offshore', q: 'CA-EBS', codes: ['ebs'] },
  { tier: 'C offshore', q: 'MIST', codes: ['opito_mist'] },
  { tier: 'C offshore', q: 'H2S', codes: ['opito_h2s'] },
  { tier: 'C offshore', q: 'offshore survival', codes: ['opito_bosiet', 'opito_tbosiet', 'opito_foet', 'opito_tfoet', 'offshore_personal_survival', 'gwo_sea_survival'] },
  { tier: 'C tug', q: 'tug', codes: ['tug_master_prep'] },
  { tier: 'C tug', q: 'tug master', codes: ['tug_master_prep'] },
  { tier: 'C inland', q: 'boatmaster', codes: ['boatmaster', 'mt_boatmaster', 'ae_boatmaster', 'bml_fire_safety', 'bml_pswt', 'bml_first_aid_restricted', 'bml_ancillary_safety', 'bml_fire_safety_restricted', 'bml_pswt_restricted'] },
  { tier: 'C inland', q: 'BML', codes: ['boatmaster', 'bml_fire_safety', 'bml_pswt', 'bml_first_aid_restricted', 'bml_ancillary_safety', 'bml_fire_safety_restricted', 'bml_pswt_restricted'] },
  { tier: 'C inland', q: 'boatmaster London', codes: ['boatmaster', 'bml_fire_safety', 'bml_pswt', 'bml_first_aid_restricted', 'bml_ancillary_safety', 'bml_fire_safety_restricted', 'bml_pswt_restricted'], near: P.london },
  { tier: 'C merchant', q: 'tanker', codes: ['tanker_oil_chem_basic', 'tanker_gas_basic', 'tanker_basic_gas', 'tanker_basic_oil_chem', 'tanker_oil_adv', 'tanker_chem_adv', 'tanker_gas_adv', 'tanker_advanced_oil', 'tanker_advanced_chem', 'tanker_advanced_gas', 'tanker_ff', 'tanker_chem_adv_refresher', 'tanker_oil_adv_refresher', 'uscg_tankerman_pic', 'uscg_tank_barge_ff'] },
  { tier: 'C merchant', q: 'oil tanker', codes: ['tanker_oil_chem_basic', 'tanker_basic_oil_chem', 'tanker_oil_adv', 'tanker_advanced_oil', 'tanker_oil_adv_refresher'] },
  { tier: 'C merchant', q: 'LNG', codes: ['tanker_gas_basic', 'tanker_basic_gas', 'tanker_gas_adv', 'tanker_advanced_gas', 'igf_basic', 'igf_adv', 'igf_advanced'] },
  { tier: 'C merchant', q: 'IGF', codes: ['igf_basic', 'igf_adv', 'igf_advanced', 'igf_ammonia_adv', 'igf_ammonia_basic', 'igf_hydrogen', 'igf_methanol_adv', 'igf_methanol_basic'] },
  { tier: 'C merchant', q: 'BRM', codes: ['brm', 'uscg_brm', 'tc_brm'] },
  { tier: 'C merchant', q: 'bridge resource management', codes: ['brm', 'uscg_brm', 'tc_brm'] },
  { tier: 'C merchant', q: 'cadetship', codes: ['merch_deck_cadetship', 'merch_eng_cadetship', 'eto_cadetship', 'tc_cadet_deck', 'tc_cadet_engine'] },
  { tier: 'C fishing', q: 'fishing', codes: ['seafish_fishing', 'seafish_basic_safety', 'seafish_intro_fishing', 'seafish_safety_awareness', 'seafish_health_safety', 'seafish_basic_first_aid', 'seafish_fire_fighting', 'seafish_stability', 'seafish_watchkeeper', 'bim_fishing', 'uscg_fishing_vessel', 'uscg_fishing_stability', 'uscg_fishing_drill_conductor', 'samsa_oow_fishing', 'samsa_skipper_fishing_limited', 'samsa_skipper_fishing_unlimited', 'samsa_second_eng_fishing', 'samsa_safety_officer_fishing', 'mnz_skipper_fv_limited', 'mnz_skipper_fv_unlimited', 'mnz_mate_fv_limited', 'mnz_mate_fv_unlimited', 'mnz_advanced_deckhand_fishing', 'fishing_deck_officer_prep'] },
  // USCG
  { tier: 'US', q: 'OUPV', codes: ['uscg_oupv'] },
  { tier: 'US', q: 'six pack', codes: ['uscg_oupv'] },
  { tier: 'US', q: '6 pack captain', codes: ['uscg_oupv'] },
  { tier: 'US', q: "captain's license", codes: ['uscg_oupv', 'uscg_master_100', 'uscg_master_200', 'uscg_master_limited'] },
  { tier: 'US', q: 'captains license Fort Lauderdale', codes: ['uscg_oupv', 'uscg_master_100', 'uscg_master_200'], near: P.ftl },
  { tier: 'US', q: '100 ton master', codes: ['uscg_master_100'] },
  { tier: 'US', q: 'master 100', codes: ['uscg_master_100'] },
  { tier: 'US', q: 'OUPV Newport', codes: ['uscg_oupv'], near: P.newport },
  { tier: 'US', q: 'OUPV Los Angeles', codes: ['uscg_oupv'], near: P.la },
  { tier: 'US', q: 'radar observer', codes: ['uscg_radar_observer', 'uscg_radar_observer_renewal'] },
  { tier: 'US', q: 'able seaman', codes: ['uscg_able_seaman', 'uscg_able_seafarer_deck', 'able_seafarer_deck'] },
  { tier: 'US', q: 'QMED', codes: ['uscg_qmed'] },
  { tier: 'US', q: 'assistance towing', codes: ['uscg_assistance_towing'] },
  { tier: 'US', q: 'auxiliary sail', codes: ['uscg_auxiliary_sail'] },
  { tier: 'US', q: 'tankerman', codes: ['uscg_tankerman_pic'] },
  { tier: 'US', q: 'basic training Fort Lauderdale', codes: STCW_BASIC, near: P.ftl },
  { tier: 'US', q: 'first aid CPR', codes: ['uscg_first_aid_cpr'] },
  // AMSA, MNZ, SAMSA, Transport Canada
  { tier: 'AU', q: 'coxswain', codes: ['amsa_coxswain_g1', 'amsa_coxswain_g2', 'amsa_coxswain_g3', 'kma_coxswain_g2', 'kma_coxswain_g3', 'opito_lifeboat_coxswain', 'opito_frc'] },
  { tier: 'AU', q: 'coxswain grade 1', codes: ['amsa_coxswain_g1'] },
  { tier: 'AU', q: 'cox 1 Gold Coast', codes: ['amsa_coxswain_g1'], near: P.goldcoast },
  { tier: 'AU', q: 'general purpose hand', codes: ['amsa_gph', 'mt_general_purpose_hand'] },
  { tier: 'AU', q: 'GPH', codes: ['amsa_gph', 'mt_general_purpose_hand'] },
  { tier: 'AU', q: 'master 24m', codes: ['amsa_master_24m'] },
  { tier: 'AU', q: 'MED 3', codes: ['amsa_med3'] },
  { tier: 'AU', q: 'marine engine driver', codes: ['amsa_med1', 'amsa_med2', 'amsa_med3'] },
  { tier: 'AU', q: 'shipboard safety skill set', codes: ['amsa_shipboard_safety'] },
  { tier: 'AU', q: 'MROVCP', codes: ['amsa_vhf'] },
  { tier: 'NZ', q: 'SRL', codes: ['mnz_srl'] },
  { tier: 'NZ', q: 'skipper restricted limits', codes: ['mnz_srl'] },
  { tier: 'NZ', q: 'MEC 6', codes: ['mnz_me6'] },
  { tier: 'ZA', q: 'SAMSA skipper', codes: ['samsa_skipper_coastal', 'samsa_skipper_day_9m', 'samsa_skipper_port_ops', 'samsa_skipper_small_vessel', 'samsa_skipper_fishing_limited', 'samsa_skipper_fishing_unlimited'] },
  { tier: 'ZA', q: 'skipper Cape Town', codes: ['samsa_skipper_coastal', 'samsa_skipper_day_9m', 'samsa_skipper_port_ops', 'samsa_skipper_small_vessel', 'day_skipper', 'coastal_skipper'], near: P.capetown },
  { tier: 'CA', q: 'MED A1', codes: ['tc_med'] },
  { tier: 'CA', q: 'SVOP', codes: ['tc_svop'] },
  { tier: 'CA', q: 'small vessel operator', codes: ['tc_svop', 'tc_smv'] },
  // Other national bodies, in their own words
  { tier: 'EU', q: 'PER', codes: ['es_per'] },
  { tier: 'EU', q: 'patron de yate', codes: ['es_patron_yate'] },
  { tier: 'EU', q: 'capitan de yate', codes: ['es_capitan_yate'] },
  { tier: 'EU', q: 'capitaine 200', codes: ['fr_capitaine_200', 'fr_capitaine_200_reval', 'fr_capitaine_200_voile', 'fr_capitaine_200_yacht'] },
  { tier: 'EU', q: 'capitaine 200 Antibes', codes: ['fr_capitaine_200', 'fr_capitaine_200_reval', 'fr_capitaine_200_voile', 'fr_capitaine_200_yacht'], near: P.antibes },
  { tier: 'EU', q: 'mecanicien 750', codes: ['fr_mecanicien_750kw'] },
  { tier: 'EU', q: 'patente nautica', codes: ['it_patente_nautica'] },
  { tier: 'EU', q: 'voditelj brodice', codes: ['hr_voditelj_brodice'] },
  { tier: 'EU', q: 'Transport Malta', codes: ['mt_boatmaster', 'mt_general_purpose_hand', 'mt_nautical_licence', 'mt_yacht_coc'] },
];

// What the "Find a course" chip from each pathway checklist returns, as personas.
interface Persona { who: string; at: Place; authority: string | null; region: string; sector?: 'yacht' | 'commercial' | 'thames'; }
const PERSONAS: Persona[] = [
  { who: 'British yacht deck, MCA', at: P.palma, authority: 'mca', region: 'GB' },
  { who: 'British yacht engineer, MCA', at: P.antibes, authority: 'mca', region: 'GB' },
  { who: 'South African yacht crew, MCA', at: P.palma, authority: 'mca', region: 'ZA' },
  { who: 'South African, SAMSA', at: P.capetown, authority: 'samsa', region: 'ZA' },
  { who: 'South African, SAMSA', at: P.durban, authority: 'samsa', region: 'ZA' },
  { who: 'Italian yacht crew, MCA', at: P.genoa, authority: 'mca', region: 'IT' },
  { who: 'German, MCA', at: P.kiel, authority: 'mca', region: 'DE' },
  { who: 'Thai yacht crew, MCA', at: P.phuket, authority: 'mca', region: 'TH' },
  { who: 'Portuguese, MCA', at: P.lisbon, authority: 'mca', region: 'PT' },
  { who: 'American yacht crew, MCA', at: P.ftl, authority: 'mca', region: 'US' },
  { who: 'Australian yacht crew, MCA', at: P.goldcoast, authority: 'mca', region: 'AU' },
  { who: 'New Zealander, MCA', at: P.auckland, authority: 'mca', region: 'NZ' },
  { who: 'Yacht crew in Dubai, MCA', at: P.dubai, authority: 'mca', region: 'GB' },
  { who: 'Yacht crew in Singapore, MCA', at: P.singapore, authority: 'mca', region: 'GB' },
  { who: 'Yacht crew in Tahiti, MCA', at: P.tahiti, authority: 'mca', region: 'NZ' },
  { who: 'British CTV crew, MCA', at: P.yarmouth, authority: 'mca', region: 'GB', sector: 'commercial' },
  { who: 'British tug crew, MCA', at: P.southampton, authority: 'mca', region: 'GB', sector: 'commercial' },
  { who: 'Thames crew, MCA', at: P.london, authority: 'mca', region: 'GB', sector: 'thames' },
  { who: 'British crew in Hull, MCA', at: P.hull, authority: 'mca', region: 'GB', sector: 'commercial' },
];
// Pathways a persona might follow (checklist ids), by authority and sector.
const sectorOf = (k: string) =>
  /^(bml|pla)-/.test(k) ? 'thames' : /^(tug|master-workboat|navigational|efficient|able-seafarer|eto)/.test(k) ? 'commercial' : 'yacht';
const pathwaysFor = (per: Persona) =>
  Object.keys(CHECKLISTS).filter((k) =>
    per.authority === 'samsa' ? k.startsWith('samsa-') : !k.startsWith('samsa-') && sectorOf(k) === (per.sector ?? 'yacht'),
  );

// ---------------------------------------------------------------------------
const truthFor = (codes: string[]) => new Set(list.filter((p) => p.courses.some((c) => codes.includes(c))).map((p) => p.id));
const km = (a: Place, p: Provider) => {
  if (p.lat == null || p.lng == null) return Infinity;
  const r = (d: number) => (d * Math.PI) / 180;
  const x = Math.sin(r(p.lat - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(p.lat)) * Math.sin(r(p.lng - a[1]) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
};

const rows: string[] = [];
let pass = 0;
let fail = 0;
const byTier: Record<string, [number, number]> = {};
for (const t of Qs) {
  // For "course + place" the right answers are the course's providers near the place.
  const allTruth = truthFor(t.codes);
  const nearestAll = t.near ? Math.min(...list.filter((p) => allTruth.has(p.id)).map((p) => km(t.near!, p))) : 0;
  const truth = t.near ? new Set([...allTruth].filter((id) => km(t.near!, list.find((p) => p.id === id)!) <= Math.max(300, nearestAll + 100))) : allTruth;
  // The searcher's phone is set to the country of the place they name (UK otherwise).
  const homeCountry = t.near ? list.reduce((a, b) => (km(t.near!, b) < km(t.near!, a) ? b : a)).country : 'GB';
  const hits = searchProviders(list, { query: t.q, course: null, sector: null, approval: null, origin: null, radiusKm: null, homeCountry });
  const ids = hits.map((h) => h.provider.id);
  const found = ids.filter((id) => truth.has(id)).length;
  const recall = truth.size ? found / truth.size : 1;
  const top = hits.slice(0, 10);
  const relevantTop = top.filter((h) => truth.has(h.provider.id)).length;
  // Fewer than 10 right answers exist near some places: score against what could be shown.
  const p10 = top.length ? relevantTop / Math.min(top.length, truth.size || 1) : 0;
  const firstKm = t.near && hits[0] ? Math.round(km(t.near, hits[0].provider)) : null;
  // A place search passes when the first row is close; otherwise recall and precision.
  const nearestTruth = nearestAll;
  const ok =
    truth.size > 0 &&
    recall >= 0.8 &&
    p10 >= 0.8 &&
    (!t.near || (firstKm != null && firstKm <= Math.max(60, nearestTruth + 30)));
  ok ? pass++ : fail++;
  const bt = (byTier[t.tier] ??= [0, 0]);
  bt[ok ? 0 : 1]++;
  if (!ok || !failOnly)
    rows.push(
      `${ok ? 'PASS' : 'FAIL'} | ${t.tier} | "${t.q}" | ${hits.length} rows | recall ${(recall * 100).toFixed(0)}% of ${truth.size} | top10 ${(p10 * 100).toFixed(0)}%` +
        (t.near ? ` | first row ${firstKm ?? '-'} km from ${t.near[2]} (nearest real ${Math.round(nearestTruth)} km)` : '') +
        (!ok && top.length ? ` | top: ${top.slice(0, 3).map((h) => h.provider.name.slice(0, 28)).join('; ')}` : ''),
    );
}

// Pathway chips: every course on every pathway, as each persona, with the
// screen's defaults (own authority, near me, widening radius).
const chip: string[] = [];
let chipPass = 0;
let chipFail = 0;
const noLink: Record<string, Set<string>> = {};
for (const per of PERSONAS) {
  for (const pw of pathwaysFor(per)) {
    for (const item of CHECKLISTS[pw].items) {
      if (['manual', 'sea_service', 'prerequisite_coc'].includes(item.type)) continue;
      const codes = providerCodesFor(item.code);
      if (!codes.length) {
        (noLink[item.code] ??= new Set()).add(pw);
        continue;
      }
      const approval = per.authority && list.some((p) => p.approvals.includes(per.authority!) && p.courses.some((c) => codes.includes(c))) ? per.authority : null;
      const all = searchProviders(list, { query: '', course: item.code, sector: null, approval, origin: { lat: per.at[0], lng: per.at[1] }, radiusKm: null, homeCountry: per.region });
      const nearest = all[0]?.distanceKm ?? Infinity;
      const ok = all.length > 0;
      ok ? chipPass++ : chipFail++;
      if (!ok || nearest > 1500)
        chip.push(`${ok ? 'FAR ' : 'NONE'} | ${per.who} @ ${per.at[2]} | ${pw} | ${item.code} | ${all.length} providers${approval ? ` (${approval.toUpperCase()})` : ''} | nearest ${Number.isFinite(nearest) ? Math.round(nearest) + ' km' : '-'}`);
    }
  }
}

const out = [
  `# Find a course search evaluation`,
  ``,
  `Typed queries: ${pass} pass, ${fail} fail of ${Qs.length}.`,
  ...Object.entries(byTier).map(([t, [p, f]]) => `- ${t}: ${p} pass, ${f} fail`),
  ``,
  ...rows,
  ``,
  `## Pathway "Find a course" chips (${PERSONAS.length} personas)`,
  `${chipPass} course chips return providers, ${chipFail} return none. Rows below: none, or nearest over 1,500 km.`,
  ...Array.from(new Set(chip)).sort(),
  ``,
  `## Checklist courses with no Find a course link (no provider code)`,
  ...Object.entries(noLink).map(([c, s]) => `- ${c}: ${s.size} pathways`),
];
console.log(out.join('\n'));
const j = process.argv.indexOf('--json');
if (j > 0) fs.writeFileSync(process.argv[j + 1], out.join('\n'));
if (fail) process.exit(1);
