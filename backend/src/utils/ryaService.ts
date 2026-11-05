/**
 * Sea time toward the RYA/MCA Yachtmaster exams, counted the RYA's way (RYA
 * "Qualifying passages" and the Yachtmaster Coastal and Offshore pages):
 *
 * - A day is eight consecutive hours living on board, most of it at sea. Shorter
 *   periods cannot be added together, and only one eight-hour period counts in
 *   any 24 hours. Here a period has to fit inside one logged entry, and periods
 *   start at least 24 hours apart.
 * - Days as skipper: the same, on entries logged with the Master rank (the RYA's
 *   skipper is the person responsible for planning and running the passage).
 * - Sea time must be in the last 10 years, on seagoing yachts, in the same
 *   discipline (sail or power) as the exam. Commercial vessels are left out: the
 *   RYA asks for yacht service and refers anything else to training@rya.org.uk.
 * - Miles: the distance run, from the AIS track where there is one, otherwise the
 *   entry's start-to-end distance.
 * - A qualifying passage is a non-stop voyage from port to port where both the
 *   planned distance and the distance run are over 60 miles. The planned route
 *   cannot be shorter than the straight line from start to end, so a straight
 *   line over 60 miles meets both. A passage that went round a headland and is
 *   shorter in a straight line is missed: this can only under-count.
 * - Overnight is not defined by the RYA. Here it is a passage that is under way
 *   through midnight UTC, shown as guidance.
 * - Night hours (Yachtmaster Coastal, 12): the RYA pages do not define them. The
 *   RYA logbook counts hours on watch, or taking an active part in the navigation
 *   or handling of the yacht, at sea between sunset and sunrise. Here they are the
 *   hours under way between local sunset and sunrise at each AIS position (start
 *   and end positions when there is no track). Whether the user was on watch
 *   cannot be seen from AIS, so this is an upper bound.
 * - Tidal waters: entries the sea-area classifier placed in tidal water.
 * - Yachtmaster Ocean: passages of 600 miles run over at least 96 hours, as
 *   skipper or mate, are listed as possible qualifying passages. Each also gets
 *   the miles run with both ends of an AIS leg more than 50 miles from land, from
 *   the classifier's coastline (Natural Earth 1:10m worldwide, ONS around GB).
 *   It loads whatever COMMERCIAL_PATHWAYS_ENABLED says, since hobby sailors take
 *   Ocean too. The RYA also counts charted objects capable of being used for navigation as
 *   land, and the coastline does not show rigs or offshore lights, so this can
 *   over-count near them. The astro sights are not checked.
 * - Reduced targets (ryaTargets): holders of Yachtmaster Offshore in the other
 *   discipline need 25 days, 3 as skipper, 1,250 miles and 3 passages (1
 *   overnight, 1 as skipper). For Yachtmaster Coastal, with a Coastal Skipper
 *   Practical course completion certificate or Yachtmaster Coastal in the other
 *   discipline, 30 days and 800 miles under 24 m may be reduced to 12 days and 400
 *   miles under 24 m, or met with 30 days and 800 miles on yachts under 500 GT.
 *   The tidal half follows the reduced days.
 */

import { calculateDistanceNauticalMiles } from './seaTime.js';
import { isNight } from './solar.js';

export type Discipline = 'sail' | 'power';

const HOUR = 3_600_000;
const DAY_HOURS = 8;
export const RYA_WINDOW_YEARS = 10;
export const PASSAGE_MIN_NM = 60;
export const OCEAN_MIN_NM = 600;
export const OCEAN_MIN_HOURS = 96;
export const OCEAN_OFFSHORE_NM = 200;
export const OCEAN_OFFSHORE_FROM_LAND_NM = 50;
/** Step used to sample night along an entry. */
const NIGHT_STEP_MS = 5 * 60_000;
/** AIS fixes further apart than this are not joined into a leg for the offshore miles. */
const MAX_LEG_GAP_MS = 6 * HOUR;

const AT_SEA = new Set(['actual_sea_service', 'watchkeeping_service', 'standby_service']);
const MATE_RANKS = new Set(['chief_officer', 'second_officer', 'third_officer', 'oow']);

