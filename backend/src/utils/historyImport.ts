/**
 * AIS history import: turn a vessel's past AIS track into passage entries.
 *
 * Pure functions only (no database, no network) so the rules can be tested
 * against real tracks. The live scheduler builds passages one 2-hour window at
 * a time; here we have the whole track at once, so we rebuild the same result
 * in one pass:
 *
 * - A leg between two fixes is underway when the vessel covered it at more than
 *   MOVING_SPEED_KNOTS, or a fix reported that speed and the leg is a real move.
 * - A stop between underway legs is bridged or ends the passage by the same
 *   anchor rules as live tracking (shouldCloseVoyageAtStop).
 * - A gap in AIS coverage longer than MAX_BRIDGE_GAP_HOURS ends the passage. We
 *   cannot see what happened in the gap, so it is never counted.
 * - Passages are cut at UTC midnight, like live entries, so each entry covers
 *   one calendar day.
 * - Pieces under MIN_PASSAGE_NM are dropped (live tracking's 0.5 nm minimum).
 */

import { calculateDistanceNauticalMiles } from './seaTime.js';
import { MOVING_SPEED_KNOTS, shouldCloseVoyageAtStop } from './voyageState.js';

export const HISTORY_PRODUCTS = {
  seatime_history_6m: 6,
  seatime_history_12m: 12,
} as const;
export type HistoryProductId = keyof typeof HISTORY_PRODUCTS;

export function isHistoryProduct(id: string): id is HistoryProductId {
  return Object.prototype.hasOwnProperty.call(HISTORY_PRODUCTS, id);
}

/** A leg longer than this has no coverage in the middle: it ends the passage. */
export const MAX_BRIDGE_GAP_HOURS = 6;
/** Faster than this between two fixes is a bad position, not a passage. */
export const MAX_PLAUSIBLE_KNOTS = 45;
/** A fix's reported speed only counts as underway if the leg is at least this long. */
const MIN_REPORTED_SPEED_LEG_NM = 0.2;
/** Same minimum as live tracking. */
export const MIN_PASSAGE_NM = 0.5;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface HistoryFix {
  time: Date;
  latitude: number;
  longitude: number;
  speed_knots: number | null;
  destination: string | null;
}

export interface ImportedPassage {
  start_time: Date;
  end_time: Date;
  start_latitude: number;
  start_longitude: number;
  end_latitude: number;
  end_longitude: number;
  distance_nm: number;
  duration_hours: number;
}

export interface Interval {
  start: Date;
  end: Date;
}

/** Drop unusable fixes, sort by time, and keep one fix per timestamp. */
export function cleanFixes(fixes: HistoryFix[]): HistoryFix[] {
  const usable = fixes.filter(
    (f) =>
      f.time instanceof Date &&
      !isNaN(f.time.getTime()) &&
      Number.isFinite(f.latitude) &&
      Number.isFinite(f.longitude) &&
      !(f.latitude === 0 && f.longitude === 0) &&
      Math.abs(f.latitude) <= 90 &&
      Math.abs(f.longitude) <= 180
  );
  usable.sort((a, b) => a.time.getTime() - b.time.getTime());
  const out: HistoryFix[] = [];
  for (const f of usable) {
    if (out.length && out[out.length - 1].time.getTime() === f.time.getTime()) continue;
    out.push(f);
  }
  return removeSpikes(out);
}

function knotsBetween(a: HistoryFix, b: HistoryFix): number {
  const hours = (b.time.getTime() - a.time.getTime()) / HOUR_MS;
  if (hours <= 0) return Infinity;
  return calculateDistanceNauticalMiles(a.latitude, a.longitude, b.latitude, b.longitude) / hours;
}

/** Drop single bad positions: a fix that is implausibly far from both neighbours. */
function removeSpikes(track: HistoryFix[]): HistoryFix[] {
  return track.filter((f, i) => {
    if (i === 0 || i === track.length - 1) return true;
    return !(knotsBetween(track[i - 1], f) > MAX_PLAUSIBLE_KNOTS && knotsBetween(f, track[i + 1]) > MAX_PLAUSIBLE_KNOTS);
  });
}

type LegKind = 'moving' | 'stopped' | 'gap' | 'bad';

function legKind(a: HistoryFix, b: HistoryFix): LegKind {
  const hours = (b.time.getTime() - a.time.getTime()) / HOUR_MS;
  if (hours <= 0) return 'bad';
  if (hours > MAX_BRIDGE_GAP_HOURS) return 'gap';
  const nm = calculateDistanceNauticalMiles(a.latitude, a.longitude, b.latitude, b.longitude);
  const knots = knotsBetween(a, b);
  if (knots > MAX_PLAUSIBLE_KNOTS) return 'bad';
  if (knots > MOVING_SPEED_KNOTS) return 'moving';
  const reported = Math.max(a.speed_knots ?? 0, b.speed_knots ?? 0);
  if (reported > MOVING_SPEED_KNOTS && nm >= MIN_REPORTED_SPEED_LEG_NM) return 'moving';
  return 'stopped';
}

/**
 * Group the track into passages (before the midnight split). Each passage is the
 * list of fixes from its first underway leg to its last.
 *
 * `isAtDestination(fix)` says whether a stopped fix lies at the port the vessel
 * was broadcasting as its destination (resolved by the caller).
 */
