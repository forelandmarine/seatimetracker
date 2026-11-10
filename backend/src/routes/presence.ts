/**
 * Days abroad (2.5.0): a manual log of where the crew member was, for the
 * Schengen 90/180 tracker and per-country tax day counts. Nothing is taken
 * from AIS: only the crew member knows when they signed on and off.
 *
 *   GET    /api/presence/stays            every stay, newest first
 *   POST   /api/presence/stays            add a stay
 *   PUT    /api/presence/stays/:id        edit a stay
 *   DELETE /api/presence/stays/:id        delete a stay
 *   POST   /api/presence/sign-on          close the open stay and open an on-board stay
 *   POST   /api/presence/sign-off         close the open on-board stay, optionally open an ashore stay
 *   GET    /api/presence/summary          Schengen, tax days, country totals (and a trial trip)
 *   GET    /api/presence/settings         countries picked for tax days
 *   PUT    /api/presence/settings
 *   GET    /api/presence/export.csv       stays and per-country totals as CSV
 *
 * Guidance only, never legal or tax advice. The app says so on every card.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { and, desc, eq, isNull } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import * as authSchema from '../db/auth-schema.js';
import type { App } from '../index.js';
import { extractUserIdFromRequest } from '../middleware/auth.js';
import {
  AT_SEA_CODE,
  countryTotals,
  dayNum,
  findOverlap,
  isCountryCode,
  isIsoDate,
  resolveToday,
  schengenSummary,
  sedSummary,
  taxCountrySummary,
  validateStay,
  type Stay,
  type StayKind,
} from '../utils/presence/presence.js';
import { SCHENGEN_COUNTED_MICROSTATES, SCHENGEN_MEMBERS } from '../utils/presence/schengen.js';
import { NO_DAY_TEST_COUNTRIES, TAX_RULES, TAX_RULE_COUNTRIES } from '../utils/presence/taxRules.js';
import { guessHomeCountry } from '../utils/presence/home.js';

type StayRow = typeof schema.presence_stays.$inferSelect;

interface StayBody {
  country_code?: string;
  start_date?: string;
  end_date?: string | null;
  kind?: StayKind;
  vessel_id?: string | null;
  counts_schengen?: boolean;
  counts_tax?: boolean;
  note?: string | null;
}

const errorSchema = { type: 'object', properties: { error: { type: 'string' } } };
const anyObject = { type: 'object', additionalProperties: true };
const stayBodySchema = {
  type: 'object',
  properties: {
    country_code: { type: 'string' },
    start_date: { type: 'string' },
    end_date: { type: ['string', 'null'] },
    kind: { type: 'string', enum: ['ashore', 'on_board'] },
    vessel_id: { type: ['string', 'null'] },
    counts_schengen: { type: 'boolean' },
    counts_tax: { type: 'boolean' },
    note: { type: ['string', 'null'], maxLength: 500 },
  },
};
const MAX_STAYS = 2000;
const MAX_TAX_COUNTRIES = 12;


function toStay(r: StayRow): Stay & { vessel_id: string | null; note: string | null } {
  return {
    id: r.id,
    country_code: r.country_code,
    start_date: r.start_date,
    end_date: r.end_date,
    kind: (r.kind === 'on_board' ? 'on_board' : 'ashore') as StayKind,
    counts_schengen: r.counts_schengen,
    counts_tax: r.counts_tax,
    vessel_id: r.vessel_id,
    note: r.note,
  };
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  // Neutralise spreadsheet formulas and quote anything with separators.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function register(app: App, fastify: FastifyInstance) {
  async function auth(request: any, reply: FastifyReply): Promise<string | null> {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      reply.code(401).send({ error: 'Authentication required' });
      return null;
    }
    return userId;
  }

  async function loadStays(userId: string): Promise<StayRow[]> {
    return app.db
      .select()
      .from(schema.presence_stays)
      .where(eq(schema.presence_stays.user_id, userId))
      .orderBy(desc(schema.presence_stays.start_date));
  }

  async function vesselBelongs(userId: string, vesselId: string): Promise<boolean> {
    const rows = await app.db
      .select({ id: schema.vessels.id })
      .from(schema.vessels)
      .where(and(eq(schema.vessels.id, vesselId), eq(schema.vessels.user_id, userId)));
    return rows.length > 0;
  }

  /** Checks a stay against the rules and the user's other stays. Sends the error and returns false on a problem. */
  async function checkStay(userId: string, stay: Stay & { vessel_id?: string | null }, today: string, reply: FastifyReply, others?: StayRow[]): Promise<boolean> {
    const problem = validateStay(stay, today);
    if (problem) {
      reply.code(400).send({ error: problem });
      return false;
    }
    if (stay.vessel_id && !(await vesselBelongs(userId, stay.vessel_id))) {
      reply.code(403).send({ error: 'Vessel does not belong to this user' });
      return false;
    }
    const clash = findOverlap(stay, others ?? (await loadStays(userId)));
    if (clash) {
      reply.code(409).send({ error: 'This stay overlaps another stay', overlap_id: clash.id } as any);
      return false;
    }
    return true;
  }

  async function homeCountry(userId: string): Promise<string | null> {
    const [u] = await app.db
      .select({ nationality: authSchema.user.nationality, maritime_authority: authSchema.user.maritime_authority })
      .from(authSchema.user)
      .where(eq(authSchema.user.id, userId));
    return guessHomeCountry(u?.nationality, u?.maritime_authority);
  }

  async function settingsFor(userId: string): Promise<{ tax_countries: string[]; home_country: string | null; saved: boolean }> {
    const home = await homeCountry(userId);
    const [row] = await app.db.select().from(schema.presence_settings).where(eq(schema.presence_settings.user_id, userId));
    if (row) return { tax_countries: row.tax_countries, home_country: home, saved: true };
    return { tax_countries: home ? [home] : [], home_country: home, saved: false };
  }

  // ── Stays CRUD ──────────────────────────────────────────────────────

  fastify.get('/api/presence/stays', {
    schema: { description: 'List days abroad stays', tags: ['presence'], response: { 200: { type: 'array', items: anyObject }, 401: errorSchema } },
  }, async (request, reply) => {
    const userId = await auth(request, reply);
    if (!userId) return;
    return reply.send(await loadStays(userId));
  });

  fastify.post<{ Body: StayBody; Querystring: { today?: string } }>('/api/presence/stays', {
    schema: {
      description: 'Add a stay',
      tags: ['presence'],
      body: { ...stayBodySchema, required: ['country_code', 'start_date'] },
      response: { 200: anyObject, 400: errorSchema, 401: errorSchema, 403: errorSchema, 409: anyObject },
    },
  }, async (request, reply) => {
    const userId = await auth(request, reply);
    if (!userId) return;
    const today = resolveToday(request.query?.today);
    const b = request.body;
    const kind: StayKind = b.kind ?? 'ashore';
    const stay = {
      country_code: (b.country_code ?? '').toUpperCase(),
      start_date: b.start_date as string,
      end_date: b.end_date ?? null,
      kind,
      counts_schengen: kind === 'ashore' ? true : b.counts_schengen ?? true,
      counts_tax: b.counts_tax ?? true,
      vessel_id: kind === 'on_board' ? b.vessel_id ?? null : null,
    };
    const existing = await loadStays(userId);
    if (existing.length >= MAX_STAYS) return reply.code(400).send({ error: 'Too many stays' });
    if (!(await checkStay(userId, stay, today, reply, existing))) return;
    const [created] = await app.db
      .insert(schema.presence_stays)
      .values({ ...stay, user_id: userId, note: b.note?.trim() || null })
      .returning();
    app.logger.info({ userId, stayId: created.id }, 'Presence stay created');
    return reply.send(created);
  });

  fastify.put<{ Params: { id: string }; Body: StayBody; Querystring: { today?: string } }>('/api/presence/stays/:id', {
    schema: {
      description: 'Edit a stay',
      tags: ['presence'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      body: stayBodySchema,
      response: { 200: anyObject, 400: errorSchema, 401: errorSchema, 403: errorSchema, 404: errorSchema, 409: anyObject },
    },
  }, async (request, reply) => {
    const userId = await auth(request, reply);
    if (!userId) return;
    const today = resolveToday(request.query?.today);
    const existing = await loadStays(userId);
    const row = existing.find((r) => r.id === request.params.id);
    if (!row) return reply.code(404).send({ error: 'Stay not found' });
    const b = request.body;
    const kind: StayKind = b.kind ?? (row.kind as StayKind);
    const stay = {
      id: row.id,
      country_code: (b.country_code ?? row.country_code).toUpperCase(),
      start_date: b.start_date ?? row.start_date,
      end_date: b.end_date !== undefined ? b.end_date : row.end_date,
      kind,
      counts_schengen: kind === 'ashore' ? true : b.counts_schengen ?? row.counts_schengen,
      counts_tax: b.counts_tax ?? row.counts_tax,
      vessel_id: kind === 'on_board' ? (b.vessel_id !== undefined ? b.vessel_id : row.vessel_id) : null,
    };
    if (!(await checkStay(userId, stay, today, reply, existing))) return;
    const [updated] = await app.db
      .update(schema.presence_stays)
      .set({
        country_code: stay.country_code,
        start_date: stay.start_date,
        end_date: stay.end_date,
        kind: stay.kind,
        counts_schengen: stay.counts_schengen,
        counts_tax: stay.counts_tax,
        vessel_id: stay.vessel_id,
        note: b.note !== undefined ? b.note?.trim() || null : row.note,
        updated_at: new Date(),
      })
      .where(and(eq(schema.presence_stays.id, row.id), eq(schema.presence_stays.user_id, userId)))
      .returning();
    return reply.send(updated);
  });

  fastify.delete<{ Params: { id: string } }>('/api/presence/stays/:id', {
    schema: {
      description: 'Delete a stay',
      tags: ['presence'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { deleted: { type: 'boolean' } } }, 401: errorSchema, 404: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await auth(request, reply);
    if (!userId) return;
    const deleted = await app.db
      .delete(schema.presence_stays)
      .where(and(eq(schema.presence_stays.id, request.params.id), eq(schema.presence_stays.user_id, userId)))
      .returning({ id: schema.presence_stays.id });
    if (deleted.length === 0) return reply.code(404).send({ error: 'Stay not found' });
    return reply.send({ deleted: true });
  });

  // ── Quick actions ───────────────────────────────────────────────────

  fastify.post<{ Body: { country_code: string; vessel_id?: string | null; counts_schengen?: boolean; date?: string }; Querystring: { today?: string } }>(
    '/api/presence/sign-on',
    {
      schema: {
        description: 'Signed on: close the open stay on the date and open an on-board stay from it',
        tags: ['presence'],
        body: {
          type: 'object',
          required: ['country_code'],
          properties: {
            country_code: { type: 'string' },
            vessel_id: { type: ['string', 'null'] },
            counts_schengen: { type: 'boolean' },
            date: { type: 'string' },
          },
        },
        response: { 200: anyObject, 400: errorSchema, 401: errorSchema, 403: errorSchema, 409: anyObject },
      },
    },
    async (request, reply) => {
      const userId = await auth(request, reply);
      if (!userId) return;
      const today = resolveToday(request.query?.today);
      const date = request.body.date ?? today;
      if (!isIsoDate(date) || date > today) return reply.code(400).send({ error: 'date must be today or earlier' });
      const country = (request.body.country_code ?? '').toUpperCase();
      if (!isCountryCode(country)) return reply.code(400).send({ error: 'country_code must be a 2-letter ISO code' });
      const vesselId = request.body.vessel_id ?? null;
      if (vesselId && !(await vesselBelongs(userId, vesselId))) return reply.code(403).send({ error: 'Vessel does not belong to this user' });

      const existing = await loadStays(userId);
      const open = existing.find((r) => r.end_date == null) ?? null;
      if (open && open.start_date > date) return reply.code(409).send({ error: 'Your open stay starts after this date' });
      const others = existing.map((r) => (open && r.id === open.id ? { ...r, end_date: date } : r));
      const stay: Stay = {
        country_code: country,
        start_date: date,
        end_date: null,
        kind: 'on_board',
        counts_schengen: request.body.counts_schengen ?? true,
        counts_tax: true,
      };
      const clash = findOverlap(stay, others);
      if (clash) return reply.code(409).send({ error: 'This stay overlaps another stay', overlap_id: clash.id });

      const created = await app.db.transaction(async (tx) => {
        if (open) {
          await tx.update(schema.presence_stays).set({ end_date: date, updated_at: new Date() }).where(eq(schema.presence_stays.id, open.id));
        }
        const [row] = await tx
          .insert(schema.presence_stays)
          .values({ ...stay, user_id: userId, vessel_id: vesselId })
          .returning();
        return row;
      });
      app.logger.info({ userId, stayId: created.id }, 'Presence signed on');
      return reply.send({ closed_id: open?.id ?? null, stay: created });
    },
  );

  fastify.post<{ Body: { country_code?: string | null; date?: string }; Querystring: { today?: string } }>(
    '/api/presence/sign-off',
    {
      schema: {
        description: 'Signed off: close the open on-board stay on the date, and open an ashore stay when a country is given',
        tags: ['presence'],
        body: { type: 'object', properties: { country_code: { type: ['string', 'null'] }, date: { type: 'string' } } },
        response: { 200: anyObject, 400: errorSchema, 401: errorSchema, 404: errorSchema, 409: anyObject },
      },
    },
    async (request, reply) => {
      const userId = await auth(request, reply);
      if (!userId) return;
      const today = resolveToday(request.query?.today);
      const date = request.body?.date ?? today;
      if (!isIsoDate(date) || date > today) return reply.code(400).send({ error: 'date must be today or earlier' });
      const country = request.body?.country_code ? request.body.country_code.toUpperCase() : null;
      if (country && (!isCountryCode(country) || country === AT_SEA_CODE)) return reply.code(400).send({ error: 'country_code must be a 2-letter ISO code' });

      const [open] = await app.db
        .select()
        .from(schema.presence_stays)
        .where(and(eq(schema.presence_stays.user_id, userId), isNull(schema.presence_stays.end_date), eq(schema.presence_stays.kind, 'on_board')));
      if (!open) return reply.code(404).send({ error: 'You are not signed on' });
      if (open.start_date > date) return reply.code(409).send({ error: 'You signed on after this date' });

      const result = await app.db.transaction(async (tx) => {
        const [closed] = await tx
          .update(schema.presence_stays)
          .set({ end_date: date, updated_at: new Date() })
          .where(eq(schema.presence_stays.id, open.id))
          .returning();
        let ashore: StayRow | null = null;
        if (country) {
          [ashore] = await tx
            .insert(schema.presence_stays)
            .values({ user_id: userId, country_code: country, start_date: date, end_date: null, kind: 'ashore', counts_schengen: true, counts_tax: true })
            .returning();
        }
        return { closed, stay: ashore };
      });
      app.logger.info({ userId, stayId: open.id }, 'Presence signed off');
      return reply.send(result);
    },
  );

  // ── Summary ─────────────────────────────────────────────────────────

  fastify.get<{ Querystring: { today?: string; plan_start?: string; plan_end?: string } }>('/api/presence/summary', {
    schema: {
      description: 'Schengen 90/180, tax day counts per picked country, and country totals',
      tags: ['presence'],
      querystring: {
        type: 'object',
        properties: { today: { type: 'string' }, plan_start: { type: 'string' }, plan_end: { type: 'string' } },
      },
      response: { 200: anyObject, 400: errorSchema, 401: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await auth(request, reply);
    if (!userId) return;
    const today = resolveToday(request.query.today);
    const { plan_start, plan_end } = request.query;
    let plan: { start_date: string; end_date: string } | null = null;
    if (plan_start || plan_end) {
      if (!isIsoDate(plan_start) || !isIsoDate(plan_end) || plan_end < plan_start) {
        return reply.code(400).send({ error: 'plan_start and plan_end must be dates, end on or after start' });
      }
      if (dayNum(plan_end) - dayNum(plan_start) > 730) return reply.code(400).send({ error: 'Trips longer than two years are not checked' });
      plan = { start_date: plan_start, end_date: plan_end };
    }

    const stays = (await loadStays(userId)).map(toStay);
    const settings = await settingsFor(userId);
    const tax = settings.tax_countries.map((c) => {
      const result = taxCountrySummary(stays, c, today);
      const rule = TAX_RULES[c];
      return { ...result, note: rule?.note ?? null, sources: rule?.sources ?? [] };
    });
    const sed = settings.tax_countries.includes('GB') ? sedSummary(stays, today) : null;
    const open = stays.find((s) => s.end_date == null) ?? null;

    return reply.send({
      today,
      open_stay: open,
      schengen: schengenSummary(stays, today, plan),
      tax,
      sed,
      countries: countryTotals(stays, today),
      settings,
      rules: {
        tax_countries: TAX_RULE_COUNTRIES,
        no_day_test: NO_DAY_TEST_COUNTRIES,
        schengen_members: SCHENGEN_MEMBERS,
        schengen_microstates: SCHENGEN_COUNTED_MICROSTATES,
      },
    });
  });

  // ── Settings ────────────────────────────────────────────────────────

  fastify.get('/api/presence/settings', {
    schema: { description: 'Countries picked for tax days', tags: ['presence'], response: { 200: anyObject, 401: errorSchema } },
  }, async (request, reply) => {
    const userId = await auth(request, reply);
    if (!userId) return;
    return reply.send(await settingsFor(userId));
  });

  fastify.put<{ Body: { tax_countries: string[] } }>('/api/presence/settings', {
    schema: {
      description: 'Save the countries picked for tax days',
      tags: ['presence'],
      body: {
        type: 'object',
        required: ['tax_countries'],
        properties: { tax_countries: { type: 'array', items: { type: 'string' }, maxItems: MAX_TAX_COUNTRIES } },
      },
      response: { 200: anyObject, 400: errorSchema, 401: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await auth(request, reply);
    if (!userId) return;
    const codes = [...new Set(request.body.tax_countries.map((c) => c.toUpperCase()))];
    if (codes.some((c) => !isCountryCode(c) || c === AT_SEA_CODE)) return reply.code(400).send({ error: 'Countries must be 2-letter ISO codes' });
    await app.db
      .insert(schema.presence_settings)
      .values({ user_id: userId, tax_countries: codes })
      .onConflictDoUpdate({ target: schema.presence_settings.user_id, set: { tax_countries: codes, updated_at: new Date() } });
    return reply.send(await settingsFor(userId));
  });

  // ── Export ──────────────────────────────────────────────────────────

  fastify.get<{ Querystring: { today?: string } }>('/api/presence/export.csv', {
    schema: { description: 'Stays and per-country totals as CSV', tags: ['presence'] },
  }, async (request, reply) => {
    const userId = await auth(request, reply);
    if (!userId) return;
    const today = resolveToday(request.query?.today);
    const rows = await loadStays(userId);
    const stays = rows.map(toStay);
    const vesselRows = await app.db
      .select({ id: schema.vessels.id, name: schema.vessels.vessel_name })
      .from(schema.vessels)
      .where(eq(schema.vessels.user_id, userId));
    const vesselName = new Map(vesselRows.map((v) => [v.id, v.name]));
    const settings = await settingsFor(userId);

    const lines: string[] = [];
    const push = (cells: unknown[]) => lines.push(cells.map(csvCell).join(','));
    push(['Days abroad export', `Created ${today}`]);
    push(['Guidance only. Check with a tax adviser. Not legal advice.']);
    push([]);
    push(['STAYS']);
    push(['Country', 'Start date', 'End date', 'Days', 'Type', 'Vessel', 'Counts for Schengen', 'Counts for tax', 'Note']);
    for (const s of [...stays].sort((a, b) => a.start_date.localeCompare(b.start_date))) {
      const end = s.end_date ?? today;
      push([
        s.country_code,
        s.start_date,
        s.end_date ?? 'ongoing',
        Math.max(0, dayNum(end) - dayNum(s.start_date) + 1),
        s.kind === 'on_board' ? 'Signed on' : 'Ashore',
        s.vessel_id ? vesselName.get(s.vessel_id) ?? '' : '',
        s.kind === 'ashore' || s.counts_schengen ? 'yes' : 'no',
        s.counts_tax ? 'yes' : 'no',
        s.note ?? '',
      ]);
    }
    push([]);
    push(['DAYS PER COUNTRY (any part of a day counts)']);
    push(['Country', 'Days', 'Stays']);
    for (const c of countryTotals(stays, today)) push([c.country, c.days, c.stays]);
    push([]);
    const sch = schengenSummary(stays, today);
    push(['SCHENGEN 90/180', `Days used in the 180 days to ${today}`, sch.used, 'Days left', sch.remaining, 'Latest day if staying from today', sch.latest_stay_date ?? 'none']);
    if (settings.tax_countries.length) {
      push([]);
      push(['TAX DAYS']);
      push(['Country', 'Tax year', 'From', 'To', 'Days', 'Planned days', 'Test met']);
      for (const c of settings.tax_countries) {
        const res = taxCountrySummary(stays, c, today);
        for (const y of res.years) push([c, y.label, y.start_date, y.end_date, y.days, y.planned_days, y.status === 'none' ? 'no rule' : y.status === 'met' ? 'yes' : 'no']);
      }
    }
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="days-abroad-${today}.csv"`);
    return reply.send(lines.join('\n'));
  });
}
