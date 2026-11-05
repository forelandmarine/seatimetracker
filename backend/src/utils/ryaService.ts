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
 * - Tidal waters: entries the sea-area classifier placed in tidal water.
 * - Yachtmaster Ocean: passages of 600 miles run over at least 96 hours, as
 *   skipper or mate, are listed as possible qualifying passages. The 200 miles
 *   more than 50 miles from land and the astro sights are not checked.
 */

import { calculateDistanceNauticalMiles } from './seaTime.js';

export type Discipline = 'sail' | 'power';

const HOUR = 3_600_000;
const DAY_HOURS = 8;
export const RYA_WINDOW_YEARS = 10;
export const PASSAGE_MIN_NM = 60;
export const OCEAN_MIN_NM = 600;
export const OCEAN_MIN_HOURS = 96;

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
  ocean_passages: RyaPassage[];
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

function emptyDiscipline(): RyaDiscipline {
  return {
    days: 0, days_under_24m: 0, skipper_days_under_24m: 0, tidal_days_under_24m: 0, tidal_days: 0,
    miles: 0, miles_under_24m: 0, passages: [], ocean_passages: [],
  };
}

/**
 * @param trackNm AIS-track miles by entry id (services/trackDistance.ts); entries
 *   without a track use distance_nm.
 */
export function ryaService(entries: RyaEntry[], trackNm: Map<string, number> = new Map(), now: Date = new Date()): RyaService {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - RYA_WINDOW_YEARS);
  const atSea = entries.filter(
    (e) => (e.status == null || e.status === 'confirmed') &&
      AT_SEA.has(e.service_type || 'actual_sea_service') &&
      new Date(e.start_time) >= cutoff,
  );
  const yachts = atSea.filter((e) => !isCommercial(e));
  const result: RyaService = {
    sail: emptyDiscipline(),
    power: emptyDiscipline(),
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
        r.ocean_passages.push(passage);
      }
    }
  }
  return result;
}
