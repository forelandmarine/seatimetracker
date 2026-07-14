/**
 * Area classification helper (CTV / workboat expansion) — the differentiator.
 *
 * Classifies a day's AIS track into the area categories that RYA, BML and the
 * MCA CoC routes gate on. This is what AIS can evidence and a spreadsheet cannot.
 *
 * STATUS: distance-based classification (departure distance, safe-haven bands) is
 * implemented here from coordinates. Two classifications need EXTERNAL DATASETS
 * before they can be computed and are stubbed with clear TODOs:
 *   - Categorised waters A–D  → requires the MSN 1837 categorised-waters polygons (GeoJSON)
 *   - Tidal vs non-tidal      → requires a UK tidal-waters boundary dataset (GeoJSON)
 * Do not report A–D or tidal as evidenced until those datasets are wired in.
 */

export type SafeHavenBand = 'within_60nm' | 'within_150nm' | 'beyond_150nm';
export type CategorisedWater = 'A' | 'B' | 'C' | 'D';

export interface LatLon {
  lat: number;
  lon: number;
}

export interface DayAreaClassification {
  maxDistanceFromDepartureNm: number | null;
  isLimitedCoastal: boolean | null; // ≤5nm from land AND ≤15nm from departure (MSN 1853)
  safeHavenBand: SafeHavenBand | null;
  categorisedWaters: CategorisedWater | null; // needs MSN 1837 polygons — null until wired
  isTidal: boolean | null; // needs tidal dataset — null until wired
}

const R_NM = 3440.065; // Earth radius in nautical miles

/** Great-circle distance in nautical miles between two points (haversine). */
export function haversineNm(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Max distance any track point reached from the departure point. */
export function maxDistanceFromDeparture(track: LatLon[], departure: LatLon): number | null {
  if (!track.length) return null;
  return track.reduce((max, p) => Math.max(max, haversineNm(p, departure)), 0);
}

/**
 * Safe-haven band from a supplied distance-from-nearest-safe-haven (nm).
 * Distance-from-land / nearest-safe-haven must be computed against a coastline
 * dataset upstream; this only bands the number.
 */
export function safeHavenBand(distanceFromSafeHavenNm: number | null): SafeHavenBand | null {
  if (distanceFromSafeHavenNm === null) return null;
  if (distanceFromSafeHavenNm <= 60) return 'within_60nm';
  if (distanceFromSafeHavenNm <= 150) return 'within_150nm';
  return 'beyond_150nm';
}

/**
 * Limited coastal per MSN 1853: not more than 5nm from land and not more than
 * 15nm from the point of departure. Requires distance-from-land upstream.
 */
export function isLimitedCoastal(
  maxDistFromDepartureNm: number | null,
  maxDistFromLandNm: number | null,
): boolean | null {
  if (maxDistFromDepartureNm === null || maxDistFromLandNm === null) return null;
  return maxDistFromLandNm <= 5 && maxDistFromDepartureNm <= 15;
}

// TODO(dataset): load MSN 1837 categorised-waters polygons (GeoJSON) and
// return the category a point/track falls within. Until then, null.
export function categorisedWaters(_track: LatLon[]): CategorisedWater | null {
  return null;
}

// TODO(dataset): load UK tidal-waters boundary (GeoJSON) and test the track.
// Needed for RYA (tidal % of miles/days) and BML (tidal/non-tidal split). Null until wired.
export function isTidal(_track: LatLon[]): boolean | null {
  return null;
}

export interface ClassifyDayInput {
  track: LatLon[];
  departure: LatLon;
  distanceFromSafeHavenNm?: number | null;
  maxDistFromLandNm?: number | null;
}

/** Compose the per-day classification the pathway engine consumes. */
export function classifyDay(input: ClassifyDayInput): DayAreaClassification {
  const maxDep = maxDistanceFromDeparture(input.track, input.departure);
  return {
    maxDistanceFromDepartureNm: maxDep,
    isLimitedCoastal: isLimitedCoastal(maxDep, input.maxDistFromLandNm ?? null),
    safeHavenBand: safeHavenBand(input.distanceFromSafeHavenNm ?? null),
    categorisedWaters: categorisedWaters(input.track),
    isTidal: isTidal(input.track),
  };
}
