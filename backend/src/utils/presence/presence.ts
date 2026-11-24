/**
 * Days abroad (2.5.0): pure date maths for the stays log.
 *
 * A stay is a dated record, entered by the crew member, of where they were:
 * ashore in a country, or signed on a vessel recorded against a country (or
 * "ZZ" for international waters). Nothing here uses AIS.
 *
 * Dates are calendar dates (YYYY-MM-DD) and both ends are inclusive: the start
 * is the day you arrived or signed on, the end is the day you left or signed
 * off. An open stay (no end) runs to today.
 *
 * Stays may share a boundary day (you leave one country and arrive in the next
 * on the same day), but must not overlap by more than that.
 *
 * Guidance only. Nothing here is legal or tax advice.
 */
import {
  SCHENGEN_COUNTS_FROM,
  SCHENGEN_LIMIT,
  SCHENGEN_WARN_AT,
  SCHENGEN_WINDOW,
  isSchengenCountry,
} from './schengen.js';
import { TAX_RULES, type DayCounting, type TaxRule } from './taxRules.js';

export type StayKind = 'ashore' | 'on_board';
export const STAY_KINDS: StayKind[] = ['ashore', 'on_board'];

/** International waters / at sea: not in any country. ISO user-assigned code. */
export const AT_SEA_CODE = 'ZZ';

export interface Stay {
  id?: string | null;
  country_code: string;
  start_date: string;
  end_date: string | null;
  kind: StayKind;
  /** On-board stays only; ashore stays always count. */
  counts_schengen: boolean;
  /** False when the user leaves this stay out of tax day counts. */
  counts_tax: boolean;
}

// ── Dates ─────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Whole days since 1970-01-01 for a YYYY-MM-DD date. */
export function dayNum(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function isoOf(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return isoOf(dayNum(iso) + days);
}

/**
 * The same day of the month `months` later (or earlier). When that day does not
 * exist (31 August plus six months), the last day of that month.
 */
export function addMonthsClamped(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const idx = y * 12 + (m - 1) + months;
  const ny = Math.floor(idx / 12);
  const nm = idx - ny * 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/**
 * Germany, AO s. 9: the first day on which a stay that began on `start` has
 * lasted more than six months. The day of arrival is day 1, so six months from
 * 1 January run to 30 June and 1 July is the first day over. When the matching
 * day does not exist (31 August), six months end on the last day of February
 * and 1 March is the first day over (AO s. 108 with BGB ss. 187, 188).
 */
export function deSixMonthsPassed(start: number): number {
  const iso = isoOf(start);
  const day = Number(iso.slice(8, 10));
  const target = addMonthsClamped(iso, 6);
  return Number(target.slice(8, 10)) === day ? dayNum(target) : dayNum(target) + 1;
}

/** UTC today, or the phone's date when it is within a day of it (time zones). */
export function resolveToday(requested: string | undefined, now: Date = new Date()): string {
  const utc = now.toISOString().slice(0, 10);
  if (requested && isIsoDate(requested) && Math.abs(dayNum(requested) - dayNum(utc)) <= 1) return requested;
  return utc;
}

// ── Validation ────────────────────────────────────────────────────────

export function isCountryCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{2}$/.test(value);
}

/** First problem with a stay, or null when it is fine. */
export function validateStay(stay: Stay, today: string): string | null {
  if (!isCountryCode(stay.country_code)) return 'country_code must be a 2-letter ISO code';
  if (!STAY_KINDS.includes(stay.kind)) return 'kind must be ashore or on_board';
  if (!isIsoDate(stay.start_date)) return 'start_date must be YYYY-MM-DD';
  if (stay.end_date != null) {
    if (!isIsoDate(stay.end_date)) return 'end_date must be YYYY-MM-DD';
    if (stay.end_date < stay.start_date) return 'end_date must be on or after start_date';
  } else if (stay.start_date > today) {
    return 'An open stay cannot start in the future';
  }
  return null;
}

/**
 * The first stay that overlaps `stay` by more than a shared boundary day, or
 * null. Open stays run on forever for this check, so only one can be open and
 * nothing can start after it.
 */
export function findOverlap<T extends Pick<Stay, 'id' | 'start_date' | 'end_date'>>(
  stay: Pick<Stay, 'id' | 'start_date' | 'end_date'>,
  others: T[],
): T | null {
  const s1 = dayNum(stay.start_date);
  const e1 = stay.end_date ? dayNum(stay.end_date) : Infinity;
  for (const o of others) {
    if (stay.id && o.id === stay.id) continue;
    const s2 = dayNum(o.start_date);
    const e2 = o.end_date ? dayNum(o.end_date) : Infinity;
    if (s1 < e2 && s2 < e1) return o;
  }
  return null;
}

// ── Day sets ──────────────────────────────────────────────────────────

/**
 * The days covered by the stays that pass `include`. With 'midnight' counting a
 * closed stay's last day is left out (you were gone by midnight). An open stay
 * runs to today and today counts.
 */
export function stayDays(
  stays: Stay[],
  today: string,
  include: (s: Stay) => boolean,
  counting: DayCounting = 'any_part',
): Set<number> {
  const out = new Set<number>();
  const t = dayNum(today);
  for (const s of stays) {
    if (!include(s)) continue;
    const start = dayNum(s.start_date);
    let end: number;
    if (s.end_date) {
      end = dayNum(s.end_date);
      if (counting === 'midnight') end -= 1;
      // Portugal: a same-day visit has no overnight, so it does not count.
      if (counting === 'overnight' && end === start) continue;
      // Cyprus: the day you leave is a day outside, but a visit that starts and ends on one day counts.
      if (counting === 'departure_out' && end > start) end -= 1;
    } else {
      end = Math.max(t, start);
    }
    for (let d = start; d <= end; d++) out.add(d);
  }
  return out;
}

function countIn(days: Set<number>, from: number, to: number): number {
  let n = 0;
  if (to - from + 1 < days.size) {
    for (let d = from; d <= to; d++) if (days.has(d)) n++;
  } else {
    for (const d of days) if (d >= from && d <= to) n++;
  }
  return n;
}

function runsOf(days: Set<number>): Array<{ start: number; end: number }> {
  const sorted = [...days].sort((a, b) => a - b);
  const runs: Array<{ start: number; end: number }> = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    if (last && d === last.end + 1) last.end = d;
    else runs.push({ start: d, end: d });
  }
  return runs;
}