export interface RyaEntry {
  id?: string;
  start_time: Date | string;
  end_time: Date | string | null;
  status?: string | null;
  service_type?: string | null;
  rank?: string | null;
  distance_nm?: string | number | null;
  is_tidal?: boolean | null;
  start_latitude?: string | number | null;
  start_longitude?: string | number | null;
  end_latitude?: string | number | null;
  end_longitude?: string | number | null;
  vessel?: {
    type?: string | null;
    length_metres?: string | number | null;
    gross_tonnes?: string | number | null;
    sector?: string | null;
    is_workboat?: boolean | null;
    is_tug?: boolean | null;
  } | null;
}

export interface RyaPassage {
  id: string | null;
  start: string;
  nm: number;
  hours: number;
  overnight: boolean;
  as_skipper: boolean;
}

export interface RyaDiscipline {
  /** Days on yachts up to 500 GT (Offshore). */
  days: number;
  /** Days on vessels under 24 m (Coastal, and the Offshore half). */
  days_under_24m: number;
  /** Days as skipper on vessels under 24 m. */
  skipper_days_under_24m: number;
  /** Days in tidal waters on vessels under 24 m (the Offshore half). */
  tidal_days_under_24m: number;
  /** Days in tidal waters on any yacht (the Coastal half). */
  tidal_days: number;
  /** Miles run on yachts up to 500 GT. */
  miles: number;
  /** Miles run on vessels under 24 m. */
  miles_under_24m: number;
  passages: RyaPassage[];
  /** Possible Yachtmaster Ocean qualifying passages. */
  ocean_passages: RyaOceanPassage[];
  /** Hours under way between sunset and sunrise on yachts up to 500 GT. */
  night_hours: number;
  /** Targets after any reduction from certificates held (ryaTargets). */
  targets: RyaTargets;
}

export interface RyaOceanPassage extends RyaPassage {
  /** Miles run more than 50 miles from land, from AIS fixes; null with no track or no coastline. */
  offshore_nm: number | null;
}

/** An AIS fix (ais_checks row). */
export interface RyaFix {
  latitude: string | number | null;
  longitude: string | number | null;
  check_time: Date | string;
  is_moving?: boolean | null;
}

/** Certificates that reduce the targets. */
export interface RyaHeld {
  /** Disciplines of Yachtmaster Offshore certificates held. */
  offshore: Discipline[];
  /** Disciplines of Yachtmaster Coastal certificates held. */
  coastal: Discipline[];
  /** Holds an RYA Coastal Skipper Practical course completion certificate. */
  coastal_skipper_course: boolean;
  /** Yachtmaster certificates with no discipline recorded, which cannot reduce anything. */
  no_discipline: string[];
}

export interface RyaTargets {
  coastal: {
    /** Days under 24 m (12 when reduced, else 30). */
    days_under_24m: number;
    /** When reduced, the other way to meet the days: 30 on yachts under 500 GT. */
    days_alt_500gt: number | null;
    skipper_days_under_24m: number;
    miles_under_24m: number;
    miles_alt_500gt: number | null;
    tidal_days: number;
    night_hours: number;
    /** What reduced the targets, or null. */
    reduced_by: 'coastal_skipper_course' | 'yachtmaster_coastal' | null;
  };
  offshore: {
    days: number;
    skipper_days_under_24m: number;
    miles: number;
    passages: number;
    overnight: number;
    as_skipper: number;
    tidal_days_under_24m: number;
    reduced_by: 'yachtmaster_offshore' | null;
  };
}

export interface RyaOptions {
  /** AIS fixes by entry id, for night hours and offshore miles. */
  fixes?: Map<string, RyaFix[]>;
  /** True when a position is more than 50 miles from land; null when no coastline is loaded. */
  farFromLand?: ((lat: number, lon: number) => boolean) | null;
  held?: RyaHeld;
}

export const NO_CERTIFICATES: RyaHeld = { offshore: [], coastal: [], coastal_skipper_course: false, no_discipline: [] };

