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
  dExtensions?: GeoJSONFeatureCollection; // cat-d-extensions.geojson (outer seasonal bands)
  overrides?: GeoJSONFeatureCollection; // area-overrides.geojson + harbour-overrides.geojson (hand-drawn MSN 1837 areas, checked first)
}

/** MSN 1837 Cat D outer bands are seasonal. Default when unspecified: summer (max extent). */
export type Season = 'summer' | 'winter';
export interface ClassifyOptions {
  /** Explicit season. If omitted and `date` is given, it is derived from the date. */
  season?: Season;
  /** The fix's date/time. Season is derived from it per MSN 1837 (see seasonForDate). */
  date?: Date;
}

/**
 * MSN 1837 seasonal period (Amendment 3): **summer = April to October inclusive**,
 * **winter = November to March inclusive**. Use this to pick the season for an AIS fix
 * from its timestamp rather than assuming one.
 */
export function seasonForDate(d: Date): Season {
  const m = d.getUTCMonth() + 1; // 1 to 12
  return m >= 4 && m <= 10 ? 'summer' : 'winter';
}

/** Resolve the season to use: explicit season wins, else derived from date, else summer. */
export function resolveSeason(opts?: ClassifyOptions): Season {
  if (opts?.season) return opts.season;
  if (opts?.date) return seasonForDate(opts.date);
  return 'summer'; // default: fuller Cat D extent
}

/** About 200 m. A fix this close to a water body is taken to be in it (harbour edges). */
export const SNAP_NM = 200 / 1852;
/** A fix at sea is only snapped into categorised water when it is also this close to land. */
export const HARBOUR_EDGE_LAND_NM = 400 / 1852;
/** Sea within this distance of the UK's WFD coastal waters counts as UK waters (about the territorial sea). */
export const UK_WATERS_NM = 12;

export interface PointClassification {
  areaCategory: CategorisedWater | null; // MSN 1837 A to D, or null if not categorised
  /** Tidal waters. Only set inside UK waters; null outside the UK or when not placed. */
  isTidal: boolean | null;
  /** Outside categorised waters, in the water ("sea" under MSN 1837). */
  atSea: boolean;
  /** In UK waters (the categorised, WFD or near-shore layers), so area and tidal values apply. */
  inUk: boolean;
  /** Placed by snapping to a water body within about 200 m. */
  snapped: boolean;
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

// Split the seasonal features by season into their own layers.
function seasonLayer(fc: GeoJSONFeatureCollection | undefined, want: string): PolygonLayer {
  const feats = (fc?.features ?? []).filter((f) => (f.properties.season ?? 'all') === want);
  return new PolygonLayer({ type: 'FeatureCollection', features: feats });
}

const asCategory = (v: unknown, fallback: CategorisedWater | null = null): CategorisedWater | null =>
  v === 'A' || v === 'B' || v === 'C' || v === 'D' ? v : fallback;

/** An override with category 'none' marks water that MSN 1837 does not categorise (it masks the layers below). */
const NOT_CATEGORISED = 'none';

/** Approximate area (km2) of a Polygon or MultiPolygon, for picking the smallest override. */
function areaKm2(geometry: GeoJSONFeatureCollection['features'][number]['geometry']): number {
  const polys =
    geometry.type === 'Polygon'
      ? [geometry.coordinates as number[][][]]
      : geometry.type === 'MultiPolygon'
        ? (geometry.coordinates as number[][][][])
        : [];
  let total = 0;
  for (const rings of polys) {
    rings.forEach((ring, i) => {
      let a = 0;
      for (let k = 0; k < ring.length - 1; k++) a += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1];
      const kx = 111.32 * Math.cos(((ring[0]?.[1] ?? 0) * Math.PI) / 180);
      total += (i === 0 ? 1 : -1) * Math.abs(a / 2) * kx * 110.57;
    });
  }
  return total;
}

/** Overrides with their area attached (built ones carry area_km2; older hand-drawn ones get it here). */
function withAreas(fc: GeoJSONFeatureCollection | undefined): GeoJSONFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: (fc?.features ?? []).map((f) => ({
      ...f,
      properties: { ...f.properties, area_km2: typeof f.properties.area_km2 === 'number' ? f.properties.area_km2 : areaKm2(f.geometry) },
    })),
  };
}

export class AreaClassifier {
  private catLayer: PolygonLayer;
  private tidalLayer: PolygonLayer;
  private landLayer: PolygonLayer;
  private dAll: PolygonLayer;
  private dSummer: PolygonLayer;
  private dWinter: PolygonLayer;
  private oLayer: PolygonLayer;
  /** WFD bodies an override marks as wholly not categorised (left out of distance-to-categorised). */
  private maskedWfd: Set<unknown>;

