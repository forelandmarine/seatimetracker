import type { FastifyInstance } from "fastify";
import { eq, and, isNull, isNotNull, desc, lte, gte, notInArray, inArray, or } from "drizzle-orm";
import * as schema from "../db/schema.js";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import { CHECKING_CONFIRM_ERROR, CHECKING_STATUS, HIDDEN_ENTRY_STATUSES } from "../utils/passageRefinement.js";
import {
  calculateDurationHours,
  calculateSeaDays,
  entrySeaDays,
  samsaEntryDates,
  calculateDistanceNauticalMiles,
  getCalendarDay,
  isValidServiceType,
  VALID_SERVICE_TYPES,
} from "../utils/seaTime.js";
import { MANUAL_SHIFT_NOTE_PREFIX, MAX_SHIFT_HOURS, UUID_RE, resolveShiftEnd } from "../utils/shifts.js";
import { formatHoursMinutes } from "../utils/duration.js";
import { enrichEntryClassification } from "../utils/seaAreas/enrichEntry.js";
import { closeOpenAisPassages, dedupeOpenShifts, findOpenShift, rejectAisPassagesCoveredByShift } from "../services/shifts.js";
import { entriesWithSoleWatch } from "../services/soleWatch.js";
import { SIGNATURE_CLEARED, changesSignedFields, entrySignatureView } from "../utils/entrySignature.js";

// Validate certificate belongs to the authenticated user
async function validateCertificateOwnership(app: App, certificateId: string | null | undefined, userId: string): Promise<boolean> {
  if (!certificateId) return true;
  const certs = await app.db.select({ id: schema.certificates.id }).from(schema.certificates)
    .where(and(eq(schema.certificates.id, certificateId), eq(schema.certificates.user_id, userId)));
  return certs.length > 0;
}

// sea_days stored on one entry, counted under the user's chosen maritime
// authority (MCA when none is set). Vessel tonnage is needed for USCG.
async function storedSeaDays(
  app: App,
  userId: string,
  entry: { id?: string; vessel_id: string; start_time: Date; end_time: Date | null; service_type?: string | null; sea_days?: number | null; status?: string | null; is_stationary?: boolean | null }
): Promise<number> {
  const [u] = await app.db
    .select({ authority: authSchema.user.maritime_authority })
    .from(authSchema.user)
    .where(eq(authSchema.user.id, userId));
  const [vessel] = await app.db
    .select({ vessel_name: schema.vessels.vessel_name, gross_tonnes: schema.vessels.gross_tonnes, tonnage_itc: schema.vessels.tonnage_itc })
    .from(schema.vessels)
    .where(eq(schema.vessels.id, entry.vessel_id));
  const claimed = u?.authority === 'samsa' ? await samsaClaimedDates(app, userId, entry) : undefined;
  return entrySeaDays({ ...entry, vessel: vessel ?? null }, u?.authority, undefined, claimed);
}

// SAMSA counts any day touched, so a date already held by another confirmed
// entry must not be stored again on this one (per-entry sums would double count).
export async function samsaClaimedDates(
  app: App,
  userId: string,
  entry: { id?: string; start_time: Date; end_time: Date | null }
): Promise<Set<string>> {
  const from = new Date(new Date(entry.start_time).getTime() - 86_400_000);
  const to = new Date(new Date(entry.end_time ?? entry.start_time).getTime() + 86_400_000);
  const others = await app.db
    .select()
    .from(schema.sea_time_entries)
    .where(and(
      eq(schema.sea_time_entries.user_id, userId),
      eq(schema.sea_time_entries.status, 'confirmed'),
      lte(schema.sea_time_entries.start_time, to),
      or(isNull(schema.sea_time_entries.end_time), gte(schema.sea_time_entries.end_time, from)),
    ));
  const claimed = new Set<string>();
  for (const o of others) if (o.id !== entry.id) samsaEntryDates(o as any).forEach((d) => claimed.add(d));
  return claimed;
}

const VALID_TRADE_AREAS = ['unlimited', 'near_coastal', 'coastal', 'inland'] as const;
const VALID_RANKS = ['master', 'chief_officer', 'second_officer', 'third_officer', 'oow', 'chief_engineer', 'second_engineer', 'eto', 'cadet', 'rating'] as const;

function isValidTradeArea(value: any): boolean {
  return value === null || (typeof value === 'string' && (VALID_TRADE_AREAS as readonly string[]).includes(value));
}

function isValidRank(value: any): boolean {
  return value === null || (typeof value === 'string' && (VALID_RANKS as readonly string[]).includes(value));
}

// Helper function to check if another entry exists for the same calendar day
// Uses SQL date range filter instead of loading all entries (performance fix)
async function checkEntryExistsForDay(app: App, userId: string, calendarDay: string, excludeEntryId?: string): Promise<boolean> {
  const dayStart = new Date(`${calendarDay}T00:00:00.000Z`);
  const dayEnd = new Date(`${calendarDay}T23:59:59.999Z`);

  const conditions = [
    eq(schema.sea_time_entries.user_id, userId),
    gte(schema.sea_time_entries.start_time, dayStart),
    lte(schema.sea_time_entries.start_time, dayEnd),
  ];

  const entries = await app.db
    .select({ id: schema.sea_time_entries.id })
    .from(schema.sea_time_entries)
    .where(and(...conditions))
    .limit(2);

  if (excludeEntryId) {
    return entries.some(e => e.id !== excludeEntryId);
  }
  return entries.length > 0;
}

// Helper function to transform vessel object for API response
function transformVesselForResponse(vessel: any) {
  return {
    id: vessel.id,
    mmsi: vessel.mmsi,
    vessel_name: vessel.vessel_name,
    callsign: vessel.callsign,
    flag: vessel.flag,
    vessel_type: vessel.type, // Map 'type' database field to 'vessel_type' in API response
    is_active: vessel.is_active,
    created_at: vessel.created_at,
  };
}

/** Workboat sea area and dual capacity the user can set on an entry (request body). */
const AREA_BODY_PROPS = {
  area_category: { type: ['string', 'null'], enum: ['A', 'B', 'C', 'D', 'sea', null], description: 'MSN 1837 category A to D, or sea (guidance)' },
  is_tidal: { type: ['boolean', 'null'], description: 'Tidal waters (guidance)' },
  dual_capacity: { type: ['boolean', 'null'], description: 'Served in a dual deck and engine capacity (MGN 496 4.5, counts at 50%)' },
} as const;

/** Workboat sea-area fields on an entry (response schema). */
const ENTRY_AREA_PROPS = {
  area_category: { type: ['string', 'null'] },
  is_tidal: { type: ['boolean', 'null'] },
  is_categorised_water: { type: ['boolean', 'null'] },
  dual_capacity: { type: ['boolean', 'null'] },
} as const;

// Detail fields the edit screen loads back. Without them in the response schema
// Fastify drops them, and saving the entry writes them back as null.
const ENTRY_DETAIL_PROPS = {
  rank: { type: ['string', 'null'] },
  date_joined: { type: ['string', 'null'] },
  date_left: { type: ['string', 'null'] },
  trade_area: { type: ['string', 'null'] },
  bridge_watch_hours: { type: ['number', 'null'] },
  engine_watch_hours: { type: ['number', 'null'] },
  night_watch_hours: { type: ['number', 'null'] },
  certificate_id: { type: ['string', 'null'] },
  from_port: { type: ['string', 'null'] },
  to_port: { type: ['string', 'null'] },
  // Who signed the entry (entrySignatureView); the image itself is not sent
  signature: {
    type: ['object', 'null'],
    properties: {
      signer_name: { type: 'string' },
      signer_capacity: { type: 'string' },
      signed_at: { type: 'string' },
      method: { type: 'string' },
    },
  },
} as const;

// Helper function to transform sea time entry for API response
// Detail fields the edit screen loads back. Without them in the response schema
// Fastify drops them, and saving the entry writes them back as null.
const ENTRY_DETAIL_PROPS = {
  rank: { type: ['string', 'null'] },
  date_joined: { type: ['string', 'null'] },
  date_left: { type: ['string', 'null'] },
  trade_area: { type: ['string', 'null'] },
  bridge_watch_hours: { type: ['number', 'null'] },
  engine_watch_hours: { type: ['number', 'null'] },
  night_watch_hours: { type: ['number', 'null'] },
  certificate_id: { type: ['string', 'null'] },
  from_port: { type: ['string', 'null'] },
  to_port: { type: ['string', 'null'] },
} as const;

function transformSeaTimeEntryForResponse(entry: any) {
  // Calculate duration_hours if both start_time and end_time are present
  let duration_hours = null;
  if (entry.start_time && entry.end_time) {
    const startTime = entry.start_time instanceof Date ? entry.start_time : new Date(entry.start_time);
    const endTime = entry.end_time instanceof Date ? entry.end_time : new Date(entry.end_time);
    duration_hours = calculateDurationHours(startTime, endTime);
  }

  // Parse detection_window_hours if present
  let detection_window_hours = null;
  if (entry.detection_window_hours != null) {
    detection_window_hours = parseFloat(String(entry.detection_window_hours));
  }

  // Parse watchkeeping_hours if present
  let watchkeeping_hours = null;
  if (entry.watchkeeping_hours != null) {
    watchkeeping_hours = parseFloat(String(entry.watchkeeping_hours));
  }

  // Parse additional_watchkeeping_hours if present
  let additional_watchkeeping_hours = null;
  if (entry.additional_watchkeeping_hours != null) {
    additional_watchkeeping_hours = parseFloat(String(entry.additional_watchkeeping_hours));
  }

  // Parse bridge_watch_hours if present
  let bridge_watch_hours = null;
  if (entry.bridge_watch_hours != null) {
    bridge_watch_hours = parseFloat(String(entry.bridge_watch_hours));
  }

  // Parse engine_watch_hours if present
  let engine_watch_hours = null;
  if (entry.engine_watch_hours != null) {
    engine_watch_hours = parseFloat(String(entry.engine_watch_hours));
  }

  return {
    id: entry.id,
    vessel_id: entry.vessel_id,
    start_time: entry.start_time.toISOString ? entry.start_time.toISOString() : entry.start_time,
    end_time: entry.end_time ? (entry.end_time.toISOString ? entry.end_time.toISOString() : entry.end_time) : null,
    duration_hours: duration_hours,
    sea_days: entry.sea_days,
    status: entry.status,
    service_type: entry.service_type || 'actual_sea_service',
    notes: entry.notes,
    start_latitude: entry.start_latitude,
    start_longitude: entry.start_longitude,
    end_latitude: entry.end_latitude,
    end_longitude: entry.end_longitude,
    mca_compliant: entry.mca_compliant !== null ? entry.mca_compliant : null,
    detection_window_hours: detection_window_hours,
    watchkeeping_hours: watchkeeping_hours,
    additional_watchkeeping_hours: additional_watchkeeping_hours,
    is_stationary: entry.is_stationary ?? null,
    rank: entry.rank || null,
    date_joined: entry.date_joined || null,
    date_left: entry.date_left || null,
    trade_area: entry.trade_area || null,
    bridge_watch_hours: bridge_watch_hours,
    engine_watch_hours: engine_watch_hours,
    night_watch_hours: entry.night_watch_hours != null ? parseFloat(String(entry.night_watch_hours)) : null,
    certificate_id: entry.certificate_id || null,
    from_port: entry.from_port || null,
    to_port: entry.to_port || null,
    is_sole_watch: entry.is_sole_watch === true,
    area_category: entry.area_category ?? null,
    is_tidal: entry.is_tidal ?? null,
    is_categorised_water: entry.is_categorised_water ?? null,
    dual_capacity: entry.dual_capacity ?? null,
    // Signed by the Master or a responsible person; null when unsigned or edited since (no image here)
    signature: entrySignatureView(entry),
    created_at: entry.created_at.toISOString ? entry.created_at.toISOString() : entry.created_at,
    vessel: entry.vessel ? transformVesselForResponse(entry.vessel) : null,
  };
}

