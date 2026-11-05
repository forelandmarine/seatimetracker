// Builds src/utils/seaAreas/data/harbour-overrides.geojson: MSN 1837 (M) Amendment 3, Annex 1
// areas the WFD-derived layers miss or get wrong (small harbours, docks, canals, lochs, lakes,
// non-tidal river reaches, and 'none' masks where a WFD body was given a category Annex 1 does not).
//
// Area specs live in scripts/harbour-areas/areas.mjs, each with its Annex 1 limit text and
// sources. Three kinds:
//   polygon   hand-drawn ring whose seaward side is the Annex 1 closing line (vertices from OSM
//             pier heads, breakwaters and named points, or the positions Annex 1 gives)
//   water     named OSM water polygons (natural=water, landuse=reservoir, water=dock/basin)
//   waterway  named OSM waterway centrelines, buffered; optional cuts at locks or bridges keep
//             only the reach that holds the seed point
//   wfd       an existing body of categorised-waters.geojson (by wfd_water_body) or of
//             tidal-waters.geojson (by name, for bodies with no category yet), usually clipped,
//             re-tagged where Annex 1 gives it a different category, season or none at all
//   line      a chart centreline buffered (narrow channels)
//   hull      convex hull of the OSM breakwaters and piers in the bbox (plus any extra points): the
//             water "within the breakwaters", its seaward edge running between the heads
// Optional on any kind: clip (ring to intersect with), clip_bbox, dates ("MM-DD/MM-DD": only
// between those dates, e.g. the Clyde 5 June to 5 September extension), within_nm_of_land, grow_m (widen before clipping,
// for narrow channels the simplified WFD outline misses), inset_nm (shrink inwards, e.g. Lough
// Neagh more than 2 miles from the shore). Ring vertices may be names, looked up in the bbox.
//
// OSM data (ODbL): water polygons and waterway lines come from the Geofabrik shapefile extracts
// (fetch them first with scripts/harbour-areas/fetch-osm-layers.mjs); bays, harbour basins and
// named cut points come from the Overpass API. Both are cached in scripts/harbour-areas/osm-cache/
// (git-ignored). --refresh refetches the Overpass answers. Run from backend/:
//   NODE_OPTIONS=--max-old-space-size=8192 node scripts/build-harbour-overrides.mjs "<path to Workboats Sea Areas Tool>" [--refresh] [--only=id,id]
// (the England water and waterway layers need the larger heap)
// The tool path is only used for its @turf modules, as in build-thames-overrides.mjs.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import { AREAS } from './harbour-areas/areas.mjs';

const T = process.argv[2];
if (!T || !fs.existsSync(path.join(T, 'package.json'))) {
  console.error('Usage: node scripts/build-harbour-overrides.mjs "<path to Workboats Sea Areas Tool>"');
  process.exit(1);
}
const REFRESH = process.argv.includes('--refresh');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const req = createRequire(path.join(T, 'package.json'));
const turf = (m) => req(`@turf/${m}`).default ?? req(`@turf/${m}`);
const buffer = turf('buffer');
const union = turf('union');
const intersect = turf('intersect');
const simplify = turf('simplify');
const area = turf('area');
const truncate = turf('truncate');
const convex = turf('convex');
const bboxClip = turf('bbox-clip');
const H = req('@turf/helpers');

const CACHE = 'scripts/harbour-areas/osm-cache';
const OUT = 'src/utils/seaAreas/data/harbour-overrides.geojson';
const UA = 'SeaTimeTracker-sea-areas-build/1.0';
const NM_KM = 1.852;
fs.mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Geofabrik layers, loaded once: named features only.
const shapefile = req('shapefile');
const GF = path.join(CACHE, 'geofabrik');
async function loadLayer(layer) {
  const out = [];
  for (const region of ['scotland', 'wales', 'england', 'ireland']) {
    const shp = path.join(GF, region, `${layer}.shp`);
    if (!fs.existsSync(shp)) throw new Error(`Missing ${shp}: run scripts/harbour-areas/fetch-osm-layers.mjs`);
    const src = await shapefile.open(shp, shp.replace(/\.shp$/, '.dbf'), { encoding: 'utf-8' });
    for (let r = await src.read(); !r.done; r = await src.read()) {
      const f = r.value;
      if (!f.properties.name) continue;
      const b = [180, 90, -180, -90];
      const walk = (c) => { if (typeof c[0] === 'number') { b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]); } else c.forEach(walk); };
      walk(f.geometry.coordinates);
      out.push({ name: f.properties.name, fclass: f.properties.fclass, id: f.properties.osm_id, geometry: f.geometry, bbox: b });
    }
  }
  return out;
}
let WATER_A = null;
let LAND = null;
let WATERWAYS = null;
const overlaps = (b, [s, w, n, e]) => b[0] <= e && b[2] >= w && b[1] <= n && b[3] >= s;
const nameTest = (spec) => {
  if (spec.name_regex) { const re = new RegExp(spec.name_regex, 'i'); return (n) => re.test(n); }
  if (!spec.names) return () => true;
  const set = new Set(spec.names.map((n) => n.toLowerCase()));
  return (n) => set.has(n.toLowerCase());
};

