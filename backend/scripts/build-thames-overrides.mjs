// Builds the River Thames overrides in src/utils/seaAreas/data/area-overrides.geojson
// (non-tidal Cat B Teddington Lock to Osney, Cat A above, tidal Cat C Teddington to Richmond).
// Input: ways.json, OSM waterway=river name="River Thames" ways (Overpass, out geom), west of -0.29.
// Run from the folder holding ways.json: node build-thames-overrides.mjs <path to Workboats Sea Areas Tool> (for @turf).
import fs from 'fs';
import { createRequire } from 'module';
const T = process.argv[2];
const req = createRequire(T + '/package.json');
const buffer = req('@turf/buffer').default ?? req('@turf/buffer');
const union = req('@turf/union').default ?? req('@turf/union');
const simplify = req('@turf/simplify').default ?? req('@turf/simplify');
const H = req('@turf/helpers');
const ways = JSON.parse(fs.readFileSync('ways.json', 'utf8'));
const key = (p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
// Directed graph along way direction (OSM rivers run downstream)
const out = new Map(); const byStart = new Map();
for (const w of ways) {
  const g = w.geometry;
  for (let i = 0; i < g.length - 1; i++) {
    const a = key(g[i]), b = key(g[i + 1]);
    if (!out.has(a)) out.set(a, []);
    out.get(a).push(b);
  }
}
// Downstream of Teddington Lock: everything reachable going downstream from the lock node
const tedWay = ways.find((w) => w.id === 47836796);
const start = key(tedWay.geometry[0]);
const down = new Set([start]); const q = [start];
while (q.length) { const n = q.shift(); for (const m of out.get(n) ?? []) if (!down.has(m)) { down.add(m); q.push(m); } }
// Upstream of Osney (Cat A): nodes from which Osney is reachable downstream, excluding Osney's own downstream
const osWay = ways.find((w) => w.id === 613348346);
const osney = key(osWay.geometry[1]);
const rev = new Map();
for (const [a, bs] of out) for (const b of bs) { if (!rev.has(b)) rev.set(b, []); rev.get(b).push(a); }
const up = new Set([osney]); const q2 = [osney];
while (q2.length) { const n = q2.shift(); for (const m of rev.get(n) ?? []) if (!up.has(m)) { up.add(m); q2.push(m); } }
const groups = { A: [], B: [], C: [] }; let dropped = 0;
for (const w of ways) {
  const g = w.geometry;
  const ks = g.map(key);
  // A way is tidal if all but its first node are downstream of the lock
  // Tidal reach below Teddington Lock (to Twickenham and Richmond): north of the lock and east of Hampton
  const below = g.filter((p) => p.lat > 51.4325 && p.lon > -0.335).length;
  if (below > g.length / 2) { dropped++; groups.C.push(H.lineString(g.map((p) => [p.lon, p.lat]))); continue; }
  const cat = ks.slice(0, -1).every((k) => up.has(k)) ? 'A' : 'B';
  groups[cat].push(H.lineString(g.map((p) => [p.lon, p.lat])));
}
console.log('tidal ways', dropped, 'A', groups.A.length, 'B', groups.B.length);
const feats = [];
for (const cat of ['A', 'B', 'C']) {
  let acc = null;
  for (const l of groups[cat]) {
    const b = buffer(l, 0.05, { units: 'kilometers', steps: 4 });
    acc = acc ? union(H.featureCollection([acc, b])) ?? acc : b;
  }
  const s = simplify(acc, { tolerance: 0.00008, highQuality: false });
  s.properties = cat === 'C'
    ? { category: 'C', season: 'all', estuary: 'River Thames (Teddington Lock to Richmond)', country: 'England', confidence: 'medium', msn_reference: 'MSN 1837 (M) Amendment 3, Annex 1, Category C: River Thames from Teddington Lock to Denton Wharf Pier, Gravesend', basis: 'OpenStreetMap River Thames centreline (ODbL), 50 m each side; tidal reach the WFD outline misses' }
    : cat === 'B'
    ? { category: 'B', season: 'all', tidal: false, estuary: 'River Thames (Teddington Lock to Oxford)', country: 'England', confidence: 'medium', msn_reference: 'MSN 1837 (M) Amendment 3, Annex 1, Category B: River Thames above Teddington Lock to Oxford', basis: 'OpenStreetMap River Thames centreline (ODbL), 50 m each side; non-tidal' }
    : { category: 'A', season: 'all', tidal: false, estuary: 'River Thames (above Oxford)', country: 'England', confidence: 'medium', msn_reference: 'MSN 1837 (M) Amendment 3, Annex 1, Category A: River Thames above Oxford', basis: 'OpenStreetMap River Thames centreline (ODbL), 50 m each side, split at Osney; non-tidal' };
  feats.push(s);
}
fs.writeFileSync('non-tidal-thames.geojson', JSON.stringify(H.featureCollection(feats)));
console.log('bytes', fs.statSync('non-tidal-thames.geojson').size);
