import { useCallback, useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { authFetch } from '@/utils/seaTimeApi';
import { courseLabel } from '@/utils/courseChecklist';
import { OFFERED_COURSES } from '@/constants/offeredCourses';

/**
 * Training provider directory for "Find a course". The directory (built from
 * the 2.4.0 research by scripts/gen-training-providers.mjs) is downloaded from
 * the backend the first time it's needed and kept on the phone, so search works
 * offline after that and the list can be corrected without an app release.
 * Course dates come from the backend where a provider publishes a calendar we
 * can read; everywhere else the app links to the provider's own dates page.
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

// Saved copy of the directory, plus its ETag. The ETag file's modified time is
// when the copy was last checked against the backend.
const CACHE_FILE = `${FileSystem.documentDirectory}training-providers.json`;
const ETAG_FILE = `${FileSystem.documentDirectory}training-providers.etag`;
const RECHECK_MS = 7 * 24 * 3600 * 1000;

let providers: Provider[] | null = null;
let loading: Promise<Provider[]> | null = null;

function parseDirectory(text: string): Provider[] {
  const data = JSON.parse(text);
  if (!Array.isArray(data?.providers)) throw new Error('Bad provider directory');
  return data.providers;
}

/** Fetches the directory; null when the saved copy (etag) is still current. */
async function download(etag: string | null): Promise<Provider[] | null> {
  try {
    const res = await authFetch('/api/training/providers', { timeout: 30_000, headers: etag ? { 'If-None-Match': etag } : {} });
    const text = await res.text();
    const list = parseDirectory(text);
    await FileSystem.writeAsStringAsync(CACHE_FILE, text);
    await FileSystem.writeAsStringAsync(ETAG_FILE, res.headers.get('etag') ?? '');
    return list;
  } catch (e) {
    if ((e as { status?: number })?.status === 304) {
      await FileSystem.writeAsStringAsync(ETAG_FILE, etag ?? '').catch(() => {});
      return null;
    }
    throw e;
  }
}

async function readSaved(): Promise<{ list: Provider[]; etag: string | null; checkedAt: number } | null> {
  try {
    const info = await FileSystem.getInfoAsync(ETAG_FILE);
    if (!info.exists) return null;
    const list = parseDirectory(await FileSystem.readAsStringAsync(CACHE_FILE));
    const etag = (await FileSystem.readAsStringAsync(ETAG_FILE)) || null;
    return { list, etag, checkedAt: (info.modificationTime ?? 0) * 1000 };
  } catch {
    return null;
  }
}

/**
 * The directory, from memory, the saved copy or the backend (in that order).
 * A saved copy older than a week is used straight away and refreshed behind it.
 */
export function loadProviders(): Promise<Provider[]> {
  if (providers) return Promise.resolve(providers);
  if (!loading) {
    loading = (async () => {
      const saved = await readSaved();
      if (saved) {
        providers = saved.list;
        if (Date.now() - saved.checkedAt > RECHECK_MS) {
          download(saved.etag).then((l) => { if (l) providers = l; }).catch(() => {});
        }
        return saved.list;
      }
      const list = (await download(null))!;
      providers = list;
      return list;
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
}

/** Directory for a screen: null while loading, with an error and retry if the first download fails. */
export function useProviders(): { providers: Provider[] | null; error: string | null; retry: () => void } {
  const [list, setList] = useState<Provider[] | null>(providers);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    loadProviders()
      .then(setList)
      .catch(() => setError("Couldn't load the course directory. Check your connection and try again."));
  }, []);
  useEffect(() => {
    if (!list) load();
  }, [list, load]);
  return { providers: list, error, retry: load };
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

export function searchProviders(list: Provider[], f: ProviderFilters): ProviderHit[] {
  const hits: ProviderHit[] = [];
  for (const p of list) {
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

/** Course codes that at least one provider offers, for the course picker. Ships with the app. */
export function offeredCourses(): string[] {
  return [...OFFERED_COURSES].sort((a, b) => courseLabel(a).localeCompare(courseLabel(b)));
}

export function offeredApprovals(list: Provider[]): string[] {
  const set = new Set<string>();
  list.forEach((p) => p.approvals.forEach((a) => set.add(a)));
  // Main bodies first, then national administrations alphabetically.
  const known = Object.keys(APPROVAL_LABELS).filter((a) => set.has(a));
  const others = Array.from(set)
    .filter((a) => !APPROVAL_LABELS[a])
    .sort((x, y) => approvalLabel(x).localeCompare(approvalLabel(y)));
  return [...known, ...others];
}


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
