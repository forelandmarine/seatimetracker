import type { FastifyInstance } from "fastify";
import { eq, and, isNull, isNotNull, desc, lte, gte } from "drizzle-orm";
import * as schema from "../db/schema.js";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";

function calculateDurationHours(startTime: Date, endTime: Date): number {
  const diffMs = endTime.getTime() - startTime.getTime();
  return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100; // Round to 2 decimal places
}

// Helper function to calculate sea days (1 if duration >= 4 hours, 0 otherwise)
function calculateSeaDays(durationHours: number): number {
  return durationHours >= 4 ? 1 : 0;
}

// Valid service types
const VALID_SERVICE_TYPES = ['actual_sea_service', 'watchkeeping_service', 'standby_service', 'yard_service', 'service_in_port'];

// Helper function to validate service type
function isValidServiceType(serviceType: any): boolean {
  return typeof serviceType === 'string' && VALID_SERVICE_TYPES.includes(serviceType);
}

// Helper function to calculate distance in nautical miles using Haversine formula
function calculateDistanceNauticalMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const EARTH_RADIUS_NM = 3440.065; // Nautical miles

  // Convert degrees to radians
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const lat1Rad = lat1 * (Math.PI / 180);
  const lat2Rad = lat2 * (Math.PI / 180);

  // Haversine formula
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.asin(Math.sqrt(a));
  const distance = EARTH_RADIUS_NM * c;

  // Round to 2 decimal places
  return Math.round(distance * 100) / 100;
}

