/**
 * Passage refinement: check a live-tracked passage against the AIS track once the
 * vessel has stopped, before the user is asked to approve it.
 *
 * The live tracker starts a passage at the last position check before movement was
 * seen (in port that check can be up to 6 hours old) and often ends it hours after
 * arrival. The Datalastic track has a position about every 30 minutes, so it shows
 * when the vessel really left and arrived.
 *
 * Pure functions only (no database, no network). The rules:
 * - Underway legs, stops and gaps are found with the history import's detector
 *   (groupPassages), so live and imported passages follow the same rules.
 * - A passage is only ever SHORTENED to the underway track inside its live times,
 *   never lengthened, so refining can't add sea time or overlap another entry.
 * - A start or end only moves across time the track actually covers: no gap longer
 *   than MAX_COVERAGE_GAP_HOURS between the live time and the new one. A hole in the
 *   track (common offshore) is no evidence the vessel was stopped.
 * - It never moves past a live check that saw the vessel moving: those come from the
 *   same AIS source and are proof the passage was under way at that time.
 */

import { calculateDistanceNauticalMiles } from './seaTime.js';
import { groupPassages, cleanFixes, MIN_PASSAGE_NM, type HistoryFix } from './historyImport.js';

/** Live passages wait, hidden, in this status until refined (then 'pending'). */
export const CHECKING_STATUS = 'checking';
/** Entry statuses the app never lists: off-board passages and unrefined ones. */
export const HIDDEN_ENTRY_STATUSES = ['off_board', CHECKING_STATUS];

/** Datalastic history runs about 26 minutes behind; wait this long after the passage end. */
export const HISTORY_LAG_MINUTES = 45;
/** An entry not extended for this long is finished even if the vessel never showed as stopped. */
export const SETTLED_AFTER_HOURS = 2.5;
/** Track fetched either side of the live passage. */
export const TRACK_MARGIN_HOURS = 1;
/** Longest hole in the track that still counts as covered when moving a start or end. */
export const MAX_COVERAGE_GAP_HOURS = 1.5;
/** Shifts smaller than this are noise: report the passage as unchanged. */
const MIN_SHIFT_MS = 60_000;

const HOUR_MS = 3_600_000;

export type RefineOutcome = 'refined' | 'unchanged' | 'no_movement' | 'no_history';

export interface LivePassage {
  start_time: Date;
  end_time: Date;
  start_latitude: number | null;
  start_longitude: number | null;
  end_latitude: number | null;
  end_longitude: number | null;
}

export interface RefinedPassage {
  outcome: RefineOutcome;
  start_time: Date;
  end_time: Date;
  start_latitude: number | null;
  start_longitude: number | null;
  end_latitude: number | null;
  end_longitude: number | null;
  duration_hours: number;
  distance_nm: number | null; // track distance; null when the track wasn't used
  positions_used: number;
}

export function refinementEnabled(): boolean {
  return (process.env.PASSAGE_REFINEMENT || '').toLowerCase() !== 'off';
}

/** Status for a new live-tracked passage: hidden while it is checked, unless off board. */
export function newLiveEntryStatus(entryStatus: 'pending' | 'off_board'): string {
  return entryStatus === 'pending' && refinementEnabled() ? CHECKING_STATUS : entryStatus;
}

/** Statuses of an open live passage that a new check may extend. */
export function extendableStatuses(entryStatus: 'pending' | 'off_board'): string[] {
  return entryStatus === 'pending' ? ['pending', CHECKING_STATUS] : ['off_board'];
}

/**
 * Ready to refine: the vessel has stopped since the passage's last extension and the
 * track has caught up, or the passage simply hasn't been extended for a while (the
 * vessel stopped between checks, or a new calendar day started a new entry).
 */
