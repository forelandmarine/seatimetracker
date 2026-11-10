/**
 * Days abroad (2.5.0): client for /api/presence. Crew log where they were by
 * hand (ashore in a country, or signed on a vessel). The backend works out the
 * Schengen 90/180 figures and tax day counts. Guidance only.
 */
import { authFetch } from '@/utils/seaTimeApi';
import { todayIso } from '@/utils/localDate';

export type StayKind = 'ashore' | 'on_board';

/** International waters / at sea. */
export const AT_SEA_CODE = 'ZZ';

export interface PresenceStay {
  id: string;
  country_code: string;
  start_date: string;
  end_date: string | null;
  kind: StayKind;
  vessel_id: string | null;
  counts_schengen: boolean;
  counts_tax: boolean;
  note: string | null;
}

export interface StayInput {
  country_code: string;
  start_date: string;
  end_date: string | null;
  kind: StayKind;
  vessel_id?: string | null;
  counts_schengen?: boolean;
  counts_tax?: boolean;
  note?: string | null;
}

export interface Segment {
  start_date: string;
  end_date: string;
  days: number;
}

export interface SchengenPlan {
  start_date: string;
  end_date: string;
  days: number;
  ok: boolean;
  first_breach: string | null;
  max_used: number;
  latest_stay_if_enter: string | null;
}

export interface SchengenSummary {
  today: string;
  limit: number;
  window_days: number;
  window_start: string;
  used: number;
  remaining: number;
  latest_stay_date: string | null;
  over: boolean;
  warn: boolean;
  future_breach: string | null;
  segments: Segment[];
  future_segments: Segment[];
  next_release: { date: string; remaining: number } | null;
  plan: SchengenPlan | null;
}

export type TaxStatus = 'met' | 'near' | 'under' | 'none';

export interface TaxYear {
  label: string;
  start_date: string;
  end_date: string;
  days: number;
  planned_days: number;
  unrecorded_days: number;
  status: TaxStatus;
  days_to_test: number | null;
  detail: Record<string, number | string | null>;
}

export type TaxTestType = 'threshold' | 'majority' | 'us_spt' | 'ie_two_year' | 'za_ppt' | 'nz_rolling' | 'de_continuous';

export interface TaxCountry {
  country: string;
  has_rule: boolean;
  counting: 'midnight' | 'any_part';
  test: { type: TaxTestType; days?: number; cmp?: 'gt' | 'gte' } | null;
  years: TaxYear[];
  note: string | null;
  sources: string[];
}

export interface SedPeriod {
  start_date: string;
  end_date: string;
  days: number;
  absence_days: number;
  uk_days: number;
  eligible: boolean;
}

export interface PresenceSummary {
  today: string;
  open_stay: PresenceStay | null;
  schengen: SchengenSummary;
  tax: TaxCountry[];
  sed: { periods: SedPeriod[]; current: (SedPeriod & { days_to_365: number; uk_days_since: number; broken: boolean }) | null } | null;
  countries: Array<{ country: string; days: number; stays: number }>;
  settings: { tax_countries: string[]; home_country: string | null; saved: boolean };
  rules: { tax_countries: string[]; no_day_test: string[]; schengen_members: string[]; schengen_microstates: string[] };
}

const today = () => `today=${todayIso()}`;

export const getStays = async (): Promise<PresenceStay[]> => {
  const res = await authFetch('/api/presence/stays');
  return res.json();
};

export const addStay = async (stay: StayInput): Promise<PresenceStay> => {
  const res = await authFetch(`/api/presence/stays?${today()}`, { method: 'POST', body: stay });
  return res.json();
};

export const updateStay = async (id: string, stay: Partial<StayInput>): Promise<PresenceStay> => {
  const res = await authFetch(`/api/presence/stays/${id}?${today()}`, { method: 'PUT', body: stay });
  return res.json();
};

export const deleteStay = async (id: string): Promise<void> => {
  await authFetch(`/api/presence/stays/${id}`, { method: 'DELETE' });
};

export const signOn = async (body: { country_code: string; vessel_id?: string | null; counts_schengen?: boolean; date?: string }) => {
  const res = await authFetch(`/api/presence/sign-on?${today()}`, { method: 'POST', body });
  return res.json();
};

export const signOff = async (body: { country_code?: string | null; date?: string }) => {
  const res = await authFetch(`/api/presence/sign-off?${today()}`, { method: 'POST', body });
  return res.json();
};

export const getPresenceSummary = async (plan?: { start_date: string; end_date: string } | null): Promise<PresenceSummary> => {
  const q = plan ? `&plan_start=${plan.start_date}&plan_end=${plan.end_date}` : '';
  const res = await authFetch(`/api/presence/summary?${today()}${q}`);
  return res.json();
};

export const savePresenceSettings = async (taxCountries: string[]) => {
  const res = await authFetch('/api/presence/settings', { method: 'PUT', body: { tax_countries: taxCountries } });
  return res.json();
};

export const downloadPresenceCsv = async (): Promise<string> => {
  const res = await authFetch(`/api/presence/export.csv?${today()}`);
  return res.text();
};
