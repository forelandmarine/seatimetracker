/**
 * Sole watchkeeper periods: database side.
 *
 * Loads each vessel's periods and attaches them to entries so isSoleWatchEntry
 * can match by date, and keeps the old vessels.is_sole_watchkeeper flag in step
 * for app builds before 2.5.0 (on while a period covers today).
 *
 * If the periods table is missing (backend deployed before the manual SQL),
 * loading returns null and the old flag keeps working as before.
 */
import { asc, eq, inArray } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { App } from '../index.js';
import { getCalendarDay, isSoleWatchEntry } from '../utils/seaTime.js';
import { legacyFlagValue, sortPeriods, toDay, type SoleWatchPeriod } from '../utils/soleWatch.js';

export interface StoredSoleWatchPeriod extends SoleWatchPeriod {
  id: string;
  vessel_id: string;
}

export function todayUtc(now: Date = new Date()): string {
  return getCalendarDay(now);
}

/** Periods per vessel id, or null when the table cannot be read. */
export async function loadSoleWatchPeriods(app: App, vesselIds: string[]): Promise<Map<string, StoredSoleWatchPeriod[]> | null> {
  const out = new Map<string, StoredSoleWatchPeriod[]>();
  const ids = [...new Set(vesselIds.filter(Boolean))];
  if (!ids.length) return out;
  try {
    const rows = await app.db
      .select()
      .from(schema.vessel_sole_watch_periods)
      .where(inArray(schema.vessel_sole_watch_periods.vessel_id, ids))
      .orderBy(asc(schema.vessel_sole_watch_periods.start_date));
    for (const r of rows) {
      const list = out.get(r.vessel_id) ?? [];
      list.push({ id: r.id, vessel_id: r.vessel_id, start_date: toDay(r.start_date), end_date: toDay(r.end_date) });
      out.set(r.vessel_id, list);
    }
    for (const [k, list] of out) out.set(k, sortPeriods(list));
    return out;
  } catch (err) {
    app.logger.warn({ err }, 'Sole watch periods could not be read; using the vessel flag');
    return null;
  }
}

/**
 * Attach each vessel's periods to its entries (vessel.sole_watch_periods) and
 * mark each entry with is_sole_watch. Entries keep their other fields.
 */
export async function entriesWithSoleWatch<E extends { vessel_id: string; start_time: Date | string; service_type?: string | null; vessel?: any }>(
  app: App,
  entries: E[]
): Promise<(E & { is_sole_watch: boolean })[]> {
  const periods = await loadSoleWatchPeriods(app, entries.map((e) => e.vessel_id));
  return entries.map((e) => {
    const vessel = periods && e.vessel ? { ...e.vessel, sole_watch_periods: periods.get(e.vessel_id) ?? [] } : e.vessel;
    const withPeriods = { ...e, vessel };
    return { ...withPeriods, is_sole_watch: isSoleWatchEntry(withPeriods as any) };
  });
}

/**
 * Replace a vessel's periods with a new set and sync the old flag. The caller
 * has already checked ownership and that the set has no overlaps.
 */
export async function replaceVesselPeriods(
  app: App,
  vessel: { id: string; user_id: string | null },
  periods: SoleWatchPeriod[],
  today: string = todayUtc()
): Promise<StoredSoleWatchPeriod[]> {
  await app.db.transaction(async (tx) => {
    await tx.delete(schema.vessel_sole_watch_periods).where(eq(schema.vessel_sole_watch_periods.vessel_id, vessel.id));
    if (periods.length) {
      await tx.insert(schema.vessel_sole_watch_periods).values(
        periods.map((p) => ({ vessel_id: vessel.id, user_id: vessel.user_id, start_date: p.start_date, end_date: p.end_date }))
      );
    }
    await tx
      .update(schema.vessels)
      .set({ is_sole_watchkeeper: legacyFlagValue(periods, today), updated_at: new Date() })
      .where(eq(schema.vessels.id, vessel.id));
  });
  return (await loadSoleWatchPeriods(app, [vessel.id]))?.get(vessel.id) ?? [];
}

/** Set the old flag from the vessel's stored periods (after a single-period edit). */
export async function syncSoleWatchFlag(app: App, vesselId: string, today: string = todayUtc()): Promise<boolean> {
  const periods = (await loadSoleWatchPeriods(app, [vesselId]))?.get(vesselId) ?? [];
  const value = legacyFlagValue(periods, today);
  await app.db
    .update(schema.vessels)
    .set({ is_sole_watchkeeper: value, updated_at: new Date() })
    .where(eq(schema.vessels.id, vesselId));
  return value;
}