export function isSettled(params: {
  now: Date;
  entryEnd: Date;
  latestCheck: { check_time: Date; is_moving: boolean } | null;
}): boolean {
  const { now, entryEnd, latestCheck } = params;
  const sinceEnd = now.getTime() - entryEnd.getTime();
  if (sinceEnd >= SETTLED_AFTER_HOURS * HOUR_MS) return true;
  return (
    sinceEnd >= HISTORY_LAG_MINUTES * 60_000 &&
    latestCheck !== null &&
    !latestCheck.is_moving &&
    latestCheck.check_time.getTime() >= entryEnd.getTime()
  );
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

const hoursBetween = (a: Date, b: Date) => Math.round(((b.getTime() - a.getTime()) / HOUR_MS) * 100) / 100;

/** True when the track has a fix at least every MAX_COVERAGE_GAP_HOURS from `from` to `to`. */
function covers(track: HistoryFix[], from: Date, to: Date): boolean {
  const maxGap = MAX_COVERAGE_GAP_HOURS * HOUR_MS;
  let last = from.getTime();
  for (const f of track) {
    const ms = f.time.getTime();
    if (ms <= from.getTime()) continue;
    if (ms > to.getTime()) break;
    if (ms - last > maxGap) return false;
    last = ms;
  }
  return to.getTime() - last <= maxGap;
}

/**
 * Check a live passage against the AIS track around it. `movingChecks` are the times
 * of live position checks inside the passage that saw the vessel moving.
 */
export function refinePassage(live: LivePassage, fixes: HistoryFix[], movingChecks: Date[] = []): RefinedPassage {
  const unchanged = (outcome: RefineOutcome, positions: number): RefinedPassage => ({
    outcome,
    ...live,
    duration_hours: hoursBetween(live.start_time, live.end_time),
    distance_nm: null,
    positions_used: positions,
  });

  const from = live.start_time.getTime() - TRACK_MARGIN_HOURS * HOUR_MS;
  const to = live.end_time.getTime() + TRACK_MARGIN_HOURS * HOUR_MS;
  const track = cleanFixes(fixes.filter((f) => f.time.getTime() >= from && f.time.getTime() <= to));
  const inside = track.filter((f) => f.time >= live.start_time && f.time <= live.end_time);
  if (inside.length < 2) return unchanged('no_history', track.length);

  // Underway stretches that overlap the live passage
  const underway = groupPassages(track)
    .filter((p) => trackNm(p) >= MIN_PASSAGE_NM)
    .filter((p) => p[0].time < live.end_time && p[p.length - 1].time > live.start_time);
  if (underway.length === 0) return unchanged('no_movement', track.length);

  const first = underway[0][0]; // last stopped fix before the first underway leg
  const last = underway[underway.length - 1][underway[underway.length - 1].length - 1];

  // Only shorten, and only where the track covers the moment. The start moves later
  // when an earlier fix shows the vessel still stopped after the live start; the end
  // moves earlier only when a later fix confirms the stop.
  const moving = movingChecks.map((d) => d.getTime()).filter((ms) => ms >= live.start_time.getTime() && ms <= live.end_time.getTime());
  const firstMoving = moving.length ? Math.min(...moving) : Infinity;
  const lastMoving = moving.length ? Math.max(...moving) : -Infinity;

  const startConfirmed = track.some((f) => f.time < first.time) && covers(track, live.start_time, first.time);
  const startMoves = startConfirmed && first.time > live.start_time;
  const endConfirmed = track.some((f) => f.time > last.time) && covers(track, last.time, live.end_time);
  const endMoves = endConfirmed && last.time < live.end_time;

  // Never past a live check that saw the vessel under way
  const start_time = startMoves ? new Date(Math.min(first.time.getTime(), Math.max(firstMoving, live.start_time.getTime()))) : live.start_time;
  const end_time = endMoves ? new Date(Math.max(last.time.getTime(), Math.min(lastMoving, live.end_time.getTime()))) : live.end_time;
  if (end_time <= start_time) return unchanged('no_movement', track.length);

  const shifted =
    start_time.getTime() - live.start_time.getTime() >= MIN_SHIFT_MS ||
    live.end_time.getTime() - end_time.getTime() >= MIN_SHIFT_MS;
  if (!shifted) return unchanged('unchanged', track.length);

  const legs = track.filter((f) => f.time >= start_time && f.time <= end_time);
  return {
    outcome: 'refined',
    start_time,
    end_time,
    start_latitude: start_time.getTime() === first.time.getTime() ? first.latitude : live.start_latitude,
    start_longitude: start_time.getTime() === first.time.getTime() ? first.longitude : live.start_longitude,
    end_latitude: end_time.getTime() === last.time.getTime() ? last.latitude : live.end_latitude,
    end_longitude: end_time.getTime() === last.time.getTime() ? last.longitude : live.end_longitude,
    duration_hours: hoursBetween(start_time, end_time),
    distance_nm: legs.length > 1 ? trackNm(legs) : null,
    positions_used: track.length,
  };
}