// ── Timeline helpers ──────────────────────────────────────────────────

interface Placed {
  s: Stay;
  start: number;
  end: number;
  idx: number;
}

/**
 * Stays in time order: by start, then end, then the order given. An open stay
 * runs to today (or is a one-day record when it starts later).
 */
function placed(stays: Stay[], today: string): Placed[] {
  const t = dayNum(today);
  return stays
    .map((s, idx) => {
      const start = dayNum(s.start_date);
      return { s, start, end: s.end_date ? dayNum(s.end_date) : Math.max(t, start), idx };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end || a.idx - b.idx);
}

/**
 * Every run of days with no stay logged that has a logged stay on both sides
 * and ends before a stay that has already begun (on or before today). `before`
 * are the stays that end on the day before the gap, `after` the stays that
 * start on the day after it. Days after today are plans, not unknowns, so
 * they are never filled.
 */
function boundedGaps(items: Placed[], today: string): Array<{ from: number; to: number; before: Placed[]; after: Placed[] }> {
  const t = dayNum(today);
  const out: Array<{ from: number; to: number; before: Placed[]; after: Placed[] }> = [];
  let maxEnd = -Infinity;
  let atMax: Placed[] = [];
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    if (maxEnd !== -Infinity && it.start > maxEnd + 1 && it.start <= t) {
      const after = items.filter((o) => o.start === it.start);
      out.push({ from: maxEnd + 1, to: it.start - 1, before: atMax, after });
    }
    if (it.end > maxEnd) {
      maxEnd = it.end;
      atMax = [it];
    } else if (it.end === maxEnd) {
      atMax.push(it);
    }
  }
  return out;
}

// ── Schengen ──────────────────────────────────────────────────────────

/**
 * Whether a stay in a country counts on its own terms: the country (or
 * Gibraltar, or a microstate) is counted, and an on-board stay has not been
 * switched off. "At sea" stays are decided by schengenStayStatus.
 */
export function countsForSchengen(s: Stay): boolean {
  if (!isSchengenCountry(s.country_code)) return false;
  return s.kind === 'ashore' || s.counts_schengen;
}

/** First day a country's days count (Gibraltar, late joiners), or -Infinity. */
function countsFromDay(code: string): number {
  const from = SCHENGEN_COUNTS_FROM[code.toUpperCase()];
  return from ? dayNum(from) : -Infinity;
}

/**
 * For each stay (in the order given): does it count for Schengen, and from
 * which day.
 *
 * Caution rule for "At sea" (owner's rule, 2026-11-22): a yacht sailing between
 * Schengen ports never leaves the area (there is no exit check, Borders Code
 * art. 6 and Annex VI 3.2.4 to 3.2.6), and the app cannot know whether a crew
 * member did exit formalities before an ocean passage. So an at-sea stay
 * counts when the stay just before it in time counts and runs up to it (ends
 * on the day the passage starts or the day before), unless the user switched
 * the at-sea stay's "counts for Schengen" off, which means "I cleared out with
 * an exit check before sailing". It takes the start date of the place it
 * sailed from, so days before Gibraltar began to count (15 July 2026) still
 * never count. Unlogged days are time outside the area (owner's rule,
 * 2026-11-23), so an at-sea stay after a gap, or with nothing logged before
 * it, does not count.
 */
export function schengenStayStatus(stays: Stay[], today: string): Array<{ counts: boolean; from: number }> {
  const items = placed(stays, today);
  const out: Array<{ counts: boolean; from: number }> = new Array(stays.length);
  let prev: { counts: boolean; from: number } | null = null;
  let maxEnd = -Infinity;
  for (const it of items) {
    let st: { counts: boolean; from: number };
    if (it.s.country_code.toUpperCase() === AT_SEA_CODE) {
      const joined = prev && it.start <= maxEnd + 1; // no unlogged day before the passage
      st = it.s.counts_schengen && prev && joined ? { counts: prev.counts, from: prev.from } : { counts: false, from: -Infinity };
    } else {
      st = { counts: countsForSchengen(it.s), from: countsFromDay(it.s.country_code) };
    }
    out[it.idx] = st;
    prev = st;
    if (it.end > maxEnd) maxEnd = it.end;
  }
  return out;
}

