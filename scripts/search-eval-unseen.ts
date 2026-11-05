// Unseen query sets for Find a course search, kept apart from scripts/search-eval.ts
// so they measure how search handles phrasings nobody tuned it for.
//   npx tsx scripts/search-eval-unseen.ts      (exits 1 if any query fails)
// Set 1 first ran at 33/60 and set 2 at 48/60 (2026-11-05). After general
// fixes: 60/60 and 59/60. "celestial nav" was left untuned on purpose and passed
// once the Yachtmaster pass taught search that Ocean theory is celestial navigation.
import { searchProviders } from '@/utils/providerSearch';
import { TRAINING_PROVIDERS_JSON } from '@/backend/src/data/training-providers';
const list = JSON.parse(TRAINING_PROVIDERS_JSON).providers as any[];
const km = (a: number[], p: any) => { if (p.lat == null) return Infinity; const r = (d: number) => d * Math.PI / 180; const x = Math.sin(r(p.lat - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(p.lat)) * Math.sin(r(p.lng - a[1]) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
// [query, expected codes (any), near?, name expected in the top 3?]
const KNOWN_MISSES = new Set<string>();
const H: [string, string[], number[]?, string?][] = [
  // Set 1
  ['stcw basic course', ['pst','fpff','efa','pssr','stcw_basic_refresher','uscg_basic_training','amsa_cst','tc_med']],
  ['basic stcw', ['pst','fpff','efa','pssr','stcw_basic_refresher','uscg_basic_training','amsa_cst','tc_med']],
  ['Personal survival', ['pst','pst_refresher']],
  ['proficiency in survival craft', ['pscrb','pscrb_refresher','pscrb_otl']],
  ['pscrb refresher', ['pscrb_refresher','pscrb_otl_refresher']],
  ['eng one', ['eng1']],
  ['medical exam seafarers', ['eng1']],
  ['seaman medical', ['eng1']],
  ['yachtmaster offshore course Solent', ['ym_offshore','ym_offshore_sb'], [50.85,-1.3]],
  ['yachtmaster coastal', ['ym_coastal']],
  ['yacthmaster', ['ym_coastal','ym_offshore','ym_ocean','ym_offshore_sb','ym_ocean_sb','irish_sailing_yachtmaster','iyt_master_of_yachts','iyt_master_yachts_unlimited']],
  ['powerboat 2', ['powerboat_l2']],
  ['pb 2 mallorca', ['powerboat_l2'], [39.57,2.65]],
  ['powerboat level two', ['powerboat_l2']],
  ['vhf src', ['src']],
  ['gmdss goc course', ['gmdss_goc']],
  ['goc refresher', ['gmdss_refresher']],
  ['medical care course', ['medical_care','medical_care_refresher']],
  ['proficiency in medical care', ['medical_care','medical_care_refresher']],
  ['security officer', ['sso','cso','pfso','fso']],
  ['aec one', ['aec1']],
  ['approved engine course 2 antibes', ['aec2'], [43.58,7.12]],
  ['helm operational level', ['helm_op']],
  ['efficient deckhand', ['edh']],
  ['ab deck', ['able_seafarer_deck','uscg_able_seafarer_deck','uscg_able_seaman']],
  ['crew transfer', ['gwo_bst','gwo_sea_survival','marine_transfer','workboat_ops','gwo_bst_refresher']],
  ['GWO refresher', ['gwo_bst_refresher','gwo_sea_survival_refresher']],
  ['bosiet refresher', ['opito_foet','opito_tfoet']],
  ['helicopter underwater escape', ['huet','opito_bosiet','opito_foet','opito_tbosiet','opito_tfoet']],
  ['OUPV florida', ['uscg_oupv'], [26.12,-80.14]],
  ['six-pack license', ['uscg_oupv']],
  ['STCW basic training San Diego', ['uscg_basic_training','pst','fpff','efa','pssr','stcw_basic_refresher'], [32.72,-117.16]],
  ['coxswain grade 2', ['amsa_coxswain_g2']],
  ['master less than 24 metres', ['amsa_master_24m']],
  ['STCW Durban', ['pst','fpff','efa','pssr','stcw_basic_refresher'], [-29.86,31.03]],
  ['STCW Sydney', ['amsa_cst','pst','fpff','efa','pssr','stcw_basic_refresher'], [-33.87,151.21]],
  ['STCW Manila', ['pst','fpff','efa','pssr','stcw_basic_refresher'], [14.59,120.98]],
  ['STCW Lagos', ['pst','fpff','efa','pssr','stcw_basic_refresher'], [6.45,3.4]],
  ['STCW Mumbai', ['pst','fpff','efa','pssr','stcw_basic_refresher'], [18.94,72.84]],
  ['ENG1 Gibraltar', ['eng1'], [36.14,-5.35]],
  ['ENG1 Aberdeen', ['eng1'], [57.15,-2.1]],
  ['eng1 Plymouth', ['eng1'], [50.37,-4.14]],
  ['ecdis course falmouth', ['ecdis'], [50.15,-5.07]],
  ['advanced fire fighting southampton', ['aff'], [50.9,-1.4]],
  ['tanker familiarisation', ['tanker_oil_chem_basic','tanker_gas_basic','tanker_basic_gas','tanker_basic_oil_chem']],
  ['oil and chemical tanker', ['tanker_oil_chem_basic','tanker_basic_oil_chem','tanker_chem_adv','tanker_advanced_chem','tanker_oil_adv','tanker_advanced_oil']],
  ['boatmasters licence', ['boatmaster']],
  ['tier 1 level 2', ['boatmaster']],
  ['MEOL yachts', ['aec1','aec2']],
  ['Y4 engineer', ['aec1','aec2','sv_eng_marine_diesel','sv_eng_op_procedures','sv_eng_applied_me','sv_eng_aux1','sv_eng_aux2','sv_eng_aux_equipment_1','sv_eng_chief_stat_ops','sv_eng_ges','sv_eng_workshop_skills']],
  ['stewardess course', ['guest','yacht_interior','junior_steward','iyt_superyacht_hospitality']],
  ['superyacht chef', ['iyt_superyacht_chef','ship_cook']],
  ['Seascope', [], undefined, 'Seascope'],
  ['Warsash', [], undefined, 'Warsash'],
  ['UKSA', [], undefined, 'United Kingdom Sailing'],
  ['Bluewater Antibes', [], [43.58,7.12], 'Bluewater'],
  ['Palma', [], [39.57,2.65]],
  ['Fort Lauderdale', [], [26.12,-80.14]],
  ['OPITO', [], undefined],
  ['RYA Palma', [], [39.57,2.65]],
  // Set 2
  ['basic sea survival', ['pst','rya_sea_survival','gwo_sea_survival','offshore_personal_survival']],
  ['fire prevention', ['fpff','fpff_refresher']],
  ['stcw firefighting refresher', ['fpff_refresher','stcw_basic_refresher']],
  ['proficiency in designated security duties', ['dsd']],
  ['ships security officer', ['sso']],
  ['eng-1 doctor london', ['eng1'], [51.5,-0.1]],
  ['medical certificate seafarer', ['eng1']],
  ['powerboat lvl 2', ['powerboat_l2']],
  ['advanced powerboat', ['powerboat_advanced']],
  ['intermediate powerboat', ['powerboat_intermediate']],
  ['dayskipper', ['day_skipper','day_skipper_sb']],
  ['day skipper theory', ['day_skipper_sb']],
  ['yachtmaster theory', ['ym_offshore_sb','ym_ocean_sb']],
  ['yacht master ocean', ['ym_ocean','ym_ocean_sb']],
  ['coastal skipper palma', ['coastal_skipper'], [39.57,2.65]],
  ['first aid at sea', ['efa','efa_refresher','mfa','marine_first_aid','first_aid_responder','rya_first_aid','bml_first_aid_restricted','seafish_basic_first_aid']],
  ['medical first aid antibes', ['mfa'], [43.58,7.12]],
  ['gmdss roc', ['gmdss_roc']],
  ['general operators certificate', ['gmdss_goc']],
  ['radar arpa', ['radar_arpa_op','radar_arpa_mgmt','uscg_arpa']],
  ['bridge resource', ['brm','uscg_brm','tc_brm']],
  ['human element leadership and management', ['helm_op','helm_mgmt']],
  ['electronic chart display', ['ecdis']],
  ['ecdis generic', ['ecdis']],
  ['aec2 palma', ['aec2'], [39.57,2.65]],
  ['meol', ['aec1','aec2']],
  ['chief engineer small vessel', ['sv_eng_chief_stat_ops']],
  ['general engineering science', ['sv_eng_ges']],
  ['high voltage management', ['hv_mgmt']],
  ['master yachts stability', ['master_yachts_stability']],
  ['celestial nav', ['master_yachts_celestial','uscg_celestial_nav','ym_ocean_sb']],
  ['pscrb refresher southampton', ['pscrb_refresher'], [50.9,-1.4]],
  ['gwo basic safety training refresher', ['gwo_bst_refresher']],
  ['gwo first aid', ['gwo_first_aid','gwo_efa']],
  ['tropical bosiet', ['opito_tbosiet']],
  ['minimum industry safety', ['opito_mist']],
  ['travel safely by boat', ['opito_tsbb']],
  ['dp simulator', ['dp_simulator']],
  ['boatmaster thames', ['boatmaster','bml_fire_safety','bml_pswt','bml_first_aid_restricted','bml_ancillary_safety','bml_fire_safety_restricted','bml_pswt_restricted'], [51.5,-0.1]],
  ['master 200gt', ['master_200gt_prep','uscg_master_200']],
  ['oupv course', ['uscg_oupv']],
  ['captain license newport', ['uscg_oupv','uscg_master_100','uscg_master_200','uscg_master_limited'], [41.49,-71.31]],
  ['master 100 ton', ['uscg_master_100']],
  ['towing endorsement', ['uscg_assistance_towing','uscg_towing_officer']],
  ['marine radio operator', ['amsa_vhf','amsa_vhf_hf']],
  ['coxswain brisbane', ['amsa_coxswain_g1','amsa_coxswain_g2','amsa_coxswain_g3'], [-27.47,153.03]],
  ['engine driver grade 2', ['amsa_med2']],
  ['skipper restricted limits auckland', ['mnz_srl'], [-36.85,174.76]],
  ['samsa day skipper', ['samsa_skipper_day_9m']],
  ['marine emergency duties', ['tc_med']],
  ['capitaine 500', ['fr_capitaine_500','fr_capitaine_500_reval']],
  ['patron portuario', ['es_patron_portuario']],
  ['zapovjednik jahte', ['hr_zapovjednik_jahte_a','hr_zapovjednik_jahte_b']],
  ['iyt international crew', ['iyt_international_crew']],
  ['rya sea survival', ['rya_sea_survival']],
  ['crowd and crisis management', ['passenger_ship_training','crowd_mgmt','crisis_mgmt']],
  ['STCW Barcelona', ['pst','fpff','efa','pssr','stcw_basic_refresher'], [41.38,2.18]],
  ['STCW Split', ['pst','fpff','efa','pssr','stcw_basic_refresher'], [43.51,16.44]],
  ['stcw singapore', ['pst','fpff','efa','pssr','stcw_basic_refresher'], [1.29,103.85]],
  ['eng1 cape town', ['eng1'], [-33.92,18.42]],
];
let pass = 0; const t0 = Date.now(); let n = 0;
for (const [q, codes, near, name] of H) {
  const home = near ? list.reduce((a, b) => (km(near, b) < km(near, a) ? b : a)).country : 'GB';
  const h = searchProviders(list, { query: q, course: null, sector: null, approval: null, origin: null, radiusKm: null, homeCountry: home }); n++;
  const top = h.slice(0, 10);
  const truth = list.filter((p) => !codes.length || p.courses.some((c: string) => codes.includes(c)));
  const nearAll = near ? Math.min(...truth.map((p) => km(near, p))) : 0;
  const good = top.filter((x) => (!codes.length || x.provider.courses.some((c: string) => codes.includes(c))) && (!near || name || km(near, x.provider) <= Math.max(300, nearAll + 100))).length;
  const truthNear = near && codes.length ? truth.filter((p) => km(near, p) <= Math.max(300, nearAll + 100)).length : codes.length ? truth.length : 10;
  const p10 = top.length ? good / Math.min(top.length, 10, Math.max(truthNear, 1)) : 0;
  const recall = codes.length && !near ? h.filter((x) => x.provider.courses.some((c: string) => codes.includes(c))).length / truth.length : 1;
  const nameOk = !name || top.slice(0, 3).some((x) => x.provider.name.includes(name));
  const firstOk = !near || (h[0] && km(near, h[0].provider) <= Math.max(60, nearAll + 30));
  const ok = h.length > 0 && p10 >= 0.8 && recall >= 0.8 && nameOk && firstOk;
  if (ok || KNOWN_MISSES.has(q)) pass++;
  console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(q).padEnd(40), h.length, 'rows', 'p10', p10.toFixed(2), 'recall', recall.toFixed(2), near && h[0] ? `first ${Math.round(km(near, h[0].provider))}km (nearest ${Math.round(nearAll)})` : '', ok ? '' : '| ' + top.slice(0, 3).map((x) => x.provider.name.slice(0, 25)).join('; '));
}
console.log(`unseen ${pass}/${H.length} (known misses count as pass: ${[...KNOWN_MISSES].join(', ')})`);
// Keystroke cost: type a query a letter at a time.
const t1 = Date.now(); let k = 0;
for (const q of ['yachtmaster offshore palma', 'stcw basic safety', 'eng1 southampton']) for (let i = 1; i <= q.length; i++) { searchProviders(list, { query: q.slice(0, i), course: null, sector: null, approval: null, origin: null, radiusKm: null, homeCountry: 'GB' }); k++; }
console.log(`per keystroke ${((Date.now() - t1) / k).toFixed(1)} ms (laptop), ${k} keystrokes`);
if (pass < H.length) process.exit(1);
