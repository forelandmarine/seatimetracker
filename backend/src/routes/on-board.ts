import type { FastifyInstance } from "fastify";
import { eq, and, gte, inArray, asc } from "drizzle-orm";
import * as schema from "../db/schema.js";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const errorSchema = { type: "object", properties: { error: { type: "string" } } };

/** AIS passages logged since the user went off board (status 'off_board'), oldest first. */
async function offBoardPassages(app: App, userId: string, since: Date | null) {
  const conditions = [
    eq(schema.sea_time_entries.user_id, userId),
    eq(schema.sea_time_entries.status, "off_board"),
  ];
  if (since) conditions.push(gte(schema.sea_time_entries.start_time, since));
  return app.db.query.sea_time_entries.findMany({
    where: and(...conditions),
    with: { vessel: true },
    orderBy: asc(schema.sea_time_entries.start_time),
  });
}

function toPassage(e: Awaited<ReturnType<typeof offBoardPassages>>[number]) {
  return {
    id: e.id,
    vessel_name: e.vessel?.vessel_name ?? null,
    start_time: e.start_time,
    end_time: e.end_time,
    duration_hours: e.duration_hours != null ? Number(e.duration_hours) : null,
    distance_nm: e.distance_nm != null ? Number(e.distance_nm) : null,
  };
}

export function register(app: App, fastify: FastifyInstance) {
  // GET /api/on-board - Current on/off board state
  fastify.get("/api/on-board", {
    schema: {
      description: "Get the user's on/off board state and any passages logged while off board",
      tags: ["on-board"],
      response: { 200: { type: "object", additionalProperties: true }, 401: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });

    const [u] = await app.db.select().from(authSchema.user).where(eq(authSchema.user.id, userId));
    if (!u) return reply.code(401).send({ error: "Authentication required" });

    const passages = u.on_board ? [] : await offBoardPassages(app, userId, u.off_board_since);
    return reply.code(200).send({
      on_board: u.on_board,
      off_board_since: u.off_board_since,
      expected_return_date: u.expected_return_date,
      off_board_passages: passages.length,
    });
  });

  // PUT /api/on-board - Switch on or off board, or change the expected return date
  fastify.put<{ Body: { on_board: boolean; expected_return_date?: string | null } }>("/api/on-board", {
    schema: {
      description: "Switch on/off board. Going back on board returns the passages logged while away so the user can claim them.",
      tags: ["on-board"],
      body: {
        type: "object",
        required: ["on_board"],
        properties: {
          on_board: { type: "boolean" },
          expected_return_date: { type: ["string", "null"] },
        },
      },
      response: { 200: { type: "object", additionalProperties: true }, 400: errorSchema, 401: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });

    const { on_board, expected_return_date } = request.body;
    if (expected_return_date != null && !DATE_RE.test(expected_return_date)) {
      return reply.code(400).send({ error: "expected_return_date must be YYYY-MM-DD" });
    }

    const [u] = await app.db.select().from(authSchema.user).where(eq(authSchema.user.id, userId));
    if (!u) return reply.code(401).send({ error: "Authentication required" });

    if (!on_board) {
      // Already off board: only the return date changes, the period keeps its start.
      const since = u.on_board ? new Date() : u.off_board_since ?? new Date();
      const [updated] = await app.db
        .update(authSchema.user)
        .set({
          on_board: false,
          off_board_since: since,
          expected_return_date: expected_return_date ?? null,
          ...(u.on_board ? { underway_alert_sent_at: null } : {}),
        })
        .where(eq(authSchema.user.id, userId))
        .returning();

      app.logger.info({ userId, since: since.toISOString(), expected_return_date }, "User switched off board");
      return reply.code(200).send({
        on_board: false,
        off_board_since: updated.off_board_since,
        expected_return_date: updated.expected_return_date,
        passages: [],
      });
    }

    const passages = u.on_board ? [] : await offBoardPassages(app, userId, u.off_board_since);
    await app.db
      .update(authSchema.user)
      .set({ on_board: true, off_board_since: null, expected_return_date: null, underway_alert_sent_at: null })
      .where(eq(authSchema.user.id, userId));

    app.logger.info({ userId, offBoardPassages: passages.length }, "User switched on board");
    return reply.code(200).send({
      on_board: true,
      off_board_since: null,
      expected_return_date: null,
      passages: passages.map(toPassage),
    });
  });

  // POST /api/on-board/claim - Move passages logged while off board into the review queue
  fastify.post<{ Body: { entry_ids: string[] } }>("/api/on-board/claim", {
    schema: {
      description: "Claim passages logged while off board: status off_board -> pending",
      tags: ["on-board"],
      body: {
        type: "object",
        required: ["entry_ids"],
        properties: { entry_ids: { type: "array", items: { type: "string" }, maxItems: 500 } },
      },
      response: { 200: { type: "object", properties: { claimed: { type: "number" } } }, 401: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });

    const ids = request.body.entry_ids;
    if (ids.length === 0) return reply.code(200).send({ claimed: 0 });

    const claimed = await app.db
      .update(schema.sea_time_entries)
      .set({ status: "pending" })
      .where(and(
        inArray(schema.sea_time_entries.id, ids),
        eq(schema.sea_time_entries.user_id, userId),
        eq(schema.sea_time_entries.status, "off_board"),
      ))
      .returning({ id: schema.sea_time_entries.id });

    app.logger.info({ userId, claimed: claimed.length }, "Off-board passages claimed");
    return reply.code(200).send({ claimed: claimed.length });
  });

  // POST /api/push-tokens - Register this device's Expo push token
  fastify.post<{ Body: { token: string; platform?: string | null } }>("/api/push-tokens", {
    schema: {
      description: "Register an Expo push token for the authenticated user",
      tags: ["notifications"],
      body: {
        type: "object",
        required: ["token"],
        properties: { token: { type: "string" }, platform: { type: ["string", "null"] } },
      },
      response: { 200: { type: "object", properties: { ok: { type: "boolean" } } }, 400: errorSchema, 401: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });

    const { token, platform } = request.body;
    if (!/^Expo(nent)?PushToken\[.+\]$/.test(token)) {
      return reply.code(400).send({ error: "Not an Expo push token" });
    }

    // A token belongs to one device; if another account signed in on it, move it over.
    await app.db
      .insert(schema.push_tokens)
      .values({ user_id: userId, token, platform: platform ?? null })
      .onConflictDoUpdate({
        target: schema.push_tokens.token,
        set: { user_id: userId, platform: platform ?? null, updated_at: new Date() },
      });

    return reply.code(200).send({ ok: true });
  });

  // DELETE /api/push-tokens - Unregister a device (sign out)
  fastify.delete<{ Body: { token: string } }>("/api/push-tokens", {
    schema: {
      description: "Remove an Expo push token for the authenticated user",
      tags: ["notifications"],
      body: { type: "object", required: ["token"], properties: { token: { type: "string" } } },
      response: { 200: { type: "object", properties: { ok: { type: "boolean" } } }, 401: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });

    await app.db
      .delete(schema.push_tokens)
      .where(and(eq(schema.push_tokens.token, request.body.token), eq(schema.push_tokens.user_id, userId)));
    return reply.code(200).send({ ok: true });
  });
}
