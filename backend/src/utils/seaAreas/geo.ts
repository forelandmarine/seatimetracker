/**
 * geo.ts — dependency-free geometry primitives for point-in-polygon lookup.
 *
 * No runtime dependencies (no turf, no proj4). All reprojection happens at build
 * time; this operates directly on WGS84 lon/lat GeoJSON. Ray-casting is
 * coordinate-system agnostic, so working in degrees is fine for a topological
 * inside/outside test.
 */

export interface LonLat {
  lon: number;
  lat: number;
}

type BBox = [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]

/** One indexed polygon: bounding box + the GeoJSON polygon rings, plus its feature props. */
interface IndexedPolygon {
  bbox: BBox;
  rings: number[][][]; // [ring][pt][lon,lat]; ring 0 outer, rest holes
  props: Record<string, unknown>;
}

export interface GeoJSONFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] }
    | { type: string; coordinates: unknown };
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
  metadata?: Record<string, unknown>;
}

function ringsBBox(rings: number[][][]): BBox {
  let minLon = 180,
    minLat = 90,
    maxLon = -180,
    maxLat = -90;
  for (const pt of rings[0]) {
    if (pt[0] < minLon) minLon = pt[0];
    if (pt[0] > maxLon) maxLon = pt[0];
    if (pt[1] < minLat) minLat = pt[1];
    if (pt[1] > maxLat) maxLat = pt[1];
  }
  return [minLon, minLat, maxLon, maxLat];
}

/**
 * A spatial layer: many polygons with a cheap bounding-box prefilter. Point
 * queries first reject on bbox, then run the exact ray-cast only on candidates.
 */
export class PolygonLayer {
  private polys: IndexedPolygon[] = [];

  constructor(fc: GeoJSONFeatureCollection) {
    for (const f of fc.features) {
      const g = f.geometry;
      if (g.type === 'Polygon') {
        this.add(g.coordinates as number[][][], f.properties);
      } else if (g.type === 'MultiPolygon') {
        for (const poly of g.coordinates as number[][][][]) this.add(poly, f.properties);
      }
    }
  }

  private add(rings: number[][][], props: Record<string, unknown>): void {
    if (!rings.length || !rings[0].length) return;
    this.polys.push({ bbox: ringsBBox(rings), rings, props });
  }

  get size(): number {
    return this.polys.length;
  }

  /** Properties of the first polygon containing the point, or null. */
  findContaining(p: LonLat): Record<string, unknown> | null {
    for (const poly of this.polys) {
      const b = poly.bbox;
      if (p.lon < b[0] || p.lon > b[2] || p.lat < b[1] || p.lat > b[3]) continue;
      if (pointInPolygonWithHoles(p, poly.rings)) return poly.props;
    }
    return null;
  }

  contains(p: LonLat): boolean {
    return this.findContaining(p) !== null;
  }

  /**
   * Nautical-mile distance from p to the nearest polygon boundary in the layer
   * (0 if p is inside a polygon's outer ring is NOT assumed — this measures to the
   * ring segments, so a point just inside the coast returns its distance to shore).
   *
   * Uses a per-polygon bounding-box lower bound to prune: polygons whose bbox is
   * already farther than the running best are skipped without touching their
   * segments. Candidates are visited nearest-bbox-first so `best` shrinks fast.
   * This keeps distance-from-land cheap even with a fine (many-vertex) coastline.
   */
  nearestDistanceNm(p: LonLat): number {
    const latRef = (p.lat * Math.PI) / 180;
    const kx = R_NM * (Math.PI / 180) * Math.cos(latRef); // nm per degree lon
    const ky = R_NM * (Math.PI / 180); // nm per degree lat
    const px = p.lon * kx;
    const py = p.lat * ky;

    // Point-to-bbox lower bound (nm): 0 if inside the bbox, else distance to the
    // nearest bbox edge. A polygon can only beat `best` if its lower bound does.
    const lbOf = (b: BBox): number => {
      const cx = Math.max(b[0], Math.min(p.lon, b[2]));
      const cy = Math.max(b[1], Math.min(p.lat, b[3]));
      return Math.hypot((p.lon - cx) * kx, (p.lat - cy) * ky);
    };
    const scan = (poly: IndexedPolygon): number => {
      let d = Infinity;
      for (const ring of poly.rings) {
        for (let i = 0; i < ring.length - 1; i++) {
          const s = segDistNmProj(px, py, ring[i], ring[i + 1], kx, ky);
          if (s < d) d = s;
        }
      }
      return d;
    };

    // Seed `best` from the polygon with the smallest lower bound (no sort/alloc),
    // then prune everything whose lower bound already exceeds `best`. `best` only
    // shrinks, so a polygon skipped once is correctly skipped for good.
    let minLb = Infinity;
    let seed: IndexedPolygon | null = null;
    for (const poly of this.polys) {
      const lb = lbOf(poly.bbox);
      if (lb < minLb) {
        minLb = lb;
        seed = poly;
      }
    }
    if (!seed) return Infinity;
    let best = scan(seed);
    for (const poly of this.polys) {
      if (poly === seed) continue;
      if (lbOf(poly.bbox) >= best) continue;
      const d = scan(poly);
      if (d < best) best = d;
    }
    return best;
  }
}

const R_NM = 3440.065; // Earth radius in nautical miles

/**
 * Distance (nm) from a projected point (px,py) to segment [a,b], where a,b are
 * lon/lat pairs and kx,ky convert degrees to nm at the query latitude. Kept here
 * so PolygonLayer.nearestDistanceNm has no external dependency.
 */
function segDistNmProj(px: number, py: number, a: number[], b: number[], kx: number, ky: number): number {
  const ax = a[0] * kx;
  const ay = a[1] * ky;
  const bx = b[0] * kx;
  const by = b[1] * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Ray-casting point-in-ring (even–odd rule). Ring is [lon,lat] pairs. */
function pointInRing(p: LonLat, ring: number[][]): boolean {
  let inside = false;
  const x = p.lon;
  const y = p.lat;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and not inside any hole. */
function pointInPolygonWithHoles(p: LonLat, rings: number[][][]): boolean {
  if (!pointInRing(p, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(p, rings[i])) return false; // in a hole
  }
  return true;
}
