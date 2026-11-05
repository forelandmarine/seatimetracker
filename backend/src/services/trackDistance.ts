import { and, eq, gte, inArray, lte } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { App } from "../index.js";
import { cumulativeTrackDistanceNm, type TrackFix } from "../utils/seaTime.js";

/**
 * Cumulative AIS-track mileage: for entries that have recorded AIS fixes, sum the
 * great-circle legs between consecutive fixes rather than a single start-to-end
 * straight line. This captures continuous / short-leg operations (e.g. a CTV
 * working turbine to turbine in a wind farm), which point-to-point understates.
 * Entries without fixes are left out; callers fall back to distance_nm.
 */
export async function trackDistances(
  app: App,
  userId: string,
  entries: TrackEntry[],
): Promise<Map<string, number>> {
  const trackDistanceByEntry = new Map<string, number>();
  for (const [id, fixes] of await entryFixes(app, userId, entries)) {
    trackDistanceByEntry.set(id, cumulativeTrackDistanceNm(fixes));
  }
  return trackDistanceByEntry;
}

type TrackEntry = { id: string; vessel_id: string | null; start_time: Date | string; end_time: Date | string | null };
export type EntryFix = TrackFix & { is_moving: boolean | null };

/** The AIS fixes inside each entry, for entries with at least two. */
export async function entryFixes(app: App, userId: string, entries: TrackEntry[]): Promise<Map<string, EntryFix[]>> {
  const byEntry = new Map<string, EntryFix[]>();
  if (entries.length > 0) {
    const vesselIds = [...new Set(entries.map((e) => e.vessel_id).filter(Boolean))] as string[];
    const times = entries.flatMap((e) => [
      new Date(e.start_time).getTime(),
      e.end_time ? new Date(e.end_time).getTime() : new Date(e.start_time).getTime(),
    ]);
    if (vesselIds.length > 0 && times.length > 0) {
      const windowStart = new Date(Math.min(...times));
      const windowEnd = new Date(Math.max(...times));
      const fixes = await app.db
        .select({
          vessel_id: schema.ais_checks.vessel_id,
          latitude: schema.ais_checks.latitude,
          longitude: schema.ais_checks.longitude,
          check_time: schema.ais_checks.check_time,
          is_moving: schema.ais_checks.is_moving,
        })
        .from(schema.ais_checks)
        .where(
          and(
            eq(schema.ais_checks.user_id, userId),
            inArray(schema.ais_checks.vessel_id, vesselIds),
            gte(schema.ais_checks.check_time, windowStart),
            lte(schema.ais_checks.check_time, windowEnd),
          ),
        );
      const byVessel = new Map<string, EntryFix[]>();
      for (const f of fixes) {
        if (!f.vessel_id) continue;
        const arr = byVessel.get(f.vessel_id) ?? [];
        arr.push(f as EntryFix);
        byVessel.set(f.vessel_id, arr);
      }
      for (const e of entries) {
        if (!e.vessel_id || !e.end_time) continue;
        const vf = byVessel.get(e.vessel_id);
        if (!vf) continue;
        const s = new Date(e.start_time).getTime();
        const en = new Date(e.end_time).getTime();
        const inWindow = vf.filter((f) => {
          const t = f.check_time instanceof Date ? f.check_time.getTime() : new Date(f.check_time).getTime();
          return t >= s && t <= en;
        });
        if (inWindow.length >= 2) byEntry.set(e.id, inWindow);
      }
    }
  }
  return byEntry;
}
