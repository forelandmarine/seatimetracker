import type { FastifyInstance } from "fastify";
import { eq, inArray, desc, and } from "drizzle-orm";
import * as schema from "../db/schema.js";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest, verifyVesselOwnership } from "../middleware/auth.js";
import { fetchVesselAISDataWithFallback } from "./ais.js";
import { lookupPort } from "../utils/portDatabase.js";
import { enrichHubspotContactWithVessel } from "../utils/hubspot.js";

// Trigger an immediate AIS check for a vessel and store the result.
// Used on activation to populate position data right away rather than waiting
// for the scheduler's next iteration.
async function fetchAndStoreInitialAISCheck(
  app: App,
  vesselId: string,
  mmsi: string,
  userId: string
): Promise<void> {
  try {
    const { data: ais_data, apiSource } = await fetchVesselAISDataWithFallback(
      mmsi,
      app.logger,
      vesselId,
      app,
      userId,
      true
    );

    if (ais_data.error || ais_data.latitude === null || ais_data.longitude === null) {
      app.logger.warn(
        { vesselId, mmsi, error: ais_data.error },
        'Initial AIS fetch failed or returned no position'
      );
      return;
    }

    await app.db.insert(schema.ais_checks).values({
      user_id: userId,
      vessel_id: vesselId,
      check_time: new Date(),
      is_moving: ais_data.is_moving,
      speed_knots: ais_data.speed_knots !== null ? String(ais_data.speed_knots) : null,
      latitude: String(ais_data.latitude),
      longitude: String(ais_data.longitude),
      course: ais_data.course !== null && ais_data.course !== undefined ? String(ais_data.course) : null,
      heading: ais_data.heading !== null && ais_data.heading !== undefined ? String(ais_data.heading) : null,
      nav_status: ais_data.status ?? null,
      destination: lookupPort(ais_data.destination) ?? ais_data.destination ?? null,
      eta: ais_data.eta ?? null,
      api_source: apiSource,
    });

    // Update vessel with AIS-derived data (callsign, flag, type)
    const vesselUpdates: Record<string, any> = { updated_at: new Date() };
    if (ais_data.callsign) vesselUpdates.callsign = ais_data.callsign;
    if (ais_data.flag) vesselUpdates.flag = ais_data.flag;
    if (ais_data.ship_type) vesselUpdates.type = ais_data.ship_type;

    if (Object.keys(vesselUpdates).length > 1) {
      await app.db
        .update(schema.vessels)
        .set(vesselUpdates)
        .where(eq(schema.vessels.id, vesselId));
      app.logger.info({ vesselId, updates: Object.keys(vesselUpdates).filter(k => k !== 'updated_at') }, 'Vessel updated with AIS data on activation');
    }

    app.logger.info(
      { vesselId, mmsi, lat: ais_data.latitude, lng: ais_data.longitude },
      'Initial AIS check stored on vessel activation'
    );
  } catch (err) {
    app.logger.error({ err, vesselId, mmsi }, 'Failed to fetch initial AIS check');
  }
}

// Helper function to ensure a scheduled task exists for a vessel
async function ensureScheduledTask(app: App, vesselId: string, userId: string): Promise<void> {
  try {
    // Check if a scheduled task already exists for this vessel
    const existingTask = await app.db
      .select()
      .from(schema.scheduled_tasks)
      .where(eq(schema.scheduled_tasks.vessel_id, vesselId));

    if (existingTask.length > 0) {
      app.logger.debug({ vesselId }, 'Scheduled task already exists for vessel');
      return;
    }

    // Create a new scheduled task for the vessel with 2-hour check interval.
    // First check runs immediately so user sees data right after activation;
    // subsequent checks are spaced 2 hours apart by the scheduler.
    const now = new Date();
    const nextRun = now;

    const [newTask] = await app.db
      .insert(schema.scheduled_tasks)
      .values({
        user_id: userId,
        task_type: 'ais_check',
        vessel_id: vesselId,
        interval_hours: '2',
        is_active: true,
        next_run: nextRun,
        last_run: null,
      })
      .returning();

    app.logger.info(
      { vesselId, userId, taskId: newTask.id, interval: '2 hours', nextRun: nextRun.toISOString() },
      `Created scheduled task for vessel with 2-hour position check interval (user: ${userId})`
    );
  } catch (error) {
    app.logger.error(
      { err: error, vesselId, userId },
      `Failed to create scheduled task for vessel (user: ${userId})`
    );
    throw error;
  }
}