  constructor(layers: ClassifierLayers) {
    this.catLayer = new PolygonLayer(layers.categorised);
    this.tidalLayer = new PolygonLayer(layers.tidal);
    this.landLayer = new PolygonLayer(layers.land);
    this.dAll = seasonLayer(layers.dExtensions, 'all');
    this.dSummer = seasonLayer(layers.dExtensions, 'summer');
    this.dWinter = seasonLayer(layers.dExtensions, 'winter');
    this.oLayer = new PolygonLayer(withAreas(layers.overrides));
    this.maskedWfd = new Set((layers.overrides?.features ?? []).map((f) => f.properties.masks_wfd).filter(Boolean));
  }

  /** A categorised-layer feature applies in this season (features with no season apply all year). */
  private static inSeason(season: Season) {
    return (props: Record<string, unknown>) => {
      const s = props.season;
      return s == null || s === 'all' || s === season;
    };
  }

  /**
   * The in-season hand-drawn override containing the point. Where several overlap
   * (a dock inside a harbour inside an estuary) the smallest wins, so the most
   * specific MSN 1837 limit applies.
   */
  private overrideAt(p: LatLon, season: Season): Record<string, unknown> | null {
    const hits = this.oLayer.findAllContaining(ll(p), AreaClassifier.inSeason(season));
    if (hits.length <= 1) return hits[0] ?? null;
    return hits.reduce((a, b) => ((b.area_km2 as number) < (a.area_km2 as number) ? b : a));
  }

  /**
   * MSN 1837 category for a point, or null if outside the classified waters.
   * Precedence: hand-drawn overrides in season (smallest first; category 'none'
   * means not categorised and stops here), then the WFD inner zones in season,
   * then the outer seasonal bands (default summer).
   */
  categorisedWatersForPoint(p: LatLon, opts?: ClassifyOptions): CategorisedWater | null {
    const pt = ll(p);
    const season = resolveSeason(opts);
    const o = this.overrideAt(p, season);
    if (o) return asCategory(o.category);
    const hit = this.catLayer.findContainingWhere(pt, AreaClassifier.inSeason(season));
    if (hit) return asCategory(hit.category);
    const band = this.dAll.findContaining(pt) ?? (season === 'winter' ? this.dWinter : this.dSummer).findContaining(pt);
    if (band) return asCategory(band.category, 'D');
    return null;
  }

  /**
   * A hand-drawn override marked tidal: false (the non-tidal Thames above
   * Teddington Lock) that contains, or lies within maxNm of, the point.
   */
  private nonTidalOverride(p: LatLon, maxNm = 0, season: Season = 'summer'): boolean {
    const pt = ll(p);
    const nonTidal = (props: Record<string, unknown>) => props.tidal === false;
    if (maxNm === 0) {
      const hit = this.overrideAt(p, season);
      return hit != null && nonTidal(hit);
    }
    const inSeason = AreaClassifier.inSeason(season);
    return this.oLayer.findNearestWithin(pt, maxNm, (pr) => nonTidal(pr) && inSeason(pr)) !== null;
  }

  /**
   * Nearest categorised water within maxNm (in season), for snapping harbour-edge
   * fixes. Inside a 'not categorised' override only the overrides are looked at,
   * so the masked layers below cannot pull the fix back in.
   */
  private nearestCategorised(p: LatLon, maxNm: number, season: Season): CategorisedWater | null {
    const pt = ll(p);
    const accept = AreaClassifier.inSeason(season);
    const masked = this.overrideAt(p, season)?.category === NOT_CATEGORISED;
    let best: { cat: CategorisedWater | null; d: number } | null = null;
    const consider = (layer: PolygonLayer, filter: (props: Record<string, unknown>) => boolean) => {
      const n = layer.findNearestWithin(pt, maxNm, filter);
      if (n && (!best || n.distanceNm < best.d)) best = { cat: asCategory(n.props.category), d: n.distanceNm };
    };
    consider(this.oLayer, (pr) => accept(pr) && pr.category !== NOT_CATEGORISED);
    if (!masked) consider(this.catLayer, accept);
    return (best as { cat: CategorisedWater | null; d: number } | null)?.cat ?? null;
  }

  /** In UK waters: inside, or within UK_WATERS_NM of, the UK WFD transitional and coastal waters. */
  isInUkWaters(p: LatLon): boolean {
    const pt = ll(p);
    if (this.tidalLayer.contains(pt) || this.catLayer.contains(pt)) return true;
    return this.tidalLayer.findNearestWithin(pt, UK_WATERS_NM) !== null;
  }

  /** Tidal test for a point (UK only): see classifyPoint. */
  isTidalForPoint(p: LatLon, opts?: ClassifyOptions): boolean | null {
    return this.classifyPoint(p, opts).isTidal;
  }

