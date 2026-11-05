// Adds MCA approved doctors (who carry out ENG1 medicals) to the provider research
// that scripts/gen-training-providers.mjs builds "Find a course" from.
//   node scripts/fetch-mca-approved-doctors.mjs "<.../2.4.0 Additions>"
// Reads the six GOV.UK lists (England, Scotland, Wales, Northern Ireland, Crown
// Dependencies, overseas) through the GOV.UK content API and writes
// <dir>/providers/mca_approved_doctors.json. Run the generator after it.
import fs from 'fs';
import path from 'path';

const dir = process.argv[2];
if (!dir) throw new Error('Give the 2.4.0 Additions folder');

const BASE = 'https://www.gov.uk/api/content/government/publications';
const PAGES = [
  ['uk', 'mca-approved-doctors-uk-based/mca-approved-doctors-listed-in-england'],
  ['uk', 'mca-approved-doctors-uk-based/mca-approved-doctors-listed-in-scotland'],
  ['uk', 'mca-approved-doctors-uk-based/mca-approved-doctors-listed-in-wales'],
  ['uk', 'mca-approved-doctors-uk-based/mca-approved-doctors-listed-in-northern-ireland'],
  ['uk', 'mca-approved-doctors-uk-based/mca-approved-doctors-within-the-crown-dependencies'],
  ['overseas', 'mca-approved-doctors-overseas/mca-approved-doctors-overseas'],
];

// Headings on the overseas page, by country.
const COUNTRIES = {
  australia: 'AU', antigua: 'AG', barbados: 'BB', 'british virgin islands': 'VG', falklands: 'FK', france: 'FR',
  gibraltar: 'GI', malaysia: 'MY', monaco: 'MC', 'new zealand': 'NZ', philippines: 'PH', 'south africa': 'ZA',
  spain: 'ES', 'trinidad and tobago': 'TT', 'united arab emirates': 'AE', 'united states of america': 'US',
};
const UK_POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?) ?(\d[A-Z]{2})$/i;
// Address lines that name a county or country rather than the town.
const AREAS = new Set(
  [
    'aberdeenshire', 'anglesey', 'argyll & bute', 'ayrshire', 'caithness', 'city of london', 'cornwall', 'cumbria', 'devon', 'durham',
    'east riding of yorkshire', 'east sussex', 'essex', 'glamorgan', 'greater london', 'greater manchester', 'gwynedd', 'isle of lewis',
    'kent', 'lancashire', 'leicestershire', 'lincolnshire', 'merseyside', 'middlesex', 'neath port talbot', 'norfolk',
    'north lincolnshire', 'north yorkshire', 'northumberland', 'nottinghamshire', 'orkney', 'pembrokeshire', 'shetland', 'suffolk',
    'surrey', 'tyne and wear', 'wales', 'west midlands', 'west yorkshire', 'wirral', 'florida', 'victoria', 'west indies', 'mallorca',
    '(spain)', 'antigua', 'trinidad',
  ]
);
// "Room 10", "c/o DDRC", "74 Avenue de la Liberte": not the surgery's name.
const NOT_A_NAME = /^(room|office|number|c\/o|suite|unit|level|floor|\d)|\d|\b(road|street|lane|avenue|drive|terrace|place|square|way)$/i;
// A surgery's name says what it is ("... Surgery", "... Clinic") or is an acronym (OHIS, TOPHS).
const LOOKS_LIKE_A_NAME = /\b(surgery|practice|centre|center|clinic|medical|medicals|health|healthcare|hospital|house|ltd|limited|inc|services|rooms|hub|building|annexe|occupational|training|group|consult\w*|club|office)\b/i;
const looksLikeAName = (l) => LOOKS_LIKE_A_NAME.test(l) || /^[A-Z]{3,}\b/.test(l);

const text = (html) =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;|&rsquo;|’/g, "'")
    .replace(/[“”]/g, '"');