// Helper function to get calendar day (YYYY-MM-DD) from a date
function getCalendarDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper function to check if another entry exists for the same calendar day
async function checkEntryExistsForDay(app: App, userId: string, calendarDay: string, excludeEntryId?: string): Promise<boolean> {
  // Get all entries for the user for this calendar day
  const entries = await app.db.query.sea_time_entries.findMany({
    where: eq(schema.sea_time_entries.user_id, userId),
  });

  // Filter by calendar day
  for (const entry of entries) {
    const entryDay = getCalendarDay(new Date(entry.start_time));
    if (entryDay === calendarDay && (!excludeEntryId || entry.id !== excludeEntryId)) {
      return true;
    }
  }

  return false;
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

// Helper function to transform sea time entry for API response
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
  if (entry.detection_window_hours) {
    detection_window_hours = parseFloat(String(entry.detection_window_hours));
  }

  // Parse watchkeeping_hours if present
  let watchkeeping_hours = null;
  if (entry.watchkeeping_hours) {
    watchkeeping_hours = parseFloat(String(entry.watchkeeping_hours));
  }

  // Parse additional_watchkeeping_hours if present
  let additional_watchkeeping_hours = null;
  if (entry.additional_watchkeeping_hours) {
    additional_watchkeeping_hours = parseFloat(String(entry.additional_watchkeeping_hours));
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
    is_stationary: entry.is_stationary || null,
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
              mca_compliant: { type: ['boolean', 'null'] },
              detection_window_hours: { type: ['number', 'null'] },
              watchkeeping_hours: { type: ['number', 'null'] },
              additional_watchkeeping_hours: { type: ['number', 'null'] },
              is_stationary: { type: ['boolean', 'null'] },
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
      where: eq(schema.sea_time_entries.user_id, userId),
      orderBy: desc(schema.sea_time_entries.start_time),
    });

    app.logger.info({ userId, count: entries.length }, 'Sea time entries retrieved');
    return reply.code(200).send(entries.map(transformSeaTimeEntryForResponse));
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
              mca_compliant: { type: ['boolean', 'null'] },
              detection_window_hours: { type: ['number', 'null'] },
              watchkeeping_hours: { type: ['number', 'null'] },
              additional_watchkeeping_hours: { type: ['number', 'null'] },
              is_stationary: { type: ['boolean', 'null'] },
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
      where: eq(schema.sea_time_entries.vessel_id, vesselId),
      with: {
        vessel: true,
      },
      orderBy: desc(schema.sea_time_entries.start_time),
    });

    app.logger.info({ userId, vesselId, count: entries.length }, 'Sea time entries retrieved');
    return reply.code(200).send(entries.map(transformSeaTimeEntryForResponse));
  });

  // GET /api/sea-time/pending - Return pending entries awaiting confirmation
  fastify.get('/api/sea-time/pending', {
    schema: {
      description: 'Get pending sea time entries awaiting confirmation (requires authentication)',
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
              status: { type: 'string' },
              service_type: { type: 'string' },
              notes: { type: ['string', 'null'] },
              created_at: { type: 'string', format: 'date-time' },
              start_latitude: { type: ['string', 'null'] },
              start_longitude: { type: ['string', 'null'] },
              end_latitude: { type: ['string', 'null'] },
              end_longitude: { type: ['string', 'null'] },
              mca_compliant: { type: ['boolean', 'null'] },
              detection_window_hours: { type: ['number', 'null'] },
              watchkeeping_hours: { type: ['number', 'null'] },
              additional_watchkeeping_hours: { type: ['number', 'null'] },
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

    const entries = await app.db.query.sea_time_entries.findMany({
      where: and(
        eq(schema.sea_time_entries.status, 'pending'),
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
                  mca_compliant: { type: ['boolean', 'null'] },
                  detection_window_hours: { type: ['number', 'null'] },
                  watchkeeping_hours: { type: ['number', 'null'] },
                  additional_watchkeeping_hours: { type: ['number', 'null'] },
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
        gte(schema.sea_time_entries.created_at, cutoffTime),
        // Filter for complete, MCA-compliant entries only
        isNotNull(schema.sea_time_entries.end_time),
        gte(schema.sea_time_entries.duration_hours, '4.0'),
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
  fastify.put<{ Params: { id: string }; Body: { notes?: string; service_type?: string } }>('/api/sea-time/:id/confirm', {
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
    const { notes, service_type } = request.body;

    // Validate service_type if provided
    if (service_type !== undefined && !isValidServiceType(service_type)) {
      app.logger.warn({ userId, entryId: id, service_type }, 'Invalid service type provided');
      return reply.code(400).send({ error: `Invalid service_type. Must be one of: ${VALID_SERVICE_TYPES.join(', ')}` });
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

    // Set end_time to now and calculate sea_days based on duration
    const end_time = new Date();

    // Calculate duration and sea_days
    const duration_hours = calculateDurationHours(current_entry.start_time, end_time);
    const calculated_sea_days = calculateSeaDays(duration_hours);

    // Note: Calendar day restriction has been removed to allow multiple entries per day as vessels move throughout the day
    // The scheduler now creates multiple entries (every 2 hours) when movement is detected
    app.logger.debug({ userId, entryId: id }, 'Confirming entry - multiple entries per calendar day are now allowed');

    const [updated] = await app.db
      .update(schema.sea_time_entries)
      .set({
        end_time,
        duration_hours: String(duration_hours),
        sea_days: calculated_sea_days,
        status: 'confirmed',
        service_type: service_type || current_entry.service_type || 'actual_sea_service',
        notes: notes || current_entry.notes,
      })
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

    return reply.code(200).send(transformSeaTimeEntryForResponse(updated));
  });

  // PUT /api/sea-time/:id - Update sea time entry (allows updating sea_days, notes, and service_type)
  fastify.put<{ Params: { id: string }; Body: { sea_days?: number; notes?: string; service_type?: string } }>('/api/sea-time/:id', {
    schema: {
      description: 'Update a sea time entry (requires authentication). Allows updating sea_days, notes, and service_type.',
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
    const { sea_days, notes, service_type } = request.body;

    // Validate service_type if provided
    if (service_type !== undefined && !isValidServiceType(service_type)) {
      app.logger.warn({ userId, entryId: id, service_type }, 'Invalid service type provided');
      return reply.code(400).send({ error: `Invalid service_type. Must be one of: ${VALID_SERVICE_TYPES.join(', ')}` });
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

    return reply.code(200).send(transformSeaTimeEntryForResponse(updated));
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

  // POST /api/sea-time/test-entry - Test endpoint to create a sea day entry from specific position data
  fastify.post('/api/sea-time/test-entry', {
    schema: {
      description: 'Test endpoint to create a sea day entry from specific position records',
      tags: ['sea-time'],
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
            notes: { type: ['string', 'null'] },
            created_at: { type: 'string', format: 'date-time' },
            start_latitude: { type: ['string', 'null'] },
            start_longitude: { type: ['string', 'null'] },
            end_latitude: { type: ['string', 'null'] },
            end_longitude: { type: ['string', 'null'] },
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
        400: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
        500: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    app.logger.info('Test endpoint: Creating sea day entry from most recent position records');

    try {
      // Find the Norwegian vessel (case-insensitive)
      const vessels = await app.db
        .select()
        .from(schema.vessels)
        .where(eq(schema.vessels.vessel_name, 'Norwegian'));

      if (vessels.length === 0) {
        app.logger.warn('Test endpoint: Norwegian vessel not found');
        return reply.code(404).send({ error: "Vessel 'Norwegian' not found" });
      }

      const vessel = vessels[0];
      app.logger.debug({ vesselId: vessel.id, vesselName: vessel.vessel_name }, 'Found Norwegian vessel');

      // Get the two most recent position records for this vessel
      const positionRecords = await app.db
        .select()
        .from(schema.ais_checks)
        .where(eq(schema.ais_checks.vessel_id, vessel.id))
        .orderBy(desc(schema.ais_checks.check_time))
        .limit(2);

      if (positionRecords.length < 2) {
        app.logger.warn(
          { vesselId: vessel.id, recordsCount: positionRecords.length },
          'Test endpoint: Not enough position records'
        );
        return reply.code(404).send({
          error: `Not enough position records found for vessel ${vessel.vessel_name} (need at least 2)`,
        });
      }

      // Records are ordered newest first, so [0] is newest, [1] is older
      const newestRecord = positionRecords[0];
      const olderRecord = positionRecords[1];

      app.logger.debug(
        {
          olderRecordTime: olderRecord.check_time.toISOString(),
          newestRecordTime: newestRecord.check_time.toISOString(),
        },
        'Test endpoint: Selected two most recent position records'
      );

      // Validate that both records have position data
      if (
        !olderRecord.latitude ||
        !olderRecord.longitude ||
        !newestRecord.latitude ||
        !newestRecord.longitude
      ) {
        app.logger.error(
          { olderRecordId: olderRecord.id, newestRecordId: newestRecord.id },
          'Test endpoint: Position records missing latitude/longitude data'
        );
        return reply.code(500).send({ error: 'Position records missing latitude/longitude data' });
      }

      const startLat = parseFloat(String(olderRecord.latitude));
      const startLng = parseFloat(String(olderRecord.longitude));
      const endLat = parseFloat(String(newestRecord.latitude));
      const endLng = parseFloat(String(newestRecord.longitude));

      // Validate that start and end coordinates are different
      // Prevent creating entries when coordinates are identical despite different timestamps
      if (startLat === endLat && startLng === endLng) {
        app.logger.warn(
          {
            vesselId: vessel.id,
            vesselName: vessel.vessel_name,
            startTime: olderRecord.check_time.toISOString(),
            startLat,
            startLng,
            endTime: newestRecord.check_time.toISOString(),
            endLat,
            endLng,
          },
          `Test endpoint: Vessel ${vessel.vessel_name} has identical coordinates (${startLat}, ${startLng}) despite different timestamps - skipping sea time entry creation`
        );
        return reply.code(400).send({
          error: `Cannot create sea time entry: start and end coordinates are identical (${startLat}, ${startLng}) despite different timestamps`,
        });
      }

      // Calculate duration in hours and sea_days
      const duration_ms = newestRecord.check_time.getTime() - olderRecord.check_time.getTime();
      const duration_hours = Math.round((duration_ms / (1000 * 60 * 60)) * 100) / 100;
      const sea_days = calculateSeaDays(duration_hours);

      // Calculate distance traveled using Haversine formula
      const EARTH_RADIUS_NM = 3440.065;
      const dLat = (endLat - startLat) * (Math.PI / 180);
      const dLon = (endLng - startLng) * (Math.PI / 180);
      const lat1Rad = startLat * (Math.PI / 180);
      const lat2Rad = endLat * (Math.PI / 180);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.asin(Math.sqrt(a));
      const distanceNm = Math.round((EARTH_RADIUS_NM * c) * 100) / 100;

      app.logger.info(
        {
          vesselId: vessel.id,
          vesselName: vessel.vessel_name,
          startTime: olderRecord.check_time.toISOString(),
          startLat,
          startLng,
          endTime: newestRecord.check_time.toISOString(),
          endLat,
          endLng,
          durationHours: duration_hours,
          seaDays: sea_days,
          distanceNm,
        },
        `Test endpoint: Creating sea day entry from two most recent positions`
      );

      // VALIDATION: Only create entries if vessel has traveled at least 0.5 nm
      if (distanceNm < 0.5) {
        app.logger.warn(
          { vesselId: vessel.id, distanceNm, minimumThreshold: 0.5 },
          `Test endpoint: Vessel has not traveled enough distance (${distanceNm} nm < 0.5 nm minimum), skipping entry creation`
        );
        return reply.code(400).send({
          error: `Cannot create sea time entry: vessel has not traveled enough distance (${distanceNm} nm < 0.5 nm minimum)`,
        });
      }

      // Check if another entry exists for this calendar day
      const testCalendarDay = getCalendarDay(new Date(olderRecord.check_time));
      const testEntryExists = await checkEntryExistsForDay(app, vessel[0].user_id, testCalendarDay);

      if (testEntryExists) {
        app.logger.warn({ vesselId: vessel.id, calendarDay: testCalendarDay }, 'Test entry: another entry exists for this calendar day');
        return reply.code(400).send({
          error: `Cannot create test entry: You can only register one sea time period per day (00:00-23:59). Another entry exists for ${testCalendarDay}.`,
        });
      }

      // Create the sea time entry
      const [new_entry] = await app.db
        .insert(schema.sea_time_entries)
        .values({
          user_id: vessel[0].user_id,
          vessel_id: vessel.id,
          start_time: olderRecord.check_time,
          end_time: newestRecord.check_time,
          duration_hours: String(duration_hours),
          sea_days: sea_days,
          start_latitude: String(startLat),
          start_longitude: String(startLng),
          end_latitude: String(endLat),
          end_longitude: String(endLng),
          distance_nm: String(distanceNm),
          is_stationary: false,
          status: 'pending',
          service_type: 'actual_sea_service',
          notes: `Test entry created from two most recent position records - vessel moved ${distanceNm} nm`,
        })
        .returning();

      app.logger.info(
        { entryId: new_entry.id, vesselId: vessel.id, vesselName: vessel.vessel_name, durationHours: duration_hours, seaDays: sea_days },
        `Test endpoint: Sea day entry created successfully`
      );

      // Return the entry with vessel information
      const response = {
        ...new_entry,
        vessel,
      };

      return reply.code(200).send(transformSeaTimeEntryForResponse(response));
    } catch (error) {
      app.logger.error({ err: error }, 'Test endpoint: Error creating sea day entry');
      return reply.code(500).send({ error: 'Failed to create sea day entry' });
    }
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
      const entry1SeaDays = calculateSeaDays(entry1Duration);
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
      const entry2SeaDays = calculateSeaDays(entry2Duration);
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
      const entry3SeaDays = calculateSeaDays(entry3Duration);
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
      where: eq(schema.sea_time_entries.user_id, userId),
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
          end_time: { type: 'string', description: 'ISO 8601 end time (optional)' },
          sea_days: { type: 'number', description: 'Number of sea days (default: 1)' },
          service_type: { type: 'string', description: 'Service type (default: actual_sea_service)' },
          notes: { type: 'string', description: 'Optional notes' },
          start_latitude: { type: 'number', description: 'Start position latitude' },
          start_longitude: { type: 'number', description: 'Start position longitude' },
          end_latitude: { type: 'number', description: 'End position latitude' },
          end_longitude: { type: 'number', description: 'End position longitude' },
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
    const { vessel_id, start_time, end_time, sea_days = 1, service_type, notes, start_latitude, start_longitude, end_latitude, end_longitude } = request.body;

    // Validate service_type if provided
    if (service_type !== undefined && !isValidServiceType(service_type)) {
      app.logger.warn({ vessel_id, service_type }, 'Invalid service type provided for manual entry');
      return reply.code(400).send({ error: `Invalid service_type. Must be one of: ${VALID_SERVICE_TYPES.join(', ')}` });
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
        calculated_duration_hours = String(duration_hours);
        calculated_sea_days = calculateSeaDays(duration_hours);

        app.logger.info({ vessel_id, durationHours: duration_hours, seaDays: calculated_sea_days }, 'Sea time duration calculated');
      } catch (error) {
        app.logger.warn({ end_time }, 'Invalid end_time format');
        return reply.code(400).send({ error: 'Invalid end_time format' });
      }
    }

    // Note: Calendar day restriction has been removed to allow multiple entries per day as vessels move throughout the day
    // The scheduler creates multiple entries (every 2 hours) when movement is detected
    app.logger.debug({ userId: session.userId }, 'Creating entry - multiple entries per calendar day are now allowed');

    // Create the sea time entry (marked as confirmed for manually created entries)
    try {
      const [entry] = await app.db
        .insert(schema.sea_time_entries)
        .values({
          user_id: session.userId,
          vessel_id,
          start_time: startDate,
          end_time: endDate,
          duration_hours: calculated_duration_hours,
          sea_days: calculated_sea_days,
          status: 'confirmed', // Manually created entries are confirmed
          service_type: service_type || 'actual_sea_service',
          notes,
          start_latitude: start_latitude ? String(start_latitude) : null,
          start_longitude: start_longitude ? String(start_longitude) : null,
          end_latitude: end_latitude ? String(end_latitude) : null,
          end_longitude: end_longitude ? String(end_longitude) : null,
        })
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

      // Return entry with vessel details
      const response = {
        ...entry,
        vessel: vessel[0],
      };

      return reply.code(201).send(transformSeaTimeEntryForResponse(response));
    } catch (error) {
      app.logger.error({ err: error, vessel_id }, 'Failed to create manual sea time entry');
      return reply.code(400).send({ error: 'Failed to create sea time entry' });
    }
  });

  // POST /api/sea-time/generate-sample-entries - Generate 4 realistic sample sea time entries for testing
  fastify.post<{
    Body: {
      email: string;
      vesselName: string;
    };
  }>('/api/sea-time/generate-sample-entries', {
    schema: {
      description: 'Generate 4 realistic sample sea time entries for testing purposes',
      tags: ['sea-time'],
      body: {
        type: 'object',
        required: ['email', 'vesselName'],
        properties: {
          email: { type: 'string', description: 'User email' },
          vesselName: { type: 'string', description: 'Vessel name' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            entriesCreated: { type: 'number' },
            vessel: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                vessel_name: { type: 'string' },
                mmsi: { type: 'string' },
              },
            },
            entries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  vessel_id: { type: 'string' },
                  start_time: { type: 'string' },
                  end_time: { type: 'string' },
                  duration_hours: { type: 'number' },
                  sea_days: { type: 'number' },
                  status: { type: 'string' },
                  notes: { type: 'string' },
                  start_latitude: { type: 'string' },
                  start_longitude: { type: 'string' },
                  end_latitude: { type: 'string' },
                  end_longitude: { type: 'string' },
                  created_at: { type: 'string' },
                },
              },
            },
          },
        },
        400: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { email, vesselName } = request.body;

    app.logger.info({ email, vesselName }, 'Generating 4 sample sea time entries');

    try {
      // Find user by email
      const users = await app.db
        .select()
        .from(authSchema.user)
        .where(eq(authSchema.user.email, email));

      if (users.length === 0) {
        app.logger.warn({ email }, 'User not found for sample entry generation');
        return reply.code(404).send({ error: 'User not found' });
      }

      const user = users[0];
      const userId = user.id;

      app.logger.info({ userId, email }, 'User found, proceeding with vessel lookup');

      // Find or create vessel
      let vessels = await app.db
        .select()
        .from(schema.vessels)
        .where(
          and(
            eq(schema.vessels.user_id, userId),
            eq(schema.vessels.vessel_name, vesselName)
          )
        );

      let vessel;
      if (vessels.length === 0) {
        // Create new vessel
        app.logger.info({ userId, vesselName }, 'Vessel not found, creating new vessel');

        const [newVessel] = await app.db
          .insert(schema.vessels)
          .values({
            user_id: userId,
            mmsi: '123456789',
            vessel_name: vesselName,
            is_active: true,
          })
          .returning();

        vessel = newVessel;
        app.logger.info({ vesselId: vessel.id, vesselName }, 'Vessel created successfully');
      } else {
        vessel = vessels[0];
        app.logger.info({ vesselId: vessel.id, vesselName }, 'Using existing vessel');
      }

      // Generate 4 sample entries with varied data
      const sampleNotes = [
        'Coastal passage from Southampton to Portsmouth. Good weather conditions.',
        'Offshore delivery voyage across the Channel.',
        'Training voyage in the Solent. Practiced navigation and mooring.',
        'Charter cruise to Cherbourg with client onboard.',
      ];

      // UK waters coordinates for realistic positions
      const startCoordinates = [
        { lat: 50.9097, lng: -1.4044 }, // Southampton
        { lat: 50.7964, lng: -1.1089 }, // Portsmouth
        { lat: 50.8429, lng: -1.2981 }, // Solent
        { lat: 50.6929, lng: -1.3047 }, // Isle of Wight
      ];

      const endCoordinates = [
        { lat: 50.7964, lng: -1.1089 }, // Portsmouth
        { lat: 50.8429, lng: -1.2981 }, // Solent
        { lat: 50.6929, lng: -1.3047 }, // Isle of Wight
        { lat: 49.6432, lng: -1.6292 }, // Cherbourg
      ];

      const entries = [];
      const usedDays = new Set<string>(); // Track calendar days to ensure no duplicates

      // Generate entries spread across last 60 days
      for (let i = 0; i < 4; i++) {
        // Random day in last 60 days, ensure no duplicate calendar days
        let daysAgo = Math.floor(Math.random() * 60) + 1;
        let startTime = new Date();
        startTime.setDate(startTime.getDate() - daysAgo);
        let calendarDay = getCalendarDay(startTime);

        // Keep trying until we find a unique calendar day
        while (usedDays.has(calendarDay)) {
          daysAgo = Math.floor(Math.random() * 60) + 1;
          startTime = new Date();
          startTime.setDate(startTime.getDate() - daysAgo);
          calendarDay = getCalendarDay(startTime);
        }

        usedDays.add(calendarDay);

        const hoursAgo = Math.floor(Math.random() * 24);
        startTime.setHours(hoursAgo, Math.floor(Math.random() * 60), 0, 0);

        // Duration between 6-14 hours
        const durationHours = Math.round((Math.random() * 8 + 6) * 100) / 100;
        const endTime = new Date(startTime.getTime() + durationHours * 60 * 60 * 1000);

        // Calculate sea_days
        const sea_days = calculateSeaDays(durationHours);

        // Mix of confirmed (3) and pending (1) status
        const status = i < 3 ? 'confirmed' : 'pending';

        // Create entry
        const [entry] = await app.db
          .insert(schema.sea_time_entries)
          .values({
            user_id: userId,
            vessel_id: vessel.id,
            start_time: startTime,
            end_time: endTime,
            duration_hours: String(durationHours),
            sea_days: sea_days,
            status: status,
            service_type: 'actual_sea_service',
            notes: sampleNotes[i],
            start_latitude: String(startCoordinates[i].lat),
            start_longitude: String(startCoordinates[i].lng),
            end_latitude: String(endCoordinates[i].lat),
            end_longitude: String(endCoordinates[i].lng),
            created_at: startTime,
          })
          .returning();

        entries.push(entry);

        app.logger.info(
          {
            entryId: entry.id,
            index: i + 1,
            durationHours: durationHours,
            seaDays: sea_days,
            status: status,
          },
          `Sample entry ${i + 1} created`
        );
      }

      app.logger.info(
        { userId, vesselId: vessel.id, entriesCount: entries.length },
        'Sample sea time entries generated successfully'
      );

      return reply.code(201).send({
        success: true,
        message: `Generated 4 sample sea time entries for vessel ${vesselName}`,
        entriesCreated: entries.length,
        vessel: {
          id: vessel.id,
          vessel_name: vessel.vessel_name,
          mmsi: vessel.mmsi,
        },
        entries: entries.map((entry) => ({
          id: entry.id,
          vessel_id: entry.vessel_id,
          start_time: entry.start_time.toISOString ? entry.start_time.toISOString() : entry.start_time,
          end_time: entry.end_time ? (entry.end_time.toISOString ? entry.end_time.toISOString() : entry.end_time) : null,
          duration_hours: entry.duration_hours ? parseFloat(String(entry.duration_hours)) : null,
          sea_days: entry.sea_days,
          status: entry.status,
          service_type: entry.service_type || 'actual_sea_service',
          notes: entry.notes,
          start_latitude: entry.start_latitude,
          start_longitude: entry.start_longitude,
          end_latitude: entry.end_latitude,
          end_longitude: entry.end_longitude,
          created_at: entry.created_at.toISOString ? entry.created_at.toISOString() : entry.created_at,
        })),
      });
    } catch (error) {
      app.logger.error({ err: error, email, vesselName }, 'Failed to generate sample sea time entries');
      return reply.code(400).send({ error: 'Failed to generate sample sea time entries' });
    }
  });
}