/** Certificate types (utils/certificatesApi.ts in the app) that reduce the targets. */
export const RYA_DISCIPLINE_CERT_TYPES = ['occ_yachtmaster_offshore', 'course_ym_coastal'] as const;

/** What the user's certificates reduce. Yachtmaster certificates need their discipline recorded. */
export function ryaHeldFrom(certs: Array<{ certificate_type: string; discipline?: string | null }>): RyaHeld {
  const held: RyaHeld = { offshore: [], coastal: [], coastal_skipper_course: false, no_discipline: [] };
  for (const c of certs) {
    if (c.certificate_type === 'course_coastal_skipper') held.coastal_skipper_course = true;
    const list = c.certificate_type === 'occ_yachtmaster_offshore' ? held.offshore
      : c.certificate_type === 'course_ym_coastal' ? held.coastal : null;
    if (!list) continue;
    const d = c.discipline === 'sail' || c.discipline === 'power' ? c.discipline : null;
    if (d) { if (!list.includes(d)) list.push(d); } else held.no_discipline.push(c.certificate_type);
  }
  return held;
}

const other = (d: Discipline): Discipline => (d === 'sail' ? 'power' : 'sail');

/** RYA Yachtmaster Coastal and Offshore pages: the pre-exam sea time for discipline d. */
export function ryaTargets(held: RyaHeld, d: Discipline): RyaTargets {
  const offshoreReduced = held.offshore.includes(other(d));
  const coastalBy = held.coastal.includes(other(d))
    ? 'yachtmaster_coastal' as const
    : held.coastal_skipper_course ? 'coastal_skipper_course' as const : null;
  const coastalDays = coastalBy ? 12 : 30;
  const offshoreDays = offshoreReduced ? 25 : 50;
  return {
    coastal: {
      days_under_24m: coastalDays,
      days_alt_500gt: coastalBy ? 30 : null,
      skipper_days_under_24m: 2,
      miles_under_24m: coastalBy ? 400 : 800,
      miles_alt_500gt: coastalBy ? 800 : null,
      // "At least half the qualifying sea time should be gained in tidal waters"
      tidal_days: Math.ceil(coastalDays / 2),
      night_hours: 12,
      reduced_by: coastalBy,
    },
    offshore: {
      days: offshoreDays,
      skipper_days_under_24m: offshoreReduced ? 3 : 5,
      miles: offshoreReduced ? 1250 : 2500,
      passages: offshoreReduced ? 3 : 5,
      overnight: offshoreReduced ? 1 : 2,
      as_skipper: offshoreReduced ? 1 : 2,
      tidal_days_under_24m: Math.ceil(offshoreDays / 2),
      reduced_by: offshoreReduced ? 'yachtmaster_offshore' : null,
    },
  };
}

export interface RyaService {
  sail: RyaDiscipline;
  power: RyaDiscipline;
  /** Days on yachts whose type (sail or motor) is not recorded, left out above. */
  days_unknown_discipline: number;
  /** Days on commercial vessels, left out above. */
  days_commercial: number;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? n : null;
};

export function disciplineOf(type: string | null | undefined): Discipline | null {
  const t = (type ?? '').toLowerCase();
  if (t.startsWith('sail')) return 'sail';
  if (t.startsWith('motor') || t.startsWith('power')) return 'power';
  return null;
}

const isCommercial = (e: RyaEntry) => e.vessel?.sector === 'commercial' || !!e.vessel?.is_workboat || !!e.vessel?.is_tug;

/**
 * Start times of the RYA days in these entries: each a period of eight hours
 * inside one entry, at least 24 hours after the previous one.
 */
export function ryaDayStarts(entries: RyaEntry[]): number[] {
  const spans = entries
    .filter((e) => e.end_time)
    .map((e) => [new Date(e.start_time).getTime(), new Date(e.end_time!).getTime()] as const)
    .filter(([s, en]) => en - s >= DAY_HOURS * HOUR)
    .sort((a, b) => a[0] - b[0]);
  const out: number[] = [];
  let last = -Infinity;
  for (const [s, en] of spans) {
    let start = Math.max(s, last + 24 * HOUR);
    while (start + DAY_HOURS * HOUR <= en) {
      out.push(start);
      last = start;
      start += 24 * HOUR;
    }
  }
  return out;
}

