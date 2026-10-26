import { eq, inArray } from 'drizzle-orm';
import fs from 'fs';
import * as schema from '../db/schema.js';
import type { App } from '../index.js';
import { matchCourseCode } from '../utils/courseMatch.js';

/**
 * Reads upcoming course dates from training providers that publish them in a
 * machine-readable way (2.4.0 "Find a course"). Sources live in
 * src/data/course-date-sources.json, built from the provider research. Each
 * provider is re-read weekly, one request at a time, and its rows replaced.
 * Kill switch: COURSE_DATES=off.
 */

export interface DateSource {
  provider_id: string;
  dates_url: string;
  parser: 'jsonld';
}

export interface ParsedDate {
  course_code: string;
  start_date: string;
  end_date: string | null;
  price_text: string | null;
  availability_text: string | null;
  booking_url: string | null;
}

const WEEK_MS = 7 * 24 * 3600 * 1000;
const USER_AGENT = 'SeaTimeTrackerCourseDates/1.0 (+https://forelandmarine.com; course dates for seafarers)';

function loadSources(): DateSource[] {
  try {
    const url = new URL('../data/course-date-sources.json', import.meta.url);
    return JSON.parse(fs.readFileSync(url, 'utf8'));
  } catch {
    return [];
  }
}

const isoDay = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};

function priceText(offers: any): string | null {
  const o = Array.isArray(offers) ? offers[0] : offers;
  if (!o || o.price == null) return null;
  const n = Number(o.price);
  if (!isFinite(n) || n <= 0) return null;
  const cur = String(o.priceCurrency || '').toUpperCase();
  const sym = cur === 'GBP' ? '£' : cur === 'EUR' ? '€' : cur === 'USD' ? '$' : cur ? `${cur} ` : '';
  return `${sym}${n.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;
}

function availability(offers: any, ev: any): string | null {
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
    const name = String(node.name ?? parentName ?? '');
    if (/Course\b/.test(type) && node.hasCourseInstance) visit(node.hasCourseInstance, name);
    if (/Event|CourseInstance/.test(type)) {
      const start = isoDay(node.startDate);
      const code = matchCourseCode(name) ?? (parentName ? matchCourseCode(parentName) : null);
      if (start && code && !/Cancelled/i.test(String(node.eventStatus ?? ''))) {
        out.push({
          course_code: code,
          start_date: start,
          end_date: isoDay(node.endDate),
          price_text: priceText(node.offers),
          availability_text: availability(node.offers, node),
          booking_url: typeof node.url === 'string' ? new URL(node.url, pageUrl).toString() : (node.offers?.url ?? null),
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
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set<string>();
  return out.filter((d) => {
    const k = `${d.course_code}|${d.start_date}`;
    if (d.start_date < today || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function refreshOne(app: App, src: DateSource): Promise<void> {
  const now = new Date();
  try {
    const res = await fetch(src.dates_url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const dates = parseJsonLd(html, src.dates_url);
    await app.db.transaction(async (tx) => {
      await tx.delete(schema.training_course_dates).where(eq(schema.training_course_dates.provider_id, src.provider_id));
      if (dates.length) {
        await tx.insert(schema.training_course_dates).values(
          dates.slice(0, 300).map((d) => ({ ...d, provider_id: src.provider_id, source_url: src.dates_url })),
        );
      }
    });
    await upsertSource(app, src, { last_run_at: now, last_ok_at: now, last_count: String(dates.length), last_error: null });
  } catch (err: any) {
    await upsertSource(app, src, { last_run_at: now, last_error: String(err?.message ?? err).slice(0, 300) });
    app.logger.warn({ provider: src.provider_id, err: err?.message }, 'course dates refresh failed');
  }
}

async function upsertSource(app: App, src: DateSource, fields: Partial<typeof schema.training_date_sources.$inferInsert>) {
  await app.db
    .insert(schema.training_date_sources)
    .values({ provider_id: src.provider_id, dates_url: src.dates_url, parser: src.parser, ...fields })
    .onConflictDoUpdate({
      target: schema.training_date_sources.provider_id,
      set: { dates_url: src.dates_url, parser: src.parser, ...fields },
    });
}

export async function refreshDueCourseDates(app: App): Promise<number> {
  const sources = loadSources();
  if (sources.length === 0) return 0;
  const state = await app.db
    .select()
    .from(schema.training_date_sources)
    .where(inArray(schema.training_date_sources.provider_id, sources.map((s) => s.provider_id)));
  const lastRun = new Map(state.map((s) => [s.provider_id, s.last_run_at?.getTime() ?? 0]));
  const due = sources.filter((s) => Date.now() - (lastRun.get(s.provider_id) ?? 0) > WEEK_MS);
  for (const src of due) {
    await refreshOne(app, src);
    await new Promise((r) => setTimeout(r, 3000));
  }
  return due.length;
}

export function startCourseDateRefresh(app: App) {
  if (process.env.COURSE_DATES === 'off') return;
  const run = () =>
    refreshDueCourseDates(app)
      .then((n) => n && app.logger.info({ refreshed: n }, 'course dates refreshed'))
      .catch((err) => app.logger.error({ err }, 'course dates refresh crashed'));
  setTimeout(run, 5 * 60 * 1000);
  setInterval(run, 6 * 3600 * 1000);
}