// Helper function to auto-fill vessel particulars from recent AIS data
async function autoFillVesselParticularsFromAIS(
  app: App,
  vesselId: string,
  currentData: Record<string, any>
): Promise<Record<string, any>> {
  try {
    // Get the most recent successful AIS debug log for this vessel (has full API response)
    const recentLog = await app.db
      .select()
      .from(schema.ais_debug_logs)
      .where(and(
        eq(schema.ais_debug_logs.vessel_id, vesselId),
        eq(schema.ais_debug_logs.response_status, '200'),
      ))
      .orderBy(desc(schema.ais_debug_logs.request_time))
      .limit(1);

    let aisData: any = null;
    if (recentLog.length > 0 && recentLog[0].response_body) {
      try {
        const parsed = JSON.parse(recentLog[0].response_body);
        // Unwrap nested data property if present
        aisData = parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
      } catch {
        // Fall through to ais_checks fallback
      }
    }

    // Fallback: use ais_checks table (always populated on successful AIS check)
    if (!aisData) {
      const recentCheck = await app.db
        .select()
        .from(schema.ais_checks)
        .where(eq(schema.ais_checks.vessel_id, vesselId))
        .orderBy(desc(schema.ais_checks.check_time))
        .limit(1);

      if (recentCheck.length === 0) {
        app.logger.debug({ vesselId }, 'No AIS data found for auto-fill');
        return currentData;
      }
      aisData = recentCheck[0];
    }

    const autoFilledFields: string[] = [];
    const result = { ...currentData };

    // Helper: try multiple field names
    const getField = (...names: string[]): any => {
      for (const n of names) {
        if (aisData[n] != null && aisData[n] !== '') return aisData[n];
      }
      return undefined;
    };

    if (!currentData.callsign) {
      const v = getField('callsign');
      if (v) { result.callsign = String(v); autoFilledFields.push('callsign'); }
    }

    if (!currentData.flag) {
      const v = getField('flag', 'country_iso');
      if (v) { result.flag = String(v); autoFilledFields.push('flag'); }
    }

    if (!currentData.type) {
      const v = getField('ship_type', 'type', 'vessel_type', 'type_specific');
      if (v) { result.type = String(v); autoFilledFields.push('type'); }
    }

    if (!currentData.length_metres) {
      const v = getField('length', 'length_metres');
      if (v) { result.length_metres = String(v); autoFilledFields.push('length_metres'); }
    }

    if (!currentData.imo_number) {
      const v = getField('imo', 'imo_number');
      if (v) { result.imo_number = String(v); autoFilledFields.push('imo_number'); }
    }

    if (autoFilledFields.length > 0) {
      app.logger.info(
        { vesselId, autoFilledFields },
        `Auto-filled vessel particulars from AIS: ${autoFilledFields.join(', ')}`
      );
    }

    return result;
  } catch (error) {
    app.logger.error(
      { err: error, vesselId },
      'Error auto-filling vessel particulars from AIS data'
    );
    return currentData;
  }
}

// Helper function to transform vessel object for API response
function transformVesselForResponse(vessel: any) {
  let engine_kilowatts = null;
  if (vessel.engine_kilowatts) {
    engine_kilowatts = parseFloat(String(vessel.engine_kilowatts));
  }

  return {
    id: vessel.id,
    mmsi: vessel.mmsi,
    vessel_name: vessel.vessel_name,
    imo_number: vessel.imo_number || null,
    callsign: vessel.callsign,
    flag: vessel.flag,
    official_number: vessel.official_number,
    vessel_type: vessel.type, // Map 'type' database field to 'vessel_type' in API response
    length_metres: vessel.length_metres,
    gross_tonnes: vessel.gross_tonnes,
    tonnage_itc: vessel.tonnage_itc || null,
    engine_kilowatts: engine_kilowatts,
    engine_type: vessel.engine_type || null,
    is_active: vessel.is_active,
    created_at: vessel.created_at,
    updated_at: vessel.updated_at,
  };
}

