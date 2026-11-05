import { and, eq, gte, inArray, lte } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { App } from "../index.js";
import { getSeaAreaClassifier } from "../utils/seaAreas/singleton.js";
import { cachedMeasures, type CoastalVesselFix, type NearCoastalMeasures } from "../utils/nearCoastal.js";

/** The classifier's distances, cached for one request; null when the classifier is off. */
export function nearCoastalMeasures(): NearCoastalMeasures | null {
  const classifier = getSeaAreaClassifier();
  return classifier ? cachedMeasures(classifier) : null;
}

/**
 * The user's AIS fixes on the entries' vessels across the entries' time span,
 * for the near-coastal label (utils/nearCoastal.ts). Same window query as
 * trackDistances.
 */
export async function coastalFixes(
  app: App,
  userId: string,
  entries: Array<{ vessel_id: string | null; start_time: Date | string; end_time: Date | string | null }>,
): Promise<CoastalVesselFix[]> {
  const vesselIds = [...new Set(entries.map((e) => e.vessel_id).filter(Boolean))] as string[];
  if (vesselIds.length === 0) return [];
  const times = entries.flatMap((e) => [
    new Date(e.start_time).getTime(),
    e.end_time ? new Date(e.end_time).getTime() : new Date(e.start_time).getTime(),
  ]);
  return app.db
    .select({
      vessel_id: schema.ais_checks.vessel_id,
      check_time: schema.ais_checks.check_time,
      latitude: schema.ais_checks.latitude,
      longitude: schema.ais_checks.longitude,
      area_category: schema.ais_checks.area_category,
    })
    .from(schema.ais_checks)
    .where(
      and(
        eq(schema.ais_checks.user_id, userId),
        inArray(schema.ais_checks.vessel_id, vesselIds),
        gte(schema.ais_checks.check_time, new Date(Math.min(...times))),
        lte(schema.ais_checks.check_time, new Date(Math.max(...times))),
      ),
    );
}
