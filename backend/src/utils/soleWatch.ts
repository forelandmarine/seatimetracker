/**
 * Sole watchkeeper periods: pure helpers (no database).
 *
 * A period is the dates the user was the only watchkeeper in their department
 * on a vessel. An actual sea service entry whose UTC start date falls inside a
 * period also counts as a watchkeeping day (see isSoleWatchEntry). Rules are
 * unchanged from the old per-vessel flag: MCA, MNZ and SAMSA only, actual sea
 * service only, and days stay distinct.
 */
import {
  countDistinctSeaDays,
  dayInSoleWatchPeriods,
  getCalendarDay,
  isSoleWatchEntry,
  mnzCreditableDays,
  samsaCreditableDays,
  serviceDatesAnyHours,
  type SoleWatchPeriod,
} from './seaTime.js';

export type { SoleWatchPeriod };

/** Authorities whose progress carries a separate watchkeeping figure. */
export const SOLE_WATCH_AUTHORITIES = new Set(['mca', 'mnz', 'samsa']);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDay(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && getCalendarDay(d) === v;
}

/** Normalise a date-ish value from the DB or a request to YYYY-MM-DD or null. */
export function toDay(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return getCalendarDay(v);
  return String(v).slice(0, 10);
}

/** An error message for a bad period, or null when it is fine. */
export function validatePeriod(p: { start_date?: unknown; end_date?: unknown }): string | null {
  const start = p.start_date ?? null;
  const end = p.end_date ?? null;
  if (start !== null && !isValidDay(start)) return 'start_date must be YYYY-MM-DD or null';
  if (end !== null && !isValidDay(end)) return 'end_date must be YYYY-MM-DD or null';
  if (start !== null && end !== null && (start as string) > (end as string)) return 'start_date must be on or before end_date';
  return null;
}

/** True when two periods share at least one date. Null ends are open. */
export function periodsOverlap(a: SoleWatchPeriod, b: SoleWatchPeriod): boolean {
  const aStartsBeforeBEnds = a.start_date == null || b.end_date == null || a.start_date <= b.end_date;
  const bStartsBeforeAEnds = b.start_date == null || a.end_date == null || b.start_date <= a.end_date;
  return aStartsBeforeBEnds && bStartsBeforeAEnds;
}

/** The first existing period the candidate overlaps (ignoring ignoreId), or null. */
export function findOverlap(existing: SoleWatchPeriod[], candidate: SoleWatchPeriod, ignoreId?: string | null): SoleWatchPeriod | null {
  for (const p of existing) {
    if (ignoreId && p.id === ignoreId) continue;
    if (periodsOverlap(p, candidate)) return p;
  }
  return null;
}

/** True when a period covers the given day. */
export function periodCovers(p: SoleWatchPeriod, day: string): boolean {
  return dayInSoleWatchPeriods(day, [p]);
}

/** Sort periods by start date, open starts first. */
export function sortPeriods<T extends SoleWatchPeriod>(periods: T[]): T[] {
  return [...periods].sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''));
}

/** What the toggle dialogs ask for. */
export type SoleWatchChange =
  /** Turn on: all past service (from the first entry), from a date, or from today. */
  | { action: 'on'; from: 'all' | 'date' | 'today'; date?: string | null }
  /** Turn off: last day today, last day on a date, or never was (remove every period). */
  | { action: 'off'; at: 'today' | 'date' | 'never'; date?: string | null };

export function validateChange(c: any): string | null {
  if (!c || typeof c !== 'object') return 'change is required';
  if (c.action === 'on') {
    if (!['all', 'date', 'today'].includes(c.from)) return 'from must be all, date or today';
    if (c.from === 'date' && !isValidDay(c.date)) return 'date must be YYYY-MM-DD';
    return null;
  }
  if (c.action === 'off') {
    if (!['today', 'date', 'never'].includes(c.at)) return 'at must be today, date or never';
    if (c.at === 'date' && !isValidDay(c.date)) return 'date must be YYYY-MM-DD';
    return null;
  }
  return 'action must be on or off';
}

/**
 * The vessel's periods after a toggle change. Never creates an overlap.
 *
 * - On: a new open period from the chosen start (null for all past service).
 *   Periods it overlaps are merged into it; earlier ones are kept.
 * - Off: every period is cut to end on the chosen last day; periods starting
 *   after it are removed. "Never was" removes all periods.
 */
export function applySoleWatchChange(periods: SoleWatchPeriod[], change: SoleWatchChange, today: string): SoleWatchPeriod[] {
  if (change.action === 'on') {
    const start = change.from === 'all' ? null : change.from === 'today' ? today : (change.date as string);
    const fresh: SoleWatchPeriod = { start_date: start, end_date: null };
    const kept: SoleWatchPeriod[] = [];
    for (const p of periods) {
      if (periodsOverlap(p, fresh)) {
        if (p.start_date == null || (fresh.start_date != null && p.start_date < fresh.start_date)) {
          fresh.start_date = p.start_date;
        }
      } else {
        kept.push(p);
      }
    }
    return sortPeriods([...kept, fresh]);
  }
  if (change.at === 'never') return [];
  const last = change.at === 'today' ? today : (change.date as string);
  const out: SoleWatchPeriod[] = [];
  for (const p of periods) {
    if (p.start_date != null && p.start_date > last) continue;
    if (p.end_date == null || p.end_date > last) out.push({ ...p, end_date: last });
    else out.push(p);
  }
  return sortPeriods(out);
}

