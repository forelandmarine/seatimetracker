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

/** 1 sea day if duration >= 4 hours, else 0 (MCA 4-hour rule). */
export function calculateSeaDays(durationHours: number): number {
  return durationHours >= 4 ? 1 : 0;
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
