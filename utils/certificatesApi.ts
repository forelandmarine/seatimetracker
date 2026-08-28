import { authFetch } from "./api";

export interface Certificate {
  id: string;
  certificate_type: string;
  certificate_number: string | null;
  issuing_body: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CertificateInput {
  certificate_type: string;
  certificate_number?: string | null;
  issuing_body?: string | null;
  issued_date?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
  image_url?: string | null;
}

export const CERTIFICATE_TYPE_LABELS: Record<string, string> = {
  stcw_basic_safety: "STCW Basic Safety Training",
  stcw_advanced_firefighting: "Advanced Fire Fighting",
  stcw_medical_first_aid: "Medical First Aid",
  stcw_proficiency_security: "Security Awareness",
  eng1_medical: "ENG1 Medical Certificate",
  gmdss_goc: "GMDSS GOC",
  gmdss_roc: "GMDSS ROC",
  ecdis: "ECDIS",
  radar_observer: "Radar Observer",
  radar_arpa: "Radar / ARPA",
  personal_survival_techniques: "Personal Survival Techniques",
  occ_yachtmaster_offshore: "Yachtmaster Offshore",
  occ_yachtmaster_ocean: "Yachtmaster Ocean",
  occ_master_3000gt: "Master <3000gt",
  occ_oow_3000gt: "OOW <3000gt",
  occ_chief_engineer: "Chief Engineer",
  occ_second_engineer: "Second Engineer",
  // USCG Documents
  uscg_mmc: "MMC (Merchant Mariner Credential)",
  uscg_twic: "TWIC",
  uscg_medical_certificate: "USCG Medical Certificate (CG-719K)",
  // USCG Deck Endorsements
  uscg_master_onc_unlimited: "Master, Oceans/Near-Coastal, Unlimited",
  uscg_chief_mate_onc_unlimited: "Chief Mate, Oceans/Near-Coastal, Unlimited",
  uscg_second_mate_onc_unlimited: "Second Mate, Oceans/Near-Coastal, Unlimited",
  uscg_third_mate_onc_unlimited: "Third Mate, Oceans/Near-Coastal, Unlimited",
  uscg_master_onc_1600grt: "Master, Oceans/Near-Coastal, under 1,600 GRT",
  uscg_mate_ocean_1600grt: "Mate, Oceans, under 1,600 GRT",
  uscg_mate_nc_1600grt: "Mate, Near-Coastal, under 1,600 GRT",
  uscg_master_onc_500grt: "Master, Oceans/Near-Coastal, under 500 GRT",
  uscg_mate_ocean_500grt: "Mate, Oceans, under 500 GRT",
  uscg_mate_nc_500grt: "Mate, Near-Coastal, under 500 GRT",
  uscg_master_ocean_200grt: "Master, Oceans, under 200 GRT",
  uscg_master_nc_200grt: "Master, Near-Coastal, under 200 GRT (200-ton)",
  uscg_mate_ocean_200grt: "Mate, Oceans, under 200 GRT",
  uscg_mate_nc_200grt: "Mate, Near-Coastal, under 200 GRT",
  uscg_master_nc_100grt: "Master, Near-Coastal, under 100 GRT",
  uscg_master_gl_inland: "Master, Great Lakes and Inland",
  uscg_mate_gl_inland: "Mate, Great Lakes and Inland",
  uscg_master_rivers: "Master, Rivers",
  uscg_oupv: "OUPV (Six-Pack)",
  // USCG Towing
  uscg_master_towing: "Master of Towing Vessels",
  uscg_mate_pilot_towing: "Mate (Pilot) of Towing Vessels",
  uscg_apprentice_mate_towing: "Apprentice Mate of Towing Vessels",
  uscg_toar: "TOAR (Towing Officer Assessment Record)",
  // USCG Offshore
  uscg_master_osv: "Master-OSV",
  uscg_chief_mate_osv: "Chief Mate-OSV",
  uscg_mate_osv: "Mate-OSV",
  uscg_oim: "Offshore Installation Manager (OIM)",
  uscg_barge_supervisor: "Barge Supervisor",
  uscg_ballast_control_operator: "Ballast Control Operator (BCO)",
  // USCG Fishing
  uscg_master_fishing: "Master, Uninspected Fishing Industry Vessels",
  uscg_mate_fishing: "Mate, Uninspected Fishing Industry Vessels",
  // USCG Engineer Endorsements
  uscg_chief_engineer: "Chief Engineer",
  uscg_first_assistant_engineer: "First Assistant Engineer",
  uscg_second_assistant_engineer: "Second Assistant Engineer",
  uscg_third_assistant_engineer: "Third Assistant Engineer",
  uscg_chief_engineer_limited: "Chief Engineer-Limited",
  uscg_assistant_engineer_limited: "Assistant Engineer-Limited",
  uscg_dde: "Designated Duty Engineer (DDE)",
  uscg_qmed: "QMED (Qualified Member of the Engine Department)",
  uscg_chief_engineer_osv: "Chief Engineer-OSV",
  uscg_assistant_engineer_osv: "Assistant Engineer-OSV",
  uscg_chief_engineer_modu: "Chief Engineer-MODU",
  uscg_assistant_engineer_modu: "Assistant Engineer-MODU",
  uscg_chief_engineer_fishing: "Chief Engineer, Uninspected Fishing Industry Vessels",
  uscg_assistant_engineer_fishing: "Assistant Engineer, Uninspected Fishing Industry Vessels",
  // USCG STCW Endorsements
  uscg_stcw_master: "STCW Master",
  uscg_stcw_chief_mate: "STCW Chief Mate",
  uscg_stcw_oicnw: "STCW OICNW",
  uscg_stcw_chief_engineer: "STCW Chief Engineer Officer",
  uscg_stcw_second_engineer: "STCW Second Engineer Officer",
  uscg_stcw_oicew: "STCW OICEW",
  uscg_stcw_eto: "STCW Electro-technical Officer",
  uscg_stcw_able_seafarer_deck: "Able Seafarer-Deck",
  uscg_stcw_able_seafarer_engine: "Able Seafarer-Engine",
  uscg_rfpnw: "RFPNW (Ratings Forming Part of a Navigational Watch)",
  uscg_rfpew: "RFPEW (Ratings Forming Part of an Engineering Watch)",
  uscg_vso: "Vessel Security Officer (VSO)",
  passport: "Passport",
  seaman_book: "Seaman's Discharge Book",
  other: "Other",
};

export const CERTIFICATE_TYPES = Object.keys(CERTIFICATE_TYPE_LABELS);

export interface CertificateTypeGroup {
  title: string;
  types: string[];
}

/**
 * Grouped view of CERTIFICATE_TYPES for the type picker. The USCG list is long
 * enough that a flat scroll is unusable, so the picker renders section headers.
 * Every key in CERTIFICATE_TYPE_LABELS appears in exactly one group.
 */
export const CERTIFICATE_TYPE_GROUPS: CertificateTypeGroup[] = [
  {
    title: "STCW & Safety",
    types: [
      "stcw_basic_safety",
      "stcw_advanced_firefighting",
      "stcw_medical_first_aid",
      "stcw_proficiency_security",
      "personal_survival_techniques",
    ],
  },
  { title: "Medical", types: ["eng1_medical"] },
  { title: "Communications", types: ["gmdss_goc", "gmdss_roc"] },
  { title: "Navigation & Bridge", types: ["ecdis", "radar_observer", "radar_arpa"] },
  {
    title: "MCA / RYA Certificates of Competency",
    types: [
      "occ_yachtmaster_offshore",
      "occ_yachtmaster_ocean",
      "occ_master_3000gt",
      "occ_oow_3000gt",
      "occ_chief_engineer",
      "occ_second_engineer",
    ],
  },
  {
    title: "USCG Documents",
    types: [
      "uscg_mmc",
      "uscg_twic",
      "uscg_medical_certificate",
    ],
  },
  {
    title: "USCG Deck Endorsements",
    types: [
      "uscg_master_onc_unlimited",
      "uscg_chief_mate_onc_unlimited",
      "uscg_second_mate_onc_unlimited",
      "uscg_third_mate_onc_unlimited",
      "uscg_master_onc_1600grt",
      "uscg_mate_ocean_1600grt",
      "uscg_mate_nc_1600grt",
      "uscg_master_onc_500grt",
      "uscg_mate_ocean_500grt",
      "uscg_mate_nc_500grt",
      "uscg_master_ocean_200grt",
      "uscg_master_nc_200grt",
      "uscg_mate_ocean_200grt",
      "uscg_mate_nc_200grt",
      "uscg_master_nc_100grt",
      "uscg_master_gl_inland",
      "uscg_mate_gl_inland",
      "uscg_master_rivers",
      "uscg_oupv",
    ],
  },
  {
    title: "USCG Towing",
    types: [
      "uscg_master_towing",
      "uscg_mate_pilot_towing",
      "uscg_apprentice_mate_towing",
      "uscg_toar",
    ],
  },
  {
    title: "USCG Offshore",
    types: [
      "uscg_master_osv",
      "uscg_chief_mate_osv",
      "uscg_mate_osv",
      "uscg_oim",
      "uscg_barge_supervisor",
      "uscg_ballast_control_operator",
    ],
  },
  {
    title: "USCG Fishing",
    types: [
      "uscg_master_fishing",
      "uscg_mate_fishing",
    ],
  },
  {
    title: "USCG Engineer Endorsements",
    types: [
      "uscg_chief_engineer",
      "uscg_first_assistant_engineer",
      "uscg_second_assistant_engineer",
      "uscg_third_assistant_engineer",
      "uscg_chief_engineer_limited",
      "uscg_assistant_engineer_limited",
      "uscg_dde",
      "uscg_qmed",
      "uscg_chief_engineer_osv",
      "uscg_assistant_engineer_osv",
      "uscg_chief_engineer_modu",
      "uscg_assistant_engineer_modu",
      "uscg_chief_engineer_fishing",
      "uscg_assistant_engineer_fishing",
    ],
  },
  {
    title: "USCG STCW Endorsements",
    types: [
      "uscg_stcw_master",
      "uscg_stcw_chief_mate",
      "uscg_stcw_oicnw",
      "uscg_stcw_chief_engineer",
      "uscg_stcw_second_engineer",
      "uscg_stcw_oicew",
      "uscg_stcw_eto",
      "uscg_stcw_able_seafarer_deck",
      "uscg_stcw_able_seafarer_engine",
      "uscg_rfpnw",
      "uscg_rfpew",
      "uscg_vso",
    ],
  },
  { title: "Identity & Other", types: ["passport", "seaman_book", "other"] },
];


async function ensureOk(res: Response): Promise<void> {
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = `Request failed (${res.status})`;
    try { const j = JSON.parse(text); if (j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
}

export async function listCertificates(): Promise<Certificate[]> {
  const res = await authFetch("/api/certificates");
  await ensureOk(res);
  return res.json();
}

export async function createCertificate(input: CertificateInput): Promise<Certificate> {
  const res = await authFetch("/api/certificates", { method: "POST", body: input });
  await ensureOk(res);
  return res.json();
}

export async function updateCertificate(id: string, input: Partial<CertificateInput>): Promise<Certificate> {
  const res = await authFetch(`/api/certificates/${id}`, { method: "PUT", body: input });
  await ensureOk(res);
  return res.json();
}

export async function deleteCertificate(id: string): Promise<void> {
  const res = await authFetch(`/api/certificates/${id}`, { method: "DELETE" });
  await ensureOk(res);
}

/** Returns days until expiry. Negative if expired. Null if no expiry set. */
export function daysUntilExpiry(cert: Certificate): number | null {
  if (!cert.expiry_date) return null;
  const expiry = new Date(cert.expiry_date);
  if (isNaN(expiry.getTime())) return null;
  const now = new Date();
  const diffMs = expiry.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export type ExpiryStatus = "expired" | "soon" | "ok" | "unknown";

export function expiryStatus(cert: Certificate): ExpiryStatus {
  const days = daysUntilExpiry(cert);
  if (days === null) return "unknown";
  if (days < 0) return "expired";
  if (days <= 90) return "soon";
  return "ok";
}
