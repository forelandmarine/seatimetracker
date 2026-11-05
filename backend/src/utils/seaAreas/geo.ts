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
  /** Built only for polygons with many vertices (see INDEX_MIN_VERTICES). */
  bands?: RingBands[]; // per ring: edges bucketed by latitude, for point-in-polygon
  cells?: EdgeGrid; // edge grid for nearest-edge queries: cell -> packed (ring, edge)
}

/** Cell -> packed (ring, edge) lists in typed arrays (sorted keys, offsets), compact enough for the land layer. */
interface EdgeGrid {
  keys: Float64Array; // sorted cell keys
  off: Uint32Array; // items[off[i]..off[i+1]) belong to keys[i]
  items: Float64Array;
}

/** Edges of one ring bucketed into horizontal latitude bands. */
interface RingBands {
  minLat: number;
  h: number; // band height in degrees
  buckets: number[][]; // band -> start index i of edge ring[i] -> ring[i+1]
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

/** Polygons with at least this many vertices get edge indexes; smaller ones are scanned directly. */
const INDEX_MIN_VERTICES = 64;
/** Layer grid cell (degrees) for finding candidate polygons. */
const LAYER_CELL = 0.25;
/** A polygon whose bbox covers more layer cells than this (a continent) goes on a short list instead. */
const LAYER_MAX_CELLS = 4096;
/** Edge grid cell (degrees) for nearest-edge queries inside a large polygon. */
const EDGE_CELL = 0.02;
const RING_STRIDE = 2 ** 22; // packs (ring, edge) into one number: ring * RING_STRIDE + edge

const cellKey = (ix: number, iy: number): number => ix * 100003 + iy;

/** Merge two ascending index lists. */
function mergeSorted(a: number[], b: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && a[i] < b[j])) out.push(a[i++]);
    else out.push(b[j++]);
  }
  return out;
}

function buildBands(ring: number[][]): RingBands {
  let minLat = Infinity,
    maxLat = -Infinity;
  for (const pt of ring) {
    if (pt[1] < minLat) minLat = pt[1];
    if (pt[1] > maxLat) maxLat = pt[1];
  }
  const n = Math.max(1, Math.ceil(ring.length / 8));
  const h = Math.max((maxLat - minLat) / n, 1e-9);
  const buckets: number[][] = Array.from({ length: n + 1 }, () => []);
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i][1];
    const b = ring[i + 1][1];
    const lo = Math.floor((Math.min(a, b) - minLat) / h);
    const hi = Math.floor((Math.max(a, b) - minLat) / h);
    for (let k = lo; k <= hi; k++) buckets[k].push(i);
  }
  return { minLat, h, buckets };
}

function compactGrid(cells: Map<number, number[]>): EdgeGrid {
  const keys = Float64Array.from(cells.keys()).sort();
  const off = new Uint32Array(keys.length + 1);
  let n = 0;
  keys.forEach((k, i) => {
    off[i] = n;
    n += cells.get(k)!.length;
  });
  off[keys.length] = n;
  const items = new Float64Array(n);
  keys.forEach((k, i) => items.set(cells.get(k)!, off[i]));
  return { keys, off, items };
}

/** Index range [start, end) of a cell's items, or null. */
function gridRange(g: EdgeGrid, k: number): [number, number] | null {
  let lo = 0;
  let hi = g.keys.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = g.keys[mid];
    if (v === k) return [g.off[mid], g.off[mid + 1]];
    if (v < k) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

function buildEdgeCells(rings: number[][][]): EdgeGrid {
  const cells = new Map<number, number[]>();
  rings.forEach((ring, r) => {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i];
      const b = ring[i + 1];
      // Only the cells the segment passes through: per grid column, the rows its
      // latitude spans inside that column (a long diagonal edge would otherwise
      // fill its whole bounding box).
      const [ax, ay] = a[0] <= b[0] ? a : b;
      const [bx, by] = a[0] <= b[0] ? b : a;
      const x0 = Math.floor(ax / EDGE_CELL);
      const x1 = Math.floor(bx / EDGE_CELL);
      const slope = bx === ax ? 0 : (by - ay) / (bx - ax);
      for (let x = x0; x <= x1; x++) {
        const lo = Math.max(ax, x * EDGE_CELL);
        const hi = Math.min(bx, (x + 1) * EDGE_CELL);
        const ya = x0 === x1 ? ay : ay + slope * (lo - ax);
        const yb = x0 === x1 ? by : ay + slope * (hi - ax);
        const y0 = Math.floor(Math.min(ya, yb) / EDGE_CELL);
        const y1 = Math.floor(Math.max(ya, yb) / EDGE_CELL);
        for (let y = y0; y <= y1; y++) {
          const k = cellKey(x, y);
          const list = cells.get(k);
          if (list) list.push(r * RING_STRIDE + i);
          else cells.set(k, [r * RING_STRIDE + i]);
        }
      }
    }
  });
  return compactGrid(cells);
}

