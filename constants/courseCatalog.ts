/**
 * Course codes shared by the oral checklist and the training provider search.
 * Validity is the default rule; a checklist item can override it.
 */

export type Validity = 'none' | '5y_update' | '3y' | '2y' | '1y' | 'as_dated';

export interface CourseDef {
  label: string;
  group: CourseGroup;
  validity: Validity;
}

export type CourseGroup =
  | 'STCW safety'
  | 'Medical'
  | 'Security'
  | 'Navigation and bridge'
  | 'Radio'
  | 'Yacht deck'
  | 'Yacht modules'
  | 'Workboat and offshore'
  | 'Engineering'
  | 'Other';

export const COURSE_CATALOG: Record<string, CourseDef> = {
  pst: { label: 'Personal Survival Techniques', group: 'STCW safety', validity: '5y_update' },
  fpff: { label: 'Fire Prevention and Fire Fighting', group: 'STCW safety', validity: '5y_update' },
  efa: { label: 'Elementary First Aid', group: 'STCW safety', validity: 'none' },
  pssr: { label: 'Personal Safety and Social Responsibilities', group: 'STCW safety', validity: 'none' },
  stcw_basic_refresher: { label: 'STCW basic training refresher', group: 'STCW safety', validity: '5y_update' },
  pscrb: { label: 'Proficiency in Survival Craft and Rescue Boats', group: 'STCW safety', validity: '5y_update' },
  pscrb_otl: { label: 'PSCRB (other than lifeboats)', group: 'STCW safety', validity: '5y_update' },
  pscrb_refresher: { label: 'PSCRB refresher', group: 'STCW safety', validity: '5y_update' },
  frb: { label: 'Fast Rescue Boats', group: 'STCW safety', validity: '5y_update' },
  aff: { label: 'Advanced Fire Fighting', group: 'STCW safety', validity: '5y_update' },
  aff_refresher: { label: 'Advanced Fire Fighting refresher', group: 'STCW safety', validity: '5y_update' },
  crowd_mgmt: { label: 'Crowd management', group: 'STCW safety', validity: '5y_update' },
  crisis_mgmt: { label: 'Crisis management and human behaviour', group: 'STCW safety', validity: '5y_update' },
  mfa: { label: 'Medical First Aid', group: 'Medical', validity: 'none' },
  medical_care: { label: 'Medical Care', group: 'Medical', validity: 'none' },
  medical_care_refresher: { label: 'Medical Care refresher', group: 'Medical', validity: 'none' },
  eng1: { label: 'ENG1 medical', group: 'Medical', validity: 'as_dated' },
  psa: { label: 'Proficiency in Security Awareness', group: 'Security', validity: 'none' },
  dsd: { label: 'Designated Security Duties', group: 'Security', validity: 'none' },
  sso: { label: 'Ship Security Officer', group: 'Security', validity: 'none' },
  ecdis: { label: 'ECDIS', group: 'Navigation and bridge', validity: 'none' },
  radar_arpa_op: { label: 'Radar, ARPA, bridge teamwork and SAR (operational)', group: 'Navigation and bridge', validity: 'none' },
  naest_op: { label: 'NAEST (Operational)', group: 'Navigation and bridge', validity: 'none' },
  naest_mgmt: { label: 'NAEST (Management)', group: 'Navigation and bridge', validity: 'none' },
  helm_op: { label: 'HELM (Operational)', group: 'Navigation and bridge', validity: 'none' },
  helm_mgmt: { label: 'HELM (Management)', group: 'Navigation and bridge', validity: 'none' },
  gmdss_goc: { label: 'GMDSS General Operator Certificate', group: 'Radio', validity: '5y_update' },
  gmdss_roc: { label: 'GMDSS Restricted Operator Certificate', group: 'Radio', validity: '5y_update' },
  src: { label: 'VHF Short Range Certificate', group: 'Radio', validity: 'none' },
  lrc: { label: 'Long Range Certificate', group: 'Radio', validity: 'none' },
  competent_crew: { label: 'RYA Competent Crew', group: 'Yacht deck', validity: 'none' },
  day_skipper: { label: 'RYA Day Skipper', group: 'Yacht deck', validity: 'none' },
  coastal_skipper: { label: 'RYA Coastal Skipper', group: 'Yacht deck', validity: 'none' },
  ym_coastal: { label: 'Yachtmaster Coastal', group: 'Yacht deck', validity: 'none' },
  ym_offshore: { label: 'Yachtmaster Offshore', group: 'Yacht deck', validity: 'none' },
  ym_offshore_sb: { label: 'Yachtmaster Offshore shore-based course', group: 'Yacht deck', validity: 'none' },
  ym_ocean: { label: 'Yachtmaster Ocean', group: 'Yacht deck', validity: 'none' },
  ym_ocean_sb: { label: 'Yachtmaster Ocean shore-based course', group: 'Yacht deck', validity: 'none' },
  edh: { label: 'Efficient Deck Hand', group: 'Yacht deck', validity: 'none' },
  yacht_rating: { label: 'Yacht Rating course', group: 'Yacht deck', validity: 'none' },
  powerboat_l2: { label: 'RYA Powerboat Level 2', group: 'Yacht deck', validity: 'none' },
  yacht_trb: { label: 'Yacht Training Record Book', group: 'Yacht deck', validity: 'none' },
  oow_yachts_nav_radar: { label: 'Navigation and Radar (OOW Yachts) module and exam', group: 'Yacht modules', validity: '3y' },
  oow_yachts_gsk: { label: 'General Ship Knowledge (OOW Yachts) module and exam', group: 'Yacht modules', validity: '3y' },
  master_yachts_seamanship: { label: 'Seamanship and Meteorology (Master Yachts)', group: 'Yacht modules', validity: '3y' },
  master_yachts_stability: { label: 'Stability (Master Yachts)', group: 'Yacht modules', validity: '3y' },
  master_yachts_business_law: { label: 'Business and Law (Master Yachts)', group: 'Yacht modules', validity: '3y' },
  master_yachts_celestial: { label: 'Celestial Navigation', group: 'Yacht modules', validity: '1y' },
  master_yachts_nav: { label: 'Advanced Navigation (Master Yachts)', group: 'Yacht modules', validity: '3y' },
  workboat_ops: { label: 'Workboat Operations module and exam', group: 'Workboat and offshore', validity: '3y' },
  boatmaster: { label: "Boatmasters' Licence", group: 'Workboat and offshore', validity: 'as_dated' },
  gwo_bst: { label: 'GWO Basic Safety Training', group: 'Workboat and offshore', validity: '2y' },
  gwo_sea_survival: { label: 'GWO Sea Survival', group: 'Workboat and offshore', validity: '2y' },
  gwo_bst_refresher: { label: 'GWO BST refresher', group: 'Workboat and offshore', validity: '2y' },
  opito_bosiet: { label: 'OPITO BOSIET', group: 'Workboat and offshore', validity: '2y' },
  opito_foet: { label: 'OPITO FOET', group: 'Workboat and offshore', validity: '2y' },
  huet: { label: 'HUET', group: 'Workboat and offshore', validity: '2y' },
  aec1: { label: 'Approved Engine Course 1', group: 'Engineering', validity: 'none' },
  aec2: { label: 'Approved Engine Course 2', group: 'Engineering', validity: 'none' },
  meol_sv: { label: 'Marine Engine Operator Licence (Small Vessel) course', group: 'Engineering', validity: 'none' },
  pssr_vh_module: { label: 'PSSR violence and harassment module (MGN 718)', group: 'Other', validity: 'none' },
  food_hygiene: { label: 'Food hygiene', group: 'Other', validity: 'none' },
  ship_cook: { label: "Ship's cook", group: 'Other', validity: 'none' },
};
