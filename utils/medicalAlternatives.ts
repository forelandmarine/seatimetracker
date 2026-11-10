import {
  MEDICAL_OPTIONS,
  AUTHORITY_MEDICAL_COUNTRY,
  COUNTRY_ALIASES,
  type MedicalOption,
} from '@/constants/medicalEquivalents';
import { normaliseSearch, queryWords, queryPlaceCountry, nearestCountry, type Provider } from '@/utils/providerSearch';

/**
 * "Also accepted instead of ENG1" for Find a course. Crew outside the UK, or far
 * from an MCA approved doctor, can often use their own country's seafarer medical
 * instead (MSN 1815), and other authorities ask for their own medical. Kept free
 * of Expo imports so scripts/search-eval-medical.ts can run it.
 */

export interface MedicalAlternatives {
  /** Country the options are for, and how it was worked out. */
  country: string | null;
  countryFrom: 'query' | 'location' | 'home' | null;
  /** The words in the query taken as that country. */
  countryWords: string[];
  /** The medical the user's own authority asks for, when that isn't the MCA. */
  authorityOption: MedicalOption | null;
  /** Other medicals that answer the search, most relevant first. */
  options: MedicalOption[];
  /** An MCA approved doctor is listed in that country. */
  hasMcaDoctor: boolean;
  /** Show these before the ENG1 doctors: no MCA doctor there, or the user needs another authority's medical. */
  lead: boolean;
}

// The Channel Islands and Isle of Man have MCA doctors and count as the UK here.
const UK = new Set(['GB', 'JE', 'GG', 'IM']);

// Words that make a search about the seafarer medical.
const MEDICAL_WORDS = new Set(['eng1', 'ml5', 'medical', 'medicals', 'doctor', 'doctors', 'physical', 'cg719k', '719k']);
const MEDICAL_COURSE_WORDS = new Set(['care', 'aid', 'first', 'mfa', 'responder', 'refresher', 'course', 'courses']);

/** True when one word is at most one edit (or a swap) from the other. */
function oneEditAway(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const diff = [...a].map((c, i) => (c !== b[i] ? i : -1)).filter((i) => i >= 0);
    return diff.length === 1 || (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]);
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  for (let i = 0; i < l.length; i++) if (s === l.slice(0, i) + l.slice(i + 1)) return true;
  return false;
}

/** True when a search or the chosen course is about the seafarer medical (ENG1, ML5, "seafarer medical"). */
export function isMedicalSearch(query: string, course: string | null): boolean {
  if (course === 'eng1' || course === 'ml5') return true;
  const words = queryWords(query);
  if (words.some((w) => w === 'eng1' || w === 'ml5')) return true;
  // "Medical care", "medical first aid": STCW courses, not the medical certificate.
  if (words.some((w) => MEDICAL_COURSE_WORDS.has(w))) return false;
  return words.some(
    (w) => MEDICAL_WORDS.has(w) || (w.length >= 6 && oneEditAway(w, 'medical')) || (w.length >= 6 && w.startsWith('medic')),
  );
}

// Country names and aliases, longest first so "south africa" wins over "africa".
const COUNTRY_NAMES: [string, string][] = (() => {
  const out = new Map<string, string>();
  for (const o of MEDICAL_OPTIONS) out.set(normaliseSearch(o.countryName), o.country);
  for (const [cc, words] of Object.entries(COUNTRY_ALIASES)) for (const w of words) out.set(normaliseSearch(w), cc);
  return Array.from(out).sort((a, b) => b[0].split(' ').length - a[0].split(' ').length || b[0].length - a[0].length);
})();

/** A country named in the query ("eng1 norway", "medical in the usa"), with the words that named it. */
export function countryInQuery(query: string): { country: string; words: string[] } | null {
  const text = ` ${normaliseSearch(query)} `;
  for (const [name, cc] of COUNTRY_NAMES) {
    // Two-letter aliases ("us", "sa") only count in upper case as typed, or "us" in "near us" would be America.
    if (name.length <= 2 && !new RegExp(`(^|[^A-Za-z])${name.toUpperCase()}([^A-Za-z]|$)`).test(query)) continue;
    if (text.includes(` ${name} `)) return { country: cc, words: name.split(' ') };
  }
  return null;
}

export interface MedicalContext {
  query: string;
  course: string | null;
  /** The user's maritime authority (mca, uscg, amsa, mnz, samsa). */
  authority: string | null;
  /** The phone's location when "Near me" is on. */
  origin: { lat: number; lng: number } | null;
  /** searchHomeCountry(): the authority's country, else the phone's region. */
  homeCountry: string | null;
}

/**
 * Medicals to show next to the ENG1 doctors for a medical search, or null when
 * the search isn't about the medical. The country comes from the query first
 * ("eng1 Norway", "medical Split"), then "Near me", then the user's home country.
 */
export function medicalAlternatives(list: Provider[], ctx: MedicalContext): MedicalAlternatives | null {
  if (!isMedicalSearch(ctx.query, ctx.course)) return null;
  const words = queryWords(ctx.query);
  const named = countryInQuery(ctx.query);
  const place = named ? null : queryPlaceCountry(list, ctx.query, ctx.homeCountry);
  let country: string | null = null;
  let countryFrom: MedicalAlternatives['countryFrom'] = null;
  let countryWords: string[] = [];
  if (named) [country, countryFrom, countryWords] = [named.country, 'query', named.words];
  else if (place?.country) [country, countryFrom, countryWords] = [place.country, 'query', place.words];
  else if (ctx.origin) {
    country = nearestCountry(list, ctx.origin);
    if (country) countryFrom = 'location';
  }
  if (!country && ctx.homeCountry) [country, countryFrom] = [ctx.homeCountry.toUpperCase(), 'home'];

  const auth = ctx.authority?.toLowerCase() ?? null;
  const authCountry = auth ? AUTHORITY_MEDICAL_COUNTRY[auth] : undefined;
  const optionFor = (cc: string) =>
    cc === 'US' ? MEDICAL_OPTIONS.find((o) => o.id === 'uscg')! : MEDICAL_OPTIONS.find((o) => o.kind === 'eng1_equivalent' && o.country === cc) ?? null;
  const authorityOption = authCountry ? optionFor(authCountry) : null;

  const inUk = !!country && UK.has(country);
  const askedMl5 = ctx.course === 'ml5' || words.includes('ml5');
  const options: MedicalOption[] = [];
  const ml5 = MEDICAL_OPTIONS.find((o) => o.id === 'ml5')!;
  if (askedMl5) options.push(ml5);
  const local = country && !inUk ? optionFor(country) : null;
  if (local && local !== authorityOption) options.push(local);
  if (inUk && !askedMl5) options.push(ml5);

  const hasMcaDoctor = !!country && list.some((p) => (inUk ? UK.has(p.country) : p.country === country) && p.courses.includes('eng1'));
  const lead = askedMl5 || !!authorityOption || (!!local && !hasMcaDoctor);
  return { country, countryFrom, countryWords, authorityOption, options, hasMcaDoctor, lead };
}

/** The query with the country words taken out, to list ENG1 doctors elsewhere when none are in that country. */
export function queryWithout(query: string, words: string[]): string {
  const drop = new Set(words);
  return normaliseSearch(query)
    .split(' ')
    .filter((w) => w && !drop.has(w))
    .join(' ');
}