/**
 * The periods an old app build asks for when it flips the single switch.
 * On with no periods: one open period with no start, which is what the old
 * flag meant (every day on the vessel). On with dated history: a new open
 * period from the day after the last one ended, so the history is kept. Off:
 * periods end today, as "Today" in the new dialog.
 */
export function legacyFlagChange(periods: SoleWatchPeriod[], on: boolean, today: string): SoleWatchPeriod[] {
  if (!on) return applySoleWatchChange(periods, { action: 'off', at: 'today' }, today);
  if (periods.some((p) => periodCovers(p, today))) return periods;
  if (periods.length === 0) return [{ start_date: null, end_date: null }];
  // Start the day after the last period that ended before today, so no day is
  // added that the user's dated history leaves out.
  let latestEnd: string | null = null;
  for (const p of periods) if (p.end_date && p.end_date < today && (!latestEnd || p.end_date > latestEnd)) latestEnd = p.end_date;
  const start = latestEnd ? nextDay(latestEnd) : today;
  return applySoleWatchChange(periods, { action: 'on', from: 'date', date: start }, today);
}

/** The flag old builds read: on while a period covers today. */
export function legacyFlagValue(periods: SoleWatchPeriod[], today: string): boolean {
  return periods.some((p) => periodCovers(p, today));
}

export function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return getCalendarDay(d);
}

interface WatchEntry {
  vessel_id?: string | null;
  start_time: Date | string;
  end_time: Date | string | null;
  sea_days?: number | null;
  status?: string | null;
  service_type?: string | null;
  vessel?: any;
}

/**
 * Watchkeeping days under the authority, counted the way the totals count
 * them, with sole-watch entries included. Days are distinct, so a date already
 * logged as watchkeeping is not counted again.
 *   MCA: distinct sea days of watchkeeping entries plus sole-watch entries.
 *   MNZ, SAMSA: their watchkeeping figure (logged hours at 8 to the day, plus sole days).
 * Other authorities have no watchkeeping figure, so 0.
 */
export function watchkeepingDays(entries: WatchEntry[], authority: string | null | undefined, now: Date = new Date()): number {
  const a = authority || 'mca';
  const confirmed = entries.filter((e) => e.status == null || e.status === 'confirmed');
  if (a === 'mca') {
    return countDistinctSeaDays(confirmed.filter((e) => e.service_type === 'watchkeeping_service' || isSoleWatchEntry(e)) as any);
  }
  if (a === 'mnz') return mnzCreditableDays(confirmed as any, now).watchkeeping;
  if (a === 'samsa') return samsaCreditableDays(confirmed as any, now).watchkeeping;
  return 0;
}

/** The entries with one vessel's periods swapped for the given set. */
export function withVesselPeriods<E extends WatchEntry>(entries: E[], vesselId: string, periods: SoleWatchPeriod[]): E[] {
  return entries.map((e) =>
    e.vessel_id === vesselId ? { ...e, vessel: { ...(e.vessel ?? {}), sole_watch_periods: periods } } : e
  );
}

export interface SoleWatchPreview {
  current_days: number;
  proposed_days: number;
  added: number;
  removed: number;
}

/** How many watchkeeping days a new set of periods on one vessel adds or removes. */
export function previewPeriods(
  entries: WatchEntry[],
  vesselId: string,
  current: SoleWatchPeriod[],
  proposed: SoleWatchPeriod[],
  authority: string | null | undefined,
  now: Date = new Date()
): SoleWatchPreview {
  const current_days = watchkeepingDays(withVesselPeriods(entries, vesselId, current), authority, now);
  const proposed_days = watchkeepingDays(withVesselPeriods(entries, vesselId, proposed), authority, now);
  const diff = proposed_days - current_days;
  return { current_days, proposed_days, added: Math.max(0, diff), removed: Math.max(0, -diff) };
}

/**
 * Days of actual sea service on one vessel inside a period: the figure shown
 * next to each period. SAMSA counts any time on a date; MCA and MNZ need 4 hours.
 */
export function periodDays(entries: WatchEntry[], vesselId: string, period: SoleWatchPeriod, authority: string | null | undefined): number {
  const inside = entries.filter(
    (e) =>
      e.vessel_id === vesselId &&
      (e.status == null || e.status === 'confirmed') &&
      (e.service_type || 'actual_sea_service') === 'actual_sea_service' &&
      periodCovers(period, getCalendarDay(new Date(e.start_time)))
  );
  if (authority === 'samsa') return serviceDatesAnyHours(inside as any).size;
  return countDistinctSeaDays(inside as any);
}

/** UTC date of the first confirmed actual sea service entry on a vessel, or null. */
export function firstEntryDay(entries: WatchEntry[], vesselId: string): string | null {
  let first: string | null = null;
  for (const e of entries) {
    if (e.vessel_id !== vesselId) continue;
    if (e.status != null && e.status !== 'confirmed') continue;
    if ((e.service_type || 'actual_sea_service') !== 'actual_sea_service') continue;
    const d = getCalendarDay(new Date(e.start_time));
    if (!first || d < first) first = d;
  }
  return first;
}
