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
