/**
 * Passage refinement job: once a vessel has stopped, check each live-tracked passage
 * waiting in status 'checking' against the Datalastic AIS track, correct its times,
 * and release it to 'pending' for the user to approve. Rules in utils/passageRefinement.ts.
 *
 * The track comes from Datalastic vessel_history (about 2 credits per vessel per day)
 * through the same per-MMSI cache the history import uses, so a day is only bought
 * once per vessel. Today's day is never marked as cached because it is still filling.
 */

import { and, asc, desc, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { App } from '../index.js';
import {
  CHECKING_STATUS,
  TRACK_MARGIN_HOURS,
  isSettled,
  refinePassage,
  refinementEnabled,
  type RefinedPassage,
} from '../utils/passageRefinement.js';
import { addDays, daysBetween, utcDay, type HistoryFix } from '../utils/historyImport.js';

const HISTORY_URL = 'https://api.datalastic.com/api/v0/vessel_history';
const STAT_URL = 'https://api.datalastic.com/api/v0/stat';
const FETCH_TIMEOUT_MS = 20_000;
const RUN_EVERY_MS = 10 * 60_000;
/** Below this many credits left, passages are released unchecked so live tracking keeps running. */
const CREDIT_FLOOR = 1_000;
/** Passages handled per run, oldest first. */
const BATCH_SIZE = 20;
const HOUR_MS = 3_600_000;

let lastRunAt = 0;
let creditCache: { value: number | null; at: number } | null = null;

const apiKey = () => process.env.DATALASTIC_API_KEY || '';

/** Called every scheduler iteration; does real work at most every 10 minutes. */
export async function processPassageRefinements(app: App, now: Date = new Date()): Promise<void> {
  if (!refinementEnabled()) {
    // Switched off: nothing may stay hidden
    await app.db
      .update(schema.sea_time_entries)
      .set({ status: 'pending' })
      .where(eq(schema.sea_time_entries.status, CHECKING_STATUS));
    return;
  }
  if (now.getTime() - lastRunAt < RUN_EVERY_MS) return;
  lastRunAt = now.getTime();

  const waiting = await app.db
    .select({ entry: schema.sea_time_entries, vessel: schema.vessels })
    .from(schema.sea_time_entries)
    .innerJoin(schema.vessels, eq(schema.vessels.id, schema.sea_time_entries.vessel_id))
    .where(and(eq(schema.sea_time_entries.status, CHECKING_STATUS), isNotNull(schema.sea_time_entries.end_time)))
    .orderBy(asc(schema.sea_time_entries.end_time))
    .limit(BATCH_SIZE);

  for (const { entry, vessel } of waiting) {
    try {
      await refineEntry(app, entry, vessel, now);
    } catch (err) {
      app.logger.error({ err, entryId: entry.id, vesselId: vessel.id }, 'Passage refinement failed; will retry');
    }
  }
}

async function refineEntry(
  app: App,
  entry: typeof schema.sea_time_entries.$inferSelect,
  vessel: typeof schema.vessels.$inferSelect,
  now: Date
): Promise<void> {
  const end = entry.end_time!;
  const [latestCheck] = await app.db
    .select({ check_time: schema.ais_checks.check_time, is_moving: schema.ais_checks.is_moving })
    .from(schema.ais_checks)
    .where(eq(schema.ais_checks.vessel_id, vessel.id))
    .orderBy(desc(schema.ais_checks.check_time))
    .limit(1);
  if (!isSettled({ now, entryEnd: end, latestCheck: latestCheck ?? null })) return;

  const live = {
    start_time: entry.start_time,
    end_time: end,
    start_latitude: entry.start_latitude != null ? parseFloat(String(entry.start_latitude)) : null,
    start_longitude: entry.start_longitude != null ? parseFloat(String(entry.start_longitude)) : null,
    end_latitude: entry.end_latitude != null ? parseFloat(String(entry.end_latitude)) : null,
    end_longitude: entry.end_longitude != null ? parseFloat(String(entry.end_longitude)) : null,
  };

  const credits = await creditsRemaining();
  if (credits !== null && credits < CREDIT_FLOOR) {
    app.logger.warn({ entryId: entry.id, credits, floor: CREDIT_FLOOR }, 'Datalastic credits low: releasing passage unchecked');
    await release(app, entry, refinePassage(live, []), 'skipped_low_credits');
    return;
  }

  const fixes = await trackAround(app, vessel.mmsi, live.start_time, live.end_time, now);
  const movingChecks = await app.db
    .select({ check_time: schema.ais_checks.check_time })
    .from(schema.ais_checks)
    .where(
      and(
        eq(schema.ais_checks.vessel_id, vessel.id),
        eq(schema.ais_checks.is_moving, true),
        gte(schema.ais_checks.check_time, live.start_time),
        lte(schema.ais_checks.check_time, live.end_time)
      )
    );
  await release(app, entry, refinePassage(live, fixes, movingChecks.map((c) => c.check_time)));
}

/** Write the result, record the original times, and hand the passage to the user. */
async function release(
  app: App,
  entry: typeof schema.sea_time_entries.$inferSelect,
  result: RefinedPassage,
  outcomeOverride?: string
): Promise<void> {
  const outcome = outcomeOverride ?? result.outcome;
  const updates: Record<string, any> = { status: 'pending' };
  if (result.outcome === 'refined') {
    Object.assign(updates, {
      start_time: result.start_time,
      end_time: result.end_time,
      start_latitude: result.start_latitude != null ? String(result.start_latitude) : null,
      start_longitude: result.start_longitude != null ? String(result.start_longitude) : null,
      end_latitude: result.end_latitude != null ? String(result.end_latitude) : null,
      end_longitude: result.end_longitude != null ? String(result.end_longitude) : null,
      duration_hours: String(result.duration_hours),
      mca_compliant: result.duration_hours >= 4,
    });
    if (result.distance_nm != null) {
      updates.distance_nm = String(result.distance_nm);
      updates.is_stationary = result.distance_nm < 0.5;
    }
  } else if (result.outcome === 'no_movement') {
    const note = 'The AIS track shows no movement for this passage: check it before confirming.';
    updates.notes = entry.notes ? `${entry.notes} ${note}` : note;
  }

  // Guarded on status: if the scheduler re-opened the passage meanwhile, leave it for the next run
  const released = await app.db
    .update(schema.sea_time_entries)
    .set(updates)
    .where(and(eq(schema.sea_time_entries.id, entry.id), eq(schema.sea_time_entries.status, CHECKING_STATUS)))
    .returning({ id: schema.sea_time_entries.id });
  if (released.length === 0) return;

  const originalDuration = entry.end_time
    ? String(Math.round(((entry.end_time.getTime() - entry.start_time.getTime()) / HOUR_MS) * 100) / 100)
    : null;
  await app.db
    .insert(schema.passage_refinements)
    .values({
      entry_id: entry.id,
      outcome,
      original_start_time: entry.start_time,
      original_end_time: entry.end_time,
      refined_start_time: result.start_time,
      refined_end_time: result.end_time,
      original_duration_hours: originalDuration,
      refined_duration_hours: String(result.duration_hours),
      positions_used: result.positions_used,
    })
    // A passage refined again after being extended keeps its very first live start
    .onConflictDoUpdate({
      target: schema.passage_refinements.entry_id,
      set: {
        outcome,
        original_end_time: entry.end_time,
        refined_start_time: result.start_time,
        refined_end_time: result.end_time,
        refined_duration_hours: String(result.duration_hours),
        positions_used: result.positions_used,
        refined_at: new Date(),
      },
    });

  app.logger.info(
    {
      entryId: entry.id,
      outcome,
      liveStart: entry.start_time.toISOString(),
      liveEnd: entry.end_time?.toISOString(),
      start: result.start_time.toISOString(),
      end: result.end_time.toISOString(),
      liveHours: originalDuration,
      hours: result.duration_hours,
      positions: result.positions_used,
    },
    `Passage checked against AIS track (${outcome}) and released for review`
  );
}

// ---------------------------------------------------------------------------
// Datalastic track, through the shared history cache
// ---------------------------------------------------------------------------

interface DatalasticPosition {
  lat: number;
  lon: number;
  speed?: number | null;
  course?: number | null;
  destination?: string | null;
  last_position_UTC?: string;
  last_position_epoch?: number;
}

/** The AIS track from an hour before `start` to an hour after `end` (or now). */
async function trackAround(app: App, mmsi: string, start: Date, end: Date, now: Date): Promise<HistoryFix[]> {
  const from = new Date(start.getTime() - TRACK_MARGIN_HOURS * HOUR_MS);
  const to = new Date(Math.min(end.getTime() + TRACK_MARGIN_HOURS * HOUR_MS, now.getTime()));
  const today = utcDay(now);
  const days = daysBetween(utcDay(from), addDays(utcDay(to), 1));

  // Complete past days already bought (by an import or an earlier refinement)
  const cached = await app.db
    .select({ day: schema.ais_history_days.day })
    .from(schema.ais_history_days)
    .where(and(eq(schema.ais_history_days.mmsi, mmsi), inArray(schema.ais_history_days.day, days)));
  const cachedDays = new Set(cached.map((r) => String(r.day)));
  const missing = days.filter((d) => d >= today || !cachedDays.has(d));
  if (missing.length > 0) {
    await fetchAndStore(app, mmsi, missing[0], addDays(missing[missing.length - 1], 1), today);
  }

  const rows = await app.db
    .select()
    .from(schema.ais_history_positions)
    .where(
      and(
        eq(schema.ais_history_positions.mmsi, mmsi),
        gte(schema.ais_history_positions.position_time, from),
        lte(schema.ais_history_positions.position_time, to)
      )
    )
    .orderBy(asc(schema.ais_history_positions.position_time));
  return rows.map((r) => ({
    time: r.position_time,
    latitude: parseFloat(String(r.latitude)),
    longitude: parseFloat(String(r.longitude)),
    speed_knots: r.speed_knots != null ? parseFloat(String(r.speed_knots)) : null,
    destination: r.destination,
  }));
}

/** Fetch days [from, to) and cache them; only days before `today` are marked complete. */
async function fetchAndStore(app: App, mmsi: string, from: string, to: string, today: string): Promise<void> {
  const url = new URL(HISTORY_URL);
  url.searchParams.set('api-key', apiKey());
  url.searchParams.set('mmsi', mmsi);
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok && res.status !== 404) throw new Error(`Datalastic vessel_history returned ${res.status}`);
  const body = res.status === 404 ? null : ((await res.json()) as any);
  const positions: DatalasticPosition[] = Array.isArray(body?.data?.positions) ? body.data.positions : [];

  const rows = positions
    .map((p) => {
      const time = p.last_position_UTC ? new Date(p.last_position_UTC) : p.last_position_epoch ? new Date(p.last_position_epoch * 1000) : null;
      if (!time || isNaN(time.getTime()) || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
      return {
        mmsi,
        position_time: time,
        latitude: String(p.lat),
        longitude: String(p.lon),
        speed_knots: p.speed != null ? String(p.speed) : null,
        course: p.course != null ? String(p.course) : null,
        destination: p.destination || null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(utcDay(r.position_time), (counts.get(utcDay(r.position_time)) ?? 0) + 1);

  await app.db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 500) {
      await tx.insert(schema.ais_history_positions).values(rows.slice(i, i + 500)).onConflictDoNothing();
    }
    for (const day of daysBetween(from, to)) {
      if (day >= today) continue; // still filling
      await tx
        .insert(schema.ais_history_days)
        .values({ mmsi, day, position_count: counts.get(day) ?? 0 })
        .onConflictDoUpdate({
          target: [schema.ais_history_days.mmsi, schema.ais_history_days.day],
          set: { position_count: counts.get(day) ?? 0, fetched_at: new Date() },
        });
    }
  });
  app.logger.info({ mmsi, from, to, positions: rows.length }, 'Fetched AIS track for passage refinement');
}

/** Credits left this cycle (cached 1 hour). Null if the stat call fails. */
async function creditsRemaining(): Promise<number | null> {
  if (creditCache && Date.now() - creditCache.at < HOUR_MS) return creditCache.value;
  let value: number | null = null;
  try {
    const url = new URL(STAT_URL);
    url.searchParams.set('api-key', apiKey());
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const n = ((await res.json()) as any)?.data?.requests_remaining;
    value = typeof n === 'number' ? n : null;
  } catch {
    value = null;
  }
  creditCache = { value, at: Date.now() };
  return value;
}

/** For tests: forget the run throttle and credit cache. */
export function resetPassageRefinementState(): void {
  lastRunAt = 0;
  creditCache = null;
}
