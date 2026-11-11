import { matchCourseCode, matchCourseRule } from '../utils/courseMatch.js';

/**
 * Parsers for providers' published course dates (2.5.0 "Find a course" passes).
 * Each takes the fetched body and returns upcoming dates mapped to the app's
 * course codes; anything that doesn't map to a code is dropped, never guessed.
 *   jsonld  schema.org Event / CourseInstance JSON-LD in the page
 *   ics     an iCal feed (VEVENT SUMMARY / DTSTART / DTEND / URL)
 *   tribe   The Events Calendar REST API (/wp-json/tribe/events/v1/events)
 *   html    a plain HTML list or table, split into rows by a per-source config
 */

export type ParserType = 'jsonld' | 'ics' | 'tribe' | 'html';

export interface HtmlConfig {
  /** Regex source that starts each row (e.g. '<tr\\b'), no capture groups; the page is split on it. */
  block: string;
  /** Regex source whose group 1 is the course title in a row's text; else the whole row. */
  title?: string;
  /** Match config.title against the row's raw HTML (an aria-label or data attribute) instead. */
  titleHtml?: boolean;
  /** Regex source whose group 1 holds the row's date text (e.g. 'Starts \\| ([^|]+)'); else the whole row. */
  date?: string;
  /**
   * Match config.date against the row's raw HTML. With three groups it reads them
   * as year, month, day (a data attribute such as data-event="ev-xxxx-20261115090000").
   */
  dateHtml?: boolean;
  /** Every row is this course (a page per course); skips title matching. */
  course?: string;
  /** Only rows whose text matches this regex source (a venue on a multi-site page). */
  venue?: string;
  /** Skip rows whose text matches this regex source (e.g. 'online' for rolling e-learning). */
  skip?: string;
  /** How numeric dates read: 12/01/2027 is 12 Jan (dmy, default) or Dec 1 (mdy). */
  dateOrder?: 'dmy' | 'mdy';
}

export interface ParsedDate {
  course_code: string;
  start_date: string;
  end_date: string | null;
  price_text: string | null;
  availability_text: string | null;
  booking_url: string | null;
}

