// Maps a provider's course title to the app's course codes (constants/courseCatalog.ts
// in the app). Order matters: refreshers and specific courses before the general ones.
// A null code means "deliberately not mapped": no app course matches it closely enough.
const RULES: [RegExp, string | null][] = [
  // "Nav & Radar (OOW) Week 2": a later week of a multi-week course isn't a start date.
  [/\bweek\s*[2-9]\b/i, null],
  // Master-level nav and radar isn't the OOW (Yachts) module; which master module it is varies.
  [/master'?s?\b[^|]*nav(igation)?\b[^|]*radar/i, null],
  // Restricted PSCRB is a narrower certificate than PSCRB or PSCRB (other than lifeboats).
  [/(pscrb|survival craft)[^|]*restricted|restricted[^|]*(pscrb|survival craft)/i, null],
  [/(pscrb|survival craft).*(refresher|update)|(refresher|updat(?:ed?|ing)|revalidation)\b.*(pscrb|survival craft)/i, 'pscrb_refresher'],
  [/advanced? fire ?fighting.*(refresher|update|revalidation)|(refresher|updat(?:ed?|ing)|revalidation)\b.*advanced? fire ?fighting|advanced fire.*(refresher|update)/i, 'aff_refresher'],
  [/gwo[^|]*(basic safety[^|]*refresher|\bbstr\b|\bbst\b[^|]*refresher)/i, 'gwo_bst_refresher'],
  [/medical care.*(refresher|update)|(refresher|updat(?:ed?|ing)|revalidation)\b.*medical care/i, 'medical_care_refresher'],
  [/(basic|bst).*(refresher|update|revalidation)|(refresher|update|revalidation).*basic/i, 'stcw_basic_refresher'],
  // "Updated proficiency in fire prevention and fire fighting and personal survival techniques"
  [/(refresher|updat(?:ed?|ing)|revalidation)\b.*(fire prevention.*personal survival|personal survival.*fire prevention)/i, 'stcw_basic_refresher'],
  // Any other refresher (PST, MFA, a single GWO module) has no app course of its own:
  // don't let it fall through to the full course below.
  [/\b(refresher|updating|revalidation|aggiornamento|recyclage|actualizaci[oó]n)\b|\bupdated? (proficiency|training)/i, null],
  [/(pscrb|survival craft).*(other than lifeboat|otl)|pscrb.?otl/i, 'pscrb_otl'],
  [/pscrb|survival craft and rescue boat|cop\s*sc\s*&?\s*rb/i, 'pscrb'],
  [/fast rescue boat/i, 'frb'],
  [/advanced fire|advance fire ?fighting|\baff\b/i, 'aff'],
  [/personal survival techniques|\bpst\b/i, 'pst'],
  [/fire prevention|\bfpff\b/i, 'fpff'],
  [/elementary first aid|\befa\b/i, 'efa'],
  [/personal safety and social|\bpssr\b/i, 'pssr'],
  [/medical first aid|\bmfa\b/i, 'mfa'],
  [/medical care|person in charge of medical/i, 'medical_care'],
  [/designated security|\bdsd\b/i, 'dsd'],
  [/ship security officer|\bsso\b/i, 'sso'],
  [/security awareness|\bpsa\b/i, 'psa'],
  [/ecdis/i, 'ecdis'],
  // "Human Element Leadership & Management (Operational Level) - HELM (O)": the level decides.
  [/helm\s*\(m\)|human element[^|]*management level/i, 'helm_mgmt'],
  [/helm\s*\(o\)|human element[^|]*operational level/i, 'helm_op'],
  [/helm.*manag/i, 'helm_mgmt'],
  [/helm.*oper|\bhelm\b/i, 'helm_op'],
  [/naest.*manag/i, 'naest_mgmt'],
  [/naest/i, 'naest_op'],
  [/general operator|\bgoc\b/i, 'gmdss_goc'],
  [/restricted operator|\broc\b/i, 'gmdss_roc'],
  [/short range cert|\bsrc\b|vhf/i, 'src'],
  [/long range cert|\blrc\b/i, 'lrc'],
  [/efficient deck ?hand|\bedh\b/i, 'edh'],
  [/yachtmaster ocean.*(theory|shore)|ocean.*shore.?based/i, 'ym_ocean_sb'],
  [/yachtmaster offshore.*(theory|shore)|(coastal skipper|yachtmaster).*shore.?based/i, 'ym_offshore_sb'],
  [/yachtmaster ocean/i, 'ym_ocean'],
  [/yachtmaster offshore/i, 'ym_offshore'],
  [/yachtmaster coastal/i, 'ym_coastal'],
  // A skipper refresher or mile builder isn't the RYA certificate course.
  [/skipper[^|]*(refresher|mile ?builder)/i, null],
  [/coastal skipper/i, 'coastal_skipper'],
  [/day skipper/i, 'day_skipper'],
  [/competent crew/i, 'competent_crew'],
  [/powerboat.*(level 2|l2)|(level 2|l2)[^|]*powerboat/i, 'powerboat_l2'],
  [/general ship knowledge|\bgsk\b/i, 'oow_yachts_gsk'],
  // Small Ships Navigation & Radar is a fishing/workboat course, not OOW (Yacht) Nav & Radar.
  [/small ships?[^|]*nav/i, null],
  [/navigation and radar|nav(igation)? ?& ?radar/i, 'oow_yachts_nav_radar'],
  [/celestial/i, 'master_yachts_celestial'],
  [/naras|navigation,? radar and arpa simulator/i, 'master_yachts_nav'],
  [/stability/i, 'master_yachts_stability'],
  [/business and law/i, 'master_yachts_business_law'],
  [/seamanship and met/i, 'master_yachts_seamanship'],
  [/workboat operations/i, 'workboat_ops'],
  [/gwo.*sea survival/i, 'gwo_sea_survival'],
  [/(gwo|global wind)[^|]*(basic safety|\bbst\b)/i, 'gwo_bst'],
  // Other GWO standards (ART, BTT, Enhanced First Aid, Slinger Signaller) aren't BST.
  [/gwo|global wind/i, null],
  [/bosiet/i, 'opito_bosiet'],
  [/foet/i, 'opito_foet'],
  [/huet/i, 'huet'],
  [/\baec\s*2|approved engine course 2/i, 'aec2'],
  [/\baec\s*1?\b|approved engine course/i, 'aec1'],
  [/\bmeol\b|marine engine operator/i, 'meol_sv'],
  [/crowd management/i, 'crowd_mgmt'],
  [/crisis management/i, 'crisis_mgmt'],
  [/food (hygiene|safety)/i, 'food_hygiene'],
];

export function matchCourseCode(title: string): string | null {
  for (const [re, code] of RULES) if (re.test(title)) return code;
  return null;
}
