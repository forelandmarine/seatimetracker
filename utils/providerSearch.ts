import { courseLabel } from '@/utils/courseChecklist';

/**
 * Search for "Find a course". Kept free of Expo imports so the backend tests
 * can run it against the directory the backend serves.
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

export interface ProviderFilters {
  query: string;
  course: string | null;
  sector: string | null;
  approval: string | null;
  origin: { lat: number; lng: number } | null;
  radiusKm: number | null;
  /** The phone's country; without a location its providers come first. */
  homeCountry?: string | null;
}

export interface ProviderHit {
  provider: Provider;
  distanceKm: number | null;
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Lower-cases and drops accents and punctuation, so "ENG-1" reads "eng 1" and "Côte" reads "cote". */
export function normaliseSearch(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Words crew use for a course that its label doesn't contain.
const COURSE_SEARCH_WORDS: Record<string, string> = {
  eng1: 'seafarer medical approved doctor medical examination',
  medical_care: 'stcw medical',
  mfa: 'stcw medical',
  efa: 'stcw basic safety first aid',
  pst: 'stcw basic safety sea survival',
  fpff: 'stcw basic safety fire fighting',
  pssr: 'stcw basic safety',
  stcw_basic_refresher: 'stcw basic safety',
};

// Country words the country name doesn't cover.
const COUNTRY_SEARCH_WORDS: Record<string, string> = {
  GB: 'uk britain england scotland wales',
  US: 'usa america',
  AE: 'uae',
  NL: 'holland',
};

// Words that describe the search rather than narrow it ("ENG1 providers near Southampton").
const FILLER = new Set([
  'a', 'an', 'the', 'in', 'at', 'for', 'of', 'near', 'me', 'nearest', 'local', 'find', 'where', 'to', 'get',
  'provider', 'providers', 'course', 'courses', 'training', 'school', 'schools', 'centre', 'centres', 'center', 'centers',
]);

/** Query words, with fillers dropped and "eng 1" joined back to "eng1". */
export function queryWords(q: string): string[] {
  const raw = normaliseSearch(q).split(' ').filter(Boolean);
  const joined: string[] = [];
  for (const w of raw) {
    const prev = joined[joined.length - 1];
    if (prev && /^\d+$/.test(w) && /[a-z]$/.test(prev) && !FILLER.has(prev)) joined[joined.length - 1] = prev + w;
    else joined.push(w);
  }
  const words = joined.filter((w) => !FILLER.has(w));
  // "Training centre" on its own still means something.
  return words.length ? words : joined;
}

const hayCache = new WeakMap<Provider, { spaced: string; compact: string }>();

function haystack(p: Provider): { spaced: string; compact: string } {
  let h = hayCache.get(p);
  if (!h) {
    const spaced = normaliseSearch(
      [
        p.name,
        p.address,
        p.city,
        p.region,
        p.country,
        p.countryName,
        COUNTRY_SEARCH_WORDS[p.country],
        p.postcode,
        ...p.approvals,
        ...p.courses.flatMap((c) => [courseLabel(c), c, COURSE_SEARCH_WORDS[c]]),
      ]
        .filter(Boolean)
        .join(' '),
    );
    h = { spaced, compact: spaced.replace(/ /g, '') };
    hayCache.set(p, h);
  }
  return h;
}

export function matchesQuery(p: Provider, q: string): boolean {
  const words = queryWords(q);
  if (!words.length) return true;
  const { spaced, compact } = haystack(p);
  // Spaces don't count either way: "eng1" finds "ENG 1" and "pscrb otl" finds "PSCRB-OTL".
  return words.every((w) => spaced.includes(w) || compact.includes(w));
}

/** Matches a picker label (and its code) to what the user typed, spacing and punctuation ignored. */
export function labelMatches(label: string, code: string, q: string): boolean {
  const words = normaliseSearch(q).split(' ').filter(Boolean);
  if (!words.length) return true;
  const spaced = normaliseSearch(`${label} ${code} ${COURSE_SEARCH_WORDS[code] ?? ''}`);
  const compact = spaced.replace(/ /g, '');
  const joined = words.join('');
  return words.every((w) => spaced.includes(w)) || compact.includes(joined);
}

// The Channel Islands and Isle of Man count as home for UK phones.
const HOME_GROUPS: Record<string, string[]> = { GB: ['GB', 'JE', 'GG', 'IM'] };

export function searchProviders(list: Provider[], f: ProviderFilters): ProviderHit[] {
  const hc = f.homeCountry?.toUpperCase();
  const home = new Set(hc ? (HOME_GROUPS[hc] ?? [hc]) : []);
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
    return (
      Number(!home.has(a.provider.country)) - Number(!home.has(b.provider.country)) ||
      a.provider.country.localeCompare(b.provider.country) ||
      a.provider.name.localeCompare(b.provider.name)
    );
  });
  return hits;
}
