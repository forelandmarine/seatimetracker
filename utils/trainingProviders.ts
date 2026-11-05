import { useCallback, useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { authFetch } from '@/utils/seaTimeApi';
import { courseLabel } from '@/utils/courseChecklist';
import { OFFERED_COURSES } from '@/constants/offeredCourses';
import { APPROVAL_LABELS, approvalLabel, type Provider } from '@/utils/providerSearch';

export {
  searchProviders,
  haversineKm,
  labelMatches,
  providerCodesFor,
  defaultApproval,
  closerUnderOtherApprovals,
  approvalLabel,
  APPROVAL_LABELS,
} from '@/utils/providerSearch';
export type { Provider, ProviderFilters, ProviderHit } from '@/utils/providerSearch';

/**
 * Training provider directory for "Find a course". The directory (built from
 * the 2.4.0 research by scripts/gen-training-providers.mjs) is downloaded from
 * the backend the first time it's needed and kept on the phone, so search works
 * offline after that and the list can be corrected without an app release.
 * Course dates come from the backend where a provider publishes a calendar we
 * can read; everywhere else the app links to the provider's own dates page.
 */

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

export const SECTOR_LABELS: Record<string, string> = {
  yacht: 'Yacht',
  commercial: 'Commercial',
  offshore_wind: 'Offshore wind',
  merchant: 'Merchant',
  fishing: 'Fishing',
  towing: 'Towing',
};

/** The phone's region code, e.g. "GB", or null when it can't be read. */
export function phoneRegion(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getLocales } = require('expo-localization');
    const region = getLocales()?.[0]?.regionCode;
    return region ? String(region).toUpperCase() : null;
  } catch {
    return null;
  }
}

/** Miles where the phone's region is the UK, US, Liberia or Myanmar; kilometres elsewhere. */
export function usesMiles(): boolean {
  return ['GB', 'US', 'LR', 'MM'].includes(phoneRegion() ?? '');
}

export function formatDistance(km: number, miles: boolean): string {
  const v = miles ? km / 1.609344 : km;
  const unit = miles ? 'mi' : 'km';
  return v < 10 ? `${v.toFixed(1)} ${unit}` : `${Math.round(v).toLocaleString()} ${unit}`;
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
