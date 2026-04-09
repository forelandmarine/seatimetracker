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
  passport: "Passport",
  seaman_book: "Seaman's Discharge Book",
  other: "Other",
};

export const CERTIFICATE_TYPES = Object.keys(CERTIFICATE_TYPE_LABELS);

export async function listCertificates(): Promise<Certificate[]> {
  const res = await authFetch("/api/certificates");
  return res.json();
}

export async function createCertificate(input: CertificateInput): Promise<Certificate> {
  const res = await authFetch("/api/certificates", { method: "POST", body: input });
  return res.json();
}

export async function updateCertificate(id: string, input: Partial<CertificateInput>): Promise<Certificate> {
  const res = await authFetch(`/api/certificates/${id}`, { method: "PUT", body: input });
  return res.json();
}

export async function deleteCertificate(id: string): Promise<void> {
  await authFetch(`/api/certificates/${id}`, { method: "DELETE" });
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
