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