/** Absolute http(s) URL or null; anything else in the page's data is ignored. */
export function httpUrl(v: unknown, base: string): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  try {
    const u = new URL(v.trim(), base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

const isoDay = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};

/** Drops past and far-future dates and repeats of the same course on the same day. */
function upcoming(out: ParsedDate[]): ParsedDate[] {
  const today = new Date().toISOString().slice(0, 10);
  // Nobody publishes real course dates years ahead; 2096 is a placeholder row.
  const horizon = new Date(Date.now() + 2 * 365 * 86_400_000).toISOString().slice(0, 10);
  const seen = new Set<string>();
  return out.filter((d) => {
    const k = `${d.course_code}|${d.start_date}`;
    if (d.start_date < today || d.start_date > horizon || seen.has(k)) return false;
    seen.add(k);
    if (d.end_date && d.end_date < d.start_date) d.end_date = null;
    return true;
  });
}

const ENTITIES: Record<string, string> = { euro: '€', pound: '£', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", hellip: '...' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (n === 8211 || n === 8212) return '-';
      return isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Visible text of an HTML fragment, one space between words. */
export function htmlText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|li|td|th|tr|h\d)>/gi, ' \n ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[–—]/g, '-')
    .replace(/[ \t\r\f\v ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function money(n: number, cur: string): string | null {
  if (!isFinite(n) || n <= 0) return null;
  const c = cur.toUpperCase();
  const sym = c === 'GBP' ? '£' : c === 'EUR' ? '€' : c === 'USD' ? '$' : c ? `${c} ` : '';
  return `${sym}${n.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;
}

/** Reads 1,195.00 or the European 1.049,00 as a number. */
function amount(raw: string): number {
  return /^\d{1,3}(\.\d{3})*,\d{2}$|^\d+,\d{2}$/.test(raw) ? Number(raw.replace(/\./g, '').replace(',', '.')) : Number(raw.replace(/,/g, ''));
}

/** First price written in text as £895, €1,200.00, € 1.049,00, $450 or 895 GBP. */
export function priceInText(text: string): string | null {
  const NUM = '(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2})?|\\d+(?:[.,]\\d{2})?)';
  const m = text.match(new RegExp(`([£€$])\\s?${NUM}`));
  if (m) return money(amount(m[2]), m[1] === '£' ? 'GBP' : m[1] === '€' ? 'EUR' : 'USD');
  const m2 = text.match(new RegExp(`${NUM}\\s?(GBP|EUR|USD|AUD|NZD|ZAR|€|£)(?![\\w])`));
  if (!m2) return null;
  return money(amount(m2[1]), m2[2] === '€' ? 'EUR' : m2[2] === '£' ? 'GBP' : m2[2]);
}

/** Availability from the words a row uses; null when it says nothing clear. */
export function availabilityInText(text: string): string | null {
  if (/cancel+ed/i.test(text)) return 'Cancelled';
  if (/fully booked|sold out|\bfull\b|no (places|spaces) (left|available)|waiting list/i.test(text)) return 'Full';
  if (/(few|limited|last|only \d+) (places|spaces|seats)|limited availability|almost full/i.test(text)) return 'Few places left';
  if (/(places|spaces|seats) (available|left|remaining)|\bavailable\b(?! from)|book now/i.test(text)) return 'Available';
  return null;
}

// ---------------------------------------------------------------- dates in text

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const ORD = '(?:st|nd|rd|th)?';
const SEP = '\\s*(?:-|to|until|till)\\s*';

const pad = (n: number) => String(n).padStart(2, '0');
function ymd(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

export interface DateSpan {
  start: string;
  end: string | null;
}

/**
 * The first date or date range written in a piece of text. Reads 12 January 2027,
 * Mon 12th Jan 2027, 12-15 Jan 2027, 30 Jan - 2 Feb 2027, January 12-15, 2027,
 * Jan 12 - Feb 2 2027, 2027-01-12, and 12/01/2027, 12.01.2027 or 12-01-2027
 * (dateOrder picks d/m or m/d).
 * Dates without a year are ignored: guessing the year is how wrong dates get in.
 */
export function firstDateSpan(text: string, order: 'dmy' | 'mdy' = 'dmy'): DateSpan | null {
  const t = text.replace(/[–—]/g, '-').replace(/,/g, ', ').replace(/\s+/g, ' ');
  const found: { at: number; span: DateSpan }[] = [];
  const add = (at: number, start: string | null, end: string | null) => {
    if (start) found.push({ at, span: { start, end: end && end >= start ? end : null } });
  };
  let m: RegExpExecArray | null;
  const rx = (s: string) => new RegExp(s, 'gi');

  // 12 January 2027 / 12-15 January 2027 / 30 Jan - 2 Feb 2027 / 30 Dec 2026 - 2 Jan 2027
  const dmy = rx(`\\b(\\d{1,2})${ORD}(?:\\s+${MON})?(?:\\s+(\\d{4}))?(?:${SEP}(\\d{1,2})${ORD})?\\s+${MON},?\\s+(\\d{4})\\b`);
  while ((m = dmy.exec(t))) {
    const [, d1, m1, y1, d2, m2, y2] = m;
    const em = MONTHS[m2.toLowerCase().replace('.', '')];
    const ey = Number(y2);
    if (!d2) {
      add(m.index, ymd(ey, em, Number(d1)), null);
      continue;
    }
    const sm = m1 ? MONTHS[m1.toLowerCase().replace('.', '')] : em;
    const sy = y1 ? Number(y1) : sm > em ? ey - 1 : ey;
    add(m.index, ymd(sy, sm, Number(d1)), ymd(ey, em, Number(d2)));
  }
  // January 12-15, 2027 / Jan 12 - Feb 2, 2027 / January 12, 2027
  const mdy = rx(`\\b${MON}\\s+(\\d{1,2})${ORD}(?:,?\\s+(\\d{4}))?(?:${SEP}(?:${MON}\\s+)?(\\d{1,2})${ORD})?,?\\s+(\\d{4})\\b`);
  while ((m = mdy.exec(t))) {
    const [, m1, d1, y1, m2, d2, y2] = m;
    const sm = MONTHS[m1.toLowerCase().replace('.', '')];
    const ey = Number(y2);
    if (y1 && !d2) {
      add(m.index, ymd(Number(y1), sm, Number(d1)), null);
      continue;
    }
    const em = m2 ? MONTHS[m2.toLowerCase().replace('.', '')] : sm;
    const sy = y1 ? Number(y1) : sm > em ? ey - 1 : ey;
    add(m.index, ymd(sy, sm, Number(d1)), d2 ? ymd(ey, em, Number(d2)) : null);
  }
  // 2027-01-12
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
  while ((m = iso.exec(t))) add(m.index, ymd(Number(m[1]), Number(m[2]), Number(m[3])), null);
  // 12/01/2027 or 12.01.2027, optionally "- 15/01/2027"
  const num = /\b(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})\b(?:\s*(?:-|to)\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b)?/g;
  while ((m = num.exec(t))) {
    // A dashed pair with a two-digit year ("12-15-26") is too likely a range or a code.
    if (m[2] === '-' && m[4].length === 2) continue;
    const [a, b] = order === 'mdy' ? [m[3], m[1]] : [m[1], m[3]];
    const end = m[5] ? (order === 'mdy' ? ymd(Number(m[7]), Number(m[5]), Number(m[6])) : ymd(Number(m[7]), Number(m[6]), Number(m[5]))) : null;
    add(m.index, ymd(Number(m[4]), Number(b), Number(a)), end);
  }
  if (!found.length) return null;
  found.sort((x, y) => x.at - y.at || (y.span.end ? 1 : 0) - (x.span.end ? 1 : 0));
  return found[0].span;
}

// ---------------------------------------------------------------- jsonld

function offerPrice(offers: any): string | null {
  const o = Array.isArray(offers) ? offers[0] : offers;
  if (!o || o.price == null) return null;
  return money(Number(o.price), String(o.priceCurrency || ''));
}

function offerAvailability(offers: any, ev: any): string | null {
  const o = Array.isArray(offers) ? offers[0] : offers;
  const a = String(o?.availability || ev?.eventStatus || '');
  if (/SoldOut/i.test(a)) return 'Full';
  if (/LimitedAvailability/i.test(a)) return 'Few places left';
  if (/InStock|OnlineOnly|PreOrder/i.test(a)) return 'Available';
  if (/Cancelled/i.test(a)) return 'Cancelled';
  return null;
}

/** schema.org Event / CourseInstance blocks embedded as JSON-LD. */
export function parseJsonLd(html: string, pageUrl: string): ParsedDate[] {
  const out: ParsedDate[] = [];
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  const visit = (node: any, parentName?: string) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, parentName));
    if (node['@graph']) visit(node['@graph'], parentName);
    const type = ([] as string[]).concat(node['@type'] ?? []).join(' ');
    const name = decodeEntities(String(node.name ?? parentName ?? ''));
    if (/Course\b/.test(type) && node.hasCourseInstance) visit(node.hasCourseInstance, name);
    if (/Event|CourseInstance/.test(type)) {
      const start = isoDay(node.startDate);
      const code = matchCourseCode(name) ?? (parentName ? matchCourseCode(parentName) : null);
      if (start && code && !/Cancelled/i.test(String(node.eventStatus ?? ''))) {
        out.push({
          course_code: code,
          start_date: start,
          end_date: isoDay(node.endDate),
          price_text: offerPrice(node.offers),
          availability_text: offerAvailability(node.offers, node),
          booking_url: httpUrl(node.url, pageUrl) ?? httpUrl((Array.isArray(node.offers) ? node.offers[0] : node.offers)?.url, pageUrl),
        });
      }
    }
  };
  for (const b of blocks) {
    const json = b.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      visit(JSON.parse(json));
    } catch {
      // ignore malformed blocks
    }
  }
  return upcoming(out);
}

// ---------------------------------------------------------------- ics

function icsDay(v: string | undefined): string | null {
  const m = v?.match(/(\d{4})(\d{2})(\d{2})/);
  return m ? ymd(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

/** iCal feed: a ParsedDate per run (DTSTART plus any RDATEs) of each VEVENT whose SUMMARY maps to a course. RRULE isn't expanded. */
export function parseIcs(ics: string, feedUrl: string, course?: string): ParsedDate[] {
  const lines = ics.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out: ParsedDate[] = [];
  let ev: Record<string, { params: string; value: string }> | null = null;
  let extra: string[] = [];
  let skipped = new Set<string>();
  const unescape = (s: string) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
  const days = (v: string) => v.split(',').map(icsDay).filter((d): d is string => !!d);
  const shift = (day: string, n: number) => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      ev = {};
      extra = [];
      skipped = new Set();
    } else if (line === 'END:VEVENT' && ev) {
      const summary = unescape(ev.SUMMARY?.value ?? '');
      const code = course ?? matchCourseCode(summary);
      const start = icsDay(ev.DTSTART?.value);
      let end = icsDay(ev.DTEND?.value);
      // An all-day DTEND is exclusive: a course on the 12th to 15th ends DTEND 16th.
      if (end && (/VALUE=DATE(?!-)/.test(ev.DTEND?.params ?? '') || /^\d{8}$/.test(ev.DTEND?.value ?? ''))) end = shift(end, -1);
      if (code && start && !/CANCELLED/i.test(ev.STATUS?.value ?? '')) {
        const desc = unescape(ev.DESCRIPTION?.value ?? '');
        const length = end && end > start ? Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) : 0;
        // RDATE lists further runs of the same course (Event Organiser feeds); EXDATE removes runs.
        for (const day of [start, ...extra]) {
          if (skipped.has(day)) continue;
          out.push({
            course_code: code,
            start_date: day,
            end_date: length ? shift(day, length) : null,
            price_text: priceInText(desc),
            availability_text: availabilityInText(summary),
            booking_url: httpUrl(ev.URL?.value, feedUrl),
          });
        }
      }
      ev = null;
    } else if (ev) {
      const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/);
      if (!m) continue;
      if (m[1] === 'RDATE') extra.push(...days(m[3]));
      else if (m[1] === 'EXDATE') days(m[3]).forEach((d) => skipped.add(d));
      else if (!ev[m[1]]) ev[m[1]] = { params: m[2], value: m[3] };
    }
  }
  out.sort((a, b) => a.start_date.localeCompare(b.start_date));
  return upcoming(out);
}

// ---------------------------------------------------------------- tribe

/** The Events Calendar (WordPress) REST response: { events: [...] }. */
export function parseTribe(json: string, apiUrl: string, course?: string): ParsedDate[] {
  let data: any;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  const out: ParsedDate[] = [];
  for (const e of Array.isArray(data?.events) ? data.events : []) {
    const title = htmlText(String(e?.title ?? ''));
    const cats = (Array.isArray(e?.categories) ? e.categories : []).map((c: any) => String(c?.name ?? '')).join(' ');
    // Categories only when the title hits no rule at all: a title left unmapped on
    // purpose ("Mile Builder") mustn't pick up a course from its category list.
    const rule = matchCourseRule(title);
    const code = course ?? (rule ? rule.code : cats ? matchCourseCode(cats) : null);
    const start = isoDay(e?.start_date);
    if (!code || !start || /cancel+ed/i.test(title)) continue;
    const cost = typeof e?.cost === 'string' ? e.cost : '';
    const costValue = Number(e?.cost_details?.values?.[0]);
    const cur = String(e?.cost_details?.currency_code ?? '') || (cost.includes('£') ? 'GBP' : cost.includes('€') ? 'EUR' : cost.includes('$') ? 'USD' : '');
    out.push({
      course_code: code,
      start_date: start,
      end_date: isoDay(e?.end_date),
      price_text: isFinite(costValue) && costValue > 0 ? money(costValue, cur) : priceInText(cost),
      availability_text: availabilityInText(title),
      booking_url: httpUrl(e?.url, apiUrl),
    });
  }
  return upcoming(out);
}

/** The next page of a Tribe REST listing, if the response names one. */
export function tribeNextPage(json: string): string | null {
  try {
    const n = JSON.parse(json)?.next_rest_url;
    return typeof n === 'string' && /^https?:\/\//.test(n) ? n : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- html

/**
 * A plain HTML timetable: the page is split into rows where config.block matches,
 * and each row needs a course (from config.course, config.title or its own text)
 * and a dated start. Rows without both are skipped.
 */
export function parseHtml(html: string, pageUrl: string, config: HtmlConfig): ParsedDate[] {
  const body = html.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ');
  const blockRe = new RegExp(`^(?:${config.block})`, 'i');
  // Whatever comes before the first row (page header, nav) isn't a row.
  const parts = body.split(new RegExp(`(?=${config.block})`, 'i')).filter((p) => blockRe.test(p));
  const titleRe = config.title ? new RegExp(config.title, 'i') : null;
  const dateRe = config.date ? new RegExp(config.date, 'i') : null;
  const venueRe = config.venue ? new RegExp(config.venue, 'i') : null;
  const skipRe = config.skip ? new RegExp(config.skip, 'i') : null;
  const out: ParsedDate[] = [];
  for (const part of parts) {
    const text = htmlText(part).replace(/\n/g, ' | ');
    if ((venueRe && !venueRe.test(text)) || (skipRe && skipRe.test(text))) continue;
    const title = titleRe ? decodeEntities(titleRe.exec(config.titleHtml ? part : text)?.[1] ?? '') : text;
    const code = config.course ?? (title ? matchCourseCode(title) : null);
    if (!code) continue;
    const dm = dateRe ? dateRe.exec(config.dateHtml ? part : text) : null;
    const dateText = !dateRe ? text : dm?.[3] ? `${dm[1]}-${dm[2]}-${dm[3]}` : dm?.[1] ?? '';
    const span = dateText ? firstDateSpan(dateText, config.dateOrder ?? 'dmy') : null;
    if (!span) continue;
    const href = part.match(/<a\b[^>]*href=["']([^"'#][^"']*)["']/i)?.[1];
    out.push({
      course_code: code,
      start_date: span.start,
      end_date: span.end,
      price_text: priceInText(text),
      availability_text: availabilityInText(text),
      booking_url: href ? httpUrl(decodeEntities(href), pageUrl) : null,
    });
  }
  return upcoming(out);
}
