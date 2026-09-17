/**
 * enrichEntry.ts — write the aggregate area/tidal classification onto a sea-time
 * entry from the ais_checks fixes inside its time window.
 *
 * COMMERCIAL PATHWAYS PREP — DARK BY DEFAULT + best-effort. No-op when
 * COMMERCIAL_PATHWAYS_ENABLED is off, and never throws (enrichment must not break
 * sea-time creation). Call this AFTER a sea-time entry is created/updated; it is
 * intentionally decoupled from the ~12 entry mutation sites so it can be wired in
 * at one point when the flag is enabled and real classified data exists.
 */
import { and, eq, gte, lte } from 'drizzle-orm';
import type { App } from '../../index.js';
import * as schema from '../../db/schema.js';
import { commercialPathwaysEnabled } from './singleton.js';
import { aggregateFixClassifications } from './aggregate.js';

export interface EnrichableEntry {
  id: string;
  vessel_id: string;
  start_time: Date;
  end_time: Date | null;
}

export async function enrichEntryClassification(app: App, entry: EnrichableEntry): Promise<void> {
  if (!commercialPathwaysEnabled()) return;
  try {
    const end = entry.end_time ?? new Date();
    const fixes = await app.db
      .select({
        area_category: schema.ais_checks.area_category,
        is_tidal: schema.ais_checks.is_tidal,
      })
      .from(schema.ais_checks)
      .where(
        and(
          eq(schema.ais_checks.vessel_id, entry.vessel_id),
          gte(schema.ais_checks.check_time, entry.start_time),
          lte(schema.ais_checks.check_time, end),
        ),
      );

    if (fixes.length === 0) return;

    const agg = aggregateFixClassifications(fixes);
    if (agg.area_category === null && agg.is_tidal === null && agg.is_categorised_water === null) return;

    await app.db
      .update(schema.sea_time_entries)
      .set(agg)
      .where(eq(schema.sea_time_entries.id, entry.id));
  } catch (err) {
    app.logger?.warn?.({ err, entryId: entry.id }, '[seaAreas] entry classification enrichment failed');
  }
}
