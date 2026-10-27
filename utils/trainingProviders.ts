import { authFetch } from '@/utils/seaTimeApi';
import { courseLabel } from '@/utils/courseChecklist';

/**
 * Training provider directory for "Find a course". The directory ships with
 * the app (constants/trainingProviders.json, built from the 2.4.0 research by
 * scripts/gen-training-providers.mjs) so search works offline. Course dates
 * come from the backend where a provider publishes a calendar we can read;
 * everywhere else the app links to the provider's own dates page.
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

export interface CourseDate {
  provider_id: string;
  course_code: string;
  start_date: string;
  end_date: string | null;
  price_text: string | null;
  availability_text: string | null;
  booking_url: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RAW: { v: number; providers: Provider[] } = require('@/constants/trainingProviders.json');
export const PROVIDERS: Provider[] = RAW.providers;

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
const COUNTRY_WORDS = new Set(['spain', 'france', 'italy', 'india', 'singapore', 'croatia', 'portugal', 'netherlands', 'denmark', 'finland', 'cyprus', 'greece', 'malta', 'philippines', 'nigeria', 'kenya', 'brazil', 'chile', 'argentina', 'ireland', 'canada', 'kong', 'hong']);
export const approvalLabel = (a: string): string => {
  if (APPROVAL_LABELS[a]) return APPROVAL_LABELS[a];
  if (!a.startsWith('other:')) return a.toUpperCase();
  return a
    .slice(6)
    .trim()
    .split(/[_\s]+/)
    .map((w) => (COUNTRY_WORDS.has(w.toLowerCase()) ? w[0].toUpperCase() + w.slice(1) : w.length <= 5 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
};

export const SECTOR_LABELS: Record<string, string> = {
  yacht: 'Yacht',
  commercial: 'Commercial',
  offshore_wind: 'Offshore wind',
  merchant: 'Merchant',
  fishing: 'Fishing',
  towing: 'Towing',
};

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Miles where the phone's region is the UK, US, Liberia or Myanmar; kilometres elsewhere. */
export function usesMiles(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getLocales } = require('expo-localization');
    const region = getLocales()?.[0]?.regionCode;
    return ['GB', 'US', 'LR', 'MM'].includes(String(region).toUpperCase());
  } catch {
    return false;
  }
}

export function formatDistance(km: number, miles: boolean): string {
  const v = miles ? km / 1.609344 : km;
  const unit = miles ? 'mi' : 'km';
  return v < 10 ? `${v.toFixed(1)} ${unit}` : `${Math.round(v).toLocaleString()} ${unit}`;
}

export interface ProviderFilters {
  query: string;
  course: string | null;
  sector: string | null;
  approval: string | null;
  origin: { lat: number; lng: number } | null;
  radiusKm: number | null;
}

export interface ProviderHit {
  provider: Provider;
  distanceKm: number | null;
}

function matchesQuery(p: Provider, q: string): boolean {
  if (!q) return true;
  const hay = [p.name, p.city, p.region, p.country, p.countryName, p.postcode, ...p.courses.map(courseLabel)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

export function searchProviders(f: ProviderFilters): ProviderHit[] {
  const hits: ProviderHit[] = [];
  for (const p of PROVIDERS) {
    if (f.course && !p.courses.includes(f.course)) continue;
    if (f.sector && !p.sectors.includes(f.sector)) continue;
    if (f.approval && !p.approvals.includes(f.approval)) continue;
    if (!matchesQuery(p, f.query.trim())) continue;
    const distanceKm =
      f.origin && p.lat != null && p.lng != null ? haversineKm(f.origin.lat, f.origin.lng, p.lat, p.lng) : null;
    if (f.origin && f.radiusKm != null && (distanceKm == null || distanceKm > f.radiusKm)) continue;
    hits.push({ provider: p, distanceKm });
  }
  hits.sort((a, b) => {
    if (a.distanceKm != null && b.distanceKm != null) return a.distanceKm - b.distanceKm;
    if (a.distanceKm != null) return -1;
    if (b.distanceKm != null) return 1;
    return a.provider.country.localeCompare(b.provider.country) || a.provider.name.localeCompare(b.provider.name);
  });
  return hits;
}

/** Course codes that at least one provider offers, for the course picker. */
export function offeredCourses(): string[] {
  const set = new Set<string>();
  PROVIDERS.forEach((p) => p.courses.forEach((c) => set.add(c)));
  return Array.from(set).sort((a, b) => courseLabel(a).localeCompare(courseLabel(b)));
}

export function offeredApprovals(): string[] {
  const set = new Set<string>();
  PROVIDERS.forEach((p) => p.approvals.forEach((a) => set.add(a)));
  // Main bodies first, then national administrations alphabetically.
  const known = Object.keys(APPROVAL_LABELS).filter((a) => set.has(a));
  const others = Array.from(set)
    .filter((a) => !APPROVAL_LABELS[a])
    .sort((x, y) => approvalLabel(x).localeCompare(approvalLabel(y)));
  return [...known, ...others];
}

export const getProvider = (id: string) => PROVIDERS.find((p) => p.id === id) ?? null;

// Dates for one course across every provider, fetched once per course while the app is open.
const datesByCourse = new Map<string, Promise<CourseDate[]>>();
export function courseDatesFor(course: string): Promise<CourseDate[]> {
  let p = datesByCourse.get(course);
  if (!p) {
    p = fetchCourseDates([], course);
    datesByCourse.set(course, p);
  }
  return p;
}

/**
 * Upcoming dates from the backend (2.4.0+). Returns [] when the backend has
 * none for these providers or is an older version, so callers fall back to
 * linking out.
 */
export async function fetchCourseDates(providerIds: string[], course?: string | null): Promise<CourseDate[]> {
  if (providerIds.length === 0 && !course) return [];
  try {
    const params = new URLSearchParams();
    if (providerIds.length) params.set('providers', providerIds.slice(0, 50).join(','));
    if (course) params.set('course', course);
    const res = await authFetch(`/api/training/course-dates?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.dates) ? data.dates : [];
  } catch {
    return [];
  }
}
