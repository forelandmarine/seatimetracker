/**
 * Pure helper functions for sea-time calculations.
 *
 * Extracted from routes/sea-time.ts so they can be unit-tested independently.
 */

/** Duration in hours between two timestamps, rounded to 2 dp. */
export function calculateDurationHours(startTime: Date, endTime: Date): number {
  const diffMs = endTime.getTime() - startTime.getTime();
  return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * MSN 1858: "A minimum of 4 hours of working duty in 24 hours would count as 1
 * full day." The app reckons the 24 hours as the UTC calendar date, so a date
 * is a sea day when at least 4 hours of service fall on it. A passage that
 * crosses midnight only earns the second date if 4 hours fall after midnight.
 */
export const MCA_MINIMUM_HOURS_PER_DAY = 4;

/** Hours an interval spends on each UTC calendar date (YYYY-MM-DD). */
export function hoursByDate(startTime: Date, endTime: Date): Map<string, number> {
  const out = new Map<string, number>();
  let t = startTime.getTime();
  const end = endTime.getTime();
  while (t < end) {
    const dayStart = Math.floor(t / DAY_MS) * DAY_MS;
    const next = Math.min(dayStart + DAY_MS, end);
    const key = getCalendarDay(new Date(dayStart));
    out.set(key, (out.get(key) ?? 0) + (next - t) / HOUR_MS);
    t = next;
  }
  return out;
}

/**
 * Number of MCA sea days for a single service period: the UTC calendar dates
 * on which at least 4 hours of the period fall. A continuous voyage earns one
 * day for every such date, never more than one per date.
 *
 * Note: to avoid double-counting when two entries overlap, a running total
 * across multiple entries should be computed with countDistinctSeaDays rather
 * than by summing this per-entry value.
 */
export function calculateSeaDays(startTime: Date, endTime: Date): number {
  let days = 0;
  for (const h of hoursByDate(startTime, endTime).values()) {
    if (meetsHours(h, MCA_MINIMUM_HOURS_PER_DAY)) days++;
  }
  return days;
}

/** UTC calendar dates (YYYY-MM-DD) a period touches, inclusive of both ends. */
export function calendarDaysCovered(startTime: Date, endTime: Date): string[] {
  const days: string[] = [];
  if (endTime.getTime() < startTime.getTime()) return days;
  const cursor = new Date(Date.UTC(
    startTime.getUTCFullYear(), startTime.getUTCMonth(), startTime.getUTCDate()
  ));
  const last = Date.UTC(endTime.getUTCFullYear(), endTime.getUTCMonth(), endTime.getUTCDate());
  while (cursor.getTime() <= last) {
    days.push(getCalendarDay(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** Threshold comparison that tolerates millisecond rounding in stored times. */
function meetsHours(hours: number, threshold: number): boolean {
  return hours >= threshold - 1e-6;
}

/**
 * A logged day rather than a timed period: a confirmed entry with a start date,
 * no end time and a sea_days count. The manual-entry form makes the end time
 * optional and the API stores sea_days = 1 when it is left out, so these are
 * the user recording "I was at sea on this date", which is how the logbook
 * already shows them. Without this they read as zero hours and every counter
 * dropped them.
 *
 * Each declared day is credited as one standard 8-hour working day on its own
 * UTC calendar date, so it makes a day under the MCA 4-hour, USCG 8-hour and
 * AMSA 8-hour rules alike, and adds 8 hours to the MNZ hour count. Open shifts
 * (status 'active') and pending detections are timed periods still running,
 * not declared days, so they are excluded.
 */
export const DECLARED_DAY_HOURS = 8;

interface PeriodEntry {
  start_time: Date | string;
  end_time: Date | string | null;
  sea_days?: number | null;
  status?: string | null;
  service_type?: string | null;
}

export function isDeclaredDayEntry(e: PeriodEntry): boolean {
  return e.end_time == null
    && typeof e.sea_days === 'number' && e.sea_days >= 1
    && e.status !== 'active' && e.status !== 'pending';
}

const toDate = (v: Date | string): Date => (v instanceof Date ? v : new Date(v));

/** Dates a declared-day entry covers: sea_days consecutive UTC dates from its start date. */
function declaredDates(e: PeriodEntry): string[] {
  const start = toDate(e.start_time);
  const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(first.getTime() + (Math.floor(e.sea_days as number) - 1) * DAY_MS);
  return calendarDaysCovered(first, last);
}

/** A continuous stretch of service after overlapping entries are merged. */
interface Span<T> { start: number; end: number; entries: T[] }

/**
 * Merge overlapping timed entries so the same hours are never counted twice
 * (AIS detections and manual entries often overlap). Declared-day entries are
 * returned separately because they have dates but no times.
 */
function mergeEntries<T extends PeriodEntry>(entries: T[]): { spans: Span<T>[]; declared: T[] } {
  const declared: T[] = [];
  const timed: Array<{ start: number; end: number; e: T }> = [];
  for (const e of entries) {
    if (isDeclaredDayEntry(e)) { declared.push(e); continue; }
    if (e.end_time == null) continue;
    const start = toDate(e.start_time).getTime();
    const end = toDate(e.end_time).getTime();
    if (!(end > start)) continue;
    timed.push({ start, end, e });
  }
  timed.sort((a, b) => a.start - b.start);
  const spans: Span<T>[] = [];
  for (const t of timed) {
    const last = spans[spans.length - 1];
    if (last && t.start <= last.end) {
      last.end = Math.max(last.end, t.end);
      last.entries.push(t.e);
    } else {
      spans.push({ start: t.start, end: t.end, entries: [t.e] });
    }
  }
  return { spans, declared };
}

/** Union hours of service per UTC calendar date. Declared days count as 8 hours. */
function unionHoursByDate(entries: PeriodEntry[]): Map<string, number> {
  const { spans, declared } = mergeEntries(entries);
  const out = new Map<string, number>();
  for (const s of spans) {
    for (const [d, h] of hoursByDate(new Date(s.start), new Date(s.end))) {
      out.set(d, (out.get(d) ?? 0) + h);
    }
  }
  for (const e of declared) {
    for (const d of declaredDates(e)) out.set(d, Math.max(out.get(d) ?? 0, DECLARED_DAY_HOURS));
  }
  return out;
}

type Bucket = 'actual' | 'standby' | 'yard' | 'port';

/** actual_sea_service, watchkeeping_service and any unknown type are actual sea service. */
function bucketOf(e: { service_type?: string | null }): Bucket {
  const type = e.service_type || 'actual_sea_service';
  return type === 'standby_service' ? 'standby'
    : type === 'yard_service' ? 'yard'
    : type === 'service_in_port' ? 'port'
    : 'actual';
}

/**
 * MCA-style day classification shared by the MCA and MNZ counters. A date
 * qualifies when the combined (merged) sea-service hours on it reach 4: actual,
 * stand-by and yard are all working duty. It is credited once, at the best
 * service type worked that day (actual > stand-by > yard). Service in port is
 * not sea service, so it never helps a date qualify and is reported apart.
 */
function classifyCalendarDays(entries: PeriodEntry[], minHours: number = MCA_MINIMUM_HOURS_PER_DAY): {
  actual: Set<string>; standby: Set<string>; yard: Set<string>; port: Set<string>; hours: Map<string, number>;
} {
  const byBucket: Record<Bucket, PeriodEntry[]> = { actual: [], standby: [], yard: [], port: [] };
  for (const e of entries) byBucket[bucketOf(e)].push(e);
  const present = {
    actual: unionHoursByDate(byBucket.actual),
    standby: unionHoursByDate(byBucket.standby),
    yard: unionHoursByDate(byBucket.yard),
  };
  const seaHours = unionHoursByDate([...byBucket.actual, ...byBucket.standby, ...byBucket.yard]);
  const portHours = unionHoursByDate(byBucket.port);

  const actual = new Set<string>(), standby = new Set<string>(), yard = new Set<string>(), port = new Set<string>();
  for (const [d, h] of seaHours) {
    if (!(h > 0) || !meetsHours(h, minHours)) continue;
    if ((present.actual.get(d) ?? 0) > 0) actual.add(d);
    else if ((present.standby.get(d) ?? 0) > 0) standby.add(d);
    else yard.add(d);
  }
  for (const [d, h] of portHours) {
    if (h > 0 && meetsHours(h, minHours) && !actual.has(d) && !standby.has(d) && !yard.has(d)) port.add(d);
  }
  const hours = unionHoursByDate(entries);
  return { actual, standby, yard, port, hours };
}

/**
 * Distinct days across many entries of any service type: the UTC dates with at
 * least 4 merged hours of logged time. Overlapping entries are merged first so
 * the same hours and the same date are never counted twice.
 */
export function countDistinctSeaDays(entries: PeriodEntry[]): number {
  let days = 0;
  for (const h of unionHoursByDate(entries).values()) {
    if (meetsHours(h, MCA_MINIMUM_HOURS_PER_DAY)) days++;
  }
  return days;
}

/**
 * MSN 1858 crediting caps for yacht sea service that are applied to the
 * headline sea-service total:
 * - Yard service counts up to a maximum of 90 days toward the requirement.
 * - Service in port is not part of sea service and does not count.
 *
 * The stand-by limits (total stand-by not exceeding total actual service, and
 * no more than 14 consecutive days) are certificate-structure rules an assessor
 * applies per application; they are deliberately NOT baked into this universal
 * total, so stand-by is counted in full here.
 */
export const YARD_SERVICE_CAP_DAYS = 90;

export interface SeaServiceBreakdown {
  /** Distinct days of actual sea service (includes watchkeeping, which is a form of actual service). */
  actual: number;
  /** Distinct stand-by days that don't fall on an actual-service day (counted in full). */
  standby: number;
  /** Distinct yard days that don't fall on an actual- or stand-by-service day. */
  yard: number;
  /** Distinct service-in-port days (informational only; not credited). */
  port: number;
  /** Yard days actually credited = min(yard, 90). */
  yard_credited: number;
  /** Total qualifying sea service: actual + standby + yard_credited (port excluded). */
  qualifying_total: number;
}

/**
 * Qualifying sea service across many confirmed entries. Applies the two
 * crediting rules that belong in a universal total: yard service is capped at
 * 90 days (MSN 1858), and service in port is excluded (it is not sea service).
 * Stand-by is counted in full here; its certificate-structure limits are left
 * to the assessor.
 *
 * Days are deduplicated across service types with priority actual > stand-by >
 * yard > port, so a single calendar date is only ever counted once and always
 * at its most valuable classification (one sea day per calendar day).
 *
 * This does NOT apply certificate-specific structure (e.g. the OOW <3000GT
 * 250-day actual minimum / 115-day combination split or vessel-length gating);
 * it reports the credited sea service, which an assessor then maps to a
 * specific certificate.
 */
export function qualifyingSeaDays(entries: PeriodEntry[]): SeaServiceBreakdown {
  const c = classifyCalendarDays(entries);
  const actual = c.actual.size;
  const standby = c.standby.size;
  const yard = c.yard.size;
  const port = c.port.size;

  const yard_credited = Math.min(yard, YARD_SERVICE_CAP_DAYS);
  const qualifying_total = actual + standby + yard_credited; // port excluded, stand-by in full

  return { actual, standby, yard, port, yard_credited, qualifying_total };
}

/**
 * 24-hour periods for the 8-hour-day authorities (USCG, AMSA). Neither ties
 * its day to midnight: 46 CFR 10.107 and MO 505 both speak of hours within a
 * 24-hour period. Each merged stretch of service is cut into consecutive
 * 24-hour windows from its own start, so a 2000-0400 watch is one period of 8
 * hours rather than two 4-hour halves either side of midnight. Each window is
 * filed under the UTC date it starts on, and windows from separate stretches
 * that start on the same date are added together. A declared day is one
 * 8-hour period on its date.
 */
function twentyFourHourPeriods<T extends PeriodEntry>(entries: T[]): Map<string, { hours: number; entries: T[] }> {
  const { spans, declared } = mergeEntries(entries);
  const out = new Map<string, { hours: number; entries: T[] }>();
  const add = (d: string, h: number, es: T[]) => {
    const cur = out.get(d) ?? { hours: 0, entries: [] };
    cur.hours += h;
    for (const e of es) if (!cur.entries.includes(e)) cur.entries.push(e);
    out.set(d, cur);
  };
  for (const s of spans) {
    for (let w = s.start; w < s.end; w += DAY_MS) {
      const h = (Math.min(w + DAY_MS, s.end) - w) / HOUR_MS;
      add(getCalendarDay(new Date(w)), h, s.entries);
    }
  }
  for (const e of declared) {
    for (const d of declaredDates(e)) {
      const cur = out.get(d);
      if (cur) { cur.hours = Math.max(cur.hours, DECLARED_DAY_HOURS); if (!cur.entries.includes(e)) cur.entries.push(e); }
      else out.set(d, { hours: DECLARED_DAY_HOURS, entries: [e] });
    }
  }
  return out;
}

/**
 * USCG creditable service.
 *
 * The Coast Guard counts service differently from the MCA, so the MCA-shaped
 * `qualifyingSeaDays` total above must not be reused for a USCG applicant.
 *
 * The length of a creditable day is not a single number. 46 CFR 10.107 defines
 * it as 8 hours of watchstanding or day-working, excluding overtime, and then
 * qualifies that:
 *
 * - On vessels of less than 100 GRT a day is still considered 8 hours "unless
 *   the Coast Guard determines that the vessel's operating schedule makes this
 *   criteria inappropriate; in no case will this period be less than 4 hours."
 *   That determination belongs to the OCMI, not to this app, so a 4-to-8 hour
 *   day on a small vessel is reported separately as provisional rather than
 *   either credited outright or thrown away.
 * - On a vessel authorised to run a two-watch system under 46 U.S.C. 8104, a
 *   12-hour working day may be credited as 1.5 days. Whether a vessel holds
 *   that authorisation is not something the app knows, so the uplift is never
 *   applied automatically.
 * - MODU service has its own rule: a minimum of 4 hours, with no extra credit
 *   beyond 8. The vessel record has no MODU flag, so this is not detected; MODU
 *   short days fall into the same buckets as any other vessel of their tonnage.
 *
 * Tonnage comes from gross_tonnes, falling back to tonnage_itc, because under
 * 46 CFR 11.211(h) a vessel measured only under the Convention scheme is
 * credited as Gross Register Tonnage.
 *
 * Other definitions used here: "service" is the time, in days, a person is
 * assigned to work, which is why yard periods and time in port are not sea
 * service; a month is 30 days and a year is 360 days (46 CFR 10.107).
 *
 * As with the MCA total, this reports credited service and does not apply
 * endorsement-specific structure (route, tonnage or capacity conditions), which
 * an evaluator at the National Maritime Center applies to the application.
 */
export const USCG_STANDARD_HOURS_PER_DAY = 8;
export const USCG_MINIMUM_HOURS_PER_DAY = 4;
export const USCG_SMALL_VESSEL_GRT = 100;
export const USCG_DAYS_PER_MONTH = 30;
export const USCG_DAYS_PER_YEAR = 360;

export interface USCGServiceBreakdown {
  /** Distinct days of sea service meeting the full 8-hour day. */
  creditable: number;
  /**
   * Distinct days of 4 to 8 hours on a vessel under 100 GRT. Creditable only
   * if the Coast Guard accepts that the operating schedule makes the 8-hour
   * day inappropriate, so they are counted apart from `creditable`.
   */
  provisional: number;
  /** Days of 4 to 8 hours on a vessel of 100 GRT or more, which cannot make a day. */
  short_of_standard_day: number;
  /**
   * Days of 4 to 8 hours on a vessel whose tonnage has not been recorded. Held
   * rather than classified: the tonnage decides whether they are provisional or
   * short, so the user is asked for it instead of being given a guess.
   */
  awaiting_tonnage: number;
  /** Names of the vessels holding those days up, so the prompt can name them. */
  vessels_awaiting_tonnage: string[];
  /** Days under 4 hours, which are not creditable on any reading. */
  below_minimum: number;
  /** Distinct stand-by days, reported but not credited toward USCG service. */
  standby: number;
  /** Distinct yard days, reported but not credited toward USCG service. */
  yard: number;
  /** Distinct service-in-port days, reported but not credited. */
  port: number;
}

interface USCGEntry extends PeriodEntry {
  vessel?: {
    vessel_name?: string | null;
    gross_tonnes?: string | number | null;
    tonnage_itc?: string | number | null;
  } | null;
}

function toTonnage(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/** GRT for crediting purposes, with ITC-only measurement credited as GRT. */
export function creditableTonnage(entry: USCGEntry): number | null {
  const v = entry.vessel;
  if (!v) return null;
  return toTonnage(v.gross_tonnes) ?? toTonnage(v.tonnage_itc);
}

/**
 * USCG creditable sea service across many confirmed entries. Hours are taken
 * per 24-hour period (see twentyFourHourPeriods) after overlapping entries are
 * merged, so one period is never credited twice and never as more than a day.
 */
export function uscgCreditableDays(entries: USCGEntry[]): USCGServiceBreakdown {
  const full = new Set<string>();
  const provisional = new Set<string>();
  const shortOfStandard = new Set<string>();
  const awaitingTonnage = new Set<string>();
  const awaitingVessels = new Set<string>();
  const belowMinimum = new Set<string>();
  const standbyDays = new Set<string>();
  const yardDays = new Set<string>();
  const portDays = new Set<string>();

  const byBucket: Record<Bucket, USCGEntry[]> = { actual: [], standby: [], yard: [], port: [] };
  for (const e of entries) byBucket[bucketOf(e)].push(e);

  // Stand-by, yard and port are reported but not credited as sea service.
  const notSea: Array<[USCGEntry[], Set<string>]> = [
    [byBucket.standby, standbyDays], [byBucket.yard, yardDays], [byBucket.port, portDays],
  ];
  for (const [list, set] of notSea) {
    for (const [d, p] of twentyFourHourPeriods(list)) {
      if (meetsHours(p.hours, USCG_MINIMUM_HOURS_PER_DAY)) set.add(d);
    }
  }

  for (const [d, p] of twentyFourHourPeriods(byBucket.actual)) {
    if (p.hours <= 0) continue;
    if (!meetsHours(p.hours, USCG_MINIMUM_HOURS_PER_DAY)) { belowMinimum.add(d); continue; }
    if (meetsHours(p.hours, USCG_STANDARD_HOURS_PER_DAY)) { full.add(d); continue; }

    // Between 4 and 8 hours the tonnage decides the outcome. Any vessel of 100
    // GRT or more worked in the period rules out the small-vessel allowance; an
    // unrecorded tonnage is a question for the user rather than a guess.
    const tonnages = p.entries.map(creditableTonnage);
    if (tonnages.some((t) => t != null && t >= USCG_SMALL_VESSEL_GRT)) { shortOfStandard.add(d); continue; }
    if (tonnages.some((t) => t == null)) {
      awaitingTonnage.add(d);
      for (const e of p.entries) {
        if (creditableTonnage(e) == null && e.vessel?.vessel_name) awaitingVessels.add(e.vessel.vessel_name);
      }
      continue;
    }
    provisional.add(d);
  }

  // A date credited at a better classification cannot also count at a worse one.
  const order = [full, provisional, shortOfStandard, awaitingTonnage, belowMinimum, standbyDays, yardDays, portDays];
  for (let i = 0; i < order.length; i++) {
    for (const d of order[i]) {
      for (let j = i + 1; j < order.length; j++) order[j].delete(d);
    }
  }

  return {
    creditable: full.size,
    provisional: provisional.size,
    short_of_standard_day: shortOfStandard.size,
    awaiting_tonnage: awaitingTonnage.size,
    vessels_awaiting_tonnage: awaitingTonnage.size > 0 ? [...awaitingVessels].sort() : [],
    below_minimum: belowMinimum.size,
    standby: standbyDays.size,
    yard: yardDays.size,
    port: portDays.size,
  };
}

/**
 * AMSA creditable service.
 *
 * Marine Order 505 counts a day as 8 hours of qualifying work. Shifts shorter
 * than 8 hours are added together until they make a day, and more than 8 hours
 * inside one 24-hour period is still only one day. That is a different rule
 * from both the MCA calendar day and the USCG 8-hour day, which is why neither
 * of the totals above can be reused for an AMSA applicant.
 *
 * AMSA also caps service gained while the vessel is not underway: no more than
 * 15 per cent of the required service for a deck certificate and 33 per cent
 * for an engineering one. The cap is a share of the target rather than of the
 * service logged, so this function reports the two buckets and leaves the cap
 * to the caller, which is the only place the target is known.
 */
export const AMSA_STANDARD_HOURS_PER_DAY = 8;
export const AMSA_DAYS_PER_MONTH = 30;
/** Share of the required service that may be gained while not underway. */
export const AMSA_NOT_UNDERWAY_CAP_DECK = 0.15;
export const AMSA_NOT_UNDERWAY_CAP_ENGINEERING = 0.33;

export interface AMSAServiceBreakdown {
  /** Whole days of qualifying work while the vessel was underway. */
  underway: number;
  /**
   * Whole days gained while the vessel was not underway: stand-by, yard, port
   * and anything flagged stationary. Credited only up to the caller's cap.
   */
  not_underway: number;
  /** Qualifying hours left over that do not yet make a whole day. */
  part_day_hours: number;
  /** Total qualifying hours after the 8-hour-per-day ceiling is applied. */
  qualifying_hours: number;
  /**
   * Days derived from logged bridge-watch hours, for the certificates gated on
   * service in charge of a navigational watch (Master <45m and Master <100m).
   * Whether a watch was stood in charge rather than under supervision is the
   * assessor's call, so this is reported as logged rather than asserted.
   */
  navigational_watch: number;
  /** Days derived from logged engine-room watch hours. */
  engineering_watch: number;
}

interface AMSAEntry extends PeriodEntry {
  is_stationary?: boolean | null;
  bridge_watch_hours?: string | number | null;
  engine_watch_hours?: string | number | null;
}

function toHours(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Is this entry service gained while the vessel was not underway? */
function isNotUnderway(e: AMSAEntry): boolean {
  const b = bucketOf(e);
  if (b !== 'actual') return true;
  return e.is_stationary === true;
}

export function amsaCreditableDays(entries: AMSAEntry[]): AMSAServiceBreakdown {
  let bridgeHours = 0;
  let engineHours = 0;
  const underwayEntries: AMSAEntry[] = [];
  const notUnderwayEntries: AMSAEntry[] = [];
  for (const e of entries) {
    // Watch hours only count from entries that represent service.
    if (isDeclaredDayEntry(e) || (e.end_time != null && toDate(e.end_time) > toDate(e.start_time))) {
      bridgeHours += toHours(e.bridge_watch_hours);
      engineHours += toHours(e.engine_watch_hours);
    }
    (isNotUnderway(e) ? notUnderwayEntries : underwayEntries).push(e);
  }

  // Hours per 24-hour period, merged so overlapping entries are not counted
  // twice, then capped at 8 per period before anything becomes a day.
  const underwayHours = new Map<string, number>();
  const notUnderwayHours = new Map<string, number>();
  for (const [d, p] of twentyFourHourPeriods(underwayEntries)) underwayHours.set(d, p.hours);
  for (const [d, p] of twentyFourHourPeriods(notUnderwayEntries)) notUnderwayHours.set(d, p.hours);

  // A date worked both underway and alongside counts once, at the better
  // classification, the same way the other authorities' counters resolve it.
  for (const d of underwayHours.keys()) notUnderwayHours.delete(d);

  const capped = (m: Map<string, number>): number => {
    let total = 0;
    for (const h of m.values()) total += Math.min(h, AMSA_STANDARD_HOURS_PER_DAY);
    return total;
  };

  const underwayTotal = capped(underwayHours);
  const notUnderwayTotal = capped(notUnderwayHours);
  const underway = Math.floor((underwayTotal + 1e-6) / AMSA_STANDARD_HOURS_PER_DAY);
  const notUnderway = Math.floor((notUnderwayTotal + 1e-6) / AMSA_STANDARD_HOURS_PER_DAY);
  const partDayHours =
    Math.max(0, underwayTotal - underway * AMSA_STANDARD_HOURS_PER_DAY) +
    Math.max(0, notUnderwayTotal - notUnderway * AMSA_STANDARD_HOURS_PER_DAY);

  return {
    underway,
    not_underway: notUnderway,
    part_day_hours: Math.round(partDayHours * 100) / 100,
    qualifying_hours: Math.round((underwayTotal + notUnderwayTotal) * 100) / 100,
    navigational_watch: Math.floor(bridgeHours / AMSA_STANDARD_HOURS_PER_DAY),
    engineering_watch: Math.floor(engineHours / AMSA_STANDARD_HOURS_PER_DAY),
  };
}

/**
 * Maritime NZ creditable service.
 *
 * SeaCert states sea service in months, and a month is 30 days. It does not
 * define an hours-per-day rule the way MO 505 and 46 CFR do, so days are
 * counted per calendar date as they are for the MCA. Two things are specific
 * to MNZ and are handled here: service must have been gained in the 10 years
 * before the application, and the two 200-hour certificates (Skipper Restricted
 * Limits and Marine Engineer Class 6) are measured in hours rather than days.
 *
 * The yacht certificates are written in the same actual / stand-by / yard split
 * the app already records, so those three totals are reported separately rather
 * than collapsed. No 90-day yard cap is applied: that is MSN 1858, an MCA rule,
 * and MNZ has its own combination limit instead.
 */
export const MNZ_DAYS_PER_MONTH = 30;
export const MNZ_SERVICE_WINDOW_YEARS = 10;

export interface MNZServiceBreakdown {
  /** Distinct days of actual sea service inside the 10-year window. */
  actual: number;
  /** Distinct stand-by days inside the window. */
  standby: number;
  /** Distinct yard days inside the window. */
  yard: number;
  /** Distinct service-in-port days inside the window (reported, not credited). */
  port: number;
  /** actual + standby + yard, which is the combination the yacht certificates use. */
  qualifying_total: number;
  /** Days derived from logged watchkeeping hours, at 8 hours to the day. */
  watchkeeping: number;
  /** Hours on board inside the window, for the 200-hour certificates. */
  hours: number;
  /** Days older than the 10-year window, reported so the user knows why they are missing. */
  outside_window: number;
}

interface MNZEntry extends PeriodEntry {
  bridge_watch_hours?: string | number | null;
  engine_watch_hours?: string | number | null;
  watchkeeping_hours?: string | number | null;
}

export function mnzCreditableDays(entries: MNZEntry[], now: Date = new Date()): MNZServiceBreakdown {
  const windowStart = new Date(now);
  windowStart.setUTCFullYear(windowStart.getUTCFullYear() - MNZ_SERVICE_WINDOW_YEARS);
  const windowStartDay = getCalendarDay(windowStart);

  // Days are counted per calendar date on the MCA basis (see above), then split
  // by whether the date falls inside the 10-year window.
  const c = classifyCalendarDays(entries);
  const inWindow = (d: string) => d >= windowStartDay;
  const outsideDays = new Set<string>();
  const keep = (set: Set<string>) => {
    const kept = new Set<string>();
    for (const d of set) (inWindow(d) ? kept : outsideDays).add(d);
    return kept;
  };
  const actualDays = keep(c.actual);
  const standbyDays = keep(c.standby);
  const yardDays = keep(c.yard);
  const portDays = keep(c.port);

  // Hours on board inside the window, merged so overlaps are not double counted.
  let totalHours = 0;
  for (const [d, h] of c.hours) if (inWindow(d)) totalHours += h;

  let watchHours = 0;
  for (const e of entries) {
    const last = e.end_time != null ? toDate(e.end_time) : toDate(e.start_time);
    if (last.getTime() < windowStart.getTime()) continue;
    watchHours +=
      toHours(e.watchkeeping_hours) || toHours(e.bridge_watch_hours) + toHours(e.engine_watch_hours);
  }

  const actual = actualDays.size;
  const standby = standbyDays.size;
  const yard = yardDays.size;

  return {
    actual,
    standby,
    yard,
    port: portDays.size,
    qualifying_total: actual + standby + yard,
    watchkeeping: Math.floor(watchHours / 8),
    hours: Math.round(totalHours * 100) / 100,
    outside_window: outsideDays.size,
  };
}

// ── SAMSA (South Africa) ────────────────────────────────────────────
// Merchant Shipping (Training, Certification and Safe Manning) Regulations 2021.
// A day of service is any calendar day signed on, with no hours threshold, and
// port days on articles count. Stand-by in construction or refit counts in full
// up to a third of the required service (the app applies that cap against the
// target). Service older than 10 years does not count. Watchkeeping is 8 hours
// in every 24, taken here as logged watch hours at 8 to the day.
const SAMSA_SERVICE_WINDOW_YEARS = 10;

export interface SAMSAServiceBreakdown {
  /** Calendar days at sea or in port on articles, inside the 10-year window. */
  seagoing: number;
  /** Stand-by and yard days (capped at a third of the target by the app). */
  standby_yard: number;
  /** Days from logged watchkeeping hours, at 8 hours to the day. */
  watchkeeping: number;
  /** Hours on board inside the window (small vessel skipper certificates). */
  hours: number;
  /** Days that fall outside the 10-year window. */
  outside_window: number;
}

export function samsaCreditableDays(entries: MNZEntry[], now: Date = new Date()): SAMSAServiceBreakdown {
  const windowStart = new Date(now);
  windowStart.setUTCFullYear(windowStart.getUTCFullYear() - SAMSA_SERVICE_WINDOW_YEARS);
  const windowStartDay = getCalendarDay(windowStart);
  const c = classifyCalendarDays(entries, 0);
  const inWindow = (d: string) => d >= windowStartDay;
  let outside = 0;
  const count = (set: Set<string>) => {
    let n = 0;
    for (const d of set) inWindow(d) ? n++ : outside++;
    return n;
  };
  const seagoing = count(c.actual) + count(c.port);
  const standby_yard = count(c.standby) + count(c.yard);

  let totalHours = 0;
  for (const [d, h] of c.hours) if (inWindow(d)) totalHours += h;
  let watchHours = 0;
  for (const e of entries) {
    const last = e.end_time != null ? toDate(e.end_time) : toDate(e.start_time);
    if (last.getTime() < windowStart.getTime()) continue;
    watchHours +=
      toHours(e.watchkeeping_hours) || toHours(e.bridge_watch_hours) + toHours(e.engine_watch_hours);
  }
  return {
    seagoing,
    standby_yard,
    watchkeeping: Math.floor(watchHours / 8),
    hours: Math.round(totalHours * 100) / 100,
    outside_window: outside,
  };
}

/**
 * Calendar dates one entry puts on the SAMSA count (any time on the date, port
 * included). Used to store per-entry sea_days without two entries both
 * claiming the same date.
 */
export function samsaEntryDates(entry: MNZEntry, now: Date = new Date()): string[] {
  const windowStart = new Date(now);
  windowStart.setUTCFullYear(windowStart.getUTCFullYear() - SAMSA_SERVICE_WINDOW_YEARS);
  const windowStartDay = getCalendarDay(windowStart);
  return Array.from(unionHoursByDate([entry]).entries())
    .filter(([d, h]) => h > 0 && d >= windowStartDay)
    .map(([d]) => d);
}

/** Maritime authorities a user can choose, matching user.maritime_authority. */
export type MaritimeAuthority = 'mca' | 'uscg' | 'amsa' | 'mnz' | 'samsa';
export const MARITIME_AUTHORITIES: MaritimeAuthority[] = ['mca', 'uscg', 'amsa', 'mnz', 'samsa'];

/**
 * The sea_days value stored on a single entry: the days that entry earns on
 * its own under the user's chosen authority (MCA when none is set). This is
 * the per-entry figure the logbook shows; running totals must still come from
 * the counters above, which merge overlapping entries across the logbook.
 *
 * - MCA: calendar dates with 4+ hours, across actual, stand-by and yard
 *   (port is not sea service). The 90-day yard cap is a total, not per entry.
 * - MNZ: as MCA, inside the 10-year window.
 * - USCG: 24-hour periods with a full 8-hour day of sea service. Provisional
 *   small-vessel days and stand-by, yard and port time are not credited.
 * - AMSA: whole 8-hour days, underway and not underway. Part days carry over
 *   only in the running total, so a short entry alone earns 0 here.
 * - SAMSA: every calendar date touched, port days included, inside 10 years.
 */
export function entrySeaDays(
  entry: USCGEntry & AMSAEntry & MNZEntry,
  authority: string | null | undefined,
  now: Date = new Date(),
  /** SAMSA only: dates other entries already hold. Dates this entry adds are recorded here. */
  claimedDates?: Set<string>
): number {
  switch (authority) {
    case 'uscg':
      return uscgCreditableDays([entry]).creditable;
    case 'amsa': {
      const a = amsaCreditableDays([entry]);
      return a.underway + a.not_underway;
    }
    case 'mnz':
      return mnzCreditableDays([entry], now).qualifying_total;
    case 'samsa': {
      const dates = samsaEntryDates(entry, now).filter((d) => !claimedDates?.has(d));
      dates.forEach((d) => claimedDates?.add(d));
      return dates.length;
    }
    default: {
      const q = qualifyingSeaDays([entry]);
      return q.actual + q.standby + q.yard;
    }
  }
}

/** Valid service types. */
export const VALID_SERVICE_TYPES = [
  'actual_sea_service',
  'watchkeeping_service',
  'standby_service',
  'yard_service',
  'service_in_port',
] as const;

export function isValidServiceType(serviceType: any): boolean {
  return typeof serviceType === 'string' && (VALID_SERVICE_TYPES as readonly string[]).includes(serviceType);
}

/** Haversine distance in nautical miles, rounded to 2 dp. */
export function calculateDistanceNauticalMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const EARTH_RADIUS_NM = 3440.065;

  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const lat1Rad = lat1 * (Math.PI / 180);
  const lat2Rad = lat2 * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.asin(Math.sqrt(a));
  const distance = EARTH_RADIUS_NM * c;

  return Math.round(distance * 100) / 100;
}

/** A position fix from ais_checks: coordinates (string or number) plus the check time. */
export interface TrackFix {
  latitude: string | number | null;
  longitude: string | number | null;
  check_time: Date | string;
}

/**
 * Cumulative track distance in nautical miles: the sum of the great-circle legs
 * between consecutive AIS fixes, ordered by time.
 *
 * This is the honest mileage for continuous / short-leg operations (e.g. a CTV
 * working turbine to turbine in a wind farm), where a single start-to-end
 * straight line badly understates the distance actually run. Accuracy is bounded
 * by the AIS sampling interval — it cannot see movement between two fixes — so it
 * is a lower bound on true mileage, but a far better one than point-to-point.
 *
 * Fixes with missing/invalid coordinates are skipped. Returns 0 for fewer than
 * two usable fixes (callers fall back to point-to-point in that case).
 */
export function cumulativeTrackDistanceNm(fixes: TrackFix[]): number {
  const pts = fixes
    .map((f) => ({
      lat: typeof f.latitude === 'string' ? parseFloat(f.latitude) : f.latitude,
      lon: typeof f.longitude === 'string' ? parseFloat(f.longitude) : f.longitude,
      t: f.check_time instanceof Date ? f.check_time.getTime() : new Date(f.check_time).getTime(),
    }))
    .filter((p) => p.lat != null && p.lon != null && !Number.isNaN(p.lat) && !Number.isNaN(p.lon) && !Number.isNaN(p.t))
    .sort((a, b) => a.t - b.t);

  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += calculateDistanceNauticalMiles(pts[i - 1].lat!, pts[i - 1].lon!, pts[i].lat!, pts[i].lon!);
  }
  return Math.round(total * 100) / 100;
}

/** Calendar day string (YYYY-MM-DD) from a Date, using local time. */
export function getCalendarDay(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
