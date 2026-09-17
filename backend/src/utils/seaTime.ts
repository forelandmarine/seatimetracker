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

interface USCGEntry {
  start_time: Date | string;
  end_time: Date | string | null;
  service_type?: string | null;
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
  const awaitingTonnage = new Set<string>();
  const awaitingVessels = new Set<string>();
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

    // Between 4 and 8 hours the tonnage decides the outcome, so an unrecorded
    // tonnage is a question for the user rather than something to guess at.
    const tonnage = creditableTonnage(e);
    if (tonnage == null) {
      for (const d of dates) awaitingTonnage.add(d);
      const name = e.vessel?.vessel_name;
      if (name) awaitingVessels.add(name);
      continue;
    }
    const bucket = tonnage < USCG_SMALL_VESSEL_GRT ? provisional : shortOfStandard;
    for (const d of dates) bucket.add(d);
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

interface AMSAEntry {
  start_time: Date | string;
  end_time: Date | string | null;
  service_type?: string | null;
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
  const type = e.service_type || 'actual_sea_service';
  if (type === 'standby_service' || type === 'yard_service' || type === 'service_in_port') {
    return true;
  }
  return e.is_stationary === true;
}

export function amsaCreditableDays(entries: AMSAEntry[]): AMSAServiceBreakdown {
  // Hours per calendar date, so the 8-hour ceiling for a 24-hour period can be
  // applied before anything is turned into days.
  const underwayHours = new Map<string, number>();
  const notUnderwayHours = new Map<string, number>();
  let bridgeHours = 0;
  let engineHours = 0;

  for (const e of entries) {
    const start = e.start_time instanceof Date ? e.start_time : new Date(e.start_time);
    const end = e.end_time == null
      ? start
      : (e.end_time instanceof Date ? e.end_time : new Date(e.end_time));
    const hours = calculateDurationHours(start, end);
    if (hours <= 0) continue;

    bridgeHours += toHours(e.bridge_watch_hours);
    engineHours += toHours(e.engine_watch_hours);

    // Spread the period's hours evenly across the dates it touches, then let
    // the per-date ceiling below do the capping. An entry that runs for days
    // cannot credit more than one day per date whichever way it is split.
    const dates = calendarDaysCovered(start, end);
    if (dates.length === 0) continue;
    const perDate = hours / dates.length;
    const bucket = isNotUnderway(e) ? notUnderwayHours : underwayHours;
    for (const d of dates) bucket.set(d, (bucket.get(d) ?? 0) + perDate);
  }

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
  const underway = Math.floor(underwayTotal / AMSA_STANDARD_HOURS_PER_DAY);
  const notUnderway = Math.floor(notUnderwayTotal / AMSA_STANDARD_HOURS_PER_DAY);
  const partDayHours =
    (underwayTotal % AMSA_STANDARD_HOURS_PER_DAY) + (notUnderwayTotal % AMSA_STANDARD_HOURS_PER_DAY);

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

interface MNZEntry {
  start_time: Date | string;
  end_time: Date | string | null;
  service_type?: string | null;
  bridge_watch_hours?: string | number | null;
  engine_watch_hours?: string | number | null;
  watchkeeping_hours?: string | number | null;
}

export function mnzCreditableDays(entries: MNZEntry[], now: Date = new Date()): MNZServiceBreakdown {
  const windowStart = new Date(now);
  windowStart.setUTCFullYear(windowStart.getUTCFullYear() - MNZ_SERVICE_WINDOW_YEARS);

  const actualDays = new Set<string>();
  const standbyDays = new Set<string>();
  const yardDays = new Set<string>();
  const portDays = new Set<string>();
  const outsideDays = new Set<string>();
  let watchHours = 0;
  let totalHours = 0;

  for (const e of entries) {
    const start = e.start_time instanceof Date ? e.start_time : new Date(e.start_time);
    const end = e.end_time == null
      ? start
      : (e.end_time instanceof Date ? e.end_time : new Date(e.end_time));
    if (calculateDurationHours(start, end) < 4) continue;

    const dates = calendarDaysCovered(start, end);
    if (end.getTime() < windowStart.getTime()) {
      for (const d of dates) outsideDays.add(d);
      continue;
    }

    totalHours += calculateDurationHours(start, end);
    watchHours +=
      toHours(e.watchkeeping_hours) || toHours(e.bridge_watch_hours) + toHours(e.engine_watch_hours);

    const type = e.service_type || 'actual_sea_service';
    const bucket =
      type === 'standby_service' ? standbyDays :
      type === 'yard_service' ? yardDays :
      type === 'service_in_port' ? portDays :
      actualDays;
    for (const d of dates) bucket.add(d);
  }

  for (const d of actualDays) { standbyDays.delete(d); yardDays.delete(d); portDays.delete(d); outsideDays.delete(d); }
  for (const d of standbyDays) { yardDays.delete(d); portDays.delete(d); outsideDays.delete(d); }
  for (const d of yardDays) { portDays.delete(d); outsideDays.delete(d); }
  for (const d of portDays) { outsideDays.delete(d); }

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
