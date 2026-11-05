/**
 * Sun altitude from position and time (the low-precision solar position in the
 * Astronomical Almanac, good to about 0.01 degrees, so sunset and sunrise to
 * about a minute away from the poles).
 */

const RAD = Math.PI / 180;

/** Sun altitude in degrees above the horizon (negative below). */
export function sunAltitudeDeg(lat: number, lon: number, at: Date | number): number {
  const ms = typeof at === 'number' ? at : at.getTime();
  const d = ms / 86_400_000 + 2440587.5 - 2451545.0; // days from J2000.0
  const g = (357.529 + 0.98560028 * d) * RAD; // mean anomaly
  const q = 280.459 + 0.98564736 * d; // mean longitude, degrees
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // ecliptic longitude
  const e = (23.439 - 0.00000036 * d) * RAD; // obliquity
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) * 15; // degrees
  const h = (gmst + lon) * RAD - ra; // local hour angle
  const sinAlt = Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(h);
  return Math.asin(sinAlt) / RAD;
}

/** Sunset and sunrise are when the sun's upper edge meets the horizon, allowing for refraction. */
export const SUNSET_ALTITUDE_DEG = -0.833;

export const isNight = (lat: number, lon: number, at: Date | number) =>
  sunAltitudeDeg(lat, lon, at) < SUNSET_ALTITUDE_DEG;