const dayCount = (entries: RyaEntry[]) => ryaDayStarts(entries).length;

function straightLineNm(e: RyaEntry): number | null {
  const [a, b, c, d] = [e.start_latitude, e.start_longitude, e.end_latitude, e.end_longitude].map(num);
  if (a == null || b == null || c == null || d == null) return null;
  return calculateDistanceNauticalMiles(a, b, c, d);
}

/** Crosses midnight UTC while under way. */
function overnight(e: RyaEntry): boolean {
  if (!e.end_time) return false;
  const s = new Date(e.start_time);
  const en = new Date(e.end_time);
  return s.toISOString().slice(0, 10) !== en.toISOString().slice(0, 10);
}

interface Pt { lat: number; lon: number; t: number; moving: boolean | null }

/** The entry's positions in time order: its AIS fixes, else its start and end positions. */
function pathOf(e: RyaEntry, fixes: RyaFix[] | undefined): { pts: Pt[]; ais: boolean } {
  const s = new Date(e.start_time).getTime();
  const en = e.end_time ? new Date(e.end_time).getTime() : s;
  const pts = (fixes ?? [])
    .map((f) => ({
      lat: num(f.latitude), lon: num(f.longitude),
      t: new Date(f.check_time).getTime(), moving: f.is_moving ?? null,
    }))
    .filter((p): p is Pt => p.lat != null && p.lon != null && p.t >= s && p.t <= en)
    .sort((a, b) => a.t - b.t);
  if (pts.length >= 2) return { pts, ais: true };
  const [a, b, c, d] = [e.start_latitude, e.start_longitude, e.end_latitude, e.end_longitude].map(num);
  const out: Pt[] = [];
  if (a != null && b != null) out.push({ lat: a, lon: b, t: s, moving: null });
  if (c != null && d != null) out.push({ lat: c, lon: d, t: en, moving: null });
  if (out.length === 1) out.push({ ...out[0], t: out[0].t === s ? en : s });
  return { pts: out.sort((x, y) => x.t - y.t), ais: false };
}

/** Hours of the entry between sunset and sunrise, sampled every five minutes. */
export function nightHours(e: RyaEntry, fixes?: RyaFix[]): number {
  if (!e.end_time) return 0;
  const { pts } = pathOf(e, fixes);
  if (pts.length < 2) return 0;
  const s = new Date(e.start_time).getTime();
  const en = new Date(e.end_time).getTime();
  let ms = 0;
  let i = 1; // pts[i - 1] .. pts[i] brackets the sample time
  for (let t = s; t < en; t += NIGHT_STEP_MS) {
    const step = Math.min(NIGHT_STEP_MS, en - t);
    const at = t + step / 2;
    while (i < pts.length - 1 && pts[i].t < at) i++;
    const a = pts[i - 1];
    const b = pts[i];
    // A stretch between two fixes both reported not moving was not under way
    if (a.moving === false && b.moving === false && at >= a.t && at <= b.t) continue;
    // Straight between the fixes either side, held at the ends
    const f = b.t === a.t ? 0 : Math.min(1, Math.max(0, (at - a.t) / (b.t - a.t)));
    if (isNight(a.lat + (b.lat - a.lat) * f, a.lon + (b.lon - a.lon) * f, at)) ms += step;
  }
  return ms / HOUR;
}

