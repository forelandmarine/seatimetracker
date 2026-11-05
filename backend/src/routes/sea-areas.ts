/**
 * Workboat sea areas for commercial-sector users (guidance only, nothing here
 * changes any count):
 *   GET /api/sea-areas/breakdown?vesselId=   days by area (A to D, sea, tidal, non-tidal) and near coastal or unlimited
 *   GET /api/sea-time/:id/area-guidance       one trip's Workboat Code area category, the tickets that cover it,
 *                                             near coastal or unlimited, and the high-speed craft rule (WBC3 Note F)
 */
import type { FastifyInstance } from 'fastify';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import * as authSchema from '../db/auth-schema.js';
import type { App } from '../index.js';
import { extractUserIdFromRequest } from '../middleware/auth.js';
import { isCommercialWork } from '../utils/seaAreas/enrichEntry.js';
import { fixArea } from '../utils/seaAreas/aggregate.js';
import { getSeaAreaClassifier } from '../utils/seaAreas/singleton.js';
import { areaDayBreakdown, ticketsForTrip, wbc3AreaForTrack } from '../utils/workboatArea.js';
import { coastalDayBreakdown, coastalLimitForFixes } from '../utils/nearCoastal.js';
import { ADVANCED_POWERBOAT_TYPES } from '../utils/highSpeed.js';
import { coastalFixes, nearCoastalMeasures } from '../services/nearCoastal.js';

async function userSector(app: App, userId: string): Promise<string | null> {
  const rows = await app.db
    .select({ vessel_sector: authSchema.user.vessel_sector })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, userId))
    .limit(1);
  return rows[0]?.vessel_sector ?? null;
}

export function register(app: App, fastify: FastifyInstance) {
  fastify.get<{ Querystring: { vesselId?: string } }>('/api/sea-areas/breakdown', {
    schema: {
      description: 'Days by sea area for commercial-sector work (guidance; the MCA decides which waters count)',
      tags: ['sea-areas'],
      querystring: { type: 'object', properties: { vesselId: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: 'Authentication required' });
    const { vesselId } = request.query;
    const sector = await userSector(app, userId);

    const rows = await app.db
      .select({ entry: schema.sea_time_entries, vessel: schema.vessels })
      .from(schema.sea_time_entries)
      .innerJoin(schema.vessels, eq(schema.vessels.id, schema.sea_time_entries.vessel_id))
      .where(
        and(
          eq(schema.sea_time_entries.user_id, userId),
          eq(schema.sea_time_entries.status, 'confirmed'),
          ...(vesselId ? [eq(schema.sea_time_entries.vessel_id, vesselId)] : []),
        ),
      );
    const commercialRows = rows.filter((r) => isCommercialWork(r.vessel, sector));
    const commercial = sector === 'commercial' || commercialRows.length > 0;
    const commercialEntries = commercialRows.map((r) => r.entry);
    // Near coastal or unlimited days (MSN 1856 s.5), measured from the AIS fixes
    const measures = commercialEntries.length > 0 ? nearCoastalMeasures() : null;
    let coastal = null;
    if (measures) {
      try {
        coastal = coastalDayBreakdown(commercialEntries, await coastalFixes(app, userId, commercialEntries), measures);
      } catch (err) {
        app.logger.warn({ err }, 'Near-coastal day count failed; breakdown sent without it');
      }
    }
    return reply.code(200).send({
      commercial,
      breakdown: areaDayBreakdown(commercialEntries),
      coastal,
    });
  });

  fastify.get<{ Params: { id: string } }>('/api/sea-time/:id/area-guidance', {
    schema: {
      description: "One trip's Workboat Code 3 area category from AIS and the tickets that cover it (guidance)",
      tags: ['sea-areas'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: 'Authentication required' });

    const rows = await app.db
      .select({ entry: schema.sea_time_entries, vessel: schema.vessels })
      .from(schema.sea_time_entries)
      .innerJoin(schema.vessels, eq(schema.vessels.id, schema.sea_time_entries.vessel_id))
      .where(eq(schema.sea_time_entries.id, request.params.id))
      .limit(1);
    const row = rows[0];
    if (!row) return reply.code(404).send({ error: 'Sea time entry not found' });
    if (row.entry.user_id !== userId) return reply.code(403).send({ error: 'Not authorized to access this entry' });

    const { entry, vessel } = row;
    const commercial = isCommercialWork(vessel, await userSector(app, userId));
    const base = {
      commercial,
      area_category: entry.area_category ?? null,
      is_tidal: entry.is_tidal ?? null,
      is_categorised_water: entry.is_categorised_water ?? null,
    };
    const classifier = getSeaAreaClassifier();
    if (!commercial || !classifier) return reply.code(200).send({ ...base, wbc3: null, tickets: [], near_coastal: null, high_speed: null });

    const fixes = await app.db
      .select({
        latitude: schema.ais_checks.latitude,
        longitude: schema.ais_checks.longitude,
        area_category: schema.ais_checks.area_category,
        is_tidal: schema.ais_checks.is_tidal,
      })
      .from(schema.ais_checks)
      .where(
        and(
          eq(schema.ais_checks.vessel_id, entry.vessel_id),
          gte(schema.ais_checks.check_time, entry.start_time),
          lte(schema.ais_checks.check_time, entry.end_time ?? new Date()),
        ),
      )
      .orderBy(asc(schema.ais_checks.check_time));
    const track = fixes.map((f) => ({ lat: Number(f.latitude), lon: Number(f.longitude), area: fixArea(f) }));
    const wbc3 = wbc3AreaForTrack(track, classifier);

    const certs = await app.db
      .select({ certificate_type: schema.certificates.certificate_type, expiry_date: schema.certificates.expiry_date })
      .from(schema.certificates)
      .where(eq(schema.certificates.user_id, userId));

    // Near coastal or unlimited (MSN 1856 s.5): every fix within 150 nm of a UK safe haven or 30 nm of Ireland
    const near_coastal = coastalLimitForFixes(fixes, nearCoastalMeasures() ?? classifier);
    // WBC3 Table A5.1 Note F: the master of a high-speed workboat needs Advanced Powerboat
    const today = new Date().toISOString().slice(0, 10);
    const high_speed = vessel.is_high_speed === true
      ? {
          rule: 'wbc3_table_a5_1_note_f',
          as_master: entry.rank === 'master',
          powerboat_advanced_held: certs.some(
            (c) => ADVANCED_POWERBOAT_TYPES.includes(c.certificate_type) && (!c.expiry_date || String(c.expiry_date).slice(0, 10) >= today),
          ),
        }
      : null;

    return reply.code(200).send({ ...base, wbc3, tickets: ticketsForTrip(wbc3, certs), near_coastal, high_speed });
  });
}