  /**
   * Distance from the nearest coastline (nm). Measured against the runtime land
   * layer, which is medium-res (MHW) around GB, so the <=5 nm limited-coastal
   * band is judged against the true shore.
   */
  distanceFromLandNm(p: LatLon): number {
    return this.landLayer.nearestDistanceNm(ll(p));
  }

  /**
   * Distance to the edge of the nearest categorised water (0 inside it). Used as
   * the seaward edge of categorised waters and as the safe-haven distance, so it
   * counts the WFD estuaries and the hand-drawn coastal harbours, but not the
   * inland canals, lochs and lakes (marked non-tidal) or the 'none' masks.
   */
  distanceFromCategorisedNm(p: LatLon, opts?: ClassifyOptions): number {
    if (this.categorisedWatersForPoint(p, opts)) return 0;
    const pt = ll(p);
    const inSeason = AreaClassifier.inSeason(resolveSeason(opts));
    const harbour = this.oLayer.nearestDistanceNm(pt, (pr) => pr.category !== NOT_CATEGORISED && pr.tidal !== false && inSeason(pr));
    const wfd = this.catLayer.nearestDistanceNm(pt, (pr) => !this.maskedWfd.has(pr.wfd_water_body) && inSeason(pr));
    return Math.min(wfd, harbour);
  }

  /**
   * Classify one fix.
   * - In categorised waters: that category, tidal.
   * - In a WFD transitional or coastal water body: at sea (not categorised), tidal.
   * - Seaward of the coastline: at sea. Tidal only inside UK waters. A fix within
   *   about 200 m of categorised water and close to land is snapped into it
   *   (harbour edges the simplified WFD outlines miss).
   * - On land per the coastline: snapped to categorised water, a WFD water body or
   *   the sea within about 200 m; otherwise not classified (both null). It is never
   *   reported as land, since the vessel was afloat.
   */
  classifyPoint(p: LatLon, opts?: ClassifyOptions): PointClassification {
    const pt = ll(p);
    const season = resolveSeason(opts);
    const cat = this.categorisedWatersForPoint(p, opts);
    const onLand = this.landLayer.contains(pt);
    const base = { onLand, snapped: false };
    if (cat) {
      if (this.nonTidalOverride(p, 0, season)) {
        return { ...base, areaCategory: cat, isTidal: false, atSea: false, inUk: true, basis: `Categorised water (MSN 1837 Cat ${cat}, non-tidal)` };
      }
      return { ...base, areaCategory: cat, isTidal: true, atSea: false, inUk: true, basis: `Categorised water (MSN 1837 Cat ${cat}, ${season})` };
    }
    if (this.tidalLayer.contains(pt)) {
      return { ...base, areaCategory: null, isTidal: true, atSea: true, inUk: true, basis: 'WFD transitional or coastal water body (tidal, not categorised)' };
    }
    if (!onLand) {
      const near = this.nearestCategorised(p, SNAP_NM, season);
      if (near && this.landLayer.findNearestWithin(pt, HARBOUR_EDGE_LAND_NM, (pr) => pr.res !== 'coarse')) {
        return { ...base, areaCategory: near, isTidal: true, atSea: false, inUk: true, snapped: true, basis: `Harbour edge, snapped to categorised water (Cat ${near})` };
      }
      const inUk = this.isInUkWaters(p);
      return { ...base, areaCategory: null, isTidal: inUk ? true : null, atSea: true, inUk, basis: inUk ? 'At sea (UK waters)' : 'At sea (outside UK waters)' };
    }
    const near = this.nearestCategorised(p, SNAP_NM, season);
    if (near) {
      const tidal = !this.nonTidalOverride(p, SNAP_NM, season);
      return { ...base, areaCategory: near, isTidal: tidal, atSea: false, inUk: true, snapped: true, basis: `Near the shore, snapped to categorised water (Cat ${near}${tidal ? '' : ', non-tidal'})` };
    }
    if (this.tidalLayer.findNearestWithin(pt, SNAP_NM)) {
      return { ...base, areaCategory: null, isTidal: true, atSea: true, inUk: true, snapped: true, basis: 'Near the shore, snapped to a WFD water body (tidal)' };
    }
    const shore = this.landLayer.findNearestWithin(pt, SNAP_NM);
    if (shore) {
      const inUk = shore.props.res !== 'coarse' || this.isInUkWaters(p);
      return { ...base, areaCategory: null, isTidal: inUk ? true : null, atSea: true, inUk, snapped: true, basis: 'Near the shore, snapped to the sea' };
    }
    return { ...base, areaCategory: null, isTidal: null, atSea: false, inUk: false, basis: 'Not classified (inland water or a dock the coastline does not show)' };
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
      const t = this.isTidalForPoint(p, opts);
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
