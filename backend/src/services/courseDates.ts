import { eq, inArray } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { App } from '../index.js';
import { parseHtml, parseIcs, parseJsonLd, parseTribe, tribeNextPage, type HtmlConfig, type ParsedDate, type ParserType } from './courseDateParsers.js';
import { COURSE_DATE_SOURCES } from '../data/course-date-sources.js';

/**
 * Reads upcoming course dates from training providers that publish them in a
 * machine-readable way (2.4.0 "Find a course", more parsers in 2.5.0). Sources
 * live in src/data/course-date-sources.ts, found by scripts/probe-course-dates.ts
 * and the 2.5.0 discovery passes. Each provider is re-read weekly, one request at
 * a time, and its rows replaced. Kill switch: COURSE_DATES=off.
 */

export { parseJsonLd };
export type { ParsedDate };

export interface DateSource {
  provider_id: string;
  dates_url: string;
  parser: ParserType;
  /** html: how to split the page into rows. ics / tribe: optional fixed course. */
  config?: HtmlConfig | { course: string };
}

const WEEK_MS = 7 * 24 * 3600 * 1000;
const USER_AGENT = 'SeaTimeTrackerCourseDates/1.0 (+https://forelandmarine.com; course dates for seafarers)';
const TRIBE_MAX_PAGES = 4;

function loadSources(): DateSource[] {
  return COURSE_DATE_SOURCES;
}

async function getText(url: string, accept: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Fetches and parses one source. Tribe listings may page; pages are read one after another. */
export async function readSource(src: DateSource): Promise<ParsedDate[]> {
  const course = src.config && 'course' in src.config ? src.config.course : undefined;
  switch (src.parser) {
    case 'ics':
      return parseIcs(await getText(src.dates_url, 'text/calendar,text/plain'), src.dates_url, course);
    case 'tribe': {
      const out: ParsedDate[] = [];
      let url: string | null = src.dates_url;
      for (let page = 0; url && page < TRIBE_MAX_PAGES; page++) {
        if (page > 0) await new Promise((r) => setTimeout(r, 2000));
        const body = await getText(url, 'application/json');
        out.push(...parseTribe(body, src.dates_url, course));
        url = tribeNextPage(body);
      }
      const seen = new Set<string>();
      return out.filter((d) => !seen.has(`${d.course_code}|${d.start_date}`) && !!seen.add(`${d.course_code}|${d.start_date}`));
    }
    case 'html':
      if (!src.config || !('block' in src.config)) throw new Error('html source without config');
      return parseHtml(await getText(src.dates_url, 'text/html,application/xhtml+xml'), src.dates_url, src.config);
    default:
      return parseJsonLd(await getText(src.dates_url, 'text/html,application/xhtml+xml'), src.dates_url);
  }
}

async function refreshOne(app: App, src: DateSource): Promise<void> {
  const now = new Date();
  try {
    const dates = await readSource(src);
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
