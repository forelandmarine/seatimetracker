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
