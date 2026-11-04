/**
 * Sole watchkeeper periods (2.5.0).
 *
 * Dated periods when the user was the only watchkeeper in their department on
 * a vessel. Actual sea service on a date inside a period also counts as a
 * watchkeeping day (MCA, MNZ, SAMSA). Periods on one vessel never overlap.
 *
 *   GET    /api/sole-watch-periods                         every vessel with its periods
 *   GET    /api/vessels/:id/sole-watch-periods             one vessel
 *   POST   /api/vessels/:id/sole-watch-periods             add a period
 *   PUT    /api/vessels/:id/sole-watch-periods/:periodId   edit dates
 *   DELETE /api/vessels/:id/sole-watch-periods/:periodId   delete
 *   POST   /api/vessels/:id/sole-watch/preview             days a toggle change or new set would add or remove
 *   POST   /api/vessels/:id/sole-watch                     apply a toggle change
 *
 * Every write keeps vessels.is_sole_watchkeeper in step for old app builds.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { and, eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import * as authSchema from '../db/auth-schema.js';
import type { App } from '../index.js';
import { extractUserIdFromRequest } from '../middleware/auth.js';
import {
  entriesWithSoleWatch,
  loadSoleWatchPeriods,
  replaceVesselPeriods,
  syncSoleWatchFlag,
  todayUtc,
  type StoredSoleWatchPeriod,
} from '../services/soleWatch.js';
import {
  SOLE_WATCH_AUTHORITIES,
  applySoleWatchChange,
  findOverlap,
  firstEntryDay,
  periodDays,
  previewPeriods,
  sortPeriods,
  validateChange,
  validatePeriod,
  type SoleWatchChange,
  type SoleWatchPeriod,
} from '../utils/soleWatch.js';

const errorSchema = { type: 'object', properties: { error: { type: 'string' } } };
const anyObject = { type: 'object', additionalProperties: true };
const periodBody = {
  type: 'object',
  properties: {
    start_date: { type: ['string', 'null'] },
    end_date: { type: ['string', 'null'] },
  },
};
const changeSchema = {
  type: 'object',
  required: ['action'],
  properties: {
    action: { type: 'string', enum: ['on', 'off'] },
    from: { type: 'string', enum: ['all', 'date', 'today'] },
    at: { type: 'string', enum: ['today', 'date', 'never'] },
    date: { type: ['string', 'null'] },
  },
};

export function register(app: App, fastify: FastifyInstance) {
  async function authority(userId: string): Promise<string> {
    const [u] = await app.db
      .select({ maritime_authority: authSchema.user.maritime_authority })
      .from(authSchema.user)
      .where(eq(authSchema.user.id, userId));
    return u?.maritime_authority || 'mca';
  }

  /** Confirmed entries for the user, with every vessel's periods attached. */
  async function confirmedEntries(userId: string) {
    const rows = await app.db.query.sea_time_entries.findMany({
      with: { vessel: true },
      where: and(eq(schema.sea_time_entries.user_id, userId), eq(schema.sea_time_entries.status, 'confirmed')),
    });
    return entriesWithSoleWatch(app, rows);
  }

  async function ownedVessel(userId: string, vesselId: string, reply: FastifyReply) {
    const [vessel] = await app.db.select().from(schema.vessels).where(eq(schema.vessels.id, vesselId));
    if (!vessel) {
      reply.code(404).send({ error: 'Vessel not found' });
      return null;
    }
    if (vessel.user_id !== userId) {
      reply.code(403).send({ error: 'Not authorized to update this vessel' });
      return null;
    }
    return vessel;
  }

  async function periodsFor(vesselId: string, reply: FastifyReply): Promise<StoredSoleWatchPeriod[] | null> {
    const map = await loadSoleWatchPeriods(app, [vesselId]);
    if (!map) {
      reply.code(503).send({ error: 'Sole watch periods are not available yet' });
      return null;
    }
    return map.get(vesselId) ?? [];
  }

  /** One vessel's periods with the sea days inside each. */
  function vesselView(
    vessel: { id: string; vessel_name: string; is_active: boolean; is_sole_watchkeeper: boolean | null },
    periods: SoleWatchPeriod[],
    entries: any[],
    auth: string
  ) {
    const list = sortPeriods(periods).map((p) => ({
      id: p.id ?? null,
      start_date: p.start_date,
      end_date: p.end_date,
      days: periodDays(entries, vessel.id, p, auth),
    }));
    return {
      vessel_id: vessel.id,
      vessel_name: vessel.vessel_name,
      is_active: vessel.is_active,
      is_sole_watchkeeper: vessel.is_sole_watchkeeper === true,
      first_entry_date: firstEntryDay(entries, vessel.id),
      // Periods never overlap, so the per-period figures add up without double counting
      total_days: list.reduce((n, p) => n + p.days, 0),
      periods: list,
    };
  }

  async function vesselResponse(userId: string, vesselId: string) {
    const [vessel] = await app.db.select().from(schema.vessels).where(eq(schema.vessels.id, vesselId));
    const [entries, auth, map] = await Promise.all([
      confirmedEntries(userId),
      authority(userId),
      loadSoleWatchPeriods(app, [vesselId]),
    ]);
    return { applies: SOLE_WATCH_AUTHORITIES.has(auth), today: todayUtc(), ...vesselView(vessel, map?.get(vesselId) ?? [], entries, auth) };
  }

  // GET /api/sole-watch-periods - every vessel the user has, with its periods
  fastify.get('/api/sole-watch-periods', {
    schema: {
      description: 'Sole watchkeeper periods for every vessel the user has, with the sea days inside each (requires authentication)',
      tags: ['sole-watch'],
      response: { 200: anyObject, 401: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: 'Authentication required' });

    const vessels = await app.db.select().from(schema.vessels).where(eq(schema.vessels.user_id, userId));
    const [entries, auth, map] = await Promise.all([
      confirmedEntries(userId),
      authority(userId),
      loadSoleWatchPeriods(app, vessels.map((v) => v.id)),
    ]);
    const list = vessels
      .map((v) => vesselView(v, map?.get(v.id) ?? [], entries, auth))
      .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.vessel_name.localeCompare(b.vessel_name));
    return reply.code(200).send({ applies: SOLE_WATCH_AUTHORITIES.has(auth), authority: auth, today: todayUtc(), available: map != null, vessels: list });
  });

  // GET /api/vessels/:id/sole-watch-periods - one vessel
  fastify.get<{ Params: { id: string } }>('/api/vessels/:id/sole-watch-periods', {
    schema: {
      description: 'Sole watchkeeper periods for one vessel (requires authentication)',
      tags: ['sole-watch'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: anyObject, 401: errorSchema, 403: errorSchema, 404: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: 'Authentication required' });
    const vessel = await ownedVessel(userId, request.params.id, reply);
    if (!vessel) return reply;
    return reply.code(200).send(await vesselResponse(userId, vessel.id));
  });

  // POST /api/vessels/:id/sole-watch-periods - add a period
  fastify.post<{ Params: { id: string }; Body: { start_date?: string | null; end_date?: string | null } }>('/api/vessels/:id/sole-watch-periods', {
    schema: {
      description: 'Add a sole watchkeeper period to a vessel. Dates are inclusive; null start = from the first entry, null end = ongoing (requires authentication)',
      tags: ['sole-watch'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: periodBody,
      response: { 200: anyObject, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema, 503: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: 'Authentication required' });
    const vessel = await ownedVessel(userId, request.params.id, reply);
    if (!vessel) return reply;

    const candidate: SoleWatchPeriod = { start_date: request.body?.start_date ?? null, end_date: request.body?.end_date ?? null };
    const bad = validatePeriod(candidate);
    if (bad) return reply.code(400).send({ error: bad });
    const existing = await periodsFor(vessel.id, reply);
    if (!existing) return reply;
    if (findOverlap(existing, candidate)) return reply.code(409).send({ error: 'This period overlaps another one on this vessel' });

    await app.db.insert(schema.vessel_sole_watch_periods).values({
      vessel_id: vessel.id,
      user_id: vessel.user_id,
      start_date: candidate.start_date,
      end_date: candidate.end_date,
    });
    await syncSoleWatchFlag(app, vessel.id);
    app.logger.info({ userId, vesselId: vessel.id, ...candidate }, 'Sole watch period added');
    return reply.code(200).send(await vesselResponse(userId, vessel.id));
  });

  // PUT /api/vessels/:id/sole-watch-periods/:periodId - edit dates
  fastify.put<{ Params: { id: string; periodId: string }; Body: { start_date?: string | null; end_date?: string | null } }>('/api/vessels/:id/sole-watch-periods/:periodId', {
    schema: {
      description: 'Change the dates of a sole watchkeeper period (requires authentication)',
      tags: ['sole-watch'],
      params: { type: 'object', required: ['id', 'periodId'], properties: { id: { type: 'string' }, periodId: { type: 'string' } } },
      body: periodBody,
      response: { 200: anyObject, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: errorSchema, 503: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: 'Authentication required' });
    const vessel = await ownedVessel(userId, request.params.id, reply);
    if (!vessel) return reply;
    const existing = await periodsFor(vessel.id, reply);
    if (!existing) return reply;
    const current = existing.find((p) => p.id === request.params.periodId);
    if (!current) return reply.code(404).send({ error: 'Period not found' });

    const body = request.body ?? {};
    const candidate: SoleWatchPeriod = {
      start_date: body.start_date !== undefined ? body.start_date : current.start_date,
      end_date: body.end_date !== undefined ? body.end_date : current.end_date,
    };
    const bad = validatePeriod(candidate);
    if (bad) return reply.code(400).send({ error: bad });
    if (findOverlap(existing, candidate, current.id)) return reply.code(409).send({ error: 'This period overlaps another one on this vessel' });

    await app.db
      .update(schema.vessel_sole_watch_periods)
      .set({ start_date: candidate.start_date, end_date: candidate.end_date, updated_at: new Date() })
      .where(eq(schema.vessel_sole_watch_periods.id, current.id));
    await syncSoleWatchFlag(app, vessel.id);
    app.logger.info({ userId, vesselId: vessel.id, periodId: current.id, ...candidate }, 'Sole watch period updated');
    return reply.code(200).send(await vesselResponse(userId, vessel.id));
  });

  // DELETE /api/vessels/:id/sole-watch-periods/:periodId
  fastify.delete<{ Params: { id: string; periodId: string } }>('/api/vessels/:id/sole-watch-periods/:periodId', {
    schema: {
      description: 'Delete a sole watchkeeper period (requires authentication)',
      tags: ['sole-watch'],
      params: { type: 'object', required: ['id', 'periodId'], properties: { id: { type: 'string' }, periodId: { type: 'string' } } },
      response: { 200: anyObject, 401: errorSchema, 403: errorSchema, 404: errorSchema, 503: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: 'Authentication required' });
    const vessel = await ownedVessel(userId, request.params.id, reply);
    if (!vessel) return reply;
    const existing = await periodsFor(vessel.id, reply);
    if (!existing) return reply;
    const current = existing.find((p) => p.id === request.params.periodId);
    if (!current) return reply.code(404).send({ error: 'Period not found' });

    await app.db.delete(schema.vessel_sole_watch_periods).where(eq(schema.vessel_sole_watch_periods.id, current.id));
    await syncSoleWatchFlag(app, vessel.id);
    app.logger.info({ userId, vesselId: vessel.id, periodId: current.id }, 'Sole watch period deleted');
    return reply.code(200).send(await vesselResponse(userId, vessel.id));
  });

  // POST /api/vessels/:id/sole-watch/preview - effect of toggle changes or a new set of periods
  fastify.post<{ Params: { id: string }; Body: { changes?: SoleWatchChange[]; periods?: SoleWatchPeriod[] } }>('/api/vessels/:id/sole-watch/preview', {
    schema: {
      description: 'How many watchkeeping days each proposed change would add or remove. Pass toggle changes, or a full new set of periods (requires authentication)',
      tags: ['sole-watch'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          changes: { type: 'array', items: changeSchema, maxItems: 10 },
          periods: { type: 'array', items: periodBody, maxItems: 50 },
        },
      },
      response: { 200: anyObject, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 503: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: 'Authentication required' });
    const vessel = await ownedVessel(userId, request.params.id, reply);
    if (!vessel) return reply;
    const changes = request.body?.changes ?? [];
    const proposedSet = request.body?.periods;
    for (const c of changes) {
      const bad = validateChange(c);
      if (bad) return reply.code(400).send({ error: bad });
    }
    if (proposedSet) {
      for (const p of proposedSet) {
        const bad = validatePeriod(p);
        if (bad) return reply.code(400).send({ error: bad });
      }
      for (let i = 0; i < proposedSet.length; i++) {
        if (findOverlap(proposedSet.slice(i + 1), proposedSet[i])) return reply.code(400).send({ error: 'Periods overlap' });
      }
    }
    const current = await periodsFor(vessel.id, reply);
    if (!current) return reply;
    const [entries, auth] = await Promise.all([confirmedEntries(userId), authority(userId)]);
    const today = todayUtc();
    const first = firstEntryDay(entries, vessel.id);

    const results = changes.map((c) => {
      const proposed = applySoleWatchChange(current, c, today);
      const from_date = c.action === 'on' ? (c.from === 'all' ? first : c.from === 'today' ? today : c.date ?? null) : null;
      return { ...previewPeriods(entries, vessel.id, current, proposed, auth, new Date()), from_date };
    });
    const set = proposedSet ? previewPeriods(entries, vessel.id, current, proposedSet.map((p) => ({ start_date: p.start_date ?? null, end_date: p.end_date ?? null })), auth) : null;
    return reply.code(200).send({ applies: SOLE_WATCH_AUTHORITIES.has(auth), today, first_entry_date: first, results, periods: set });
  });

  // POST /api/vessels/:id/sole-watch - apply a toggle change from the vessel screen
  fastify.post<{ Params: { id: string }; Body: { change: SoleWatchChange } }>('/api/vessels/:id/sole-watch', {
    schema: {
      description: 'Turn sole watchkeeping on (all past service, from a date, from today) or off (today, on a date, never was) for a vessel (requires authentication)',
      tags: ['sole-watch'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: { type: 'object', required: ['change'], properties: { change: changeSchema } },
      response: { 200: anyObject, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 503: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: 'Authentication required' });
    const vessel = await ownedVessel(userId, request.params.id, reply);
    if (!vessel) return reply;
    const change = request.body.change;
    const bad = validateChange(change);
    if (bad) return reply.code(400).send({ error: bad });
    const current = await periodsFor(vessel.id, reply);
    if (!current) return reply;

    const next = applySoleWatchChange(current, change, todayUtc());
    await replaceVesselPeriods(app, vessel, next);
    app.logger.info({ userId, vesselId: vessel.id, change, periods: next.length }, 'Sole watch toggle applied');
    return reply.code(200).send(await vesselResponse(userId, vessel.id));
  });
}
