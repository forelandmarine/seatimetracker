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

/**
 * Number of qualifying sea days for a single service period.
 *
 * The MCA counts one sea day for each calendar day on which qualifying service
 * is performed, and never more than one per calendar day. A continuous voyage
 * therefore earns one day for every distinct calendar date it spans, not a
 * single day for the whole passage. Returns 0 if the whole period is under the
 * 4-hour threshold.
 *
 * Note: to avoid double-counting when two entries overlap, a running total
 * across multiple entries should be computed with countDistinctSeaDays rather
 * than by summing this per-entry value.
 */
export function calculateSeaDays(startTime: Date, endTime: Date): number {
  const durationHours = calculateDurationHours(startTime, endTime);
  if (durationHours < 4) return 0;
  return calendarDaysCovered(startTime, endTime).length;
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

/**
 * Distinct sea days across many entries, deduplicating overlapping calendar
 * days so the same date is never counted twice. Each entry only counts if it
 * meets the 4-hour threshold. Pass entries that already qualify (e.g. confirmed).
 */
export function countDistinctSeaDays(
  entries: Array<{ start_time: Date | string; end_time: Date | string | null }>
): number {
  const days = new Set<string>();
  for (const e of entries) {
    const start = e.start_time instanceof Date ? e.start_time : new Date(e.start_time);
    const end = e.end_time == null
      ? start
      : (e.end_time instanceof Date ? e.end_time : new Date(e.end_time));
    if (calculateDurationHours(start, end) < 4) continue;
    for (const d of calendarDaysCovered(start, end)) days.add(d);
  }
  return days.size;
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

/** Distinct qualifying calendar days for one entry ([] if under the 4-hour threshold). */
function entryCalendarDays(e: { start_time: Date | string; end_time: Date | string | null }): string[] {
  const start = e.start_time instanceof Date ? e.start_time : new Date(e.start_time);
  const end = e.end_time == null
    ? start
    : (e.end_time instanceof Date ? e.end_time : new Date(e.end_time));
  if (calculateDurationHours(start, end) < 4) return [];
  return calendarDaysCovered(start, end);
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
export function qualifyingSeaDays(
  entries: Array<{ start_time: Date | string; end_time: Date | string | null; service_type?: string | null }>
): SeaServiceBreakdown {
  const actualDays = new Set<string>();
  const standbyDays = new Set<string>();
  const yardDays = new Set<string>();
  const portDays = new Set<string>();

  for (const e of entries) {
    const type = e.service_type || 'actual_sea_service';
    const bucket =
      type === 'standby_service' ? standbyDays :
      type === 'yard_service' ? yardDays :
      type === 'service_in_port' ? portDays :
      actualDays; // actual_sea_service, watchkeeping_service, and any unknown default to actual
    for (const d of entryCalendarDays(e)) bucket.add(d);
  }

  // Deduplicate by priority: a day already credited as actual can't also be
  // stand-by/yard/port, etc.
  for (const d of actualDays) { standbyDays.delete(d); yardDays.delete(d); portDays.delete(d); }
  for (const d of standbyDays) { yardDays.delete(d); portDays.delete(d); }
  for (const d of yardDays) { portDays.delete(d); }

  const actual = actualDays.size;
  const standby = standbyDays.size;
  const yard = yardDays.size;
  const port = portDays.size;

  const yard_credited = Math.min(yard, YARD_SERVICE_CAP_DAYS);
  const qualifying_total = actual + standby + yard_credited; // port excluded, stand-by in full

  return { actual, standby, yard, port, yard_credited, qualifying_total };
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
  /** Days of 4 to 8 hours where the vessel is 100 GRT or more, or its tonnage is unknown. */
  short_of_standard_day: number;
  /** Days under 4 hours, which are not creditable on any reading. */
  below_minimum: number;
  /** Distinct stand-by days, reported but not credited toward USCG service. */
  standby: number;
  /** Distinct yard days, reported but not credited toward USCG service. */
  yard: number;
  /** Distinct service-in-port days, reported but not credited. */
  port: number;
}

interface USCGEntry {
  start_time: Date | string;
  end_time: Date | string | null;
  service_type?: string | null;
  vessel?: {
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
 * Calendar dates an entry can credit, capped so a short period that happens to
 * straddle midnight cannot yield more days than its hours support. A six-hour
 * watch from 2100 to 0300 touches two dates but is one day's work at most.
 */
function creditableDates(entry: USCGEntry, hours: number): string[] {
  const start = entry.start_time instanceof Date ? entry.start_time : new Date(entry.start_time);
  const end = entry.end_time == null
    ? start
    : (entry.end_time instanceof Date ? entry.end_time : new Date(entry.end_time));
  const dates = calendarDaysCovered(start, end);
  const cap = Math.max(1, Math.ceil(hours / USCG_STANDARD_HOURS_PER_DAY));
  return dates.slice(0, cap);
}

/**
 * USCG creditable sea service across many confirmed entries, deduplicated by
 * calendar date so one date is never counted twice.
 */
export function uscgCreditableDays(entries: USCGEntry[]): USCGServiceBreakdown {
  const full = new Set<string>();
  const provisional = new Set<string>();
  const shortOfStandard = new Set<string>();
  const belowMinimum = new Set<string>();
  const standbyDays = new Set<string>();
  const yardDays = new Set<string>();
  const portDays = new Set<string>();

  for (const e of entries) {
    const type = e.service_type || 'actual_sea_service';
    const start = e.start_time instanceof Date ? e.start_time : new Date(e.start_time);
    const end = e.end_time == null
      ? start
      : (e.end_time instanceof Date ? e.end_time : new Date(e.end_time));
    const hours = calculateDurationHours(start, end);
    const dates = creditableDates(e, hours);

    if (type === 'standby_service') {
      for (const d of dates) standbyDays.add(d);
      continue;
    }
    if (type === 'yard_service') {
      for (const d of dates) yardDays.add(d);
      continue;
    }
    if (type === 'service_in_port') {
      for (const d of dates) portDays.add(d);
      continue;
    }

    // actual_sea_service, watchkeeping_service and unknown types are sea service
    if (hours < USCG_MINIMUM_HOURS_PER_DAY) {
      for (const d of dates) belowMinimum.add(d);
      continue;
    }
    if (hours >= USCG_STANDARD_HOURS_PER_DAY) {
      for (const d of dates) full.add(d);
      continue;
    }

    const tonnage = creditableTonnage(e);
    const bucket =
      tonnage != null && tonnage < USCG_SMALL_VESSEL_GRT ? provisional : shortOfStandard;
    for (const d of dates) bucket.add(d);
  }

  // A date credited at a better classification cannot also count at a worse one.
  const order = [full, provisional, shortOfStandard, belowMinimum, standbyDays, yardDays, portDays];
  for (let i = 0; i < order.length; i++) {
    for (const d of order[i]) {
      for (let j = i + 1; j < order.length; j++) order[j].delete(d);
    }
  }

  return {
    creditable: full.size,
    provisional: provisional.size,
    short_of_standard_day: shortOfStandard.size,
    below_minimum: belowMinimum.size,
    standby: standbyDays.size,
    yard: yardDays.size,
    port: portDays.size,
  };
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

/** Calendar day string (YYYY-MM-DD) from a Date, using local time. */
export function getCalendarDay(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
