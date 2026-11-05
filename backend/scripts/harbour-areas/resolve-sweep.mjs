// Resolves sweep-spec.mjs into tests/fixtures/msn1837-sweep.json.
// Named inland waters ({ nom }) are looked up once with OSM Nominatim (ODbL, 1 request a second);
// for a line the vertex nearest the label point is used. Canals and rivers ({ ww }) use the
// nearest vertex of the named OSM waterway centreline (Geofabrik extract), so the point is on the water.
// Run from backend/: node scripts/harbour-areas/resolve-sweep.mjs
import fs from 'fs';
import { createRequire } from 'module';
import { SWEEP } from './sweep-spec.mjs';

const OUT = 'tests/fixtures/msn1837-sweep.json';
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
const cache = new Map(prev.filter((r) => r.source !== 'chart position').map((r) => [r.source, [r.lat, r.lon]]));
const UA = 'SeaTimeTracker-sea-areas-build/1.0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Named waterway lines from the Geofabrik extracts (fetch-osm-layers.mjs), with a label point each.
let WW = null;
async function loadWaterways() {
  const T = process.env.SEA_AREAS_TOOL ?? `${process.env.HOME}/Desktop/Foreland Group/SeaTime Tracker/Playstore - Seatime Tracker/Workboats Sea Areas Tool`;
  const shapefile = createRequire(T + '/package.json')('shapefile');
  const out = [];
  for (const r of ['scotland', 'wales', 'england', 'ireland']) {
    const shp = `scripts/harbour-areas/osm-cache/geofabrik/${r}/gis_osm_waterways_free_1.shp`;
    const src = await shapefile.open(shp, shp.replace('.shp', '.dbf'), { encoding: 'utf-8' });
    for (let x = await src.read(); !x.done; x = await src.read()) {
      const f = x.value;
      if (!f.properties.name) continue;
      const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
      out.push({ name: f.properties.name, lines, lon: lines[0][0][0], lat: lines[0][0][1] });
    }
  }
  return out;
}

function onGeometry(g, lat, lon) {
  if (!g || g.type === 'Point' || g.type === 'Polygon' || g.type === 'MultiPolygon') return [lat, lon];
  const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
  let best = null;
  for (const l of lines) for (const [x, y] of l) {
    const d = (x - lon) ** 2 + (y - lat) ** 2;
    if (!best || d < best.d) best = { d, p: [y, x] };
  }
  return best.p;
}

const out = [];
for (const [area, expect, season, loc, note] of SWEEP) {
  let lat, lon, source;
  if (Array.isArray(loc)) {
    [lat, lon] = loc;
    source = 'chart position';
  } else if (loc.ww) {
    source = `osm waterway:${loc.ww}@${loc.near.join(',')}`;
    WW ??= await loadWaterways();
    const lines = WW.filter((f) => f.name.toLowerCase() === loc.ww.toLowerCase() && Math.abs(f.lat - loc.near[0]) < 0.3 && Math.abs(f.lon - loc.near[1]) < 0.5).flatMap((f) => f.lines);
    if (!lines.length) { console.warn('no waterway', loc.ww); continue; }
    [lat, lon] = onGeometry({ type: 'MultiLineString', coordinates: lines }, loc.near[0], loc.near[1]);
  } else {
    source = `nominatim:${loc.nom}`;
    if (cache.has(source)) [lat, lon] = cache.get(source);
    else {
      const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&polygon_geojson=1&q=${encodeURIComponent(loc.nom)}`;
      const r = await (await fetch(u, { headers: { 'User-Agent': UA } })).json();
      await sleep(1100);
      if (!r.length) { console.warn('no result', loc.nom); continue; }
      [lat, lon] = onGeometry(r[0].geojson, Number(r[0].lat), Number(r[0].lon));
      console.log(loc.nom, '->', r[0].display_name.slice(0, 70), lat, lon);
    }
  }
  out.push({ area, expect, season, lat: +lat.toFixed(5), lon: +lon.toFixed(5), source, ...(note ? { uncertain: note } : {}) });
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(out.length, 'points ->', OUT);