export interface SchengenDayDetail {
  /** Every day that counts. */
  days: Set<number>;
  /** Counted days covered only by at-sea stays. */
  at_sea: Set<number>;
  /** Days with nothing logged between two stays that count. Not counted (treated as outside the area); shown so the user can log them. */
  unlogged: Set<number>;
}

/**
 * The days that count towards the 90, with the at-sea days the caution rule
 * adds.
 *
 * Unlogged days (owner's rule, 2026-11-23): a run of days with nothing logged
 * is time outside the Schengen area and is not counted. Runs between two
 * stays that count (the later one begun) are returned as `unlogged` so the
 * card can ask the user to log them if they were in the area.
 */
export function schengenDayDetail(stays: Stay[], today: string): SchengenDayDetail {
  const status = schengenStayStatus(stays, today);
  const items = placed(stays, today);
  const days = new Set<number>();
  const onLand = new Set<number>();
  const seaDays = new Set<number>();
  for (const it of items) {
    const st = status[it.idx];
    if (!st.counts) continue;
    const atSea = it.s.country_code.toUpperCase() === AT_SEA_CODE;
    // Days before a country joined (or, for Gibraltar, began to count) are left out.
    for (let d = Math.max(it.start, st.from); d <= it.end; d++) {
      days.add(d);
      (atSea ? seaDays : onLand).add(d);
    }
  }
  const unlogged = new Set<number>();
  for (const g of boundedGaps(items, today)) {
    if (!g.before.some((p) => status[p.idx].counts) || !g.after.some((p) => status[p.idx].counts)) continue;
    for (let d = g.from; d <= g.to; d++) unlogged.add(d);
  }
  const atSeaOnly = new Set([...seaDays].filter((d) => !onLand.has(d)));
  return { days, at_sea: atSeaOnly, unlogged };
}

export function schengenDays(stays: Stay[], today: string): Set<number> {
  return schengenDayDetail(stays, today).days;
}

/** Schengen days in the 180-day window that ends on `day`. */
export function windowCount(days: Set<number>, day: number): number {
  return countIn(days, day - SCHENGEN_WINDOW + 1, day);
}

/**
 * Staying every day from `from`, the last day before the rule breaks. Null when
 * even `from` itself would break it. `days` is not changed.
 */
export function latestStayFrom(days: Set<number>, from: number): number | null {
  const trial = new Set(days);
  // A continuous stay can never pass 90 days plus the window, so this always ends.
  for (let d = from; d <= from + SCHENGEN_WINDOW + SCHENGEN_LIMIT; d++) {
    trial.add(d);
    if (windowCount(trial, d) > SCHENGEN_LIMIT) return d === from ? null : d - 1;
  }
  return from + SCHENGEN_WINDOW + SCHENGEN_LIMIT;
}

/**
 * First day of stay in [from, to] where the window passes 90, or null. With
 * `unless`, a day is skipped when `unless(d)` is true.
 */
function firstBreach(days: Set<number>, from: number, to: number, unless?: (d: number) => boolean): number | null {
  for (let d = from; d <= to; d++) {
    if (days.has(d) && windowCount(days, d) > SCHENGEN_LIMIT && !(unless && unless(d))) return d;
  }
  return null;
}

/** The last day in the set, or -Infinity when it is empty. */
function lastDay(days: Set<number>): number {
  let max = -Infinity;
  for (const d of days) if (d > max) max = d;
  return max;
}

export interface SchengenPlanResult {
  start_date: string;
  end_date: string;
  days: number;
  ok: boolean;
  /** First day the rule would be broken: in the trip, or a logged stay after it that the trip pushes over. */
  first_breach: string | null;
  /** Most days used in any window ending during the trip. */
  max_used: number;
  /** Entering on the trip's first day, the last day you could stay. */
  latest_stay_if_enter: string | null;
}

export interface SchengenSummary {
  today: string;
  limit: number;
  window_days: number;
  window_start: string;
  used: number;
  remaining: number;
  /** Staying from today, the last day you can stay. Null when you are already over. */
  latest_stay_date: string | null;
  over: boolean;
  warn: boolean;
  /** First future day where stays already logged break the rule. */
  future_breach: string | null;
  /** Runs of Schengen days in the window, for the timeline. */
  segments: Array<{ start_date: string; end_date: string; days: number }>;
  /** Runs of logged Schengen days after today (planned). */
  future_segments: Array<{ start_date: string; end_date: string; days: number }>;
  /** When `used` next falls, the date and how many days are back by then (next 30 days). */
  next_release: { date: string; remaining: number } | null;
  /** Of `used`, days at sea counted because you sailed from a Schengen port. */
  at_sea_days: number;
  /** Days in the window with nothing logged between two Schengen stays. Not in `used` (treated as outside the area). */
  unlogged_days: number;
  /** Ids of at-sea stays that count (to label them in the list). */
  at_sea_counted_ids: string[];
  plan: SchengenPlanResult | null;
}

