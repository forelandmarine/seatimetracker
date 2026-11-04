/**
 * enrichEntry.ts: write the rolled-up area and tidal classification onto a
 * sea-time entry from the ais_checks fixes inside its time window.
 *
 * Called when an AIS entry is created, extended or closed, and when a shift
 * closes. Best effort: it never throws, so a failure here cannot break sea-time
 * creation. No-op when COMMERCIAL_PATHWAYS_ENABLED is off.
 *
 * Only commercial-sector work is classified (the vessel is commercial, a
 * workboat or a tug, or the user chose the commercial sector). A confirmed entry
 * that already has values is left alone, so a user's correction stands.
 */
import { and, eq, gte, lte } from 'drizzle-orm';
import type { App } from '../../index.js';
import * as schema from '../../db/schema.js';
import * as authSchema from '../../db/auth-schema.js';
import { commercialPathwaysEnabled } from './singleton.js';
import { aggregateFixClassifications, type EntryClassification } from './aggregate.js';

export interface EnrichableEntry {
  id: string;
  vessel_id: string;
  start_time: Date;
  end_time: Date | null;
}

/** Vessel or user marks this as commercial-sector (workboat) work. */
export function isCommercialWork(
  vessel: { sector?: string | null; is_workboat?: boolean | null; is_tug?: boolean | null } | null | undefined,
  userSector?: string | null,
): boolean {
  return vessel?.sector === 'commercial' || vessel?.is_workboat === true || vessel?.is_tug === true || userSector === 'commercial';
}

/** Read the fixes in the entry window and roll them up (no write). */
export async function classifyEntryFromFixes(app: App, entry: EnrichableEntry): Promise<EntryClassification | null> {
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
  if (fixes.length === 0) return null;
  const agg = aggregateFixClassifications(fixes);
  if (agg.area_category === null && agg.is_tidal === null && agg.is_categorised_water === null) return null;
  return agg;
}

export async function enrichEntryClassification(app: App, entry: EnrichableEntry): Promise<void> {
  if (!commercialPathwaysEnabled()) return;
  try {
    const rows = await app.db
      .select({
        status: schema.sea_time_entries.status,
        user_id: schema.sea_time_entries.user_id,
        area_category: schema.sea_time_entries.area_category,
        is_tidal: schema.sea_time_entries.is_tidal,
        sector: schema.vessels.sector,
        is_workboat: schema.vessels.is_workboat,
        is_tug: schema.vessels.is_tug,
      })
      .from(schema.sea_time_entries)
      .innerJoin(schema.vessels, eq(schema.vessels.id, schema.sea_time_entries.vessel_id))
      .where(eq(schema.sea_time_entries.id, entry.id))
      .limit(1);
    const row = rows[0];
    if (!row) return;
    if (row.status === 'confirmed' && (row.area_category != null || row.is_tidal != null)) return;

    let userSector: string | null = null;
    if (!isCommercialWork(row) && row.user_id) {
      const users = await app.db
        .select({ vessel_sector: authSchema.user.vessel_sector })
        .from(authSchema.user)
        .where(eq(authSchema.user.id, row.user_id))
        .limit(1);
      userSector = users[0]?.vessel_sector ?? null;
    }
    if (!isCommercialWork(row, userSector)) return;

    const agg = await classifyEntryFromFixes(app, entry);
    if (!agg) return;

    await app.db
      .update(schema.sea_time_entries)
      .set(agg)
      .where(eq(schema.sea_time_entries.id, entry.id));
  } catch (err) {
    app.logger?.warn?.({ err, entryId: entry.id }, '[seaAreas] entry classification enrichment failed');
  }
}