export function register(app: App, fastify: FastifyInstance) {
  // GET /api/sea-time - Return all sea time entries with vessel info
  fastify.get('/api/sea-time', {
    schema: {
      description: 'Get all sea time entries with complete vessel information (requires authentication)',
      tags: ['sea-time'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              vessel_id: { type: 'string' },
              start_time: { type: 'string', format: 'date-time' },
              end_time: { type: ['string', 'null'], format: 'date-time' },
              duration_hours: { type: ['number', 'null'] },
              sea_days: { type: ['number', 'null'] },
              status: { type: 'string', enum: ['pending', 'confirmed', 'rejected'] },
              service_type: { type: 'string', enum: ['actual_sea_service', 'watchkeeping_service', 'standby_service', 'yard_service', 'service_in_port'] },
              notes: { type: ['string', 'null'] },
              start_latitude: { type: ['string', 'null'] },
              start_longitude: { type: ['string', 'null'] },
              end_latitude: { type: ['string', 'null'] },
              end_longitude: { type: ['string', 'null'] },
              ...ENTRY_AREA_PROPS,
              ...ENTRY_DETAIL_PROPS,
              mca_compliant: { type: ['boolean', 'null'] },
              detection_window_hours: { type: ['number', 'null'] },
              watchkeeping_hours: { type: ['number', 'null'] },
              additional_watchkeeping_hours: { type: ['number', 'null'] },
              ...ENTRY_DETAIL_PROPS,
              is_stationary: { type: ['boolean', 'null'] },
              is_sole_watch: { type: 'boolean' }, // inside a sole watchkeeper period, so it also counts as watchkeeping
              created_at: { type: 'string', format: 'date-time' },
              vessel: {
                type: ['object', 'null'],
                properties: {
                  id: { type: 'string' },
                  mmsi: { type: 'string' },
                  vessel_name: { type: 'string' },
                  callsign: { type: ['string', 'null'] },
                  flag: { type: ['string', 'null'] },
                  vessel_type: { type: ['string', 'null'] },
                  is_active: { type: 'boolean' },
                  created_at: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        401: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'Sea time entries list requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    app.logger.info({ userId }, 'Retrieving sea time entries for user');

    const entries = await app.db.query.sea_time_entries.findMany({
      with: {
        vessel: true,
      },
      // Passages logged while the user was off board stay hidden until claimed
      where: and(
        eq(schema.sea_time_entries.user_id, userId),
        notInArray(schema.sea_time_entries.status, HIDDEN_ENTRY_STATUSES)
      ),
      orderBy: desc(schema.sea_time_entries.start_time),
    });

    app.logger.info({ userId, count: entries.length }, 'Sea time entries retrieved');
    return reply.code(200).send((await entriesWithSoleWatch(app, entries)).map(transformSeaTimeEntryForResponse));
  });

  // GET /api/sea-time/:id - Get a single sea time entry by ID
  fastify.get<{ Params: { id: string } }>('/api/sea-time/:id', {
    schema: {
      description: 'Get a single sea time entry by ID (requires authentication)',
      tags: ['sea-time'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid', description: 'Sea time entry ID' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            vessel_id: { type: 'string' },
            start_time: { type: 'string', format: 'date-time' },
            end_time: { type: ['string', 'null'], format: 'date-time' },
            duration_hours: { type: ['number', 'null'] },
            sea_days: { type: ['number', 'null'] },
            status: { type: 'string' },
            service_type: { type: 'string' },
            notes: { type: ['string', 'null'] },
            start_latitude: { type: ['string', 'null'] },
            start_longitude: { type: ['string', 'null'] },
            end_latitude: { type: ['string', 'null'] },
            end_longitude: { type: ['string', 'null'] },
            ...ENTRY_AREA_PROPS,
            mca_compliant: { type: ['boolean', 'null'] },
            detection_window_hours: { type: ['number', 'null'] },
            watchkeeping_hours: { type: ['number', 'null'] },
            additional_watchkeeping_hours: { type: ['number', 'null'] },
            ...ENTRY_DETAIL_PROPS,
            is_stationary: { type: ['boolean', 'null'] },
            distance_nm: { type: ['number', 'null'] },
            user_id: { type: ['string', 'null'] },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'Sea time entry fetch requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const { id: entryId } = request.params;

    app.logger.info({ userId, entryId }, 'Fetching sea time entry by ID');

    // Get sea time entry
    const entries = await app.db
      .select()
      .from(schema.sea_time_entries)
      .where(eq(schema.sea_time_entries.id, entryId));

    if (entries.length === 0) {
      app.logger.warn({ userId, entryId }, 'Sea time entry not found');
      return reply.code(404).send({ error: 'Sea time entry not found' });
    }

    const entry = entries[0];

    // Verify ownership
    if (entry.user_id !== userId) {
      app.logger.warn({ userId, entryId }, 'Unauthorized: entry does not belong to user');
      return reply.code(403).send({ error: 'Not authorized to access this entry' });
    }

    // Parse decimal fields
    let distance_nm = null;
    if (entry.distance_nm) {
      distance_nm = parseFloat(String(entry.distance_nm));
    }

    app.logger.info({ userId, entryId, vesselId: entry.vessel_id }, 'Sea time entry retrieved');

    return reply.code(200).send({
      id: entry.id,
      vessel_id: entry.vessel_id,
      start_time: entry.start_time.toISOString(),
      end_time: entry.end_time ? entry.end_time.toISOString() : null,
      duration_hours: entry.start_time && entry.end_time ? calculateDurationHours(entry.start_time, entry.end_time) : null,
      sea_days: entry.sea_days,
      status: entry.status,
      service_type: entry.service_type || 'actual_sea_service',
      notes: entry.notes || null,
      start_latitude: entry.start_latitude ?? null,
      start_longitude: entry.start_longitude ?? null,
      end_latitude: entry.end_latitude ?? null,
      end_longitude: entry.end_longitude ?? null,
      mca_compliant: entry.mca_compliant !== null ? entry.mca_compliant : null,
      detection_window_hours: entry.detection_window_hours != null ? parseFloat(String(entry.detection_window_hours)) : null,
      watchkeeping_hours: entry.watchkeeping_hours != null ? parseFloat(String(entry.watchkeeping_hours)) : null,
      additional_watchkeeping_hours: entry.additional_watchkeeping_hours != null ? parseFloat(String(entry.additional_watchkeeping_hours)) : null,
      is_stationary: entry.is_stationary ?? null,
      distance_nm: distance_nm,
      rank: entry.rank || null,
      date_joined: entry.date_joined || null,
      date_left: entry.date_left || null,
      trade_area: entry.trade_area || null,
      bridge_watch_hours: entry.bridge_watch_hours != null ? parseFloat(String(entry.bridge_watch_hours)) : null,
      engine_watch_hours: entry.engine_watch_hours != null ? parseFloat(String(entry.engine_watch_hours)) : null,
      certificate_id: entry.certificate_id || null,
      from_port: entry.from_port || null,
      to_port: entry.to_port || null,
      area_category: entry.area_category ?? null,
      is_tidal: entry.is_tidal ?? null,
      is_categorised_water: entry.is_categorised_water ?? null,
      dual_capacity: entry.dual_capacity ?? null,
      user_id: entry.user_id || null,
      created_at: entry.created_at.toISOString(),
    });
  });

  // GET /api/vessels/:vesselId/sea-time - Return sea time entries for a specific vessel
  fastify.get<{ Params: { vesselId: string } }>('/api/vessels/:vesselId/sea-time', {
    schema: {
      description: 'Get all sea time entries for a specific vessel (requires authentication)',
      tags: ['sea-time'],
      params: {
        type: 'object',
        required: ['vesselId'],
        properties: { vesselId: { type: 'string' } },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              vessel_id: { type: 'string' },
              start_time: { type: 'string', format: 'date-time' },
              end_time: { type: ['string', 'null'], format: 'date-time' },
              duration_hours: { type: ['number', 'null'] },
              sea_days: { type: ['number', 'null'] },
              status: { type: 'string' },
              service_type: { type: 'string' },
              notes: { type: ['string', 'null'] },
              // The vessel screen shows these as Start / End Position; without them they were dropped.
              start_latitude: { type: ['string', 'null'] },
              start_longitude: { type: ['string', 'null'] },
              end_latitude: { type: ['string', 'null'] },
              end_longitude: { type: ['string', 'null'] },
              mca_compliant: { type: ['boolean', 'null'] },
              detection_window_hours: { type: ['number', 'null'] },
              watchkeeping_hours: { type: ['number', 'null'] },
              additional_watchkeeping_hours: { type: ['number', 'null'] },
              ...ENTRY_DETAIL_PROPS,
              is_stationary: { type: ['boolean', 'null'] },
              is_sole_watch: { type: 'boolean' }, // inside a sole watchkeeper period, so it also counts as watchkeeping
              ...ENTRY_AREA_PROPS,
              ...ENTRY_DETAIL_PROPS,
              created_at: { type: 'string', format: 'date-time' },
              vessel: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  mmsi: { type: 'string' },
                  vessel_name: { type: 'string' },
                  callsign: { type: ['string', 'null'] },
                  is_active: { type: 'boolean' },
                  created_at: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'Sea time entries for vessel requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const { vesselId } = request.params;

    app.logger.info({ userId, vesselId }, 'Fetching sea time entries for vessel');

    // Verify vessel exists and belongs to user
    const vessel = await app.db
      .select()
      .from(schema.vessels)
      .where(eq(schema.vessels.id, vesselId));

    if (vessel.length === 0) {
      app.logger.warn({ userId, vesselId }, 'Vessel not found');
      return reply.code(404).send({ error: 'Vessel not found' });
    }

    // Check vessel ownership
    if (vessel[0].user_id !== userId) {
      app.logger.warn({ userId, vesselId }, 'Unauthorized access to vessel sea time entries');
      return reply.code(403).send({ error: 'Not authorized to access this vessel' });
    }

    // Get all sea time entries for the vessel, ordered by most recent first
    const entries = await app.db.query.sea_time_entries.findMany({
      where: and(
        eq(schema.sea_time_entries.vessel_id, vesselId),
        notInArray(schema.sea_time_entries.status, HIDDEN_ENTRY_STATUSES)
      ),
      with: {
        vessel: true,
      },
      orderBy: desc(schema.sea_time_entries.start_time),
    });

    app.logger.info({ userId, vesselId, count: entries.length }, 'Sea time entries retrieved');
    return reply.code(200).send((await entriesWithSoleWatch(app, entries)).map(transformSeaTimeEntryForResponse));
  });

  // GET /api/sea-time/pending - Return pending entries awaiting confirmation
  fastify.get<{ Querystring: { include_checking?: string } }>('/api/sea-time/pending', {
    schema: {
      description: 'Get pending sea time entries awaiting confirmation (requires authentication). With include_checking=true, also returns live passages still being checked against the AIS track (status checking), which cannot be confirmed yet. Older app builds omit it and never see them.',
      tags: ['sea-time'],
      querystring: {
        type: 'object',
        properties: { include_checking: { type: 'string' } },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              vessel_id: { type: 'string' },
              start_time: { type: 'string', format: 'date-time' },
              end_time: { type: ['string', 'null'], format: 'date-time' },
              duration_hours: { type: ['number', 'null'] },
              sea_days: { type: ['number', 'null'] },
              status: { type: 'string' },
              service_type: { type: 'string' },
              notes: { type: ['string', 'null'] },
              created_at: { type: 'string', format: 'date-time' },
              start_latitude: { type: ['string', 'null'] },
              start_longitude: { type: ['string', 'null'] },
              end_latitude: { type: ['string', 'null'] },
              end_longitude: { type: ['string', 'null'] },
              ...ENTRY_AREA_PROPS,
              ...ENTRY_DETAIL_PROPS,
              mca_compliant: { type: ['boolean', 'null'] },
              detection_window_hours: { type: ['number', 'null'] },
              watchkeeping_hours: { type: ['number', 'null'] },
              additional_watchkeeping_hours: { type: ['number', 'null'] },
              ...ENTRY_DETAIL_PROPS,
              is_stationary: { type: ['boolean', 'null'] },
              vessel: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  mmsi: { type: 'string' },
                  vessel_name: { type: 'string' },
                  callsign: { type: ['string', 'null'] },
                  is_active: { type: 'boolean' },
                  created_at: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        401: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'Pending sea time entries requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    app.logger.info({ userId }, 'Retrieving pending sea time entries for user');

    const statuses = request.query.include_checking === 'true' ? ['pending', CHECKING_STATUS] : ['pending'];
    const entries = await app.db.query.sea_time_entries.findMany({
      where: and(
        inArray(schema.sea_time_entries.status, statuses),
        eq(schema.sea_time_entries.user_id, userId)
      ),
      with: {
        vessel: true,
      },
      orderBy: desc(schema.sea_time_entries.start_time),
    });

    app.logger.info(
      { count: entries.length },
      `Retrieved ${entries.length} pending sea time entries`
    );
    return reply.code(200).send(entries.map(transformSeaTimeEntryForResponse));
  });

  // GET /api/sea-time/new-entries - Return new entries created since a given time
  fastify.get<{ Querystring: { since?: string } }>('/api/sea-time/new-entries', {
    schema: {
      description: 'Get new sea time entries created since the last check (requires authentication)',
      tags: ['sea-time'],
      querystring: {
        type: 'object',
        properties: {
          since: { type: 'string', format: 'date-time', description: 'ISO timestamp - if not provided, returns entries from last 24 hours' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            entries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  vessel_id: { type: 'string' },
                  start_time: { type: 'string', format: 'date-time' },
                  end_time: { type: ['string', 'null'], format: 'date-time' },
                  duration_hours: { type: ['number', 'null'] },
                  sea_days: { type: ['number', 'null'] },
                  status: { type: 'string', enum: ['pending', 'confirmed', 'rejected'] },
                  service_type: { type: 'string' },
                  notes: { type: ['string', 'null'] },
                  created_at: { type: 'string', format: 'date-time' },
                  start_latitude: { type: ['string', 'null'] },
                  start_longitude: { type: ['string', 'null'] },
                  end_latitude: { type: ['string', 'null'] },
                  end_longitude: { type: ['string', 'null'] },
                  ...ENTRY_AREA_PROPS,
              ...ENTRY_DETAIL_PROPS,
                  mca_compliant: { type: ['boolean', 'null'] },
                  detection_window_hours: { type: ['number', 'null'] },
                  watchkeeping_hours: { type: ['number', 'null'] },
                  additional_watchkeeping_hours: { type: ['number', 'null'] },
                  ...ENTRY_DETAIL_PROPS,
                  is_stationary: { type: ['boolean', 'null'] },
                  vessel: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      mmsi: { type: 'string' },
                      vessel_name: { type: 'string' },
                      callsign: { type: ['string', 'null'] },
                      flag: { type: ['string', 'null'] },
                      vessel_type: { type: ['string', 'null'] },
                      is_active: { type: 'boolean' },
                      created_at: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
            count: { type: 'number' },
          },
        },
        401: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'New sea time entries requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const { since } = request.query;

    // Determine the cutoff time
    let cutoffTime: Date;
    if (since) {
      try {
        cutoffTime = new Date(since);
        if (isNaN(cutoffTime.getTime())) {
          app.logger.warn({ since }, 'Invalid since parameter format');
          return reply.code(400).send({ error: 'Invalid since parameter format - must be ISO timestamp' });
        }
      } catch (error) {
        app.logger.warn({ since }, 'Error parsing since parameter');
        return reply.code(400).send({ error: 'Invalid since parameter' });
      }
    } else {
      // Default to last 24 hours
      cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    }

    app.logger.info({ userId, since: cutoffTime.toISOString() }, 'Retrieving new sea time entries since cutoff time');

    const entries = await app.db.query.sea_time_entries.findMany({
      where: and(
        eq(schema.sea_time_entries.user_id, userId),
        // New since the cutoff: created then, or released for review then after the AIS track check
        or(
          gte(schema.sea_time_entries.created_at, cutoffTime),
          inArray(
            schema.sea_time_entries.id,
            app.db
              .select({ id: schema.passage_refinements.entry_id })
              .from(schema.passage_refinements)
              .where(gte(schema.passage_refinements.refined_at, cutoffTime))
          )
        ),
        // Filter for complete entries (mca_compliant is set by AIS handler, duration_hours may be null)
        isNotNull(schema.sea_time_entries.end_time),
        isNotNull(schema.sea_time_entries.start_latitude),
        isNotNull(schema.sea_time_entries.start_longitude),
        isNotNull(schema.sea_time_entries.end_latitude),
        isNotNull(schema.sea_time_entries.end_longitude),
        eq(schema.sea_time_entries.status, 'pending')
      ),
      with: {
        vessel: true,
      },
      orderBy: desc(schema.sea_time_entries.created_at),
    });

    app.logger.info(
      { userId, count: entries.length, cutoffTime: cutoffTime.toISOString() },
      `Retrieved ${entries.length} new sea time entries`
    );

    return reply.code(200).send({
      entries: entries.map(transformSeaTimeEntryForResponse),
      count: entries.length,
    });
  });

  // PUT /api/sea-time/:id/confirm - Confirm pending entry with optional notes and service_type
  fastify.put<{ Params: { id: string }; Body: { notes?: string; service_type?: string; rank?: string | null; date_joined?: string | null; date_left?: string | null; trade_area?: string | null; bridge_watch_hours?: number | null; engine_watch_hours?: number | null; night_watch_hours?: number | null; certificate_id?: string | null } }>('/api/sea-time/:id/confirm', {
    schema: {
      description: 'Confirm a pending sea time entry (requires authentication). Accepts optional notes and service_type.',
      tags: ['sea-time'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          notes: { type: 'string', description: 'Optional notes' },
          service_type: { type: 'string', description: 'Service type (actual_sea_service, watchkeeping_service, standby_service, yard_service, service_in_port)' },
          rank: { type: ['string', 'null'], description: 'Officer rank/capacity' },
          date_joined: { type: ['string', 'null'], description: 'Date joined vessel (YYYY-MM-DD)' },
          date_left: { type: ['string', 'null'], description: 'Date left vessel (YYYY-MM-DD)' },
          trade_area: { type: ['string', 'null'], description: 'Trade area classification' },
          bridge_watch_hours: { type: ['number', 'null'], description: 'Bridge watch hours' },
          engine_watch_hours: { type: ['number', 'null'], description: 'Engine watch hours' },
          night_watch_hours: { type: ['number', 'null'], description: 'Night watch hours (tracked separately)' },
          certificate_id: { type: ['string', 'null'], description: 'Certificate ID held during this service' },
        },
      },
      response: {
        200: { type: 'object' },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'Sea time entry confirm requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const { id } = request.params;
    const { notes, service_type, rank, date_joined, date_left, trade_area, bridge_watch_hours, engine_watch_hours, night_watch_hours, certificate_id } = request.body;

    // Validate service_type if provided
    if (service_type !== undefined && !isValidServiceType(service_type)) {
      app.logger.warn({ userId, entryId: id, service_type }, 'Invalid service type provided');
      return reply.code(400).send({ error: `Invalid service_type. Must be one of: ${VALID_SERVICE_TYPES.join(', ')}` });
    }

    // Validate rank if provided
    if (rank !== undefined && !isValidRank(rank)) {
      return reply.code(400).send({ error: `Invalid rank. Must be one of: ${VALID_RANKS.join(', ')}` });
    }

    // Validate trade_area if provided
    if (trade_area !== undefined && !isValidTradeArea(trade_area)) {
      return reply.code(400).send({ error: `Invalid trade_area. Must be one of: ${VALID_TRADE_AREAS.join(', ')}` });
    }

    app.logger.info({ userId, entryId: id }, `Confirming sea time entry: ${id}`);

    // Get the entry
    const entry = await app.db
      .select()
      .from(schema.sea_time_entries)
      .where(eq(schema.sea_time_entries.id, id));

    if (entry.length === 0) {
      app.logger.warn({ userId, entryId: id }, `Sea time entry not found: ${id}`);
      return reply.code(404).send({ error: 'Sea time entry not found' });
    }

    const current_entry = entry[0];

    // Verify ownership
    if (current_entry.user_id !== userId) {
      app.logger.warn({ userId, entryId: id }, 'Unauthorized sea time entry confirm attempt');
      return reply.code(403).send({ error: 'Not authorized to confirm this entry' });
    }

    // Guard: only pending entries can be confirmed
    if (current_entry.status === CHECKING_STATUS) {
      return reply.code(409).send({ error: CHECKING_CONFIRM_ERROR });
    }
    if (current_entry.status !== 'pending') {
      app.logger.warn({ userId, entryId: id, status: current_entry.status }, 'Entry already processed');
      return reply.code(409).send({ error: `Entry is already ${current_entry.status}` });
    }

    // Use existing end_time if already set by AIS scheduler, otherwise use now
    const end_time = current_entry.end_time || new Date();

    // Calculate duration and sea_days
    const duration_hours = calculateDurationHours(current_entry.start_time, end_time);

    // Validate that duration is not 0 hours
    if (duration_hours === 0) {
      app.logger.warn(
        { userId, entryId: id, startTime: current_entry.start_time.toISOString(), endTime: end_time.toISOString() },
        'Attempted to confirm 0 hour sea time entry'
      );
      return reply.code(400).send({ error: 'Sea time duration cannot be 0 hours. Cannot confirm entry with 0 hours.' });
    }

    const calculated_sea_days = await storedSeaDays(app, userId, {
      ...current_entry,
      end_time,
      status: 'confirmed',
      service_type: service_type || current_entry.service_type || 'actual_sea_service',
    });

    // Note: Calendar day restriction has been removed to allow multiple entries per day as vessels move throughout the day
    // The scheduler now creates multiple entries (every 2 hours) when movement is detected
    app.logger.debug({ userId, entryId: id }, 'Confirming entry - multiple entries per calendar day are now allowed');

    const confirmUpdateData: any = {
      end_time,
      duration_hours: String(duration_hours),
      sea_days: calculated_sea_days,
      status: 'confirmed',
      service_type: service_type || current_entry.service_type || 'actual_sea_service',
      notes: notes || current_entry.notes,
    };
    if (rank !== undefined) confirmUpdateData.rank = rank;
    if (date_joined !== undefined) confirmUpdateData.date_joined = date_joined;
    if (date_left !== undefined) confirmUpdateData.date_left = date_left;
    if (trade_area !== undefined) confirmUpdateData.trade_area = trade_area;
    if (bridge_watch_hours !== undefined) confirmUpdateData.bridge_watch_hours = bridge_watch_hours !== null ? String(bridge_watch_hours) : null;
    if (engine_watch_hours !== undefined) confirmUpdateData.engine_watch_hours = engine_watch_hours !== null ? String(engine_watch_hours) : null;
    if (night_watch_hours !== undefined) confirmUpdateData.night_watch_hours = night_watch_hours !== null ? String(night_watch_hours) : null;
    if (certificate_id !== undefined) {
      if (certificate_id && !(await validateCertificateOwnership(app, certificate_id, userId))) {
        return reply.code(403).send({ error: 'Certificate does not belong to this user' });
      }
      confirmUpdateData.certificate_id = certificate_id;
    }

    const [updated] = await app.db
      .update(schema.sea_time_entries)
      .set(confirmUpdateData)
      .where(eq(schema.sea_time_entries.id, id))
      .returning();

    app.logger.info(
      {
        userId,
        entryId: id,
        vesselId: current_entry.vessel_id,
        startTime: current_entry.start_time.toISOString(),
        endTime: end_time.toISOString(),
        durationHours: duration_hours,
        seaDays: calculated_sea_days,
        status: 'confirmed',
      },
      `Sea time entry confirmed: ${duration_hours} hours, ${calculated_sea_days} sea day(s)`
    );

    // Check for standby/yard service warnings
    const effectiveServiceType = service_type || current_entry.service_type || 'actual_sea_service';
    const warnings: string[] = [];

    if (effectiveServiceType === 'standby_service') {
      // Check consecutive standby days for this vessel/user
      const standbyEntries = await app.db.query.sea_time_entries.findMany({
        where: and(
          eq(schema.sea_time_entries.user_id, userId),
          eq(schema.sea_time_entries.vessel_id, current_entry.vessel_id),
          eq(schema.sea_time_entries.service_type, 'standby_service'),
        ),
        orderBy: desc(schema.sea_time_entries.start_time),
      });

      // Count consecutive days of standby ending at the current entry
      let consecutiveDays = 0;
      const sortedByDate = standbyEntries.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
      let lastDate: string | null = null;
      for (const e of sortedByDate) {
        const day = getCalendarDay(new Date(e.start_time));
        if (lastDate === null) {
          consecutiveDays = 1;
          lastDate = day;
        } else {
          const prevDate = new Date(lastDate);
          prevDate.setDate(prevDate.getDate() - 1);
          const expectedDay = prevDate.toISOString().split('T')[0];
          if (day === expectedDay) {
            consecutiveDays++;
            lastDate = day;
          } else {
            break;
          }
        }
      }

      if (consecutiveDays > 14) {
        warnings.push(`This creates ${consecutiveDays} consecutive days of standby service for this vessel, exceeding the 14-day guideline.`);
      }
    }

    if (effectiveServiceType === 'yard_service') {
      // Check total yard days for this user
      const yardEntries = await app.db.query.sea_time_entries.findMany({
        where: and(
          eq(schema.sea_time_entries.user_id, userId),
          eq(schema.sea_time_entries.service_type, 'yard_service'),
        ),
      });
      const totalYardDays = yardEntries.reduce((sum, e) => sum + (e.sea_days || 0), 0);
      if (totalYardDays > 90) {
        warnings.push(`Total yard service days (${totalYardDays}) exceeds the 90-day guideline.`);
      }
    }

    const response: any = transformSeaTimeEntryForResponse(updated);
    if (warnings.length > 0) {
      response.warnings = warnings;
    }

    return reply.code(200).send(response);
  });

  // PUT /api/sea-time/:id - Update sea time entry
  fastify.put<{
    Params: { id: string };
    Body: {
      sea_days?: number;
      notes?: string;
      service_type?: string;
      start_latitude?: number | null;
      start_longitude?: number | null;
      end_latitude?: number | null;
      end_longitude?: number | null;
      from_port?: string | null;
      to_port?: string | null;
      cargo_type?: string | null;
      rank?: string | null;
      date_joined?: string | null;
      date_left?: string | null;
      trade_area?: string | null;
      bridge_watch_hours?: number | null;
      engine_watch_hours?: number | null;
      night_watch_hours?: number | null;
      certificate_id?: string | null;
      area_category?: string | null;
      is_tidal?: boolean | null;
      dual_capacity?: boolean | null;
    };
  }>('/api/sea-time/:id', {
    schema: {
      description: 'Update a sea time entry (requires authentication). Allows updating sea_days, notes, service_type, position, voyage details, rank, trade area, watch hours, and certificate.',
      tags: ['sea-time'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          sea_days: { type: 'number', description: 'Number of sea days (0 or 1)' },
          notes: { type: 'string', description: 'Optional notes' },
          service_type: { type: 'string', description: 'Service type (actual_sea_service, watchkeeping_service, standby_service, yard_service, service_in_port)' },
          start_latitude: { type: ['number', 'null'] },
          start_longitude: { type: ['number', 'null'] },
          end_latitude: { type: ['number', 'null'] },
          end_longitude: { type: ['number', 'null'] },
          from_port: { type: ['string', 'null'] },
          to_port: { type: ['string', 'null'] },
          cargo_type: { type: ['string', 'null'] },
          rank: { type: ['string', 'null'], description: 'Officer rank/capacity' },
          date_joined: { type: ['string', 'null'], description: 'Date joined vessel (YYYY-MM-DD)' },
          date_left: { type: ['string', 'null'], description: 'Date left vessel (YYYY-MM-DD)' },
          trade_area: { type: ['string', 'null'], description: 'Trade area classification' },
          bridge_watch_hours: { type: ['number', 'null'], description: 'Bridge watch hours' },
          engine_watch_hours: { type: ['number', 'null'], description: 'Engine watch hours' },
          night_watch_hours: { type: ['number', 'null'], description: 'Night watch hours (tracked separately)' },
          certificate_id: { type: ['string', 'null'], description: 'Certificate ID held during this service' },
          ...AREA_BODY_PROPS,
        },
      },
      response: {
        200: { type: 'object' },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'Sea time entry update requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const { id } = request.params;
    const {
      sea_days,
      notes,
      service_type,
      start_latitude,
      start_longitude,
      end_latitude,
      end_longitude,
      from_port,
      to_port,
      cargo_type,
      rank,
      date_joined,
      date_left,
      trade_area,
      bridge_watch_hours,
      engine_watch_hours,
      night_watch_hours,
      certificate_id,
      area_category,
      is_tidal,
      dual_capacity,
    } = request.body;

    // Validate service_type if provided
    if (service_type !== undefined && !isValidServiceType(service_type)) {
      app.logger.warn({ userId, entryId: id, service_type }, 'Invalid service type provided');
      return reply.code(400).send({ error: `Invalid service_type. Must be one of: ${VALID_SERVICE_TYPES.join(', ')}` });
    }

    // Validate rank if provided
    if (rank !== undefined && !isValidRank(rank)) {
      return reply.code(400).send({ error: `Invalid rank. Must be one of: ${VALID_RANKS.join(', ')}` });
    }

    // Validate trade_area if provided
    if (trade_area !== undefined && !isValidTradeArea(trade_area)) {
      return reply.code(400).send({ error: `Invalid trade_area. Must be one of: ${VALID_TRADE_AREAS.join(', ')}` });
    }

    app.logger.info({ userId, entryId: id, sea_days, notes, service_type }, 'Updating sea time entry');

    // Get the entry
    const entry = await app.db
      .select()
      .from(schema.sea_time_entries)
      .where(eq(schema.sea_time_entries.id, id));

    if (entry.length === 0) {
      app.logger.warn({ userId, entryId: id }, `Sea time entry not found: ${id}`);
      return reply.code(404).send({ error: 'Sea time entry not found' });
    }

    const current_entry = entry[0];

    // Verify ownership
    if (current_entry.user_id !== userId) {
      app.logger.warn({ userId, entryId: id }, 'Unauthorized sea time entry update attempt');
      return reply.code(403).send({ error: 'Not authorized to update this entry' });
    }

    // Prepare update object
    const updateData: any = {};
    if (sea_days !== undefined) {
      updateData.sea_days = sea_days;
    }
    if (notes !== undefined) {
      updateData.notes = notes;
    }
    if (service_type !== undefined) {
      updateData.service_type = service_type;
      // The service type changes what the entry earns (port is not sea
      // service; USCG does not credit stand-by or yard), so recount it.
      if (sea_days === undefined && current_entry.end_time && service_type !== current_entry.service_type) {
        updateData.sea_days = await storedSeaDays(app, userId, { ...current_entry, service_type });
      }
    }
    if (start_latitude !== undefined) {
      updateData.start_latitude = start_latitude !== null ? String(start_latitude) : null;
    }
    if (start_longitude !== undefined) {
      updateData.start_longitude = start_longitude !== null ? String(start_longitude) : null;
    }
    if (end_latitude !== undefined) {
      updateData.end_latitude = end_latitude !== null ? String(end_latitude) : null;
    }
    if (end_longitude !== undefined) {
      updateData.end_longitude = end_longitude !== null ? String(end_longitude) : null;
    }
    if (from_port !== undefined) {
      updateData.from_port = from_port;
    }
    if (to_port !== undefined) {
      updateData.to_port = to_port;
    }
    if (cargo_type !== undefined) {
      updateData.cargo_type = cargo_type;
    }
    if (rank !== undefined) {
      updateData.rank = rank;
    }
    if (date_joined !== undefined) {
      updateData.date_joined = date_joined;
    }
    if (date_left !== undefined) {
      updateData.date_left = date_left;
    }
    if (trade_area !== undefined) {
      updateData.trade_area = trade_area;
    }
    if (bridge_watch_hours !== undefined) {
      updateData.bridge_watch_hours = bridge_watch_hours !== null ? String(bridge_watch_hours) : null;
    }
    if (engine_watch_hours !== undefined) {
      updateData.engine_watch_hours = engine_watch_hours !== null ? String(engine_watch_hours) : null;
    }
    if (night_watch_hours !== undefined) {
      updateData.night_watch_hours = night_watch_hours !== null ? String(night_watch_hours) : null;
    }
    if (certificate_id !== undefined) {
      if (certificate_id && !(await validateCertificateOwnership(app, certificate_id, userId))) {
        return reply.code(403).send({ error: 'Certificate does not belong to this user' });
      }
      updateData.certificate_id = certificate_id;
    }
    // Workboat sea area set or corrected by the user (guidance; does not change counting)
    if (area_category !== undefined) {
      updateData.area_category = area_category;
      updateData.is_categorised_water = area_category === null ? null : area_category !== 'sea';
    }
    if (is_tidal !== undefined) updateData.is_tidal = is_tidal;
    // MGN 496 4.5: dual deck and engine capacity counts at 50% in the workboat figures
    if (dual_capacity !== undefined) updateData.dual_capacity = dual_capacity;

    // The signer signed the vessel, times and service type they saw: changing any of them removes the signature
    if (current_entry.signature_image && changesSignedFields(current_entry, updateData)) {
      Object.assign(updateData, SIGNATURE_CLEARED);
    }

    // If no fields to update, return the current entry
    if (Object.keys(updateData).length === 0) {
      app.logger.warn({ userId, entryId: id }, 'No fields to update in sea time entry');
      return reply.code(200).send(transformSeaTimeEntryForResponse(current_entry));
    }

    const [updated] = await app.db
      .update(schema.sea_time_entries)
      .set(updateData)
      .where(eq(schema.sea_time_entries.id, id))
      .returning();

    app.logger.info(
      {
        userId,
        entryId: id,
        vesselId: current_entry.vessel_id,
        updatedFields: updateData,
      },
      `Sea time entry updated successfully`
    );

    // Check for standby/yard service warnings
    const effectiveServiceType = updated.service_type || 'actual_sea_service';
    const updateWarnings: string[] = [];

    if (effectiveServiceType === 'standby_service') {
      const standbyEntries = await app.db.query.sea_time_entries.findMany({
        where: and(
          eq(schema.sea_time_entries.user_id, userId),
          eq(schema.sea_time_entries.vessel_id, current_entry.vessel_id),
          eq(schema.sea_time_entries.service_type, 'standby_service'),
        ),
        orderBy: desc(schema.sea_time_entries.start_time),
      });

      let consecutiveDays = 0;
      const sortedByDate = standbyEntries.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
      let lastDate: string | null = null;
      for (const e of sortedByDate) {
        const day = getCalendarDay(new Date(e.start_time));
        if (lastDate === null) {
          consecutiveDays = 1;
          lastDate = day;
        } else {
          const prevDate = new Date(lastDate);
          prevDate.setDate(prevDate.getDate() - 1);
          const expectedDay = prevDate.toISOString().split('T')[0];
          if (day === expectedDay) {
            consecutiveDays++;
            lastDate = day;
          } else {
            break;
          }
        }
      }

      if (consecutiveDays > 14) {
        updateWarnings.push(`This creates ${consecutiveDays} consecutive days of standby service for this vessel, exceeding the 14-day guideline.`);
      }
    }

    if (effectiveServiceType === 'yard_service') {
      const yardEntries = await app.db.query.sea_time_entries.findMany({
        where: and(
          eq(schema.sea_time_entries.user_id, userId),
          eq(schema.sea_time_entries.service_type, 'yard_service'),
        ),
      });
      const totalYardDays = yardEntries.reduce((sum, e) => sum + (e.sea_days || 0), 0);
      if (totalYardDays > 90) {
        updateWarnings.push(`Total yard service days (${totalYardDays}) exceeds the 90-day guideline.`);
      }
    }

    const updateResponse: any = transformSeaTimeEntryForResponse(updated);
    if (updateWarnings.length > 0) {
      updateResponse.warnings = updateWarnings;
    }

    return reply.code(200).send(updateResponse);
  });

  // PUT /api/sea-time/:id/reject - Reject pending entry with optional notes
  fastify.put<{ Params: { id: string }; Body: { notes?: string } }>('/api/sea-time/:id/reject', {
    schema: {
      description: 'Reject a pending sea time entry (requires authentication)',
      tags: ['sea-time'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: { notes: { type: 'string' } },
      },
      response: {
        200: { type: 'object' },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'Sea time entry reject requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const { id } = request.params;
    const { notes } = request.body;

    app.logger.info({ userId, entryId: id }, `Rejecting sea time entry: ${id}`);

    // Get the entry
    const entry = await app.db
      .select()
      .from(schema.sea_time_entries)
      .where(eq(schema.sea_time_entries.id, id));

    if (entry.length === 0) {
      app.logger.warn({ userId, entryId: id }, `Sea time entry not found: ${id}`);
      return reply.code(404).send({ error: 'Sea time entry not found' });
    }

    // Verify ownership
    if (entry[0].user_id !== userId) {
      app.logger.warn({ userId, entryId: id }, 'Unauthorized sea time entry reject attempt');
      return reply.code(403).send({ error: 'Not authorized to reject this entry' });
    }

    const [updated] = await app.db
      .update(schema.sea_time_entries)
      .set({
        status: 'rejected',
        notes: notes || entry[0].notes,
      })
      .where(eq(schema.sea_time_entries.id, id))
      .returning();

    app.logger.info(
      {
        userId,
        entryId: id,
        vesselId: entry[0].vessel_id,
        status: 'rejected',
      },
      `Sea time entry rejected`
    );

    return reply.code(200).send(updated);
  });

  // DELETE /api/sea-time/:id - Delete entry
  fastify.delete<{ Params: { id: string } }>('/api/sea-time/:id', {
    schema: {
      description: 'Delete a sea time entry (requires authentication)',
      tags: ['sea-time'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      response: {
        200: { type: 'object', properties: { id: { type: 'string' } } },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'Sea time entry delete requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const { id } = request.params;

    app.logger.info({ userId, entryId: id }, `Deleting sea time entry: ${id}`);

    // Get the entry first to verify ownership
    const entry = await app.db
      .select()
      .from(schema.sea_time_entries)
      .where(eq(schema.sea_time_entries.id, id));

    if (entry.length === 0) {
      app.logger.warn({ userId, entryId: id }, `Sea time entry not found: ${id}`);
      return reply.code(404).send({ error: 'Sea time entry not found' });
    }

    // Verify ownership
    if (entry[0].user_id !== userId) {
      app.logger.warn({ userId, entryId: id }, 'Unauthorized sea time entry delete attempt');
      return reply.code(403).send({ error: 'Not authorized to delete this entry' });
    }

    const [deleted] = await app.db
      .delete(schema.sea_time_entries)
      .where(eq(schema.sea_time_entries.id, id))
      .returning();

    if (!deleted) {
      app.logger.warn({ userId, entryId: id }, `Sea time entry not found: ${id}`);
      return reply.code(404).send({ error: 'Sea time entry not found' });
    }

    app.logger.info(
      { userId, entryId: deleted.id, vesselId: deleted.vessel_id },
      `Sea time entry deleted`
    );

    return reply.code(200).send({ id: deleted.id });
  });

  // POST /api/sea-time/generate-samples - Generate sample sea time entries for testing
  fastify.post('/api/sea-time/generate-samples', {
    schema: {
      description: 'Generate sample sea time entries for testing (creates vessel if needed)',
      tags: ['sea-time'],
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            vessel: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                mmsi: { type: 'string' },
                vessel_name: { type: 'string' },
                callsign: { type: ['string', 'null'] },
                flag: { type: ['string', 'null'] },
                vessel_type: { type: ['string', 'null'] },
                is_active: { type: 'boolean' },
                created_at: { type: 'string', format: 'date-time' },
              },
            },
            entries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  vessel_id: { type: 'string' },
                  start_time: { type: 'string', format: 'date-time' },
                  end_time: { type: ['string', 'null'], format: 'date-time' },
                  duration_hours: { type: ['number', 'null'] },
                  sea_days: { type: ['number', 'null'] },
                  status: { type: 'string' },
                  notes: { type: 'string' },
                  start_latitude: { type: ['string', 'null'] },
                  start_longitude: { type: ['string', 'null'] },
                  end_latitude: { type: ['string', 'null'] },
                  end_longitude: { type: ['string', 'null'] },
                  created_at: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        400: { type: 'object', properties: { error: { type: 'string' } } },
        401: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    app.logger.info({}, 'Generating sample sea time entries for testing');

    try {
      // Authenticate user
      const authHeader = request.headers.authorization;
      const token = authHeader?.replace('Bearer ', '');

      if (!token) {
        app.logger.warn({}, 'Generate samples request without authentication');
        return reply.code(401).send({ error: 'Authentication required' });
      }

      // Find user session
      const sessions = await app.db
        .select()
        .from(authSchema.session)
        .where(eq(authSchema.session.token, token));

      if (sessions.length === 0) {
        app.logger.warn({}, 'Invalid token for generate samples');
        return reply.code(401).send({ error: 'Invalid or expired token' });
      }

      const session = sessions[0];

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        app.logger.warn({ sessionId: session.id }, 'Session expired for generate samples');
        return reply.code(401).send({ error: 'Session expired' });
      }

      const userId = session.userId;

      // Check if user has any vessels
      let vessels = await app.db.select().from(schema.vessels).where(eq(schema.vessels.user_id, userId));

      let selectedVessel;

      if (vessels.length === 0) {
        // Create sample vessel
        app.logger.info({}, 'No vessels found, creating sample vessel');

        const [newVessel] = await app.db
          .insert(schema.vessels)
          .values({
            user_id: userId,
            mmsi: '235012345',
            vessel_name: 'MV Sample Yacht',
            is_active: true,
            flag: 'United Kingdom',
            type: 'Yacht',
            length_metres: '24.5',
            gross_tonnes: '45',
          })
          .returning();

        selectedVessel = newVessel;
        app.logger.info({ vesselId: newVessel.id, vesselName: newVessel.vessel_name }, 'Sample vessel created');
      } else {
        selectedVessel = vessels[0];
        app.logger.info({ vesselId: selectedVessel.id, vesselName: selectedVessel.vessel_name }, 'Using existing vessel');
      }

      // Create three sample sea time entries
      const now = new Date();
      const entries = [];

      // Entry 1: 2 days ago, 08:00 - 18:30 (10.5 hours)
      const entry1Start = new Date(now);
      entry1Start.setDate(entry1Start.getDate() - 2);
      entry1Start.setHours(8, 0, 0, 0);

      const entry1End = new Date(now);
      entry1End.setDate(entry1End.getDate() - 2);
      entry1End.setHours(18, 30, 0, 0);

      const entry1Duration = calculateDurationHours(entry1Start, entry1End);
      const entry1SeaDays = calculateSeaDays(entry1Start, entry1End);
      const entry1StartLat = 50.9097;
      const entry1StartLng = -1.4044;
      const entry1EndLat = 50.7964;
      const entry1EndLng = -1.1089;
      const entry1Distance = calculateDistanceNauticalMiles(entry1StartLat, entry1StartLng, entry1EndLat, entry1EndLng);

      const [sampleEntry1] = await app.db
        .insert(schema.sea_time_entries)
        .values({
          user_id: userId,
          vessel_id: selectedVessel.id,
          start_time: entry1Start,
          end_time: entry1End,
          duration_hours: String(entry1Duration),
          sea_days: entry1SeaDays,
          status: 'pending',
          notes: `Coastal passage from Southampton to Portsmouth. Good weather conditions. Vessel moved ${entry1Distance} nm.`,
          start_latitude: String(entry1StartLat),
          start_longitude: String(entry1StartLng),
          end_latitude: String(entry1EndLat),
          end_longitude: String(entry1EndLng),
          distance_nm: String(entry1Distance),
          is_stationary: false,
        })
        .returning();

      entries.push(sampleEntry1);
      app.logger.info({ entryId: sampleEntry1.id, durationHours: entry1Duration, seaDays: entry1SeaDays }, 'Sample entry 1 created');

      // Entry 2: 7 days ago, 09:30 - 16:45 (7.25 hours)
      const entry2Start = new Date(now);
      entry2Start.setDate(entry2Start.getDate() - 7);
      entry2Start.setHours(9, 30, 0, 0);

      const entry2End = new Date(now);
      entry2End.setDate(entry2End.getDate() - 7);
      entry2End.setHours(16, 45, 0, 0);

      const entry2Duration = calculateDurationHours(entry2Start, entry2End);
      const entry2SeaDays = calculateSeaDays(entry2Start, entry2End);
      const entry2StartLat = 50.7964;
      const entry2StartLng = -1.1089;
      const entry2EndLat = 50.8429;
      const entry2EndLng = -1.2981;
      const entry2Distance = calculateDistanceNauticalMiles(entry2StartLat, entry2StartLng, entry2EndLat, entry2EndLng);

      const [sampleEntry2] = await app.db
        .insert(schema.sea_time_entries)
        .values({
          user_id: userId,
          vessel_id: selectedVessel.id,
          start_time: entry2Start,
          end_time: entry2End,
          duration_hours: String(entry2Duration),
          sea_days: entry2SeaDays,
          status: 'pending',
          notes: `Training voyage in the Solent. Practiced navigation and mooring. Vessel moved ${entry2Distance} nm.`,
          start_latitude: String(entry2StartLat),
          start_longitude: String(entry2StartLng),
          end_latitude: String(entry2EndLat),
          end_longitude: String(entry2EndLng),
          distance_nm: String(entry2Distance),
          is_stationary: false,
        })
        .returning();

      entries.push(sampleEntry2);
      app.logger.info({ entryId: sampleEntry2.id, durationHours: entry2Duration, seaDays: entry2SeaDays }, 'Sample entry 2 created');

      // Entry 3: 14 days ago, 07:00 - 19:15 (12.25 hours)
      const entry3Start = new Date(now);
      entry3Start.setDate(entry3Start.getDate() - 14);
      entry3Start.setHours(7, 0, 0, 0);

      const entry3End = new Date(now);
      entry3End.setDate(entry3End.getDate() - 14);
      entry3End.setHours(19, 15, 0, 0);

      const entry3Duration = calculateDurationHours(entry3Start, entry3End);
      const entry3SeaDays = calculateSeaDays(entry3Start, entry3End);
      const entry3StartLat = 50.8429;
      const entry3StartLng = -1.2981;
      const entry3EndLat = 50.6929;
      const entry3EndLng = -1.3047;
      const entry3Distance = calculateDistanceNauticalMiles(entry3StartLat, entry3StartLng, entry3EndLat, entry3EndLng);

      const [sampleEntry3] = await app.db
        .insert(schema.sea_time_entries)
        .values({
          user_id: userId,
          vessel_id: selectedVessel.id,
          start_time: entry3Start,
          end_time: entry3End,
          duration_hours: String(entry3Duration),
          sea_days: entry3SeaDays,
          status: 'pending',
          notes: `Extended passage to Isle of Wight. Overnight preparation and early departure. Vessel moved ${entry3Distance} nm.`,
          start_latitude: String(entry3StartLat),
          start_longitude: String(entry3StartLng),
          end_latitude: String(entry3EndLat),
          end_longitude: String(entry3EndLng),
          distance_nm: String(entry3Distance),
          is_stationary: false,
        })
        .returning();

      entries.push(sampleEntry3);
      app.logger.info({ entryId: sampleEntry3.id, durationHours: entry3Duration, seaDays: entry3SeaDays }, 'Sample entry 3 created');

      app.logger.info(
        { vesselId: selectedVessel.id, entryCount: entries.length },
        'Sample sea time entries generated successfully'
      );

      return reply.code(201).send({
        success: true,
        message: 'Sample sea time entries generated successfully',
        vessel: transformVesselForResponse(selectedVessel),
        entries: entries.map((entry) => {
          // Calculate duration_hours from start and end times
          let duration_hours = null;
          if (entry.start_time && entry.end_time) {
            duration_hours = calculateDurationHours(entry.start_time, entry.end_time);
          }

          return {
            id: entry.id,
            vessel_id: entry.vessel_id,
            start_time: entry.start_time.toISOString(),
            end_time: entry.end_time ? entry.end_time.toISOString() : null,
            duration_hours: duration_hours,
            sea_days: entry.sea_days,
            status: entry.status,
            notes: entry.notes,
            start_latitude: entry.start_latitude,
            start_longitude: entry.start_longitude,
            end_latitude: entry.end_latitude,
            end_longitude: entry.end_longitude,
            created_at: entry.created_at.toISOString(),
          };
        }),
      });
    } catch (error) {
      app.logger.error({ err: error }, 'Failed to generate sample sea time entries');
      return reply.code(400).send({ error: 'Failed to generate sample sea time entries' });
    }
  });

  // GET /api/logbook - Get sea time entries in chronological order for logbook/calendar view
  fastify.get<{ Querystring: { startDate?: string; endDate?: string } }>('/api/logbook', {
    schema: {
      description: 'Get sea time entries in chronological order for logbook/calendar view with optional date range filtering (requires authentication)',
      tags: ['logbook'],
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'ISO 8601 date string' },
          endDate: { type: 'string', description: 'ISO 8601 date string' },
        },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              vessel_id: { type: 'string' },
              start_time: { type: 'string' },
              end_time: { type: ['string', 'null'] },
              duration_hours: { type: ['number', 'null'] },
              sea_days: { type: ['number', 'null'] },
              status: { type: 'string' },
              service_type: { type: 'string' },
              notes: { type: ['string', 'null'] },
              start_latitude: { type: ['string', 'null'] },
              start_longitude: { type: ['string', 'null'] },
              end_latitude: { type: ['string', 'null'] },
              end_longitude: { type: ['string', 'null'] },
              ...ENTRY_AREA_PROPS,
              ...ENTRY_DETAIL_PROPS,
              created_at: { type: 'string' },
              vessel: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  mmsi: { type: 'string' },
                  vessel_name: { type: 'string' },
                  callsign: { type: ['string', 'null'] },
                  flag: { type: ['string', 'null'] },
                  vessel_type: { type: ['string', 'null'] },
                  is_active: { type: 'boolean' },
                },
              },
            },
          },
        },
        401: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'Logbook entries requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const { startDate, endDate } = request.query;

    app.logger.info({ userId, startDate, endDate }, 'Retrieving logbook entries for user');

    let query = app.db.query.sea_time_entries.findMany({
      with: {
        vessel: true,
      },
      // Passages logged while the user was off board stay hidden until claimed
      where: and(
        eq(schema.sea_time_entries.user_id, userId),
        notInArray(schema.sea_time_entries.status, HIDDEN_ENTRY_STATUSES)
      ),
      orderBy: desc(schema.sea_time_entries.start_time),
    });

    let entries = await query;

    // Filter by date range if provided
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      entries = entries.filter((entry) => {
        const entryDate = new Date(entry.start_time);
        if (start && entryDate < start) return false;
        if (end && entryDate > end) return false;
        return true;
      });
    }

    app.logger.info({ userId, count: entries.length }, 'Logbook entries retrieved');
    return reply.code(200).send(entries.map(transformSeaTimeEntryForResponse));
  });

  // POST /api/logbook/manual-entry - Create manual sea time entry (authenticated)
  fastify.post<{
    Body: {
      vessel_id: string;
      start_time: string;
      end_time?: string;
      sea_days?: number;
      service_type?: string;
      notes?: string;
      start_latitude?: number;
      start_longitude?: number;
      end_latitude?: number;
      end_longitude?: number;
      rank?: string | null;
      date_joined?: string | null;
      date_left?: string | null;
      trade_area?: string | null;
      bridge_watch_hours?: number | null;
      engine_watch_hours?: number | null;
      night_watch_hours?: number | null;
      certificate_id?: string | null;
      area_category?: string | null;
      is_tidal?: boolean | null;
      dual_capacity?: boolean | null;
    };
  }>('/api/logbook/manual-entry', {
    schema: {
      description: 'Create a manual sea time entry (requires authentication). Sea days defaults to 1 if not provided. Service type defaults to actual_sea_service.',
      tags: ['logbook'],
      body: {
        type: 'object',
        required: ['vessel_id', 'start_time'],
        properties: {
          vessel_id: { type: 'string', description: 'UUID of the vessel' },
          start_time: { type: 'string', description: 'ISO 8601 start time' },
          end_time: { type: ['string', 'null'], description: 'ISO 8601 end time (optional)' },
          sea_days: { type: ['number', 'null'], description: 'Number of sea days (default: 1)' },
          service_type: { type: ['string', 'null'], description: 'Service type (default: actual_sea_service)' },
          notes: { type: ['string', 'null'], description: 'Optional notes' },
          start_latitude: { type: ['number', 'null'], description: 'Start position latitude' },
          start_longitude: { type: ['number', 'null'], description: 'Start position longitude' },
          end_latitude: { type: ['number', 'null'], description: 'End position latitude' },
          end_longitude: { type: ['number', 'null'], description: 'End position longitude' },
          from_port: { type: ['string', 'null'] },
          to_port: { type: ['string', 'null'] },
          cargo_type: { type: ['string', 'null'] },
          rank: { type: ['string', 'null'], description: 'Officer rank/capacity' },
          date_joined: { type: ['string', 'null'], description: 'Date joined vessel (YYYY-MM-DD)' },
          date_left: { type: ['string', 'null'], description: 'Date left vessel (YYYY-MM-DD)' },
          trade_area: { type: ['string', 'null'], description: 'Trade area classification' },
          bridge_watch_hours: { type: ['number', 'null'], description: 'Bridge watch hours' },
          engine_watch_hours: { type: ['number', 'null'], description: 'Engine watch hours' },
          night_watch_hours: { type: ['number', 'null'], description: 'Night watch hours (tracked separately)' },
          certificate_id: { type: ['string', 'null'], description: 'Certificate ID held during this service' },
          ...AREA_BODY_PROPS,
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            vessel_id: { type: 'string' },
            start_time: { type: 'string' },
            end_time: { type: ['string', 'null'] },
            duration_hours: { type: ['number', 'null'] },
            sea_days: { type: ['number', 'null'] },
            status: { type: 'string' },
            notes: { type: ['string', 'null'] },
            start_latitude: { type: ['string', 'null'] },
            start_longitude: { type: ['string', 'null'] },
            end_latitude: { type: ['string', 'null'] },
            end_longitude: { type: ['string', 'null'] },
            ...ENTRY_AREA_PROPS,
            created_at: { type: 'string' },
            vessel: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                mmsi: { type: 'string' },
                vessel_name: { type: 'string' },
                callsign: { type: ['string', 'null'] },
                flag: { type: ['string', 'null'] },
                vessel_type: { type: ['string', 'null'] },
                is_active: { type: 'boolean' },
              },
            },
          },
        },
        400: { type: 'object', properties: { error: { type: 'string' } } },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const {
      vessel_id,
      start_time,
      end_time: rawEndTime,
      sea_days: rawSeaDays,
      service_type: rawServiceType,
      notes: rawNotes,
      start_latitude: rawStartLat,
      start_longitude: rawStartLng,
      end_latitude: rawEndLat,
      end_longitude: rawEndLng,
      rank: rawRank,
      date_joined: rawDateJoined,
      date_left: rawDateLeft,
      trade_area: rawTradeArea,
      bridge_watch_hours: rawBridgeWatchHours,
      engine_watch_hours: rawEngineWatchHours,
      night_watch_hours: rawNightWatchHours,
      certificate_id: rawCertificateId,
      area_category: rawAreaCategory,
      is_tidal: rawIsTidal,
      dual_capacity: rawDualCapacity,
    } = request.body as any;
    // Coerce null → undefined for downstream code that uses ?? defaults
    const end_time = rawEndTime ?? undefined;
    const sea_days = rawSeaDays ?? 1;
    const service_type = rawServiceType ?? undefined;
    const notes = rawNotes ?? undefined;
    const start_latitude = rawStartLat ?? undefined;
    const start_longitude = rawStartLng ?? undefined;
    const end_latitude = rawEndLat ?? undefined;
    const end_longitude = rawEndLng ?? undefined;
    const manualRank = rawRank ?? undefined;
    const manualDateJoined = rawDateJoined ?? undefined;
    const manualDateLeft = rawDateLeft ?? undefined;
    const manualTradeArea = rawTradeArea ?? undefined;
    const manualBridgeWatchHours = rawBridgeWatchHours ?? undefined;
    const manualEngineWatchHours = rawEngineWatchHours ?? undefined;
    const manualNightWatchHours = rawNightWatchHours ?? undefined;
    const manualCertificateId = rawCertificateId ?? undefined;

    // Validate service_type if provided
    if (service_type !== undefined && !isValidServiceType(service_type)) {
      app.logger.warn({ vessel_id, service_type }, 'Invalid service type provided for manual entry');
      return reply.code(400).send({ error: `Invalid service_type. Must be one of: ${VALID_SERVICE_TYPES.join(', ')}` });
    }

    // Validate rank if provided
    if (manualRank !== undefined && !isValidRank(manualRank)) {
      return reply.code(400).send({ error: `Invalid rank. Must be one of: ${VALID_RANKS.join(', ')}` });
    }

    // Validate trade_area if provided
    if (manualTradeArea !== undefined && !isValidTradeArea(manualTradeArea)) {
      return reply.code(400).send({ error: `Invalid trade_area. Must be one of: ${VALID_TRADE_AREAS.join(', ')}` });
    }

    app.logger.info(
      { vessel_id, start_time, end_time, service_type },
      'Manual sea time entry creation request'
    );

    // Authenticate user
    const authHeader = request.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      app.logger.warn({}, 'Manual entry creation without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    // Find user session
    const sessions = await app.db
      .select()
      .from(authSchema.session)
      .where(eq(authSchema.session.token, token));

    if (sessions.length === 0) {
      app.logger.warn({}, 'Invalid token for manual entry creation');
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }

    const session = sessions[0];

    // Check if session is expired
    if (session.expiresAt < new Date()) {
      app.logger.warn({ sessionId: session.id }, 'Session expired for manual entry creation');
      return reply.code(401).send({ error: 'Session expired' });
    }

    // Validate vessel exists and belongs to user
    const vessel = await app.db
      .select()
      .from(schema.vessels)
      .where(eq(schema.vessels.id, vessel_id));

    if (vessel.length === 0) {
      app.logger.warn({ userId: session.userId, vessel_id }, 'Vessel not found for manual entry');
      return reply.code(404).send({ error: 'Vessel not found' });
    }

    // Verify vessel ownership
    if (vessel[0].user_id !== session.userId) {
      app.logger.warn({ userId: session.userId, vessel_id }, 'Unauthorized access to vessel for manual entry');
      return reply.code(403).send({ error: 'Not authorized to create entries for this vessel' });
    }

    // Validate start_time
    let startDate: Date;
    try {
      startDate = new Date(start_time);
      if (isNaN(startDate.getTime())) {
        throw new Error('Invalid date');
      }
    } catch (error) {
      app.logger.warn({ start_time }, 'Invalid start_time format');
      return reply.code(400).send({ error: 'Invalid start_time format' });
    }

    // Validate and process end_time if provided
    let endDate: Date | null = null;
    let calculated_duration_hours: string | null = null;
    let calculated_sea_days = sea_days;

    if (end_time) {
      try {
        endDate = new Date(end_time);
        if (isNaN(endDate.getTime())) {
          throw new Error('Invalid date');
        }

        // Validate that end_time is after start_time
        if (endDate <= startDate) {
          app.logger.warn({ start_time, end_time }, 'End time is not after start time');
          return reply.code(400).send({ error: 'End time must be after start time' });
        }

        // Calculate duration_hours and sea_days from the actual times
        const duration_hours = calculateDurationHours(startDate, endDate);

        // Validate that duration is not 0 hours
        if (duration_hours === 0) {
          app.logger.warn({ userId: session.userId, vessel_id, start_time, end_time }, 'Attempted to create 0 hour sea time entry');
          return reply.code(400).send({ error: 'Sea time duration cannot be 0 hours. Please ensure start and end times are different.' });
        }

        calculated_duration_hours = String(duration_hours);
        calculated_sea_days = calculateSeaDays(startDate, endDate);

        app.logger.info({ vessel_id, durationHours: duration_hours, seaDays: calculated_sea_days }, 'Sea time duration calculated');
      } catch (error) {
        app.logger.warn({ end_time }, 'Invalid end_time format');
        return reply.code(400).send({ error: 'Invalid end_time format' });
      }
    }

    // Reject entries with 0nm distance when coordinates are provided
    if (
      start_latitude != null && start_longitude != null &&
      end_latitude != null && end_longitude != null
    ) {
      const distanceNm = calculateDistanceNauticalMiles(
        Number(start_latitude), Number(start_longitude),
        Number(end_latitude), Number(end_longitude)
      );
      if (distanceNm < 0.5) {
        app.logger.warn(
          { userId: session.userId, vessel_id, distanceNm },
          'Rejected manual entry: distance below 0.5nm minimum'
        );
        return reply.code(400).send({
          error: 'Sea time entry requires at least 0.5nm of vessel movement. The start and end positions are too close together.',
        });
      }
    }

    // A timed entry is counted under the user's authority. An entry with no end
    // time is a declared day and keeps the count the user gave.
    if (endDate) {
      calculated_sea_days = await storedSeaDays(app, session.userId, {
        vessel_id,
        start_time: startDate,
        end_time: endDate,
        service_type: service_type || 'actual_sea_service',
        status: 'confirmed',
      });
    }

    // Create the sea time entry (marked as confirmed for manually created entries)
    try {
      const manualEntryValues: any = {
        user_id: session.userId,
        vessel_id,
        start_time: startDate,
        end_time: endDate,
        duration_hours: calculated_duration_hours,
        sea_days: calculated_sea_days,
        status: 'confirmed', // Manually created entries are confirmed
        service_type: service_type || 'actual_sea_service',
        notes,
        start_latitude: start_latitude != null ? String(start_latitude) : null,
        start_longitude: start_longitude != null ? String(start_longitude) : null,
        end_latitude: end_latitude != null ? String(end_latitude) : null,
        end_longitude: end_longitude != null ? String(end_longitude) : null,
      };
      if (manualRank !== undefined) manualEntryValues.rank = manualRank;
      if (manualDateJoined !== undefined) manualEntryValues.date_joined = manualDateJoined;
      if (manualDateLeft !== undefined) manualEntryValues.date_left = manualDateLeft;
      if (manualTradeArea !== undefined) manualEntryValues.trade_area = manualTradeArea;
      if (manualBridgeWatchHours !== undefined) manualEntryValues.bridge_watch_hours = manualBridgeWatchHours !== null ? String(manualBridgeWatchHours) : null;
      if (manualEngineWatchHours !== undefined) manualEntryValues.engine_watch_hours = manualEngineWatchHours !== null ? String(manualEngineWatchHours) : null;
      if (manualNightWatchHours !== undefined) manualEntryValues.night_watch_hours = manualNightWatchHours !== null ? String(manualNightWatchHours) : null;
      if (manualCertificateId !== undefined) manualEntryValues.certificate_id = manualCertificateId;
      if (rawAreaCategory != null) {
        manualEntryValues.area_category = rawAreaCategory;
        manualEntryValues.is_categorised_water = rawAreaCategory !== 'sea';
      }
      if (rawIsTidal != null) manualEntryValues.is_tidal = rawIsTidal;
      if (rawDualCapacity != null) manualEntryValues.dual_capacity = rawDualCapacity;

      const [entry] = await app.db
        .insert(schema.sea_time_entries)
        .values(manualEntryValues)
        .returning();

      app.logger.info(
        {
          entryId: entry.id,
          vessel_id,
          vesselName: vessel[0].vessel_name,
          start_time,
          end_time: endDate?.toISOString(),
          durationHours: calculated_duration_hours,
          seaDays: calculated_sea_days,
          serviceType: service_type || 'actual_sea_service',
          status: 'confirmed',
        },
        'Manual sea time entry created successfully'
      );

      // Check for standby/yard service warnings
      const manualServiceType = service_type || 'actual_sea_service';
      const manualWarnings: string[] = [];

      if (manualServiceType === 'standby_service') {
        const standbyEntries = await app.db.query.sea_time_entries.findMany({
          where: and(
            eq(schema.sea_time_entries.user_id, session.userId),
            eq(schema.sea_time_entries.vessel_id, vessel_id),
            eq(schema.sea_time_entries.service_type, 'standby_service'),
          ),
          orderBy: desc(schema.sea_time_entries.start_time),
        });

        let consecutiveDays = 0;
        const sortedByDate = standbyEntries.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
        let lastDate: string | null = null;
        for (const e of sortedByDate) {
          const day = getCalendarDay(new Date(e.start_time));
          if (lastDate === null) {
            consecutiveDays = 1;
            lastDate = day;
          } else {
            const prevDate = new Date(lastDate);
            prevDate.setDate(prevDate.getDate() - 1);
            const expectedDay = prevDate.toISOString().split('T')[0];
            if (day === expectedDay) {
              consecutiveDays++;
              lastDate = day;
            } else {
              break;
            }
          }
        }

        if (consecutiveDays > 14) {
          manualWarnings.push(`This creates ${consecutiveDays} consecutive days of standby service for this vessel, exceeding the 14-day guideline.`);
        }
      }

      if (manualServiceType === 'yard_service') {
        const yardEntries = await app.db.query.sea_time_entries.findMany({
          where: and(
            eq(schema.sea_time_entries.user_id, session.userId),
            eq(schema.sea_time_entries.service_type, 'yard_service'),
          ),
        });
        const totalYardDays = yardEntries.reduce((sum, e) => sum + (e.sea_days || 0), 0);
        if (totalYardDays > 90) {
          manualWarnings.push(`Total yard service days (${totalYardDays}) exceeds the 90-day guideline.`);
        }
      }

      // Return entry with vessel details
      const response: any = transformSeaTimeEntryForResponse({
        ...entry,
        vessel: vessel[0],
      });
      if (manualWarnings.length > 0) {
        response.warnings = manualWarnings;
      }

      return reply.code(201).send(response);
    } catch (error) {
      app.logger.error({ err: error, vessel_id }, 'Failed to create manual sea time entry');
      return reply.code(400).send({ error: 'Failed to create sea time entry' });
    }
  });

  // -------------------------------------------------------------------------
  // Manual shift clock-in / clock-out (commercial / CTV crews)
  //
  // Records the crew member's ACTUAL on-duty hours, not the vessel's 24h AIS
  // activity, so a 12-hour shift on a 24-hour vessel is attributed correctly.
  // An open shift is a sea_time_entry with status 'active' and end_time null;
  // clock-out finalises it. Rules in utils/shifts.ts, database helpers in
  // services/shifts.ts (one open shift per user, AIS passages held back).
  // -------------------------------------------------------------------------

  const shiftResponse = (e: any) => ({
    id: e.id,
    vessel_id: e.vessel_id,
    start_time: e.start_time instanceof Date ? e.start_time.toISOString() : e.start_time,
    end_time: e.end_time ? (e.end_time instanceof Date ? e.end_time.toISOString() : e.end_time) : null,
    status: e.status,
    start_latitude: e.start_latitude,
    start_longitude: e.start_longitude,
  });

  // Current open shift for the user, or null.
  fastify.get('/api/sea-time/shift/active', async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: 'Authentication required' });
    const active = await findOpenShift(app, userId);
    return reply.code(200).send({ shift: active ? shiftResponse(active) : null, max_shift_hours: MAX_SHIFT_HOURS });
  });

  // Clock in: start a shift. Idempotent: returns the existing open shift if one exists.
  fastify.post<{ Body: { vessel_id?: string; latitude?: number | null; longitude?: number | null } }>(
    '/api/sea-time/shift/start',
    async (request, reply) => {
      const userId = await extractUserIdFromRequest(request, app);
      if (!userId) return reply.code(401).send({ error: 'Authentication required' });
      const { vessel_id, latitude, longitude } = request.body || {};
      if (!vessel_id) return reply.code(400).send({ error: 'vessel_id is required' });
      if (!UUID_RE.test(vessel_id)) return reply.code(400).send({ error: 'vessel_id must be a UUID' });

      const [vessel] = await app.db
        .select({ id: schema.vessels.id })
        .from(schema.vessels)
        .where(and(eq(schema.vessels.id, vessel_id), eq(schema.vessels.user_id, userId)));
      if (!vessel) return reply.code(404).send({ error: 'Vessel not found' });

      const existing = await findOpenShift(app, userId);
      if (existing) return reply.code(200).send({ shift: shiftResponse(existing), alreadyActive: true });

      // A shift is time on board: clocking in while switched off board would log
      // sea time for a period the user has said they are away.
      const [u] = await app.db
        .select({ on_board: authSchema.user.on_board })
        .from(authSchema.user)
        .where(eq(authSchema.user.id, userId));
      if (u && u.on_board === false) {
        return reply.code(409).send({
          error: 'You are switched off board. Switch back on board before clocking in.',
          code: 'off_board',
        });
      }

      const start = new Date();
      let created;
      try {
        [created] = await app.db
          .insert(schema.sea_time_entries)
          .values({
            user_id: userId,
            vessel_id,
            start_time: start,
            end_time: null,
            status: 'active',
            service_type: 'actual_sea_service',
            start_latitude: latitude != null ? String(latitude) : null,
            start_longitude: longitude != null ? String(longitude) : null,
            notes: `${MANUAL_SHIFT_NOTE_PREFIX}: clocked in`,
          })
          .returning();
      } catch (err: any) {
        // 23505: a concurrent clock-in won the one-open-shift-per-user index.
        if (err?.code !== '23505' && err?.cause?.code !== '23505') throw err;
        const winner = await findOpenShift(app, userId);
        if (winner) return reply.code(200).send({ shift: shiftResponse(winner), alreadyActive: true });
        throw err;
      }
      // Without the unique index (not yet applied in prod) a race can insert two.
      const kept = (await dedupeOpenShifts(app, userId)) ?? created;
      if (kept.id !== created.id) {
        return reply.code(200).send({ shift: shiftResponse(kept), alreadyActive: true });
      }

      await closeOpenAisPassages(app, userId, start);
      app.logger.info({ userId, vessel_id, entryId: created.id }, 'Shift clock-in');
      return reply.code(200).send({ shift: shiftResponse(created) });
    },
  );

  // Clock out (disembark): finalise the open shift into a confirmed sea-time entry.
  // end_time (optional, ISO) lets the user log a shift they forgot to close; it is
  // required once the shift has been open longer than MAX_SHIFT_HOURS.
  fastify.post<{ Body: { latitude?: number | null; longitude?: number | null; end_time?: string | null } }>(
    '/api/sea-time/shift/stop',
    async (request, reply) => {
      const userId = await extractUserIdFromRequest(request, app);
      if (!userId) return reply.code(401).send({ error: 'Authentication required' });
      const { latitude, longitude, end_time } = request.body || {};

      const active = await findOpenShift(app, userId);
      if (!active) return reply.code(404).send({ error: 'No active shift to clock out of' });

      const resolved = resolveShiftEnd(active.start_time, end_time);
      if (!resolved.ok) {
        return reply.code(resolved.code === 'needs_end_time' ? 409 : 400).send({
          error: resolved.error,
          code: resolved.code,
          start_time: active.start_time.toISOString(),
          max_shift_hours: MAX_SHIFT_HOURS,
        });
      }
      const end = resolved.end;
      // A position taken now says nothing about where a back-dated shift ended.
      const backDated = end_time != null && end_time !== '';
      const endLat = backDated ? null : latitude;
      const endLon = backDated ? null : longitude;

      const durationHours = calculateDurationHours(active.start_time, end);
      let distanceNm = 0;
      if (active.start_latitude != null && active.start_longitude != null && endLat != null && endLon != null) {
        distanceNm = calculateDistanceNauticalMiles(
          parseFloat(String(active.start_latitude)),
          parseFloat(String(active.start_longitude)),
          Number(endLat),
          Number(endLon),
        );
      }
      const [updated] = await app.db
        .update(schema.sea_time_entries)
        .set({
          end_time: end,
          end_latitude: endLat != null ? String(endLat) : null,
          end_longitude: endLon != null ? String(endLon) : null,
          duration_hours: String(durationHours),
          sea_days: await storedSeaDays(app, userId, { ...active, end_time: end, status: 'confirmed' }),
          mca_compliant: durationHours >= 4,
          distance_nm: String(distanceNm),
          status: 'confirmed',
          notes: `${MANUAL_SHIFT_NOTE_PREFIX}: ${formatHoursMinutes(durationHours)} on duty`,
        })
        // Only while still open, so a double tap cannot close it twice.
        .where(and(eq(schema.sea_time_entries.id, active.id), eq(schema.sea_time_entries.status, 'active')))
        .returning();
      if (!updated) return reply.code(404).send({ error: 'No active shift to clock out of' });

      await enrichEntryClassification(app, updated);
      const rejected = await rejectAisPassagesCoveredByShift(app, userId, active.start_time, end);
      app.logger.info({ userId, entryId: active.id, durationHours, rejectedAisPassages: rejected }, 'Shift clock-out');
      return reply.code(200).send({ shift: shiftResponse(updated), durationHours, sea_days: updated.sea_days });
    },
  );
}
