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

// ── Schengen ──────────────────────────────────────────────────────────

export function countsForSchengen(s: Stay): boolean {
  if (!isSchengenCountry(s.country_code)) return false;
  return s.kind === 'ashore' || s.counts_schengen;
}

export function schengenDays(stays: Stay[], today: string): Set<number> {
  return stayDays(stays, today, countsForSchengen, 'any_part');
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

/** First day in [from, to] where the window passes 90, or null. */
function firstBreach(days: Set<number>, from: number, to: number): number | null {
  for (let d = from; d <= to; d++) if (days.has(d) && windowCount(days, d) > SCHENGEN_LIMIT) return d;
  return null;
}

export interface SchengenPlanResult {
  start_date: string;
  end_date: string;
  days: number;
  ok: boolean;
  /** First day the rule would be broken (in the trip or a stay already logged after it). */
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
  const breach = firstBreach(trial, ps, pe + SCHENGEN_WINDOW - 1);
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
  const days = schengenDays(stays, today);
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
      const b = firstBreach(days, t + 1, t + SCHENGEN_WINDOW * 2);
      return b == null ? null : isoOf(b);
    })(),
    segments,
    future_segments: futureSegments,
    next_release: nextRelease,
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

function longestRunTouching(days: Set<number>, from: number, to: number): { length: number; start: number | null; end: number | null } {
  let best = { length: 0, start: null as number | null, end: null as number | null };
  for (const r of runsOf(days)) {
    if (r.end < from || r.start > to) continue;
    const len = r.end - r.start + 1;
    if (len > best.length) best = { length: len, start: r.start, end: r.end };
  }
  return best;
}

function statusFor(met: boolean, near: boolean): TaxStatus {
  return met ? 'met' : near ? 'near' : 'under';
}

/** Tax years for one country: the current one and the two before. */
export function taxCountrySummary(stays: Stay[], country: string, today: string, yearsBack = 2): TaxCountryResult {
  const rule = TAX_RULES[country] ?? null;
  const counting: DayCounting = rule?.counting ?? 'any_part';
  const yearStart = rule?.yearStart ?? { month: 1, day: 1 };
  const days = stayDays(stays, today, (s) => s.country_code === country && s.counts_tax, counting);
  const anyDays = stayDays(stays, today, () => true, 'any_part');
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
          let best = 0;
          let bestEnd: number | null = null;
          for (let d = from; d <= to; d++) {
            const c = countIn(days, d - 364, d);
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
          const run = longestRunTouching(days, from, to);
          // "More than six months": 183 days or more, on the safe side.
          status = statusFor(run.length >= 183, run.length >= 183 - NEAR_MARGIN);
          need = Math.max(0, 183 - run.length);
          detail.longest_stay = run.length;
          detail.longest_stay_start = run.start == null ? null : isoOf(run.start);
          detail.longest_stay_end = run.end == null ? null : isoOf(run.end);
          break;
        }
      }
    }

    years.push({
      label: taxYearLabel(yearStart, startYear),
      start_date: range.start,
      end_date: range.end,
      days: n,
      planned_days: planned,
      unrecorded_days: unrecorded,
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