export function register(app: App, fastify: FastifyInstance) {
  // GET /api/vessels - Return all vessels for authenticated user
  fastify.get('/api/vessels', {
    schema: {
      description: 'Get all vessels (requires authentication)',
      tags: ['vessels'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              mmsi: { type: 'string' },
              vessel_name: { type: 'string' },
              imo_number: { type: ['string', 'null'] },
              callsign: { type: ['string', 'null'] },
              flag: { type: ['string', 'null'] },
              official_number: { type: ['string', 'null'] },
              vessel_type: { type: ['string', 'null'] },
              length_metres: { type: ['string', 'null'] },
              gross_tonnes: { type: ['string', 'null'] },
              tonnage_itc: { type: ['string', 'null'] },
              engine_kilowatts: { type: ['number', 'null'] },
              engine_type: { type: ['string', 'null'] },
              is_active: { type: 'boolean' },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
          },
        },
        401: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'Vessel list requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    app.logger.info({ userId }, 'Fetching vessels for user');
    const vessels = await app.db
      .select()
      .from(schema.vessels)
      .where(eq(schema.vessels.user_id, userId));

    const isActiveValues = vessels.map(v => v.is_active).join(',');
    app.logger.info(
      { userId, count: vessels.length, is_active_values: isActiveValues },
      `Vessels fetched: count=${vessels.length}, is_active values=${isActiveValues}`
    );
    return vessels.map(transformVesselForResponse);
  });

  // GET /api/vessels/:id - Get a single vessel by ID
  fastify.get<{ Params: { id: string } }>('/api/vessels/:id', {
    schema: {
      description: 'Get a single vessel by ID (requires authentication)',
      tags: ['vessels'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid', description: 'Vessel ID' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            mmsi: { type: 'string' },
            vessel_name: { type: 'string' },
            imo_number: { type: ['string', 'null'] },
            callsign: { type: ['string', 'null'] },
            flag: { type: ['string', 'null'] },
            official_number: { type: ['string', 'null'] },
            vessel_type: { type: ['string', 'null'] },
            length_metres: { type: ['string', 'null'] },
            gross_tonnes: { type: ['string', 'null'] },
            tonnage_itc: { type: ['string', 'null'] },
            engine_kilowatts: { type: ['number', 'null'] },
            engine_type: { type: ['string', 'null'] },
            is_active: { type: 'boolean' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' },
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
      app.logger.warn({}, 'Vessel fetch requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const { id: vesselId } = request.params;

    app.logger.info({ userId, vesselId }, 'Fetching vessel by ID');

    // Get vessel and verify ownership
    const vessels = await app.db
      .select()
      .from(schema.vessels)
      .where(eq(schema.vessels.id, vesselId));

    if (vessels.length === 0) {
      app.logger.warn({ userId, vesselId }, 'Vessel not found');
      return reply.code(404).send({ error: 'Vessel not found' });
    }

    const vessel = vessels[0];
    if (vessel.user_id !== userId) {
      app.logger.warn({ userId, vesselId }, 'Unauthorized: vessel does not belong to user');
      return reply.code(403).send({ error: 'Not authorized to access this vessel' });
    }

    app.logger.info({ userId, vesselId, vesselName: vessel.vessel_name }, 'Vessel retrieved');
    return reply.code(200).send(transformVesselForResponse(vessel));
  });

  // POST /api/vessels - Create vessel with mmsi, vessel_name, and optional additional details
  fastify.post<{
    Body: {
      mmsi: string;
      vessel_name: string;
      imo_number?: string;
      callsign?: string;
      flag?: string;
      official_number?: string;
      type?: string;
      length_metres?: number;
      gross_tonnes?: number;
      tonnage_itc?: number;
      engine_kilowatts?: number;
      engine_type?: string;
      is_active?: boolean;
    }
  }>('/api/vessels', {
    schema: {
      description: 'Create a new vessel with complete vessel information. If is_active=true, deactivates all other vessels. (Requires authentication)',
      tags: ['vessels'],
      body: {
        type: 'object',
        required: ['mmsi', 'vessel_name'],
        properties: {
          mmsi: { type: 'string' },
          vessel_name: { type: 'string' },
          imo_number: { type: 'string' },
          callsign: { type: 'string' },
          flag: { type: 'string' },
          official_number: { type: 'string' },
          type: { type: 'string', enum: ['Motor', 'Sail'] },
          length_metres: { type: 'number' },
          gross_tonnes: { type: 'number' },
          tonnage_itc: { type: 'number' },
          engine_kilowatts: { type: 'number' },
          engine_type: { type: 'string' },
          is_active: { type: 'boolean', default: false },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            mmsi: { type: 'string' },
            vessel_name: { type: 'string' },
            imo_number: { type: ['string', 'null'] },
            callsign: { type: ['string', 'null'] },
            flag: { type: ['string', 'null'] },
            official_number: { type: ['string', 'null'] },
            vessel_type: { type: ['string', 'null'] },
            length_metres: { type: ['string', 'null'] },
            gross_tonnes: { type: ['string', 'null'] },
            tonnage_itc: { type: ['string', 'null'] },
            engine_kilowatts: { type: ['number', 'null'] },
            engine_type: { type: ['string', 'null'] },
            is_active: { type: 'boolean' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' },
          },
        },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        403: { type: 'object', properties: { error: { type: 'string' } } },
        409: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'Vessel creation requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    // Check subscription status
    const users = await app.db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.id, userId));

    if (users.length === 0) {
      return reply.code(401).send({ error: 'User not found' });
    }

    const user = users[0];
    const subscriptionStatus = (user as any).subscription_status || 'inactive';
    const subscriptionExpiresAt = (user as any).subscription_expires_at;

    // Check if subscription is active
    let isSubscriptionActive = subscriptionStatus === 'active' || subscriptionStatus === 'trial';
    if (isSubscriptionActive && subscriptionExpiresAt) {
      try {
        const expiryDate = new Date(subscriptionExpiresAt);
        if (isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
          isSubscriptionActive = false;
        }
      } catch {
        isSubscriptionActive = false;
      }
    }

    // Free tier: users without an active subscription can create 1 vessel.
    // Subscribers can create unlimited vessels.
    // No vessel limit - adding a new active vessel deactivates the current one
    // (handled below when is_active=true)

    const {
      mmsi,
      vessel_name,
      imo_number,
      callsign,
      flag,
      official_number,
      type,
      length_metres,
      gross_tonnes,
      tonnage_itc,
      engine_kilowatts,
      engine_type,
      is_active = false,
    } = request.body;

    app.logger.info(
      { userId, mmsi, vessel_name, flag, official_number, type, length_metres, gross_tonnes, is_active },
      `Creating vessel with is_active=${is_active} for user ${userId}`
    );

    // Check if MMSI already exists for THIS USER (allow other users to track the same vessel)
    const existing = await app.db
      .select()
      .from(schema.vessels)
      .where(
        and(
          eq(schema.vessels.mmsi, mmsi),
          eq(schema.vessels.user_id, userId)
        )
      );

    if (existing.length > 0) {
      app.logger.warn({ userId, mmsi }, 'MMSI already exists for this user');
      return reply.code(409).send({ error: 'You already have a vessel with this MMSI. Each user can only track each MMSI once.' });
    }

    // If creating as active, deactivate all others and delete their scheduled tasks
    if (is_active) {
      // Get all other vessels for this user
      const otherVessels = await app.db
        .select()
        .from(schema.vessels)
        .where(eq(schema.vessels.user_id, userId));

      // Deactivate all other vessels
      await app.db
        .update(schema.vessels)
        .set({ is_active: false })
        .where(eq(schema.vessels.user_id, userId));

      // Delete scheduled tasks for all other vessels
      const otherVesselIds = otherVessels.map(v => v.id);
      if (otherVesselIds.length > 0) {
        await app.db
          .delete(schema.scheduled_tasks)
          .where(inArray(schema.scheduled_tasks.vessel_id, otherVesselIds));

        app.logger.info(
          { userId, deactivatedVesselCount: otherVesselIds.length },
          `Deactivated ${otherVesselIds.length} other vessels and deleted their scheduled tasks`
        );
      }
    }

    const [vessel] = await app.db
      .insert(schema.vessels)
      .values({
        user_id: userId,
        mmsi,
        vessel_name,
        imo_number: imo_number || null,
        callsign,
        flag,
        official_number,
        type,
        length_metres: length_metres != null ? String(length_metres) : null,
        gross_tonnes: gross_tonnes != null ? String(gross_tonnes) : null,
        tonnage_itc: tonnage_itc != null ? String(tonnage_itc) : null,
        engine_kilowatts: engine_kilowatts != null ? String(engine_kilowatts) : null,
        engine_type,
        is_active,
      })
      .returning();

    app.logger.info(
      { vesselId: vessel.id, userId, mmsi, vessel_name, callsign, is_active },
      'Vessel created successfully'
    );

    // Create scheduled task if vessel is active
    let scheduledTaskFailed = false;
    if (is_active) {
      try {
        await ensureScheduledTask(app, vessel.id, userId);
      } catch {
        scheduledTaskFailed = true;
      }
    }

    // Enrich HubSpot contact with vessel info (non-blocking, fire-and-forget)
    if (users[0]?.email) {
      enrichHubspotContactWithVessel(
        { email: users[0].email, vesselName: vessel_name, mmsi, flag: flag || undefined },
        app.logger
      ).catch((err) => {
        app.logger.warn({ userId, err }, 'HubSpot enrichment failed (non-critical)');
      });
    }

    const response = transformVesselForResponse(vessel);
    if (scheduledTaskFailed) {
      (response as any).warning = 'Vessel created but automatic AIS tracking could not be started. Try deactivating and reactivating the vessel.';
    }
    return reply.code(201).send(response);
  });

  // PUT /api/vessels/:id/activate - Activate specified vessel and deactivate all others
  fastify.put<{ Params: { id: string } }>('/api/vessels/:id/activate', {
    schema: {
      description: 'Activate a vessel and deactivate all others (requires authentication)',
      tags: ['vessels'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            mmsi: { type: 'string' },
            vessel_name: { type: 'string' },
            imo_number: { type: ['string', 'null'] },
            callsign: { type: ['string', 'null'] },
            flag: { type: ['string', 'null'] },
            official_number: { type: ['string', 'null'] },
            vessel_type: { type: ['string', 'null'] },
            length_metres: { type: ['string', 'null'] },
            gross_tonnes: { type: ['string', 'null'] },
            tonnage_itc: { type: ['string', 'null'] },
            is_active: { type: 'boolean' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' },
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
      app.logger.warn({}, 'Vessel activation requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const { id } = request.params;

    // Check if vessel exists and belongs to user
    const vessel = await app.db
      .select()
      .from(schema.vessels)
      .where(eq(schema.vessels.id, id));

    if (vessel.length === 0) {
      app.logger.warn({ userId, vesselId: id }, 'Vessel not found for activation');
      return reply.code(404).send({ error: 'Vessel not found' });
    }

    // Verify ownership
    if (vessel[0].user_id !== userId) {
      app.logger.warn({ userId, vesselId: id }, 'Unauthorized vessel activation attempt');
      return reply.code(403).send({ error: 'Not authorized to activate this vessel' });
    }

    // Single active vessel by design — a seafarer is only on one
    // eligible vessel at a time. Activating a new vessel deactivates
    // any previously active one.
    const otherVessels = await app.db
      .select()
      .from(schema.vessels)
      .where(eq(schema.vessels.user_id, userId));

    const otherVesselIds = otherVessels
      .filter((v) => v.id !== id)
      .map((v) => v.id);

    app.logger.info(
      { userId, vesselId: id },
      `Activating vessel ${id} for user ${userId}, deactivating all other vessels`
    );

    // Use a transaction to ensure atomic activation (prevents two active vessels)
    const activated = await app.db.transaction(async (tx) => {
      // Deactivate all vessels for this user
      await tx
        .update(schema.vessels)
        .set({ is_active: false })
        .where(eq(schema.vessels.user_id, userId));

      // Delete scheduled tasks for deactivated vessels
      if (otherVesselIds.length > 0) {
        await tx
          .delete(schema.scheduled_tasks)
          .where(inArray(schema.scheduled_tasks.vessel_id, otherVesselIds));
      }

      // Activate the specified vessel
      const [result] = await tx
        .update(schema.vessels)
        .set({ is_active: true })
        .where(eq(schema.vessels.id, id))
        .returning();

      return result;
    });

    app.logger.info(
      { userId, vesselId: activated.id, vesselName: activated.vessel_name, deactivatedCount: otherVesselIds.length },
      'Vessel activated successfully (transactional)'
    );

    // Create scheduled task for activated vessel
    let scheduledTaskFailed = false;
    try {
      await ensureScheduledTask(app, activated.id, userId);
    } catch {
      scheduledTaskFailed = true;
    }

    // Fetch initial AIS position immediately so user sees data right after activation
    await fetchAndStoreInitialAISCheck(app, activated.id, activated.mmsi, userId);

    const response = transformVesselForResponse(activated);
    if (scheduledTaskFailed) {
      (response as any).warning = 'Vessel activated but automatic AIS tracking could not be started. Try deactivating and reactivating the vessel.';
    }
    return reply.code(200).send(response);
  });

  // DELETE /api/vessels/:id - Delete vessel (requires authentication and ownership)
  fastify.delete<{ Params: { id: string } }>('/api/vessels/:id', {
    schema: {
      description: 'Delete a vessel (requires authentication)',
      tags: ['vessels'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
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
      app.logger.warn({}, 'Vessel deletion requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const { id } = request.params;

    app.logger.info({ userId, vesselId: id }, 'Deleting vessel');

    // Check if vessel exists first
    const vessel = await app.db
      .select()
      .from(schema.vessels)
      .where(eq(schema.vessels.id, id));

    if (vessel.length === 0) {
      app.logger.warn({ userId, vesselId: id }, 'Vessel not found for deletion');
      return reply.code(404).send({ error: 'Vessel not found' });
    }

    // Check ownership
    if (vessel[0].user_id !== userId) {
      app.logger.warn({ userId, vesselId: id }, 'Unauthorized vessel deletion attempt');
      return reply.code(403).send({ error: 'Not authorized to delete this vessel' });
    }

    try {
      const [deleted] = await app.db
        .delete(schema.vessels)
        .where(eq(schema.vessels.id, id))
        .returning();

      app.logger.info(
        { userId, vesselId: deleted.id, vesselName: deleted.vessel_name },
        'Vessel deleted successfully'
      );

      return reply.code(200).send({ id: deleted.id });
    } catch (deleteError: any) {
      app.logger.error({ userId, vesselId: id, err: deleteError }, 'Vessel deletion failed');
      return reply.code(500).send({ error: 'Failed to delete vessel. Please try again.' });
    }
  });

  // PUT /api/vessels/:id - Update vessel details
  fastify.put<{
    Params: { id: string };
    Body: {
      vessel_name?: string;
      imo_number?: string;
      callsign?: string;
      flag?: string;
      official_number?: string;
      type?: string;
      length_metres?: number;
      gross_tonnes?: number;
      tonnage_itc?: number;
      engine_kilowatts?: number;
      engine_type?: string;
    }
  }>('/api/vessels/:id', {
    schema: {
      description: 'Update vessel information (requires authentication)',
      tags: ['vessels'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        properties: {
          vessel_name: { type: 'string' },
          imo_number: { type: ['string', 'null'] },
          callsign: { type: 'string' },
          flag: { type: 'string' },
          official_number: { type: 'string' },
          type: { type: 'string', enum: ['Motor', 'Sail'] },
          length_metres: { type: 'number' },
          gross_tonnes: { type: 'number' },
          tonnage_itc: { type: ['number', 'null'] },
          engine_kilowatts: { type: ['number', 'null'] },
          engine_type: { type: ['string', 'null'] },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            mmsi: { type: 'string' },
            vessel_name: { type: 'string' },
            imo_number: { type: ['string', 'null'] },
            callsign: { type: ['string', 'null'] },
            flag: { type: ['string', 'null'] },
            official_number: { type: ['string', 'null'] },
            vessel_type: { type: ['string', 'null'] },
            length_metres: { type: ['string', 'null'] },
            gross_tonnes: { type: ['string', 'null'] },
            tonnage_itc: { type: ['string', 'null'] },
            engine_kilowatts: { type: ['number', 'null'] },
            engine_type: { type: ['string', 'null'] },
            is_active: { type: 'boolean' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' },
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
      app.logger.warn({}, 'Vessel update requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const { id } = request.params;
    const {
      vessel_name,
      imo_number,
      callsign,
      flag,
      official_number,
      type,
      length_metres,
      gross_tonnes,
      tonnage_itc,
      engine_kilowatts,
      engine_type,
    } = request.body;

    app.logger.info({ userId, vesselId: id }, 'Updating vessel');

    // Check if vessel exists and belongs to user
    const vessel = await app.db
      .select()
      .from(schema.vessels)
      .where(eq(schema.vessels.id, id));

    if (vessel.length === 0) {
      app.logger.warn({ userId, vesselId: id }, 'Vessel not found for update');
      return reply.code(404).send({ error: 'Vessel not found' });
    }

    // Verify ownership
    if (vessel[0].user_id !== userId) {
      app.logger.warn({ userId, vesselId: id }, 'Unauthorized vessel update attempt');
      return reply.code(403).send({ error: 'Not authorized to update this vessel' });
    }

    const updateData: Record<string, any> = { updated_at: new Date() };
    if (vessel_name !== undefined) updateData.vessel_name = vessel_name;
    if (imo_number !== undefined) updateData.imo_number = imo_number || null;
    if (callsign !== undefined) updateData.callsign = callsign;
    if (flag !== undefined) updateData.flag = flag;
    if (official_number !== undefined) updateData.official_number = official_number;
    if (type !== undefined) updateData.type = type;
    if (length_metres !== undefined) updateData.length_metres = length_metres != null ? String(length_metres) : null;
    if (gross_tonnes !== undefined) updateData.gross_tonnes = gross_tonnes != null ? String(gross_tonnes) : null;
    if (tonnage_itc !== undefined) updateData.tonnage_itc = tonnage_itc != null ? String(tonnage_itc) : null;
    if (engine_kilowatts !== undefined) updateData.engine_kilowatts = engine_kilowatts != null ? String(engine_kilowatts) : null;
    if (engine_type !== undefined) updateData.engine_type = engine_type || null;

    const [updated] = await app.db
      .update(schema.vessels)
      .set(updateData)
      .where(eq(schema.vessels.id, id))
      .returning();

    app.logger.info(
      { userId, vesselId: updated.id, vesselName: updated.vessel_name },
      'Vessel updated successfully'
    );

    return reply.code(200).send(transformVesselForResponse(updated));
  });

  // PUT /api/vessels/:id/particulars - Update vessel particulars (authenticated)
  fastify.put<{
    Params: { id: string };
    Body: {
      vessel_name?: string;
      imo_number?: string;
      callsign?: string;
      flag?: string;
      official_number?: string;
      type?: string;
      length_metres?: number;
      gross_tonnes?: number;
      tonnage_itc?: number;
      engine_kilowatts?: number;
      engine_type?: string;
    };
  }>(
    '/api/vessels/:id/particulars',
    {
      schema: {
        description: 'Update vessel particulars (vessel_name, imo_number, callsign, flag, official number, type, length, gross tonnes, tonnage_itc, engine_kilowatts, engine_type). Requires authentication.',
        tags: ['vessels'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            vessel_name: { type: 'string' },
            imo_number: { type: ['string', 'null'] },
            callsign: { type: 'string' },
            flag: { type: 'string' },
            official_number: { type: 'string' },
            type: { type: 'string', enum: ['Motor', 'Sail'] },
            length_metres: { type: 'number' },
            gross_tonnes: { type: 'number' },
            tonnage_itc: { type: ['number', 'null'] },
            engine_kilowatts: { type: 'number' },
            engine_type: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              mmsi: { type: 'string' },
              vessel_name: { type: 'string' },
              imo_number: { type: ['string', 'null'] },
              callsign: { type: ['string', 'null'] },
              flag: { type: ['string', 'null'] },
              official_number: { type: ['string', 'null'] },
              vessel_type: { type: ['string', 'null'] },
              length_metres: { type: ['string', 'null'] },
              gross_tonnes: { type: ['string', 'null'] },
              tonnage_itc: { type: ['string', 'null'] },
              engine_kilowatts: { type: ['number', 'null'] },
              engine_type: { type: ['string', 'null'] },
              is_active: { type: 'boolean' },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { vessel_name, imo_number, callsign, flag, official_number, type, length_metres, gross_tonnes, tonnage_itc, engine_kilowatts, engine_type } = request.body;

      app.logger.info({ vesselId: id }, 'Updating vessel particulars');

      // Get token from Authorization header
      const authHeader = request.headers.authorization;
      const token = authHeader?.replace('Bearer ', '');

      if (!token) {
        app.logger.warn({ vesselId: id }, 'Vessel particulars update without authentication');
        return reply.code(401).send({ error: 'Authentication required' });
      }

      // Find user session
      const sessions = await app.db
        .select()
        .from(authSchema.session)
        .where(eq(authSchema.session.token, token));

      if (sessions.length === 0) {
        app.logger.warn({ vesselId: id }, 'Invalid token for vessel particulars update');
        return reply.code(401).send({ error: 'Invalid or expired token' });
      }

      const session = sessions[0];

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        app.logger.warn({ vesselId: id, sessionId: session.id }, 'Session expired for vessel particulars update');
        return reply.code(401).send({ error: 'Session expired' });
      }

      // Verify at least one field is provided for update
      if (vessel_name === undefined && imo_number === undefined && callsign === undefined && flag === undefined && official_number === undefined && type === undefined &&
          length_metres === undefined && gross_tonnes === undefined && tonnage_itc === undefined && engine_kilowatts === undefined && engine_type === undefined) {
        app.logger.warn({ vesselId: id }, 'Vessel particulars update with no fields to update');
        return reply.code(400).send({ error: 'At least one field must be provided for update' });
      }

      // Check if vessel exists
      const vessel = await app.db
        .select()
        .from(schema.vessels)
        .where(eq(schema.vessels.id, id));

      if (vessel.length === 0) {
        app.logger.warn({ vesselId: id }, 'Vessel not found for particulars update');
        return reply.code(404).send({ error: 'Vessel not found' });
      }

      // Verify ownership
      if (vessel[0].user_id !== session.userId) {
        app.logger.warn({ userId: session.userId, vesselId: id }, 'Unauthorized vessel particulars update attempt');
        return reply.code(403).send({ error: 'Not authorized to update this vessel' });
      }

      // Build update data with only provided fields
      const updateData: Record<string, any> = { updated_at: new Date() };
      if (vessel_name !== undefined) updateData.vessel_name = vessel_name;
      if (imo_number !== undefined) updateData.imo_number = imo_number || null;
      if (callsign !== undefined) updateData.callsign = callsign;
      if (flag !== undefined) updateData.flag = flag;
      if (official_number !== undefined) updateData.official_number = official_number;
      if (type !== undefined) updateData.type = type;
      if (length_metres !== undefined) updateData.length_metres = length_metres != null ? String(length_metres) : null;
      if (gross_tonnes !== undefined) updateData.gross_tonnes = gross_tonnes != null ? String(gross_tonnes) : null;
      if (tonnage_itc !== undefined) updateData.tonnage_itc = tonnage_itc != null ? String(tonnage_itc) : null;
      if (engine_kilowatts !== undefined) updateData.engine_kilowatts = engine_kilowatts != null ? String(engine_kilowatts) : null;
      if (engine_type !== undefined) updateData.engine_type = engine_type;

      // Auto-fill blank fields from recent AIS data
      const autoFilledData = await autoFillVesselParticularsFromAIS(app, id, updateData);

      // Update vessel
      const [updated] = await app.db
        .update(schema.vessels)
        .set(autoFilledData)
        .where(eq(schema.vessels.id, id))
        .returning();

      app.logger.info(
        { vesselId: updated.id, vesselName: updated.vessel_name, updatedFields: Object.keys(autoFilledData).filter(k => k !== 'updated_at') },
        'Vessel particulars updated successfully'
      );

      return reply.code(200).send(transformVesselForResponse(updated));
    }
  );

  // GET /api/vessels/archived - Return all inactive vessels for authenticated user
  fastify.get('/api/vessels/archived', {
    schema: {
      description: 'Get all archived (inactive) vessels for the authenticated user',
      tags: ['vessels'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              mmsi: { type: 'string' },
              vessel_name: { type: 'string' },
              imo_number: { type: ['string', 'null'] },
              callsign: { type: ['string', 'null'] },
              flag: { type: ['string', 'null'] },
              official_number: { type: ['string', 'null'] },
              vessel_type: { type: ['string', 'null'] },
              length_metres: { type: ['string', 'null'] },
              gross_tonnes: { type: ['string', 'null'] },
              tonnage_itc: { type: ['string', 'null'] },
              is_active: { type: 'boolean' },
              created_at: { type: 'string' },
              updated_at: { type: 'string' },
            },
          },
        },
        401: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'Archived vessels list requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    app.logger.info({ userId }, 'Fetching archived (inactive) vessels for user');

    const vessels = await app.db
      .select()
      .from(schema.vessels)
      .where(eq(schema.vessels.user_id, userId));

    // Filter to only inactive vessels
    const archivedVessels = vessels.filter(v => !v.is_active);

    app.logger.info({ userId, count: archivedVessels.length }, 'Archived vessels fetched');
    return archivedVessels.map(transformVesselForResponse);
  });
}