export function planSchengenTrip(stays: Stay[], today: string, plan: { start_date: string; end_date: string }): SchengenPlanResult {
  const days = schengenDays(stays, today);
  const ps = dayNum(plan.start_date);
  const pe = dayNum(plan.end_date);
  const trial = new Set(days);
  for (let d = ps; d <= pe; d++) trial.add(d);
  let maxUsed = 0;
  for (let d = ps; d <= pe; d++) maxUsed = Math.max(maxUsed, windowCount(trial, d));
  // Days logged after the trip can be pushed over by it, so look a full window past it.
  // A later day that is over even without the trip is not this trip's doing (the
  // summary's future_breach reports it), so it does not fail the trip.
  const breach = firstBreach(trial, ps, pe + SCHENGEN_WINDOW - 1, (d) => d > pe && windowCount(days, d) > SCHENGEN_LIMIT);
  const latest = latestStayFrom(days, ps);
  return {
    start_date: plan.start_date,
    end_date: plan.end_date,
    days: pe - ps + 1,
    ok: breach == null,
    first_breach: breach == null ? null : isoOf(breach),
    max_used: maxUsed,
    latest_stay_if_enter: latest == null ? null : isoOf(latest),
  };
}

export function schengenSummary(
  stays: Stay[],
  today: string,
  plan?: { start_date: string; end_date: string } | null,
): SchengenSummary {
  const detail = schengenDayDetail(stays, today);
  const days = detail.days;
  const status = schengenStayStatus(stays, today);
  const t = dayNum(today);
  const windowStart = t - SCHENGEN_WINDOW + 1;
  const used = windowCount(days, t);
  const latest = latestStayFrom(days, t);
  const toSeg = (r: { start: number; end: number }) => ({ start_date: isoOf(r.start), end_date: isoOf(r.end), days: r.end - r.start + 1 });
  const runs = runsOf(days);
  const segments = runs
    .filter((r) => r.end >= windowStart && r.start <= t)
    .map((r) => toSeg({ start: Math.max(r.start, windowStart), end: Math.min(r.end, t) }));
  const futureSegments = runs
    .filter((r) => r.end > t && r.start <= t + SCHENGEN_WINDOW)
    .map((r) => toSeg({ start: Math.max(r.start, t + 1), end: r.end }));

  // When do days start coming back? Counting only days already past, the window
  // for a future day d drops everything before d - 179.
  let nextRelease: SchengenSummary['next_release'] = null;
  const past = new Set([...days].filter((d) => d <= t));
  for (let d = t + 1; d <= t + 30; d++) {
    const n = windowCount(past, d);
    if (n < used) {
      nextRelease = { date: isoOf(d), remaining: Math.max(0, SCHENGEN_LIMIT - n) };
      break;
    }
  }

  return {
    today,
    limit: SCHENGEN_LIMIT,
    window_days: SCHENGEN_WINDOW,
    window_start: isoOf(windowStart),
    used,
    remaining: Math.max(0, SCHENGEN_LIMIT - used),
    latest_stay_date: latest == null ? null : isoOf(latest),
    over: used > SCHENGEN_LIMIT,
    warn: used >= SCHENGEN_WARN_AT,
    future_breach: (() => {
      // Up to the last logged day, however far ahead it is planned.
      const b = firstBreach(days, t + 1, lastDay(days));
      return b == null ? null : isoOf(b);
    })(),
    segments,
    future_segments: futureSegments,
    next_release: nextRelease,
    at_sea_days: windowCount(detail.at_sea, t),
    unlogged_days: windowCount(detail.unlogged, t),
    at_sea_counted_ids: stays
      .filter((st, i) => st.id && st.country_code.toUpperCase() === AT_SEA_CODE && status[i].counts)
      .map((st) => st.id as string),
    plan: plan ? planSchengenTrip(stays, today, plan) : null,
  };
}

// ── Tax days ──────────────────────────────────────────────────────────

/** The first day of the tax year that contains `date`. */
export function taxYearStart(yearStart: { month: number; day: number }, date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const before = m < yearStart.month || (m === yearStart.month && d < yearStart.day);
  const year = before ? y - 1 : y;
  return `${year}-${String(yearStart.month).padStart(2, '0')}-${String(yearStart.day).padStart(2, '0')}`;
}

/** [start, end] of the tax year starting in `startYear`. */
export function taxYearRange(yearStart: { month: number; day: number }, startYear: number): { start: string; end: string } {
  const start = `${startYear}-${String(yearStart.month).padStart(2, '0')}-${String(yearStart.day).padStart(2, '0')}`;
  const nextStart = `${startYear + 1}-${String(yearStart.month).padStart(2, '0')}-${String(yearStart.day).padStart(2, '0')}`;
  return { start, end: addDays(nextStart, -1) };
}