export function groupPassages(
  fixes: HistoryFix[],
  isAtDestination: (fix: HistoryFix) => boolean = () => false
): HistoryFix[][] {
  const track = cleanFixes(fixes);
  const passages: HistoryFix[][] = [];
  let current: HistoryFix[] | null = null;
  // Fixes of a stop since the current passage's last underway leg.
  let stop: HistoryFix[] = [];

  const close = () => {
    if (current && current.length > 1) passages.push(current);
    current = null;
    stop = [];
  };

  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1];
    const b = track[i];
    const kind = legKind(a, b);

    if (kind === 'gap' || kind === 'bad') {
      // No coverage, or a jump we can't trust: never count across it.
      close();
      continue;
    }
    if (kind === 'stopped') {
      if (current) stop.push(b);
      continue;
    }

    // Underway leg a -> b.
    if (!current) {
      current = [a, b];
      continue;
    }
    if (stop.length) {
      const passageEnd = current[current.length - 1];
      const stoppedHours = (a.time.getTime() - passageEnd.time.getTime()) / HOUR_MS;
      const precedingLegHours = (passageEnd.time.getTime() - current[0].time.getTime()) / HOUR_MS;
      const arrivedAtDestination = isAtDestination(passageEnd);
      if (shouldCloseVoyageAtStop({ arrivedAtDestination, stoppedHours, precedingLegHours })) {
        close();
        current = [a, b];
        continue;
      }
      // Bridged: the stop is part of the passage.
      current.push(...stop.filter((f) => f !== a));
      stop = [];
    }
    if (current[current.length - 1] !== a) current.push(a);
    current.push(b);
  }
  close();
  return passages;
}

function interpolate(a: HistoryFix, b: HistoryFix, at: number): HistoryFix {
  const span = b.time.getTime() - a.time.getTime();
  const k = span > 0 ? (at - a.time.getTime()) / span : 0;
  return {
    time: new Date(at),
    latitude: a.latitude + (b.latitude - a.latitude) * k,
    longitude: a.longitude + (b.longitude - a.longitude) * k,
    speed_knots: null,
    destination: a.destination,
  };
}

function trackNm(points: HistoryFix[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += calculateDistanceNauticalMiles(
      points[i - 1].latitude, points[i - 1].longitude, points[i].latitude, points[i].longitude
    );
  }
  return Math.round(total * 100) / 100;
}

function toPassage(points: HistoryFix[]): ImportedPassage {
  const first = points[0];
  const last = points[points.length - 1];
  return {
    start_time: first.time,
    end_time: last.time,
    start_latitude: first.latitude,
    start_longitude: first.longitude,
    end_latitude: last.latitude,
    end_longitude: last.longitude,
    distance_nm: trackNm(points),
    duration_hours: Math.round(((last.time.getTime() - first.time.getTime()) / HOUR_MS) * 100) / 100,
  };
}

/** Cut a passage at each UTC midnight it crosses (position interpolated at the cut). */
export function splitAtUtcMidnight(points: HistoryFix[]): HistoryFix[][] {
  const pieces: HistoryFix[][] = [];
  let piece: HistoryFix[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const b = points[i];
    // Midnight at the end of the current piece's day.
    let midnight = Math.floor(piece[0].time.getTime() / DAY_MS) * DAY_MS + DAY_MS;
    while (b.time.getTime() > midnight) {
      const a = piece[piece.length - 1];
      const cut = a.time.getTime() === midnight ? a : interpolate(a, b, midnight);
      if (cut !== a) piece.push(cut);
      pieces.push(piece);
      piece = [cut];
      midnight += DAY_MS;
    }
    piece.push(b);
  }
  pieces.push(piece);
  return pieces.filter((p) => p.length > 1);
}

/** The whole pipeline: track -> passages, one per UTC day, at least MIN_PASSAGE_NM each. */
export function detectPassages(
  fixes: HistoryFix[],
  isAtDestination?: (fix: HistoryFix) => boolean
): ImportedPassage[] {
  return groupPassages(fixes, isAtDestination)
    .flatMap(splitAtUtcMidnight)
    .map(toPassage)
    .filter((p) => p.distance_nm >= MIN_PASSAGE_NM && p.duration_hours > 0);
}

/** Drop passages that overlap any existing entry, so an import never double-counts. */
export function withoutOverlaps(passages: ImportedPassage[], existing: Interval[]): ImportedPassage[] {
  return passages.filter(
    (p) => !existing.some((e) => p.start_time < e.end && e.start < p.end_time)
  );
}

// ---------------------------------------------------------------------------
// Dates and windows (all UTC, days as YYYY-MM-DD)
// ---------------------------------------------------------------------------

export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function dayToDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function addDays(day: string, n: number): string {
  return utcDay(new Date(dayToDate(day).getTime() + n * DAY_MS));
}

/** Same calendar day `months` earlier (clamped to the month's last day). */
export function monthsBefore(day: string, months: number): string {
  const d = dayToDate(day);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return utcDay(target);
}

/** Days from `from` (inclusive) to `to` (exclusive). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * The days an import covers: from the later of the joining date and `months`
 * before tracking started, up to (not including) the day tracking started.
 * Null when there is nothing to import.
 */
export function importWindow(params: {
  months: number;
  trackingStartDay: string;
  joinedDay?: string | null;
}): { from: string; to: string } | null {
  const earliest = monthsBefore(params.trackingStartDay, params.months);
  const from = params.joinedDay && params.joinedDay > earliest ? params.joinedDay : earliest;
  const to = params.trackingStartDay;
  return from < to ? { from, to } : null;
}

/** Contiguous runs of days, each at most `maxDays` long, for batched API calls. */
export function dayRuns(days: string[], maxDays: number): { from: string; to: string }[] {
  const sorted = [...days].sort();
  const runs: { from: string; to: string }[] = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    if (last && last.to === d && daysBetween(last.from, last.to).length < maxDays) {
      last.to = addDays(d, 1);
    } else {
      runs.push({ from: d, to: addDays(d, 1) });
    }
  }
  return runs;
}
