// Fetches OS Open Names (below) and the OpenStreetMap water polygons and waterway lines for GB and Northern Ireland from the
// Geofabrik shapefile extracts (ODbL), reading only the needed members of each remote zip with
// HTTP range requests (the England zip is 3 GB; the two layers are a small part of it).
// Output: scripts/harbour-areas/osm-cache/geofabrik/<region>/gis_osm_{water_a,waterways}_free_1.*
// plus extract-date.txt. Run from backend/: node scripts/harbour-areas/fetch-osm-layers.mjs
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { pipeline } from 'stream/promises';

const BASE = 'https://download.geofabrik.de/europe/';
const REGIONS = {
  scotland: 'united-kingdom/scotland-latest-free.shp.zip',
  wales: 'united-kingdom/wales-latest-free.shp.zip',
  england: 'united-kingdom/england-latest-free.shp.zip',
  ireland: 'ireland-and-northern-ireland-latest-free.shp.zip',
};
const LAYERS = ['gis_osm_water_a_free_1', 'gis_osm_waterways_free_1'];
const EXTS = ['.shp', '.shx', '.dbf', '.prj', '.cpg'];
const OUT = 'scripts/harbour-areas/osm-cache/geofabrik';

async function resolve(url) {
  const r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  return { url: r.url, size: Number(r.headers.get('content-length')) };
}
async function range(url, start, end) {
  const r = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (r.status !== 206) throw new Error(`range ${start}-${end}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// Zip central directory (with ZIP64), enough to locate members.
async function centralDirectory(url, size) {
  const tail = await range(url, Math.max(0, size - 65557), size - 1);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('no EOCD');
  let cdSize = tail.readUInt32LE(eocd + 12);
  let cdOff = tail.readUInt32LE(eocd + 16);
  if (cdOff === 0xffffffff || cdSize === 0xffffffff) {
    const loc = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]), eocd);
    const z64Off = Number(tail.readBigUInt64LE(loc + 8));
    const z64 = await range(url, z64Off, z64Off + 55);
    cdSize = Number(z64.readBigUInt64LE(40));
    cdOff = Number(z64.readBigUInt64LE(48));
  }
  const cd = await range(url, cdOff, cdOff + cdSize - 1);
  const entries = [];
  for (let p = 0; p < cd.length && cd.readUInt32LE(p) === 0x02014b50; ) {
    const method = cd.readUInt16LE(p + 10);
    let csize = cd.readUInt32LE(p + 20);
    let usize = cd.readUInt32LE(p + 24);
    const nlen = cd.readUInt16LE(p + 28);
    const xlen = cd.readUInt16LE(p + 30);
    const clen = cd.readUInt16LE(p + 32);
    let off = cd.readUInt32LE(p + 42);
    const name = cd.toString('utf8', p + 46, p + 46 + nlen);
    // ZIP64 extra field
    for (let x = p + 46 + nlen; x < p + 46 + nlen + xlen; ) {
      const id = cd.readUInt16LE(x);
      const len = cd.readUInt16LE(x + 2);
      if (id === 1) {
        let q = x + 4;
        if (usize === 0xffffffff) { usize = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (csize === 0xffffffff) { csize = Number(cd.readBigUInt64LE(q)); q += 8; }
        if (off === 0xffffffff) { off = Number(cd.readBigUInt64LE(q)); q += 8; }
      }
      x += 4 + len;
    }
    entries.push({ name, method, csize, usize, off });
    p += 46 + nlen + xlen + clen;
  }
  return entries;
}

async function extract(url, e, dest) {
  const lh = await range(url, e.off, e.off + 29);
  const dataStart = e.off + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  const r = await fetch(url, { headers: { Range: `bytes=${dataStart}-${dataStart + e.csize - 1}` } });
  if (r.status !== 206) throw new Error(`member ${e.name}: HTTP ${r.status}`);
  const { Readable } = await import('stream');
  const src = Readable.fromWeb(r.body);
  await pipeline(src, e.method === 8 ? zlib.createInflateRaw() : new (await import('stream')).PassThrough(), fs.createWriteStream(dest));
}

const dates = [];
for (const [region, rel] of Object.entries(REGIONS)) {
  const { url, size } = await resolve(BASE + rel);
  dates.push(`${region}: ${url}`);
  const dir = path.join(OUT, region);
  fs.mkdirSync(dir, { recursive: true });
  const entries = await centralDirectory(url, size);
  for (const layer of LAYERS) for (const ext of EXTS) {
    const e = entries.find((x) => x.name === layer + ext);
    if (!e) continue;
    const dest = path.join(dir, layer + ext);
    if (fs.existsSync(dest) && fs.statSync(dest).size === e.usize) continue;
    process.stdout.write(`${region} ${e.name} ${(e.csize / 1e6).toFixed(1)} MB ... `);
    await extract(url, e, dest);
    console.log('ok');
  }
}
fs.writeFileSync(path.join(OUT, 'extract-date.txt'), dates.join('\n') + '\n');

// OS Open Names (Ordnance Survey, OGL), the GB gazetteer: 100 MB zip of per-square CSVs.
const OSN = 'scripts/harbour-areas/osm-cache/os-open-names';
if (!fs.existsSync(path.join(OSN, 'Data'))) {
  fs.mkdirSync(OSN, { recursive: true });
  const r = await fetch('https://api.os.uk/downloads/v1/products/OpenNames/downloads?area=GB&format=CSV&redirect');
  await pipeline((await import('stream')).Readable.fromWeb(r.body), fs.createWriteStream(path.join(OSN, 'opnames.zip')));
  const { execFileSync } = await import('child_process');
  execFileSync('unzip', ['-oq', 'opnames.zip'], { cwd: OSN });
  console.log('OS Open Names ok');
}
console.log(dates.join('\n'));