async function overpass(q) {
  const file = path.join(CACHE, crypto.createHash('sha1').update(q).digest('hex').slice(0, 16) + '.json');
  if (!REFRESH && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let i = 0; i < 6; i++) {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'User-Agent': UA },
      body: new URLSearchParams({ data: q }),
    });
    if (res.ok) {
      const j = await res.json();
      fs.writeFileSync(file, JSON.stringify(j));
      await sleep(1500);
      return j;
    }
    await sleep(8000 * (i + 1));
  }
  throw new Error('Overpass failed: ' + q);
}

const bboxStr = ([s, w, n, e]) => `(${s},${w},${n},${e})`;
const nameRe = (names) => '^(' + names.map((n) => n.replace(/[.*+?^${}()|[\]\\']/g, '\\$&')).join('|') + ')$';

// Join way geometries into closed rings (relation members come as separate ways).
function joinRings(lines) {
  const key = (p) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
  const pool = lines.map((l) => l.slice());
  const rings = [];
  while (pool.length) {
    let ring = pool.shift();
    let guard = 0;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && guard++ < 10000) {
      const end = key(ring[ring.length - 1]);
      const i = pool.findIndex((l) => key(l[0]) === end || key(l[l.length - 1]) === end);
      if (i < 0) break;
      const [l] = pool.splice(i, 1);
      ring = ring.concat((key(l[0]) === end ? l : l.slice().reverse()).slice(1));
    }
    if (ring.length >= 4 && key(ring[0]) === key(ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

const geomOf = (w) => w.geometry.map((p) => [p.lon, p.lat]);

// Point-in-ring for assigning inner rings to outers.
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// OS Open Names (Ordnance Survey, OGL): the GB gazetteer, which has the headlands, holms and taings
// Annex 1 names that OSM lacks. fetch-osm-layers.mjs downloads it; rows are read once for the
// names the specs use.
const proj4 = req('proj4');
const BNG = '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs';
let OSN = null;
function osNames() {
  if (OSN) return OSN;
  OSN = new Map();
  const wanted = new Set();
  const walk = (v) => { if (typeof v === 'string') wanted.add(v.toLowerCase()); };
  for (const a of AREAS) for (const k of ['ring', 'cuts', 'extra', 'line']) (a[k] ?? []).forEach(walk), walk(a.seed);
  const dir = path.join(CACHE, 'os-open-names', 'Data');
  if (!fs.existsSync(dir)) return OSN;
  for (const f of fs.readdirSync(dir)) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      const c = line.split(',');
      for (const n of [c[2], c[4]]) {
        if (!n || !wanted.has(n.toLowerCase())) continue;
        const [lon, lat] = proj4(BNG, 'WGS84', [Number(c[8]), Number(c[9])]);
        const key = n.toLowerCase();
        if (!OSN.has(key)) OSN.set(key, []);
        OSN.get(key).push({ lat, lon, type: c[7] });
      }
    }
  }
  return OSN;
}

// A cut, seed or ring vertex given by name ("Allington Lock") is looked up in the area's bbox:
// OS Open Names first, then OSM Nominatim (cached).
async function placeOf(spec, p) {
  if (Array.isArray(p)) return p;
  const [s0, w0, n0, e0] = spec.bbox;
  const os = (osNames().get(p.toLowerCase()) ?? []).filter((r) => r.lat >= s0 && r.lat <= n0 && r.lon >= w0 && r.lon <= e0);
  if (os.length) return [os[0].lat, os[0].lon];
  const [s_, w, n, e] = spec.bbox;
  const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&bounded=1&viewbox=${w},${n},${e},${s_}&q=${encodeURIComponent(p)}`;
  const file = path.join(CACHE, 'nom-' + crypto.createHash('sha1').update(u).digest('hex').slice(0, 16) + '.json');
  let j;
  if (!REFRESH && fs.existsSync(file)) j = JSON.parse(fs.readFileSync(file, 'utf8'));
  else {
    j = await (await fetch(u, { headers: { 'User-Agent': UA } })).json();
    fs.writeFileSync(file, JSON.stringify(j));
    await sleep(1100);
  }
  if (!j.length) throw new Error(`${spec.id}: Nominatim has nothing named ${p} in the bbox`);
  return [Number(j[0].lat), Number(j[0].lon)];
}

async function waterPolygons(spec) {
  if (!spec.select) {
    WATER_A ??= await loadLayer('gis_osm_water_a_free_1');
    const ok = nameTest(spec);
    const fcl = spec.fclass ? new Set(spec.fclass) : null;
    const hits = WATER_A.filter((f) => overlaps(f.bbox, spec.bbox) && ok(f.name) && (!fcl || fcl.has(f.fclass)) && !(spec.exclude_names ?? []).includes(f.name));
    const polys = hits.flatMap((f) => (f.geometry.type === 'Polygon' ? [H.polygon(f.geometry.coordinates)] : f.geometry.coordinates.map((c) => H.polygon(c))));
    return { polys, ids: hits.map((f) => `osm ${f.id} ${f.name}`) };
  }
  // Overpass path for other tags (natural=bay, harbour basins). names: null takes every match in the bbox.
  const nm = spec.names ? `["name"~"${nameRe(spec.names)}"]` : '';
  const b = bboxStr(spec.bbox);
  const tags = spec.select ?? ['"natural"="water"', '"landuse"="reservoir"', '"water"'];
  const q = `[out:json][timeout:120];(${tags.map((t) => `way[${t}]${nm}${b};relation[${t}]${nm}${b};`).join('')});out geom;`;
  const j = await overpass(q);
  const polys = [];
  const ids = [];
  for (const e of j.elements) {
    if (e.type === 'way' && e.geometry?.length >= 4) {
      const g = geomOf(e);
      if (g[0][0] === g[g.length - 1][0] && g[0][1] === g[g.length - 1][1]) {
        polys.push(H.polygon([g]));
        ids.push(`w${e.id}`);
      }
    } else if (e.type === 'relation') {
      const outers = joinRings(e.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map(geomOf));
      const inners = joinRings(e.members.filter((m) => m.type === 'way' && m.role === 'inner' && m.geometry).map(geomOf));
      for (const o of outers) polys.push(H.polygon([o, ...inners.filter((r) => inRing(r[0], o))]));
      if (outers.length) ids.push(`r${e.id}`);
    }
  }
  return { polys, ids };
}

// Waterway centrelines; with cuts, keep only the connected reach holding the seed.
async function waterwayPolygons(spec) {
  WATERWAYS ??= await loadLayer('gis_osm_waterways_free_1');
  const ok = nameTest(spec);
  const types = new Set((spec.types ?? 'canal|river').split('|'));
  const hits = WATERWAYS.filter((f) => types.has(f.fclass) && overlaps(f.bbox, spec.bbox) && ok(f.name));
  let lines = hits.flatMap((f) => (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates));
  const names = [...new Set(hits.map((f) => f.name))];
  const ids = [`${hits.length} OSM waterway ways: ${names.join(', ')}`];
  if (spec.cuts?.length) {
    if (!spec.seed) throw new Error(`${spec.id}: cuts need a seed`);
    spec = { ...spec, cuts: await Promise.all(spec.cuts.map((c) => placeOf(spec, c))), seed: await placeOf(spec, spec.seed) };
    // Split every line at the vertex nearest each cut point, then flood from the seed.
    const near = (pt) => {
      let best = null;
      lines.forEach((l, li) => l.forEach((p, pi) => {
        const d = (p[0] - pt[1]) ** 2 + (p[1] - pt[0]) ** 2;
        if (!best || d < best.d) best = { d, li, pi };
      }));
      return best;
    };
    const cutKeys = new Set(spec.cuts.map((c) => { const n = near(c); return lines[n.li][n.pi].join(','); }));
    const pieces = [];
    for (const l of lines) {
      let cur = [l[0]];
      for (let i = 1; i < l.length; i++) {
        cur.push(l[i]);
        if (cutKeys.has(l[i].join(',')) && i < l.length - 1) { pieces.push(cur); cur = [l[i]]; }
      }
      pieces.push(cur);
    }
    // Pieces are connected where they share any vertex that is not a cut (ends and junctions).
    const at = new Map();
    pieces.forEach((p, i) => p.forEach((v) => {
      const k = v.join(',');
      if (cutKeys.has(k)) return;
      if (!at.has(k)) at.set(k, new Set());
      at.get(k).add(i);
    }));
    const seedKey = (() => { lines = pieces; const n = near(spec.seed); return pieces[n.li][n.pi].join(','); })();
    const start = [...(at.get(seedKey) ?? [])][0];
    if (start === undefined) throw new Error(`${spec.id}: seed lands on a cut`);
    const keep = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const i = queue.shift();
      for (const v of pieces[i]) for (const n of at.get(v.join(',')) ?? []) if (!keep.has(n)) { keep.add(n); queue.push(n); }
    }
    lines = pieces.filter((_, i) => keep.has(i));
  }
  const polys = lines.map((l) => buffer(H.lineString(l), (spec.buffer_m ?? 25) / 1000, { units: 'kilometers', steps: 2 }));
  return { polys, ids };
}

function unionAll(polys) {
  if (!polys.length) return null;
  if (polys.length === 1) return polys[0];
  // Pairwise tree union keeps it fast on hundreds of canal buffers.
  let layer = polys;
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      next.push(i + 1 < layer.length ? union(H.featureCollection([layer[i], layer[i + 1]])) ?? layer[i] : layer[i]);
    }
    layer = next;
  }
  return layer[0];
}

const WFD = JSON.parse(fs.readFileSync('src/utils/seaAreas/data/categorised-waters.geojson', 'utf8'));
const TIDAL = JSON.parse(fs.readFileSync('src/utils/seaAreas/data/tidal-waters.geojson', 'utf8'));
function wfdPolygons(spec) {
  // A categorised body by wfd_water_body, else an untagged WFD body of tidal-waters.geojson by name.
  let fs_ = WFD.features.filter((f) => f.properties.wfd_water_body === spec.wfd);
  if (!fs_.length) fs_ = TIDAL.features.filter((f) => f.properties.name === spec.wfd);
  if (!fs_.length) throw new Error(`${spec.id}: no WFD body ${spec.wfd}`);
  return { polys: fs_.map((f) => H.feature(f.geometry)), ids: [`wfd:${spec.wfd}`] };
}

const features = [];
const report = [];
for (const spec of AREAS) {
  if (ONLY && !ONLY.includes(spec.id)) continue;
  try {
    await buildOne(spec);
  } catch (err) {
    console.warn(`!! ${spec.id}: ${err.message}`);
    report.push({ id: spec.id, ok: false });
  }
}

async function buildOne(spec) {
  let shape;
  let osmIds = [];
  if (spec.kind === 'polygon') {
    const ring = (await Promise.all(spec.ring.map((v) => placeOf(spec, v)))).map(([lat, lon]) => [lon, lat]);
    if (ring[0].join() !== ring[ring.length - 1].join()) ring.push(ring[0]);
    shape = H.polygon([ring]);
  } else if (spec.kind === 'water') {
    const r = await waterPolygons(spec);
    osmIds = r.ids;
    shape = unionAll(r.polys);
  } else if (spec.kind === 'waterway') {
    const r = await waterwayPolygons(spec);
    osmIds = r.ids;
    shape = unionAll(r.polys);
  } else if (spec.kind === 'hull') {
    // Breakwaters and piers, plus the harbour lights (seamark lights and lighthouses sit on the heads,
    // and catch arms OSM maps only as coastline).
    const q = `[out:json][timeout:120];(way["man_made"~"^(breakwater|pier|groyne)$"]${bboxStr(spec.bbox)};node["seamark:type"~"^light"]${bboxStr(spec.bbox)};node["man_made"="lighthouse"]${bboxStr(spec.bbox)};);out geom;`;
    const j = await overpass(q);
    const pts = j.elements.flatMap((e) => (e.type === 'node' ? [[e.lon, e.lat]] : e.geometry.map((g) => [g.lon, g.lat])));
    for (const v of spec.extra ?? []) { const [lat, lon] = await placeOf(spec, v); pts.push([lon, lat]); }
    osmIds = [`${j.elements.filter((e) => e.type === 'way').length} OSM breakwater/pier ways, ${j.elements.filter((e) => e.type === 'node').length} harbour lights`];
    shape = pts.length >= 3 ? convex(H.featureCollection(pts.map((c) => H.point(c)))) : null;
  } else if (spec.kind === 'line') {
    // A channel the WFD outline loses: a centreline from the chart, buffered.
    const pts = (await Promise.all(spec.line.map((v) => placeOf(spec, v)))).map(([lat, lon]) => [lon, lat]);
    shape = buffer(H.lineString(pts), (spec.buffer_m ?? 200) / 1000, { units: 'kilometers', steps: 4 });
  } else if (spec.kind === 'wfd') {
    const r = wfdPolygons(spec);
    osmIds = r.ids;
    shape = unionAll(r.polys);
  } else throw new Error(`${spec.id}: unknown kind ${spec.kind}`);
  if (!shape) {
    console.warn(`!! ${spec.id}: no OSM geometry found`);
    report.push({ id: spec.id, ok: false });
    return;
  }
  if (spec.grow_m) shape = buffer(shape, spec.grow_m / 1000, { units: 'kilometers', steps: 2 });
  const clipRing = spec.clip ?? (spec.clip_bbox ? [[spec.bbox[0], spec.bbox[1]], [spec.bbox[0], spec.bbox[3]], [spec.bbox[2], spec.bbox[3]], [spec.bbox[2], spec.bbox[1]]] : null);
  if (clipRing) {
    const ring = clipRing.map(([lat, lon]) => [lon, lat]);
    if (ring[0].join() !== ring[ring.length - 1].join()) ring.push(ring[0]);
    shape = intersect(H.featureCollection([shape, H.polygon([ring])]));
    if (!shape) { console.warn(`!! ${spec.id}: clip left nothing`); return; }
  }
  if (spec.within_nm_of_land) {
    // Keep only water within N nm of a given shore (Tarbert: "within one mile from the shore of
    // the Island of Harris"), measured on the ONS MHW coastline the Sea Areas Tool builds.
    const { nm, land_bbox } = spec.within_nm_of_land;
    LAND ??= JSON.parse(fs.readFileSync(path.join(T, 'data', 'uk-coastline.geojson'), 'utf8'));
    const [s1, w1, n1, e1] = land_bbox;
    // bbox-clip leaves empty parts in a MultiPolygon; keep the real ones.
    const polys = LAND.features
      .map((f) => bboxClip(f, [w1, s1, e1, n1]).geometry)
      .flatMap((g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates))
      .filter((rings) => rings.length && rings[0].length >= 4);
    // Only the main island's shore (Harris, not Scalpay): the largest land part in the box.
    const shore = polys.reduce((a, b) => (area(H.polygon(b)) > area(H.polygon(a)) ? b : a));
    const near = buffer(H.polygon(shore), nm * NM_KM, { units: 'kilometers', steps: 4 });
    shape = intersect(H.featureCollection([shape, near]));
    if (!shape) { console.warn(`!! ${spec.id}: nothing within ${nm} nm of land`); return; }
  }
  if (spec.inset_nm) {
    shape = buffer(shape, -spec.inset_nm * NM_KM, { units: 'kilometers', steps: 4 });
    if (!shape) { console.warn(`!! ${spec.id}: inset left nothing`); return; }
  }
  if (spec.kind !== 'polygon' && spec.kind !== 'wfd') shape = simplify(shape, { tolerance: spec.simplify ?? 0.00008, highQuality: false });
  shape = truncate(shape, { precision: 5, coordinates: 2 });
  const km2 = area(shape) / 1e6;
  shape.properties = {
    category: spec.category,
    season: spec.season ?? 'all',
    ...(spec.dates ? { dates: spec.dates } : {}),
    ...(spec.tidal === false ? { tidal: false } : {}),
    estuary: spec.name,
    country: spec.country,
    confidence: spec.confidence,
    msn_reference: spec.msn,
    basis: spec.basis,
    area_km2: +km2.toFixed(4),
    source_id: spec.id,
    // A whole WFD body that Annex 1 does not categorise: the classifier also drops it from distance-to-categorised.
    ...(spec.kind === 'wfd' && spec.category === 'none' && !spec.clip && (spec.season ?? 'all') === 'all' ? { masks_wfd: spec.wfd } : {}),
    ...(osmIds.length ? { source_refs: osmIds.slice(0, 40).join(' ') + (osmIds.length > 40 ? ` (+${osmIds.length - 40})` : '') } : {}),
  };
  features.push(shape);
  report.push({ id: spec.id, ok: true, km2 });
  console.log(`${spec.id.padEnd(34)} ${String(spec.category).padEnd(4)} ${(spec.season ?? 'all').padEnd(6)} ${km2.toFixed(3).padStart(10)} km2  ${spec.confidence}`);
}

// Keep a partial build (--only) from dropping the other areas.
let out = features;
if (ONLY && fs.existsSync(OUT)) {
  const prev = JSON.parse(fs.readFileSync(OUT, 'utf8')).features.filter((f) => !ONLY.includes(f.properties.source_id));
  out = [...prev, ...features];
}
const order = new Map(AREAS.map((a, i) => [a.id, i]));
out.sort((a, b) => (order.get(a.properties.source_id) ?? 1e9) - (order.get(b.properties.source_id) ?? 1e9));
fs.writeFileSync(OUT, JSON.stringify({
  type: 'FeatureCollection',
  metadata: {
    built_by: 'backend/scripts/build-harbour-overrides.mjs',
    sources: 'MSN 1837 (M) Amendment 3 Annex 1 (MCA, OGL); OpenStreetMap contributors (ODbL) via Overpass',
    see: 'backend/scripts/harbour-areas/SOURCES.md',
  },
  features: out,
}));
console.log(`${out.length} features, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB -> ${OUT}`);
const missing = report.filter((r) => !r.ok).map((r) => r.id);
if (missing.length) console.log('No geometry:', missing.join(', '));

// Sources file: one entry per built polygon, with its Annex 1 text and how it was made.
const built = new Map(out.map((f) => [f.properties.source_id, f.properties]));
const md = [
  '# Harbour and inland overrides: sources',
  '',
  'Generated by `backend/scripts/build-harbour-overrides.mjs` from `areas.mjs`. Do not edit by hand.',
  '',
  'Each polygon in `src/utils/seaAreas/data/harbour-overrides.geojson` cites the MSN 1837 (M) Amendment 3',
  'Annex 1 row it digitises (MCA, published 22 Apr 2024, updated 30 May 2024, gov.uk, Open Government',
  'Licence) and how the shape was made. OpenStreetMap data is (c) OpenStreetMap contributors, ODbL,',
  'fetched through the Overpass API. EA, NRW and SEPA WFD bodies are reused from the vendored',
  '`categorised-waters.geojson` (OGL).',
  '',
  'Confidence: **high** the shape is a clear OSM feature that is the whole named water; **medium** an OSM',
  'feature or closing line with a judgement on its ends; **low** the Annex text is ambiguous or the line',
  'positions are approximate. Low-confidence polygons carry `confidence: "low"` in the data.',
  '',
  'Category `none` marks water Annex 1 does not categorise; it masks a WFD body that had been given one.',
  'Where polygons overlap, the smallest in-season one wins.',
  '',
  '| id | Area | Category | Season | Confidence | km2 | Annex 1 limit | Basis | Source refs |',
  '|---|---|---|---|---|---|---|---|---|',
  ...AREAS.map((a) => {
    const p = built.get(a.id);
    const esc = (s) => String(s ?? '').replace(/\|/g, '/');
    return `| ${a.id} | ${esc(a.name)} | ${a.category} | ${a.season ?? 'all'}${a.dates ? ' ' + a.dates : ''} | ${a.confidence} | ${p ? p.area_km2 : 'not built'} | ${esc(a.msn)} | ${esc(a.basis)} | ${esc(p?.source_refs ?? (a.kind === 'polygon' || a.kind === 'line' ? 'hand-drawn' : ''))} |`;
  }),
  '',
];
fs.writeFileSync('scripts/harbour-areas/SOURCES.md', md.join('\n'));