const lines = (s) => s.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
const uniqLines = (a) => a.filter((l, i) => i === 0 || l.toLowerCase() !== a[i - 1].toLowerCase());
const href = (u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

function countryFor(kind, heading, postcode) {
  if (kind === 'overseas') return COUNTRIES[heading.toLowerCase()] ?? null;
  const pc = String(postcode || '').toUpperCase();
  if (pc.startsWith('JE')) return 'JE';
  if (pc.startsWith('GY')) return 'GG';
  if (pc.startsWith('IM')) return 'IM';
  return 'GB';
}

// One entry per surgery: a doctor listed at two addresses is two pins on the map.
function parsePage(kind, html, sourceUrl) {
  const out = [];
  let heading = '';
  // Northern Ireland and Wales pages put the area in the page title, not an h2.
  const parts = html.split(/(?=<h[23][\s>])/i);
  for (const part of parts) {
    const h2 = part.match(/^<h2[^>]*>([\s\S]*?)<\/h2>/i);
    if (h2) {
      heading = text(h2[1]).replace(/^\d+\.\s*/, '').trim();
      continue;
    }
    const h3 = part.match(/^<h3[^>]*>([\s\S]*?)<\/h3>/i);
    if (!h3) continue;
    const doctors = text(h3[1]).replace(/\s+/g, ' ').trim();
    if (/unavailable|retired|suspended/i.test(doctors)) continue;

    const blocks = [...part.matchAll(/<div class="address">([\s\S]*?)<\/div><\/div>/gi)];
    const phones = [...part.matchAll(/<p>\s*(?:Tel|Telephone|Phone)[:\s]+([\s\S]*?)<\/p>/gi)].map((m) => lines(text(m[1]))[0]);
    const email = part.match(/href="mailto:([^"]+)"/i)?.[1]?.trim() ?? null;
    const website = part.match(/<a[^>]+rel="external"[^>]+href="([^"]+)"/i)?.[1] ?? null;

    blocks.forEach((b, i) => {
      const addr = uniqLines(lines(text(b[1])));
      if (!addr.length) return;
      let postcode = null;
      const last = addr[addr.length - 1];
      const ukPc = last.replace(/\s+/g, '').replace(/^(.+)(\d[A-Z]{2})$/i, '$1 $2').toUpperCase();
      if (kind === 'uk' && UK_POSTCODE.test(ukPc)) {
        addr.pop();
        postcode = ukPc;
      } else if (kind === 'overseas' && /\d/.test(last) && last.length <= 12 && !/box/i.test(last)) postcode = addr.pop();
      // The town is the last line that isn't a P.O. Box, county or country.
      let region = null;
      let city = null;
      for (let j = addr.length - 1; j >= 1; j--) {
        const l = addr[j].toLowerCase();
        if (/^p\.?\s?o\.?\s*box/i.test(l)) continue;
        // A postal code on its own line above the island or country ("07014", then "Mallorca").
        if (kind === 'overseas' && /^\d{4,6}$/.test(l)) {
          postcode ??= addr[j];
          continue;
        }
        if (AREAS.has(l) || (kind === 'overseas' && COUNTRIES[l] && !['gibraltar', 'monaco'].includes(l))) {
          region ??= /^\(|west indies/.test(l) ? null : addr[j];
          continue;
        }
        // "Palma De Mallorca, 07014, Mallorca" and "Gorleston on Sea, Great Yarmouth": the town is the last named part.
        city = (addr[j].split(',').map((x) => x.trim()).filter((x) => x && !/\d/.test(x) && !AREAS.has(x.toLowerCase())).pop() ?? addr[j])
          .replace(/^\d+(st|nd|rd|th) floor\s+/i, '');
        break;
      }
      // The surgery's name is the first of the top two lines that isn't a room or street.
      const practice =
        addr.length >= 2 ? (addr.slice(0, 2).find((l) => !NOT_A_NAME.test(l) && looksLikeAName(l) && l !== city) ?? null) : null;
      const country = countryFor(kind, heading, postcode);
      if (!country) {
        console.warn('No country for', heading, doctors);
        return;
      }
      out.push({
        name: practice ? `${practice} (${doctors})` : doctors,
        brand: null,
        address: addr.filter((l) => l !== practice && l !== postcode).join(', ') || null,
        city,
        postcode,
        country,
        region: region ?? (kind === 'uk' && !/^other/i.test(heading) ? heading || null : null),
        phone: phones[i] ?? phones[0] ?? null,
        email,
        website: website ? href(website) : null,
        approvals: ['mca'],
        sectors: ['yacht', 'commercial', 'merchant', 'fishing', 'offshore_wind', 'towing'],
        courses: ['eng1'],
        course_pages: website ? { eng1: href(website) } : {},
        dates_url: null,
        dates_format: 'unknown',
        source_urls: [sourceUrl],
        checked: new Date().toISOString().slice(0, 10),
      });
    });
  }
  return out;
}

const all = [];
for (const [kind, slug] of PAGES) {
  const res = await fetch(`${BASE}/${slug}`);
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
  const page = await res.json();
  const found = parsePage(kind, page.details?.body ?? '', `https://www.gov.uk/government/publications/${slug}`);
  console.log(`${slug.split('/').pop()}: ${found.length} surgeries (updated ${page.public_updated_at?.slice(0, 10)})`);
  all.push(...found);
}
const file = path.join(dir, 'providers', 'mca_approved_doctors.json');
fs.writeFileSync(file, JSON.stringify(all, null, 1));
console.log(`${all.length} surgeries -> ${file}`);
