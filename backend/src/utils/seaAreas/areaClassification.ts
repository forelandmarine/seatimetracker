/**
 * areaClassification.ts — CTV / workboat sea-area & tidal classifier.
 *
 * Drop-in SUPERSET of the SeaTime backend helper of the same name: it keeps the
 * existing distance-based exports and FILLS THE TWO STUBS the backend left open —
 *   - categorised waters (MSN 1837 A–D)  -> from data/categorised-waters.geojson
 *   - tidal vs non-tidal                 -> from data/tidal-waters.england.geojson
 *                                           + data/uk-land.geojson (offshore/at-sea)
 * It also derives distance-from-land from the coastline layer, which un-stubs the
 * `isLimitedCoastal` input the backend previously required from upstream.
 *
 * Runtime dependency-free. Geometry lives in src/geo.ts. Load the layers with
 * createClassifierFromFiles() (Node) or `new AreaClassifier(layers)` (bring your
 * own parsed GeoJSON — e.g. bundled JSON imports in the SeaTime backend).
 */
import {
  PolygonLayer,
  type GeoJSONFeatureCollection,
  type LonLat,
} from './geo.js';

export type CategorisedWater = 'A' | 'B' | 'C' | 'D';
export type SafeHavenBand = 'within_60nm' | 'within_150nm' | 'beyond_150nm';

export interface LatLon {
  lat: number;
  lon: number;
}

// ---------------------------------------------------------------------------
// Pure distance helpers (kept identical in behaviour to the SeaTime original).
// ---------------------------------------------------------------------------
const R_NM = 3440.065; // Earth radius in nautical miles