/** "2026" for a calendar year, "2026/27" for a split year. */
export function taxYearLabel(yearStart: { month: number; day: number }, startYear: number): string {
  if (yearStart.month === 1 && yearStart.day === 1) return String(startYear);
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export type TaxStatus = 'met' | 'near' | 'under' | 'none';

export interface TaxYearResult {
  label: string;
  start_date: string;
  end_date: string;
  /** Days in the country in this tax year, including logged days after today. */
  days: number;
  /** Of those, days after today. */
  planned_days: number;
  /** Days in the year up to today (or the year end) with no stay logged anywhere. */
  unrecorded_days: number;
  /** Of `days`, days added by the country's own rule (Spain: unlogged days and sporadic absences between Spanish stays). */
  assumed_days: number;
  status: TaxStatus;
  /** Days still needed to meet the test, when that is a simple number. */
  days_to_test: number | null;
  /** Test-specific figures (weighted days, 12-month best, longest stay...). */
  detail: Record<string, number | string | null>;
}

export interface TaxCountryResult {
  country: string;
  has_rule: boolean;
  counting: DayCounting;
  test: TaxRule['test'] | null;
  year_start: { month: number; day: number };
  years: TaxYearResult[];
}

const NEAR_MARGIN = 30;

function yearLength(range: { start: string; end: string }): number {
  return dayNum(range.end) - dayNum(range.start) + 1;
}

/**
 * The unbroken run touching [from, to] that comes closest to (or furthest past)
 * six calendar months, with the days it needs to pass six months. Breaks of
 * up to `breakDays` join the runs either side and count towards the run.
 */
function bestRunTouching(
  days: Set<number>,
  from: number,
  to: number,
  breakDays = 0,
  neededFor: (start: number) => number = (start) => deSixMonthsPassed(start) - start + 1,
  countBreaks = true,
  joinBreak?: (gapFrom: number, gapTo: number, before: number, after: number) => boolean,
): { length: number; start: number | null; end: number | null; needed: number } {
  let best = { length: 0, start: null as number | null, end: null as number | null, needed: 183 };
  let bestMargin = -Infinity;
  // Short breaks are disregarded: join runs across them, break days included.
  const joined: Array<{ start: number; end: number }> = [];
  for (const r of runsOf(days)) {
    const last = joined[joined.length - 1];
    const gapFrom = last ? last.end + 1 : 0;
    const gapTo = r.start - 1;
    const join = last
      ? joinBreak
        ? joinBreak(gapFrom, gapTo, countIn(days, last.start, last.end), r.end - r.start + 1)
        : gapTo - gapFrom + 1 <= breakDays
      : false;
    if (join) last!.end = r.end;
    else joined.push({ ...r });
  }
  for (const r of joined) {
    if (r.end < from || r.start > to) continue;
    const len = countBreaks ? r.end - r.start + 1 : countIn(days, r.start, r.end);
    const needed = neededFor(r.start);
    const margin = len - needed;
    if (margin > bestMargin) {
      bestMargin = margin;
      best = { length: len, start: r.start, end: r.end, needed };
    }
  }
  return best;
}

function statusFor(met: boolean, near: boolean): TaxStatus {
  return met ? 'met' : near ? 'near' : 'under';
}

/** Per-user tax options (presence_settings.tax_options). */
export interface TaxOptions {
  /** Calendar years with a tax residence certificate from another country (Spain). */
  es_certificate_years?: number[];
  /** The user says they meet New Zealand's non-resident visitor conditions. */
  nz_visitor?: boolean;
  /** Cyprus 60-day rule conditions met (not resident elsewhere, work and a home in Cyprus...). */
  cy_60_day?: boolean;
  /** UAE 90-day rule conditions met (residence permit or UAE/GCC national, plus home, job or business there). */
  ae_90_day?: boolean;
}

/**
 * New Zealand non-resident visitor (Income Tax Act 2007 s YD 1(13) and YD 1B,
 * from 1 April 2026; IRD guide IR292): arrived on or after 1 April 2026, not
 * working for a New Zealand resident or branch, not required to be in New
 * Zealand for work, lawfully there and tax resident elsewhere. The 183-day
 * rule does not apply; more than 275 days in any 18-month period makes them
 * resident from day 276. The app cannot check the conditions, so the user
 * switches it on.
 */
export const NZ_VISITOR_FROM = '2026-04-01';
export const NZ_VISITOR_MAX_DAYS = 275;

/**
 * Spain: an absence longer than this is not "sporadic" (Tribunal Supremo,
 * 28 Nov 2017, appeals 812/2017 and 815/2017), so it is not added.
 */
export const ES_MAX_SPORADIC_ABSENCE_DAYS = 183;

/**
 * Germany: a break of up to this many days (logged elsewhere or with nothing
 * logged) does not end an unbroken stay (AO s 9 sentence 2: short breaks are
 * disregarded). The law gives no number; the AEAO examples are home trips,
 * annual leave, cures and business trips, and the BFH has left open whether
 * about 1.5 months or more breaks a stay. Six weeks is the app's line.
 */
export const DE_MAX_SHORT_BREAK_DAYS = 42;

/**
 * Days in `country` for tax, as each country's rules count them (owner's
 * rule, 2026-11-23: tax follows each country's own documentation).
 *
 * Every country counts only days you were there (UK: at midnight; others: any
 * part of a day). Days away and days with nothing logged are not days there,
 * because none of their laws or guidance counts them, with one exception:
 *
 * Spain (Ley 35/2006 art. 9.1.a; TEAC RG 04812/2020 of 25 Apr 2023): days
 * between two days proven in Spain count unless you prove you were outside
 * Spain, and sporadic absences abroad are added unless you prove tax residence
 * in another country. So a break between two Spanish stays (the later one
 * begun) is added: always when nothing is logged in it, and when time abroad
 * is logged in it only if the break is 183 days or fewer. These are the
 * `assumed` days. For a year with a tax residence certificate from another
 * country (opts.es_certificate_years), breaks with time abroad are not added;
 * unlogged-only breaks still are (TEAC: unless you prove you were outside Spain).
 *
 * Germany's short-break rule is applied to the unbroken-stay test itself
 * (bestRunTouching), not here.
 */
export function taxDays(stays: Stay[], country: string, today: string, counting: DayCounting, opts: TaxOptions = {}): { days: Set<number>; assumed: Set<number> } {
  const inCountry = (s: Stay) => s.country_code === country && s.counts_tax;
  const days = stayDays(stays, today, inCountry, counting);
  const assumed = new Set<number>();
  if (country === 'ES') {
    const t = dayNum(today);
    const logged = stayDays(stays, today, () => true, 'any_part');
    const certYears = new Set(opts.es_certificate_years ?? []);
    const runs = runsOf(days);
    for (let k = 1; k < runs.length; k++) {
      if (runs[k].start > t) break; // the next Spanish stay is a plan
      const from = runs[k - 1].end + 1;
      const to = runs[k].start - 1;
      let abroad = false;
      for (let d = from; d <= to && !abroad; d++) if (logged.has(d)) abroad = true;
      if (abroad && to - from + 1 > ES_MAX_SPORADIC_ABSENCE_DAYS) continue;
      for (let d = from; d <= to; d++) {
        // With a residence certificate from another country for that year, time abroad is not added.
        if (abroad && certYears.has(Number(isoOf(d).slice(0, 4)))) continue;
        assumed.add(d);
      }
    }
    for (const d of assumed) days.add(d);
  }
  return { days, assumed };
}

/** Tax years for one country: the current one and the two before. */
export function taxCountrySummary(stays: Stay[], country: string, today: string, yearsBack = 2, opts: TaxOptions = {}): TaxCountryResult {
  const rule = TAX_RULES[country] ?? null;
  const counting: DayCounting = rule?.counting ?? 'any_part';
  const yearStart = rule?.yearStart ?? { month: 1, day: 1 };
  const { days, assumed } = taxDays(stays, country, today, counting, opts);
  const anyDays = stayDays(stays, today, () => true, 'any_part');
  // Days working abroad: on board, at sea or in another country's waters (Denmark's break rule).
  const workAbroad = stayDays(
    stays,
    today,
    (s) => s.country_code !== country && (s.kind === 'on_board' || s.country_code.toUpperCase() === AT_SEA_CODE),
    'any_part',
  );
  const t = dayNum(today);
  const currentStartYear = Number(taxYearStart(yearStart, today).slice(0, 4));

  const countYear = (startYear: number) => {
    const r = taxYearRange(yearStart, startYear);
    return countIn(days, dayNum(r.start), dayNum(r.end));
  };

  const years: TaxYearResult[] = [];
  for (let i = 0; i <= yearsBack; i++) {
    const startYear = currentStartYear - i;
    const range = taxYearRange(yearStart, startYear);
    const from = dayNum(range.start);
    const to = dayNum(range.end);
    const n = countIn(days, from, to);
    const planned = countIn(days, Math.max(from, t + 1), to);
    const lastKnown = Math.min(to, t);
    const unrecorded = lastKnown >= from ? lastKnown - from + 1 - countIn(anyDays, from, lastKnown) : 0;
    let status: TaxStatus = 'none';
    let need: number | null = null;
    const detail: Record<string, number | string | null> = {};

    if (rule) {
      const test = rule.test;
      switch (test.type) {
        case 'threshold': {
          const target = test.cmp === 'gte' ? test.days : test.days + 1;
          need = Math.max(0, target - n);
          status = statusFor(n >= target, n >= target - NEAR_MARGIN);
          detail.threshold = target;
          break;
        }
        case 'majority': {
          const target = Math.floor(yearLength(range) / 2) + 1;
          need = Math.max(0, target - n);
          status = statusFor(n >= target, n >= target - NEAR_MARGIN);
          detail.threshold = target;
          break;
        }
        case 'us_spt': {
          const p1 = countYear(startYear - 1);
          const p2 = countYear(startYear - 2);
          const weighted = n + p1 / 3 + p2 / 6;
          const met = n >= 31 && weighted >= 183;
          status = statusFor(met, weighted >= 183 - NEAR_MARGIN);
          need = met ? 0 : Math.max(31 - n, Math.ceil(183 - weighted), 0);
          detail.weighted_days = Math.round(weighted * 10) / 10;
          detail.previous_year = p1;
          detail.year_before = p2;
          break;
        }
        case 'ie_two_year': {
          const p1 = countYear(startYear - 1);
          const twoYear = n > 30 ? n + (p1 > 30 ? p1 : 0) : 0;
          const met = n >= 183 || twoYear >= 280;
          status = statusFor(met, n >= 183 - NEAR_MARGIN || twoYear >= 280 - NEAR_MARGIN);
          need = met ? 0 : Math.max(0, Math.min(183 - n, n > 30 ? 280 - twoYear : 183 - n));
          detail.previous_year = p1;
          detail.two_year_total = twoYear;
          break;
        }
        case 'za_ppt': {
          const prev = [1, 2, 3, 4, 5].map((k) => countYear(startYear - k));
          const prevTotal = prev.reduce((a, b) => a + b, 0);
          const met = n > 91 && prev.every((p) => p > 91) && prevTotal > 915;
          const historyOk = prev.every((p) => p > 91) && prevTotal > 915;
          status = statusFor(met, historyOk && n > 91 - NEAR_MARGIN);
          need = historyOk ? Math.max(0, 92 - n) : null;
          detail.previous_five_total = prevTotal;
          detail.previous_years = prev.join(',');
          break;
        }
        case 'nz_rolling': {
          if (opts.nz_visitor && to >= dayNum(NZ_VISITOR_FROM)) {
            // Non-resident visitor: more than 275 days in any 18-month period, counting from 1 April 2026.
            // Tax years that end before then stay on the 183-day rule (the visitor rule did not exist).
            const floor = dayNum(NZ_VISITOR_FROM);
            let best = 0;
            let bestEnd: number | null = null;
            for (let d = Math.max(from, floor); d <= to; d++) {
              const windowStart = Math.max(floor, dayNum(addMonthsClamped(isoOf(d), -18)) + 1);
              const c = countIn(days, windowStart, d);
              if (c > best) {
                best = c;
                bestEnd = d;
              }
            }
            status = statusFor(best > NZ_VISITOR_MAX_DAYS, best > NZ_VISITOR_MAX_DAYS - NEAR_MARGIN);
            need = Math.max(0, NZ_VISITOR_MAX_DAYS + 1 - best);
            detail.visitor = 1;
            detail.best_18_months = best;
            detail.best_18_months_end = bestEnd == null ? null : isoOf(bestEnd);
            break;
          }
          let best = 0;
          let bestEnd: number | null = null;
          for (let d = from; d <= to; d++) {
            // A calendar 12 months ending on d: 366 days when it spans 29 February.
            const windowStart = dayNum(addMonthsClamped(isoOf(d), -12)) + 1;
            const c = countIn(days, windowStart, d);
            if (c > best) {
              best = c;
              bestEnd = d;
            }
          }
          status = statusFor(best > 183, best > 183 - NEAR_MARGIN);
          need = Math.max(0, 184 - best);
          detail.best_12_months = best;
          detail.best_12_months_end = bestEnd == null ? null : isoOf(bestEnd);
          break;
        }
        case 'de_continuous': {
          // "More than six months" in calendar months from the day of arrival (182 to 185 days).
          const run = bestRunTouching(days, from, to, DE_MAX_SHORT_BREAK_DAYS);
          status = statusFor(run.start != null && run.length >= run.needed, run.start != null && run.length >= run.needed - NEAR_MARGIN);
          need = Math.max(0, run.needed - run.length);
          detail.threshold = run.needed;
          detail.longest_stay = run.length;
          detail.longest_stay_start = run.start == null ? null : isoOf(run.start);
          detail.longest_stay_end = run.end == null ? null : isoOf(run.end);
          break;
        }
        case 'continuous': {
          // Calendar months from the day of arrival ("at least" = the day before the "more than" day), or a day count.
          const neededFor = (start: number) => {
            if (test.days != null) return test.cmp === 'gte' ? test.days : test.days + 1;
            const iso = isoOf(start);
            const target = dayNum(addMonthsClamped(iso, test.months ?? 6));
            const over = Number(isoOf(target).slice(8, 10)) === Number(iso.slice(8, 10)) ? target : target + 1;
            return (test.cmp === 'gte' ? over - 1 : over) - start + 1;
          };
          // Sweden/Denmark give no number for a short break: it may be no longer than the stay before or after it,
          // and never more than six months. Denmark: work abroad (time on board outside Denmark) ends the stay.
          const joinBreak =
            test.breakRule === 'adjacent_stay'
              ? (gf: number, gt: number, before: number, after: number) => {
                  const len = gt - gf + 1;
                  if (len > 183 || len > Math.max(before, after)) return false;
                  if (test.workBreaksEnd) for (let d = gf; d <= gt; d++) if (workAbroad.has(d)) return false;
                  return true;
                }
              : undefined;
          const run = bestRunTouching(days, from, to, test.breakDays, neededFor, test.countBreaks, joinBreak);
          status = statusFor(run.start != null && run.length >= run.needed, run.start != null && run.length >= run.needed - NEAR_MARGIN);
          need = Math.max(0, run.needed - run.length);
          detail.threshold = run.needed;
          detail.longest_stay = run.length;
          detail.longest_stay_start = run.start == null ? null : isoOf(run.start);
          detail.longest_stay_end = run.end == null ? null : isoOf(run.end);
          break;
        }
        case 'rolling': {
          // Best window per test; met when any test is passed.
          let met = false;
          let near = false;
          let bestNeed = Infinity;
          test.tests.forEach((rt, k) => {
            const target = rt.cmp === 'gte' ? rt.days : rt.days + 1;
            let best = 0;
            let bestEnd: number | null = null;
            for (let d = from; d <= to; d++) {
              const ends: Array<[number, number]> = [[dayNum(addMonthsClamped(isoOf(d), -rt.months)) + 1, d]];
              if (test.window === 'start_or_end') ends.push([d, dayNum(addMonthsClamped(isoOf(d), rt.months)) - 1]);
              for (const [a, b] of ends) {
                const c = countIn(days, a, b);
                if (c > best) {
                  best = c;
                  bestEnd = b;
                }
              }
            }
            if (best >= target) met = true;
            if (best >= target - NEAR_MARGIN) near = true;
            bestNeed = Math.min(bestNeed, Math.max(0, target - best));
            detail[`best_${k}`] = best;
            detail[`best_${k}_end`] = bestEnd == null ? null : isoOf(bestEnd);
          });
          if (country === 'AE' && opts.ae_90_day && !met && Number(detail.best_0) >= 90) {
            met = true;
            detail.alt_rule_days = 90;
            detail.alt_rule_count = Number(detail.best_0);
          }
          status = statusFor(met, near);
          need = met ? 0 : bestNeed;
          break;
        }
        case 'year_or_multi': {
          const target = test.cmp === 'gte' ? test.days : test.days + 1;
          // Every run of `years` tax years that includes this one.
          let bestTotal = 0;
          for (let first = startYear - test.years + 1; first <= startYear; first++) {
            let total = 0;
            for (let y = first; y < first + test.years; y++) total += countYear(y);
            bestTotal = Math.max(bestTotal, total);
          }
          const met = n >= target || bestTotal > test.total;
          status = statusFor(met, n >= target - NEAR_MARGIN || bestTotal > test.total - NEAR_MARGIN);
          need = met ? 0 : Math.max(0, Math.min(target - n, test.total + 1 - bestTotal));
          detail.threshold = target;
          detail.multi_total = bestTotal;
          break;
        }
      }
      // Cyprus 60-day rule: at least 60 days when the user says the other conditions are met.
      if (country === 'CY' && opts.cy_60_day && n >= 60 && status !== 'met') {
        status = 'met';
        need = 0;
        detail.alt_rule_days = 60;
        detail.alt_rule_count = n;
      }
    }

    years.push({
      label: taxYearLabel(yearStart, startYear),
      start_date: range.start,
      end_date: range.end,
      days: n,
      planned_days: planned,
      unrecorded_days: unrecorded,
      assumed_days: countIn(assumed, from, to),
      status,
      days_to_test: need,
      detail,
    });
  }

  return { country, has_rule: !!rule, counting, test: rule?.test ?? null, year_start: yearStart, years };
}

/** Every country the user has a stay in, with day totals (plain count, any part of a day). */
export function countryTotals(stays: Stay[], today: string): Array<{ country: string; days: number; stays: number }> {
  const byCountry = new Map<string, Stay[]>();
  for (const s of stays) {
    const list = byCountry.get(s.country_code) ?? [];
    list.push(s);
    byCountry.set(s.country_code, list);
  }
  return [...byCountry.entries()]
    .map(([country, list]) => ({ country, days: stayDays(list, today, () => true).size, stays: list.length }))
    .sort((a, b) => b.days - a.days);
}

// ── UK Seafarers' Earnings Deduction ──────────────────────────────────

export interface SedPeriod {
  start_date: string;
  end_date: string;
  days: number;
  absence_days: number;
  uk_days: number;
  eligible: boolean;
}

export interface SedSummary {
  periods: SedPeriod[];
  /** The period still being built (ends with the latest absence), or null. */
  current: (SedPeriod & { days_to_365: number; uk_days_since: number; broken: boolean }) | null;
}

/**
 * Eligible periods for the Seafarers' Earnings Deduction, from the stays log.
 * HMRC EIM33004 / EIM33005: a day of absence is a day you are outside the UK at
 * midnight (so the day you leave counts and the day you return does not). An
 * eligible period is 365 days or more, either all absence or a combined period:
 * each UK stay between absences is 183 days or fewer and at least half of the
 * combined period is absence. When a test fails, start again from the last
 * absence. Days with no stay logged are treated as UK days (the safe side).
 * Only the day tests are checked: SED also needs duties on a ship, a resident
 * employee and more (see EIM33000 onwards).
 */
export function sedSummary(stays: Stay[], today: string): SedSummary {
  const uk = stayDays(stays, today, (s) => s.country_code === 'GB', 'midnight');
  const abroad = stayDays(stays, today, (s) => s.country_code !== 'GB', 'midnight');
  const t = dayNum(today);
  const absence = new Set([...abroad].filter((d) => !uk.has(d) && d <= t));
  const runs = runsOf(absence);
  const periods: SedPeriod[] = [];
  let i = 0;
  while (i < runs.length) {
    const start = runs[i].start;
    let end = runs[i].end;
    let abs = end - start + 1;
    let restart: number | null = null;
    let j = i + 1;
    while (j < runs.length) {
      const gap = runs[j].start - end - 1;
      const span = runs[j].end - start + 1;
      const abs2 = abs + (runs[j].end - runs[j].start + 1);
      if (gap > 183 || abs2 * 2 < span) {
        restart = j;
        break;
      }
      end = runs[j].end;
      abs = abs2;
      j++;
    }
    const days = end - start + 1;
    periods.push({
      start_date: isoOf(start),
      end_date: isoOf(end),
      days,
      absence_days: abs,
      uk_days: days - abs,
      eligible: days >= 365,
    });
    i = restart ?? runs.length;
  }
  const last = periods[periods.length - 1];
  const current = last
    ? (() => {
        const sinceEnd = Math.max(0, t - dayNum(last.end_date));
        return {
          ...last,
          days_to_365: Math.max(0, 365 - last.days),
          uk_days_since: sinceEnd,
          broken: sinceEnd > 183,
        };
      })()
    : null;
  return { periods: periods.filter((p) => p.eligible), current };
}
