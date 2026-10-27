// Builds the "Find a course" directory from the 2.4.0 provider research.
//   node scripts/gen-training-providers.mjs "<.../2.4.0 Additions>"
// Reads providers/*.json, de-duplicates, geocodes (OpenStreetMap Nominatim,
// 1 request a second, cached in <dir>/providers/geocode-cache.json), then writes
// constants/trainingProviders.json for the app.
import fs from 'fs';
import path from 'path';

const dir = process.argv[2];
const pdir = path.join(dir, 'providers');
const cacheFile = path.join(pdir, 'geocode-cache.json');
const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};

const slug = (s) =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const clean = (v) => (typeof v === 'string' && v.trim() && !/^(null|n\/a|unknown)$/i.test(v.trim()) ? v.trim() : null);
const uniq = (a) => Array.from(new Set((a || []).filter(Boolean)));

const raw = [];
for (const f of fs.readdirSync(pdir).filter((f) => f.endsWith('.json') && !f.startsWith('geocode') && !f.startsWith('merged'))) {
  const data = JSON.parse(fs.readFileSync(path.join(pdir, f), 'utf8'));
  for (const p of Array.isArray(data) ? data : data.providers || []) {
    if (p.open_to_public === false) continue; // in-house programmes crew can't book
    raw.push({ ...p, _file: f });
  }
}

// Same site = same name (minus legal suffixes) and same city and country.
const key = (p) =>
  [slug(String(p.name).replace(/\b(ltd|limited|llc|inc|plc|gmbh|s\.?l\.?|pty)\b\.?/gi, '')), slug(p.city), String(p.country || '').toUpperCase()].join('|');
const merged = new Map();
for (const p of raw) {
  if (!clean(p.name) || !clean(p.country)) continue;
  const k = key(p);
  const cur = merged.get(k);
  if (!cur) {
    merged.set(k, { ...p });
    continue;
  }
  for (const f of ['address', 'postcode', 'phone', 'email', 'website', 'dates_url', 'region', 'lat', 'lng']) cur[f] = clean(cur[f]) ?? cur[f] ?? p[f];
  cur.approvals = uniq([...(cur.approvals || []), ...(p.approvals || [])]);
  cur.sectors = uniq([...(cur.sectors || []), ...(p.sectors || [])]);
  cur.courses = uniq([...(cur.courses || []), ...(p.courses || [])]);
  cur.course_pages = { ...(p.course_pages || {}), ...(cur.course_pages || {}) };
}

// UK, Channel Islands and Isle of Man postcodes: postcodes.io bulk lookup (100 a call).
const UK = new Set(['GB', 'UK', 'JE', 'GG', 'IM']);
async function bulkUkPostcodes(list) {
  const todo = Array.from(new Set(list.filter((pc) => !(`pc:${pc}` in cache))));
  for (let i = 0; i < todo.length; i += 100) {
    const batch = todo.slice(i, i + 100);
    try {
      const res = await fetch('https://api.postcodes.io/postcodes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ postcodes: batch }),
      });
      const j = await res.json();
      for (const r of j.result || []) {
        cache[`pc:${r.query}`] = r.result ? [Number(r.result.latitude.toFixed(5)), Number(r.result.longitude.toFixed(5))] : null;
      }
    } catch {
      // leave for the town lookup
    }
  }
  fs.writeFileSync(cacheFile, JSON.stringify(cache));
}

async function geocode(p) {
  if (typeof p.lat === 'number' && typeof p.lng === 'number') return [p.lat, p.lng];
  const pc = clean(p.postcode);
  if (pc && UK.has(String(p.country).toUpperCase()) && cache[`pc:${pc}`]) return cache[`pc:${pc}`];
  // Town level is enough to sort by distance, and towns repeat, so the cache does most of the work.
  const tries = [
    [p.city, p.region, p.country],
    [p.city, p.country],
    [p.postcode, p.country],
  ].map((parts) => parts.map(clean).filter(Boolean).join(', '));
  for (const q of Array.from(new Set(tries)).filter((q) => q.split(',').length >= 2)) {
    if (q in cache) {
      if (cache[q]) return cache[q];
      continue;
    }
    await new Promise((r) => setTimeout(r, 1100));
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { 'user-agent': 'SeaTimeTracker provider directory build (dan@forelandmarine.com)' } });
      const j = await res.json();
      cache[q] = j[0] ? [Number(Number(j[0].lat).toFixed(5)), Number(Number(j[0].lon).toFixed(5))] : null;
    } catch {
      cache[q] = null;
    }
    fs.writeFileSync(cacheFile, JSON.stringify(cache));
    if (cache[q]) return cache[q];
  }
  return [null, null];
}

await bulkUkPostcodes(Array.from(merged.values()).filter((p) => UK.has(String(p.country).toUpperCase()) && clean(p.postcode)).map((p) => clean(p.postcode)));

const regionNames = new Intl.DisplayNames(['en-GB'], { type: 'region' });
const countryName = (cc) => {
  try {
    return regionNames.of(cc === 'UK' ? 'GB' : cc) ?? cc;
  } catch {
    return cc;
  }
};

const out = [];
const ids = new Set();
let n = 0;
for (const p of merged.values()) {
  const [lat, lng] = await geocode(p);
  let id = [slug(p.name), slug(p.city), String(p.country).toLowerCase()].filter(Boolean).join('-').slice(0, 90);
  while (ids.has(id)) id += '-2';
  ids.add(id);
  out.push({
    id,
    name: p.name.trim(),
    address: clean(p.address),
    city: clean(p.city),
    postcode: clean(p.postcode),
    country: String(p.country).toUpperCase(),
    countryName: countryName(String(p.country).toUpperCase()),
    region: clean(p.region),
    lat,
    lng,
    phone: clean(p.phone),
    email: clean(p.email),
    website: clean(p.website),
    approvals: uniq(p.approvals).map((a) => String(a).toLowerCase().trim()),
    sectors: uniq(p.sectors),
    courses: uniq(p.courses),
    coursePages: Object.fromEntries(Object.entries(p.course_pages || {}).filter(([, u]) => clean(u))),
    datesUrl: clean(p.dates_url),
    _datesFormat: p.dates_format || 'unknown',
  });
  if (++n % 50 === 0) console.log('geocoded', n, '/', merged.size);
}
out.sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));

const app = { v: 1, built: new Date().toISOString().slice(0, 10), providers: out.map(({ _datesFormat, ...p }) => p) };
fs.writeFileSync(new URL('../constants/trainingProviders.json', import.meta.url), JSON.stringify(app));
fs.writeFileSync(path.join(pdir, 'merged-directory.json'), JSON.stringify(out, null, 1));
const noGeo = out.filter((p) => p.lat == null).length;
console.log(`raw ${raw.length} -> ${out.length} providers; ${noGeo} without coordinates; ${out.filter((p) => p.datesUrl).length} with a dates page`);