export function haversineNm(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function maxDistanceFromDeparture(track: LatLon[], departure: LatLon): number | null {
  if (!track.length) return null;
  return track.reduce((max, p) => Math.max(max, haversineNm(p, departure)), 0);
}

export function safeHavenBand(distanceFromSafeHavenNm: number | null): SafeHavenBand | null {
  if (distanceFromSafeHavenNm === null) return null;
  if (distanceFromSafeHavenNm <= 60) return 'within_60nm';
  if (distanceFromSafeHavenNm <= 150) return 'within_150nm';
  return 'beyond_150nm';
}

export function isLimitedCoastal(
  maxDistFromDepartureNm: number | null,
  maxDistFromLandNm: number | null,
): boolean | null {
  if (maxDistFromDepartureNm === null || maxDistFromLandNm === null) return null;
  return maxDistFromLandNm <= 5 && maxDistFromDepartureNm <= 15;
}

// ---------------------------------------------------------------------------
// The classifier.
// ---------------------------------------------------------------------------
export interface ClassifierLayers {
  categorised: GeoJSONFeatureCollection; // categorised-waters.geojson (WFD inner zones)
  tidal: GeoJSONFeatureCollection; // tidal-waters.geojson
  land: GeoJSONFeatureCollection; // uk-land.geojson
  dExtensions?: GeoJSONFeatureCollection; // cat-d-extensions.geojson (outer Cat D bands)
}

/** MSN 1837 Cat D outer bands are seasonal. Default when unspecified: summer (max extent). */
export type Season = 'summer' | 'winter';
export interface ClassifyOptions {
  /** Explicit season. If omitted and `date` is given, it is derived from the date. */
  season?: Season;
  /** The fix's date/time — season is derived from it per MSN 1837 (see seasonForDate). */
  date?: Date;
}

/**
 * MSN 1837 seasonal period (Amendment 3): **summer = April–October inclusive**,
 * **winter = November–March inclusive**. Use this to pick the season for an AIS fix
 * from its timestamp rather than assuming one.
 */
export function seasonForDate(d: Date): Season {
  const m = d.getUTCMonth() + 1; // 1–12
  return m >= 4 && m <= 10 ? 'summer' : 'winter';
}

/** Resolve the season to use: explicit season wins, else derived from date, else summer. */
export function resolveSeason(opts?: ClassifyOptions): Season {
  if (opts?.season) return opts.season;
  if (opts?.date) return seasonForDate(opts.date);
  return 'summer'; // default: fuller Cat D extent
}

export interface PointClassification {
  areaCategory: CategorisedWater | null; // MSN 1837 A–D, or null if not classified
  isTidal: boolean | null;
  onLand: boolean; // per the coarse coastline (offshore test)
  basis: string; // human-readable reason for the classification
}

export interface DayAreaClassification {
  maxDistanceFromDepartureNm: number | null;
  maxDistanceFromLandNm: number | null;
  isLimitedCoastal: boolean | null;
  safeHavenBand: SafeHavenBand | null;
  categorisedWaters: CategorisedWater | null;
  isTidal: boolean | null;
}

/** Full per-track breakdown (for the qualifying-service engine). */
export interface TrackSummary {
  points: number;
  categoryCounts: Record<CategorisedWater, number>;
  mostExposedCategory: CategorisedWater | null; // D > C > B > A
  predominantCategory: CategorisedWater | null; // most points
  tidalPoints: number;
  nonTidalPoints: number;
  unknownTidalPoints: number;
  season: Season;
}

const ll = (p: LatLon): LonLat => ({ lon: p.lon, lat: p.lat });

// Split the D-extension features by season into their own layers.
function seasonLayer(fc: GeoJSONFeatureCollection | undefined, want: string): PolygonLayer {
  const feats = (fc?.features ?? []).filter((f) => f.properties.season === want);
  return new PolygonLayer({ type: 'FeatureCollection', features: feats });
}

export class AreaClassifier {
  private catLayer: PolygonLayer;
  private tidalLayer: PolygonLayer;
  private landLayer: PolygonLayer;
  private dAll: PolygonLayer;
  private dSummer: PolygonLayer;
  private dWinter: PolygonLayer;

  constructor(layers: ClassifierLayers) {
    this.catLayer = new PolygonLayer(layers.categorised);
    this.tidalLayer = new PolygonLayer(layers.tidal);
    this.landLayer = new PolygonLayer(layers.land);
    this.dAll = seasonLayer(layers.dExtensions, 'all');
    this.dSummer = seasonLayer(layers.dExtensions, 'summer');
    this.dWinter = seasonLayer(layers.dExtensions, 'winter');
  }

  /**
   * MSN 1837 category for a point, or null if outside the classified waters.
   * Precedence: precise inner WFD-derived zones FIRST, then the outer Cat D bands
   * (all-year, then the season's band — default summer / max extent).
   */
  categorisedWatersForPoint(p: LatLon, opts?: ClassifyOptions): CategorisedWater | null {
    const hit = this.catLayer.findContaining(ll(p));
    if (hit) return (hit.category as CategorisedWater) ?? null;
    const pt = ll(p);
    if (this.dAll.contains(pt)) return 'D';
    const seasonal = resolveSeason(opts) === 'winter' ? this.dWinter : this.dSummer;
    if (seasonal.contains(pt)) return 'D';
    return null;
  }

  /**
   * Tidal test for a point:
   *   in a categorised (transitional) estuary   -> true
   *   in a WFD transitional/coastal water body   -> true
   *   at sea (not on the landmass)               -> true  (covers offshore + all UK coasts)
   *   on land per the coarse coastline           -> null  (ambiguous: inland water not resolvable)
   */
  isTidalForPoint(p: LatLon): boolean | null {
    if (this.catLayer.contains(ll(p))) return true;
    if (this.tidalLayer.contains(ll(p))) return true;
    if (!this.landLayer.contains(ll(p))) return true; // open sea
    return null; // on land — could be an inland non-tidal river/lake; can't assert
  }

  /**
   * Distance from the nearest coastline (nm). Measured against the runtime land
   * layer, which is medium-res (MHW) around GB — so the <=5 nm limited-coastal
   * band is judged against the true shore, not a ~1 km-generalised coastline.
   * Uses PolygonLayer's bbox-pruned nearest-distance, so the finer coastline does
   * not slow this down.
   */
  distanceFromLandNm(p: LatLon): number {
    return this.landLayer.nearestDistanceNm(ll(p));
  }

  classifyPoint(p: LatLon, opts?: ClassifyOptions): PointClassification {
    const cat = this.categorisedWatersForPoint(p, opts);
    const onLand = this.landLayer.contains(ll(p));
    let isTidal: boolean | null;
    let basis: string;
    if (cat) {
      isTidal = true;
      const season = resolveSeason(opts);
      const outer = !this.catLayer.contains(ll(p));
      basis = outer
        ? `Categorised water — MSN 1837 Cat ${cat} outer band (${season} limit)`
        : `Categorised water (MSN 1837 Cat ${cat})`;
    } else if (this.tidalLayer.contains(ll(p))) {
      isTidal = true;
      basis = 'WFD transitional/coastal water body (tidal)';
    } else if (!onLand) {
      isTidal = true;
      basis = 'At sea (seaward of the coastline)';
    } else {
      isTidal = null;
      basis = 'On land per coarse coastline — not classified (possible inland water)';
    }
    return { areaCategory: cat, isTidal, onLand, basis };
  }

  // -------- Track-level --------

  /**
   * Most-EXPOSED categorised water the track reached (D > C > B > A), or null if none.
   *
   * Changed from "modal" (most common) to "most exposed": qualifying-service rules care
   * whether a day *reached* Cat D, not which category appeared most often. For the full
   * breakdown (per-category counts, tidal split) use `summariseTrack`.
   */
  categorisedWaters(track: LatLon[], opts?: ClassifyOptions): CategorisedWater | null {
    return this.summariseTrack(track, opts).mostExposedCategory;
  }

  /** Per-track breakdown for the qualifying-service engine. */
  summariseTrack(track: LatLon[], opts?: ClassifyOptions): TrackSummary {
    const categoryCounts: Record<CategorisedWater, number> = { A: 0, B: 0, C: 0, D: 0 };
    let tidalPoints = 0;
    let nonTidalPoints = 0;
    let unknownTidalPoints = 0;
    for (const p of track) {
      const c = this.categorisedWatersForPoint(p, opts);
      if (c) categoryCounts[c]++;
      const t = this.isTidalForPoint(p);
      if (t === true) tidalPoints++;
      else if (t === false) nonTidalPoints++;
      else unknownTidalPoints++;
    }
    // Exposure order: D (most exposed) down to A. Predominant = the category with the
    // most points (ties broken toward the more exposed).
    const order: CategorisedWater[] = ['D', 'C', 'B', 'A'];
    const mostExposedCategory = order.find((c) => categoryCounts[c] > 0) ?? null;
    let predominantCategory: CategorisedWater | null = null;
    let bestN = 0;
    for (const c of order) {
      if (categoryCounts[c] > bestN) {
        bestN = categoryCounts[c];
        predominantCategory = c;
      }
    }
    return {
      points: track.length,
      categoryCounts,
      mostExposedCategory,
      predominantCategory,
      tidalPoints,
      nonTidalPoints,
      unknownTidalPoints,
      season: resolveSeason(opts),
    };
  }

  /** True if any track point is in tidal water; null if none resolvable. */
  isTidal(track: LatLon[]): boolean | null {
    let sawTidal = false;
    let sawAny = false;
    for (const p of track) {
      const t = this.isTidalForPoint(p);
      if (t === true) sawTidal = true;
      if (t !== null) sawAny = true;
    }
    if (sawTidal) return true;
    return sawAny ? false : null;
  }

  /** Compose the per-day classification the pathway engine consumes. */
  classifyDay(input: {
    track: LatLon[];
    departure: LatLon;
    distanceFromSafeHavenNm?: number | null;
    season?: Season;
    date?: Date;
  }): DayAreaClassification {
    const opts: ClassifyOptions = { season: input.season, date: input.date };
    const maxDep = maxDistanceFromDeparture(input.track, input.departure);
    const maxLand = input.track.length
      ? input.track.reduce((m, p) => Math.max(m, this.distanceFromLandNm(p)), 0)
      : null;
    return {
      maxDistanceFromDepartureNm: maxDep,
      maxDistanceFromLandNm: maxLand,
      isLimitedCoastal: isLimitedCoastal(maxDep, maxLand),
      safeHavenBand: safeHavenBand(input.distanceFromSafeHavenNm ?? null),
      categorisedWaters: this.categorisedWaters(input.track, opts),
      isTidal: this.isTidal(input.track),
    };
  }
}
