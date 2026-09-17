/**
 * classifyFix.ts — classify a single AIS fix for storage on ais_checks.
 *
 * COMMERCIAL PATHWAYS PREP — DARK BY DEFAULT. This is called at AIS ingest
 * (routes/ais.ts, services/scheduler.ts). It is fully null-safe and flag-gated:
 * when COMMERCIAL_PATHWAYS_ENABLED is not 'true' the classifier singleton is
 * null, so this returns {} and the insert writes no classification columns —
 * i.e. the live yachting app's ingest is completely unaffected.
 *
 * It NEVER throws: AIS ingestion must not fail because classification failed.
 */
import { getSeaAreaClassifier } from './singleton.js';
import { seasonForDate } from './areaClassification.js';

export interface FixClassificationColumns {
  area_category?: string | null;
  is_tidal?: boolean | null;
  season?: string | null;
}

/**
 * Returns the columns to merge into an ais_checks insert .values({...}).
 * Empty object when pathways are disabled, coordinates are missing/invalid, or
 * the classifier could not load — spreading {} is a no-op, leaving the columns null.
 */
export function classifyFixForStorage(
  latitude: string | number | null | undefined,
  longitude: string | number | null | undefined,
  checkTime: Date,
): FixClassificationColumns {
  const classifier = getSeaAreaClassifier();
  if (!classifier) return {};

  const lat = typeof latitude === 'string' ? Number(latitude) : latitude;
  const lon = typeof longitude === 'string' ? Number(longitude) : longitude;
  if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) return {};

  try {
    const r = classifier.classifyPoint({ lat, lon }, { date: checkTime });
    return {
      area_category: r.areaCategory,
      is_tidal: r.isTidal,
      season: seasonForDate(checkTime),
    };
  } catch {
    // Classification is best-effort context; never block the AIS write.
    return {};
  }
}
