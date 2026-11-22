/**
 * "Calamity: 6 days underway in the last 10 days" for the sign-up flow (2.5.0
 * activation). Pure helpers; the Datalastic call and the cache reads live in
 * services/onboardingPreview.ts.
 *
 * One vessel_history call covers up to CHUNK_DAYS (10) days, so the window is
 * the last 10 COMPLETE UTC days: [today - 10, today). Today is left out on
 * purpose: a cached day with positions is never fetched again, so a part-day
 * would stay part-cached for every later history import.
 *
 * Underway day: same rule as the history import check (utils/historyImport
 * underwayDays): a UTC day with at least one leg between consecutive AIS fixes
 * (at most 6 h apart) where the vessel covered ground faster than 2 kn, or
 * reported more than 2 kn over at least 0.2 nm. Fixes that imply more than
 * 45 kn are dropped as glitches. So swinging at anchor or a moored boat's GPS
 * drift does not count; a short harbour move does.
 */

import { addDays, daysBetween } from './historyImport.js';

/** Days in the activity window. Must not exceed CHUNK_DAYS (one vessel_history call). */
export const ACTIVITY_WINDOW_DAYS = 10;
/** How many days old a cached window may be and still be shown ("in the 10 days to 20 Nov"). */
export const ACTIVITY_MAX_LAG_DAYS = 7;

export interface DayWindow {
  from: string; // inclusive, YYYY-MM-DD
  to: string; // exclusive
}

/** The last `days` complete UTC days before `today`. */
export function recentWindow(today: string, days = ACTIVITY_WINDOW_DAYS): DayWindow {
  return { from: addDays(today, -days), to: today };
}

/**
 * The newest window of `days` complete days, ending at most `maxLag` days
 * before today, whose every day is known (fetched, positions or a fresh empty
 * result). Null when no such window is cached.
 */
export function latestKnownWindow(
  known: Set<string>,
  today: string,
  days = ACTIVITY_WINDOW_DAYS,
  maxLag = ACTIVITY_MAX_LAG_DAYS
): DayWindow | null {
  for (let lag = 0; lag <= maxLag; lag++) {
    const to = addDays(today, -lag);
    const from = addDays(to, -days);
    if (daysBetween(from, to).every((d) => known.has(d))) return { from, to };
  }
  return null;
}

/**
 * The single run of days to fetch so the current window is fully known: from
 * the first unknown day to the last unknown day (inclusive). Null when nothing
 * is missing. Always within the window, so never more than one call.
 */
export function missingRun(window: DayWindow, known: Set<string>): DayWindow | null {
  const missing = daysBetween(window.from, window.to).filter((d) => !known.has(d));
  if (!missing.length) return null;
  return { from: missing[0], to: addDays(missing[missing.length - 1], 1) };
}

export interface RecentActivity {
  from: string;
  to: string;
  window_days: number;
  /** Days in the window with any AIS position. */
  days_with_ais: number;
  days_underway: number;
  last_position_at: string | null;
}

/**
 * Paid-call budget for people who have not started a trial: at most `max`
 * Datalastic calls per user per `windowMs`. In memory, so a deploy resets it.
 */
export class CallBudget {
  private calls = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number) {}

  canSpend(key: string, now = Date.now()): boolean {
    return this.recent(key, now).length < this.max;
  }

  spend(key: string, now = Date.now()): void {
    this.calls.set(key, [...this.recent(key, now), now]);
    if (this.calls.size > 5_000) {
      for (const [k] of this.calls) if (!this.recent(k, now).length) this.calls.delete(k);
    }
  }

  private recent(key: string, now: number): number[] {
    return (this.calls.get(key) ?? []).filter((t) => now - t < this.windowMs);
  }
}