/** Ray-cast crossings for one ring using its latitude bands (same even-odd rule as pointInRing). */
function pointInRingBanded(p: LonLat, ring: number[][], bands: RingBands): boolean {
  const k = Math.floor((p.lat - bands.minLat) / bands.h);
  if (k < 0 || k >= bands.buckets.length) return false;
  let inside = false;
  const x = p.lon;
  const y = p.lat;
  for (const i of bands.buckets[k]) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[i + 1][0];
    const yj = ring[i + 1][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polyContains(p: LonLat, poly: IndexedPolygon): boolean {
  if (!poly.bands) return pointInPolygonWithHoles(p, poly.rings);
  if (!pointInRingBanded(p, poly.rings[0], poly.bands[0])) return false;
  for (let i = 1; i < poly.rings.length; i++) {
    if (pointInRingBanded(p, poly.rings[i], poly.bands[i])) return false;
  }
  return true;
}

/**
 * A spatial layer: many polygons behind a grid index. Point queries look only
 * at the polygons whose grid cells hold the point, reject on bbox, then
 * ray-cast against the edges in the point's latitude band. Nearest-edge queries
 * scan only the edge-grid cells within the search radius. Results match a plain
 * scan in layer order (the first containing polygon wins).
 */
export class PolygonLayer {
  private polys: IndexedPolygon[] = [];
  private grid = new Map<number, number[]>(); // layer cell -> polygon indices, ascending
  private large: number[] = []; // polygons too big for the grid, ascending

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
    const poly: IndexedPolygon = { bbox: ringsBBox(rings), rings, props };
    const vertices = rings.reduce((n, r) => n + r.length, 0);
    if (vertices >= INDEX_MIN_VERTICES) {
      poly.bands = rings.map(buildBands);
      poly.cells = buildEdgeCells(rings);
    }
    const idx = this.polys.push(poly) - 1;
    const b = poly.bbox;
    const nx = Math.floor(b[2] / LAYER_CELL) - Math.floor(b[0] / LAYER_CELL) + 1;
    const ny = Math.floor(b[3] / LAYER_CELL) - Math.floor(b[1] / LAYER_CELL) + 1;
    if (nx * ny > LAYER_MAX_CELLS) {
      this.large.push(idx);
      return;
    }
    for (let x = Math.floor(b[0] / LAYER_CELL); x <= Math.floor(b[2] / LAYER_CELL); x++)
      for (let y = Math.floor(b[1] / LAYER_CELL); y <= Math.floor(b[3] / LAYER_CELL); y++) {
        const k = cellKey(x, y);
        const list = this.grid.get(k);
        if (list) list.push(idx);
        else this.grid.set(k, [idx]);
      }
  }

  get size(): number {
    return this.polys.length;
  }

  private candidatesAt(p: LonLat): number[] {
    const cell = this.grid.get(cellKey(Math.floor(p.lon / LAYER_CELL), Math.floor(p.lat / LAYER_CELL))) ?? [];
    return this.large.length ? mergeSorted(cell, this.large) : cell;
  }

  /** Polygon indices whose layer cells overlap the box around p (ascending, no duplicates). */
  private candidatesNear(p: LonLat, dLon: number, dLat: number): number[] {
    const x0 = Math.floor((p.lon - dLon) / LAYER_CELL);
    const x1 = Math.floor((p.lon + dLon) / LAYER_CELL);
    const y0 = Math.floor((p.lat - dLat) / LAYER_CELL);
    const y1 = Math.floor((p.lat + dLat) / LAYER_CELL);
    if (x0 === x1 && y0 === y1) {
      const cell = this.grid.get(cellKey(x0, y0)) ?? [];
      return this.large.length ? mergeSorted(cell, this.large) : cell;
    }
    const seen = new Set<number>(this.large);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) for (const i of this.grid.get(cellKey(x, y)) ?? []) seen.add(i);
    return [...seen].sort((a, b) => a - b);
  }

  /** Properties of the first polygon containing the point, or null. */
  findContaining(p: LonLat): Record<string, unknown> | null {
    for (const i of this.candidatesAt(p)) {
      const poly = this.polys[i];
      const b = poly.bbox;
      if (p.lon < b[0] || p.lon > b[2] || p.lat < b[1] || p.lat > b[3]) continue;
      if (polyContains(p, poly)) return poly.props;
    }
    return null;
  }

  contains(p: LonLat): boolean {
    return this.findContaining(p) !== null;
  }

  /** Properties of the first containing polygon whose properties pass `accept`. */
  findContainingWhere(p: LonLat, accept: (props: Record<string, unknown>) => boolean): Record<string, unknown> | null {
    for (const i of this.candidatesAt(p)) {
      const poly = this.polys[i];
      const b = poly.bbox;
      if (p.lon < b[0] || p.lon > b[2] || p.lat < b[1] || p.lat > b[3]) continue;
      if (!accept(poly.props)) continue;
      if (polyContains(p, poly)) return poly.props;
    }
    return null;
  }

  /** Properties of every polygon containing the point that passes `accept`, in layer order. */
  findAllContaining(p: LonLat, accept: (props: Record<string, unknown>) => boolean = () => true): Record<string, unknown>[] {
    const hits: Record<string, unknown>[] = [];
    for (const i of this.candidatesAt(p)) {
      const poly = this.polys[i];
      const b = poly.bbox;
      if (p.lon < b[0] || p.lon > b[2] || p.lat < b[1] || p.lat > b[3]) continue;
      if (accept(poly.props) && polyContains(p, poly)) hits.push(poly.props);
    }
    return hits;
  }

  /** Nearest edge distance (nm) of one polygon to p, if within maxNm; Infinity otherwise. */
  private polyNearest(poly: IndexedPolygon, p: LonLat, maxNm: number, px: number, py: number, kx: number, ky: number): number {
    let best = Infinity;
    if (!poly.cells || !Number.isFinite(maxNm)) {
      for (const ring of poly.rings) {
        for (let i = 0; i < ring.length - 1; i++) {
          const d = segDistNmProj(px, py, ring[i], ring[i + 1], kx, ky);
          if (d < best) best = d;
        }
      }
      return best <= maxNm ? best : Infinity;
    }
    const dLon = maxNm / kx;
    const dLat = maxNm / ky;
    const x0 = Math.floor((p.lon - dLon) / EDGE_CELL);
    const x1 = Math.floor((p.lon + dLon) / EDGE_CELL);
    const y0 = Math.floor((p.lat - dLat) / EDGE_CELL);
    const y1 = Math.floor((p.lat + dLat) / EDGE_CELL);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const range = gridRange(poly.cells, cellKey(x, y));
        if (!range) continue;
        for (let j = range[0]; j < range[1]; j++) {
          const packed = poly.cells.items[j];
          const ring = poly.rings[Math.floor(packed / RING_STRIDE)];
          const i = packed % RING_STRIDE;
          const d = segDistNmProj(px, py, ring[i], ring[i + 1], kx, ky);
          if (d < best) best = d;
        }
      }
    return best <= maxNm ? best : Infinity;
  }

  /**
   * Properties of the polygon whose edge is nearest to p, if that edge is no more
   * than maxNm away. Only polygons (and edges) within maxNm are scanned, so a
   * small radius stays cheap even on a large layer.
   */
  findNearestWithin(
    p: LonLat,
    maxNm: number,
    accept: (props: Record<string, unknown>) => boolean = () => true,
  ): { props: Record<string, unknown>; distanceNm: number } | null {
    const latRef = (p.lat * Math.PI) / 180;
    const kx = R_NM * (Math.PI / 180) * Math.cos(latRef);
    const ky = R_NM * (Math.PI / 180);
    const px = p.lon * kx;
    const py = p.lat * ky;
    let best: { props: Record<string, unknown>; distanceNm: number } | null = null;
    const ids = Number.isFinite(maxNm) ? this.candidatesNear(p, maxNm / kx, maxNm / ky) : this.polys.map((_, i) => i);
    for (const i of ids) {
      const poly = this.polys[i];
      const b = poly.bbox;
      const cx = Math.max(b[0], Math.min(p.lon, b[2]));
      const cy = Math.max(b[1], Math.min(p.lat, b[3]));
      const lb = Math.hypot((p.lon - cx) * kx, (p.lat - cy) * ky);
      if (lb > maxNm || (best && lb >= best.distanceNm)) continue;
      if (!accept(poly.props)) continue;
      const d = this.polyNearest(poly, p, best ? Math.min(best.distanceNm, maxNm) : maxNm, px, py, kx, ky);
      if (d !== Infinity && (!best || d < best.distanceNm)) best = { props: poly.props, distanceNm: d };
    }
    return best;
  }

  /**
   * Nautical-mile distance from p to the nearest polygon boundary in the layer
   * (0 if p is inside a polygon's outer ring is NOT assumed — this measures to the
   * ring segments, so a point just inside the coast returns its distance to shore).
   *
   * Searches outward in growing radii through the grid indexes, so a nearby shore
   * is found without touching the rest of the layer; falls back to a full scan
   * only when nothing lies within 256 nm. `accept` limits it to some polygons.
   */
  nearestDistanceNm(p: LonLat, accept: (props: Record<string, unknown>) => boolean = () => true): number {
    if (!this.polys.length) return Infinity;
    for (const r of [0.5, 2, 8, 32, 256]) {
      const hit = this.findNearestWithin(p, r, accept);
      if (hit) return hit.distanceNm;
    }
    return this.findNearestWithin(p, Infinity, accept)?.distanceNm ?? Infinity;
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