/** Miles run on AIS legs with both fixes more than 50 miles from land; null without a track or coastline. */
export function offshoreMiles(
  e: RyaEntry,
  fixes: RyaFix[] | undefined,
  farFromLand: ((lat: number, lon: number) => boolean) | null | undefined,
): number | null {
  if (!farFromLand) return null;
  const { pts, ais } = pathOf(e, fixes);
  if (!ais) return null;
  const far = pts.map((p) => farFromLand(p.lat, p.lon));
  let nm = 0;
  for (let i = 1; i < pts.length; i++) {
    if (far[i - 1] && far[i] && pts[i].t - pts[i - 1].t <= MAX_LEG_GAP_MS) {
      nm += calculateDistanceNauticalMiles(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
    }
  }
  return Math.round(nm);
}

function emptyDiscipline(d: Discipline, held: RyaHeld): RyaDiscipline {
  return {
    days: 0, days_under_24m: 0, skipper_days_under_24m: 0, tidal_days_under_24m: 0, tidal_days: 0,
    miles: 0, miles_under_24m: 0, passages: [], ocean_passages: [], night_hours: 0,
    targets: ryaTargets(held, d),
  };
}

/**
 * @param trackNm AIS-track miles by entry id (services/trackDistance.ts); entries
 *   without a track use distance_nm.
 */
export function ryaService(
  entries: RyaEntry[],
  trackNm: Map<string, number> = new Map(),
  now: Date = new Date(),
  opts: RyaOptions = {},
): RyaService {
  const held = opts.held ?? NO_CERTIFICATES;
  const fixes = opts.fixes ?? new Map<string, RyaFix[]>();
  const fixesOf = (e: RyaEntry) => (e.id ? fixes.get(e.id) : undefined);
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - RYA_WINDOW_YEARS);
  const atSea = entries.filter(
    (e) => (e.status == null || e.status === 'confirmed') &&
      AT_SEA.has(e.service_type || 'actual_sea_service') &&
      new Date(e.start_time) >= cutoff,
  );
  const yachts = atSea.filter((e) => !isCommercial(e));
  const result: RyaService = {
    sail: emptyDiscipline('sail', held),
    power: emptyDiscipline('power', held),
    days_unknown_discipline: dayCount(yachts.filter((e) => !disciplineOf(e.vessel?.type))),
    days_commercial: dayCount(atSea.filter(isCommercial)),
  };

  const len = (e: RyaEntry) => num(e.vessel?.length_metres);
  const gt = (e: RyaEntry) => num(e.vessel?.gross_tonnes);
  const under24 = (e: RyaEntry) => (len(e) ?? Infinity) < 24;
  const upTo500 = (e: RyaEntry) => (gt(e) ?? 0) <= 500;
  const run = (e: RyaEntry) => (e.id && trackNm.has(e.id) ? trackNm.get(e.id)! : num(e.distance_nm) ?? 0);

  for (const d of ['sail', 'power'] as Discipline[]) {
    const mine = yachts.filter((e) => disciplineOf(e.vessel?.type) === d);
    const small = mine.filter(under24);
    const r = result[d];
    r.days = dayCount(mine.filter(upTo500));
    r.days_under_24m = dayCount(small);
    r.skipper_days_under_24m = dayCount(small.filter((e) => e.rank === 'master'));
    r.tidal_days_under_24m = dayCount(small.filter((e) => e.is_tidal === true));
    r.tidal_days = dayCount(mine.filter((e) => e.is_tidal === true));
    r.miles = Math.round(mine.filter(upTo500).reduce((n, e) => n + run(e), 0));
    r.miles_under_24m = Math.round(small.reduce((n, e) => n + run(e), 0));
    r.night_hours = Math.round(mine.filter(upTo500).reduce((n, e) => n + nightHours(e, fixesOf(e)), 0) * 10) / 10;
    for (const e of mine.filter(upTo500)) {
      if (!e.end_time) continue;
      const nm = run(e);
      const line = straightLineNm(e) ?? nm; // manual entries: the logged distance
      const hours = (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / HOUR;
      const passage: RyaPassage = {
        id: e.id ?? null,
        start: new Date(e.start_time).toISOString().slice(0, 10),
        nm: Math.round(nm),
        hours: Math.round(hours),
        overnight: overnight(e),
        as_skipper: e.rank === 'master',
      };
      if (line > PASSAGE_MIN_NM && nm > PASSAGE_MIN_NM) r.passages.push(passage);
      if (nm >= OCEAN_MIN_NM && hours >= OCEAN_MIN_HOURS && (e.rank === 'master' || MATE_RANKS.has(e.rank ?? ''))) {
        r.ocean_passages.push({ ...passage, offshore_nm: offshoreMiles(e, fixesOf(e), opts.farFromLand) });
      }
    }
  }
  return result;
}
