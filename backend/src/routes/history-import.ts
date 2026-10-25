import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import { isHistoryProduct, HISTORY_PRODUCTS, MAX_RANGES, type DayRange } from "../utils/historyImport.js";
import {
  HistoryImportError,
  availability,
  checkRanges,
  importSummary,
  redeem,
  unredeemed,
} from "../services/historyImport.js";

const DATE_RE = "^\\d{4}-\\d{2}-\\d{2}$";
const rangesSchema = {
  type: "array",
  minItems: 1,
  maxItems: MAX_RANGES,
  items: {
    type: "object",
    required: ["from", "to"],
    additionalProperties: false,
    properties: { from: { type: "string", pattern: DATE_RE }, to: { type: "string", pattern: DATE_RE } },
  },
};
const errorSchema = { type: "object", properties: { error: { type: "string" } } };

function sendError(app: App, reply: any, error: unknown, what: string) {
  if (error instanceof HistoryImportError) return reply.code(error.statusCode).send({ error: error.message });
  app.logger.error({ err: error }, `History import: ${what} failed`);
  return reply.code(500).send({ error: "Something went wrong. Please try again." });
}

export function register(app: App, fastify: FastifyInstance) {
  // GET /api/vessels/:vesselId/history-import - Is AIS history available, and which imports can be bought?
  fastify.get<{ Params: { vesselId: string } }>("/api/vessels/:vesselId/history-import", {
    schema: {
      description: "AIS history availability for a vessel, the importable windows, and the latest import",
      tags: ["history-import"],
      params: { type: "object", required: ["vesselId"], properties: { vesselId: { type: "string" } } },
      response: { 200: { type: "object", additionalProperties: true }, 401: errorSchema, 404: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    try {
      return reply.code(200).send(await availability(app, userId, request.params.vesselId));
    } catch (error) {
      return sendError(app, reply, error, "availability");
    }
  });

  // POST /api/vessels/:vesselId/history-import/check - Sample the picked periods before buying
  fastify.post<{ Params: { vesselId: string }; Body: { ranges: DayRange[] } }>("/api/vessels/:vesselId/history-import/check", {
    schema: {
      description: "Check a sample of days in the picked periods for AIS positions and movement (free, rate limited)",
      tags: ["history-import"],
      params: { type: "object", required: ["vesselId"], properties: { vesselId: { type: "string" } } },
      body: { type: "object", required: ["ranges"], properties: { ranges: rangesSchema } },
      response: { 200: { type: "object", additionalProperties: true }, 400: errorSchema, 401: errorSchema, 404: errorSchema, 429: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    try {
      return reply.code(200).send(await checkRanges(app, userId, request.params.vesselId, request.body.ranges));
    } catch (error) {
      return sendError(app, reply, error, "check");
    }
  });

  // POST /api/history-import - Redeem a completed store purchase against a vessel
  fastify.post<{ Body: { vessel_id: string; product_id: string; transaction_id?: string | null; ranges?: DayRange[] | null; joined_date?: string | null; platform?: string | null } }>("/api/history-import", {
    schema: {
      description: "Redeem an AIS history purchase (verified with RevenueCat) and queue the import",
      tags: ["history-import"],
      body: {
        type: "object",
        // ranges from 2.3.0 build 27 on; joined_date from build 26 (TestFlight) only
        required: ["vessel_id", "product_id"],
        properties: {
          vessel_id: { type: "string" },
          product_id: { type: "string", enum: Object.keys(HISTORY_PRODUCTS) },
          transaction_id: { type: ["string", "null"] },
          ranges: rangesSchema,
          joined_date: { type: ["string", "null"] },
          platform: { type: ["string", "null"] },
        },
      },
      response: { 200: { type: "object", additionalProperties: true }, 401: errorSchema, 402: errorSchema, 403: errorSchema, 409: errorSchema, 422: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    const { vessel_id, product_id, transaction_id, ranges, joined_date, platform } = request.body;
    if (!isHistoryProduct(product_id)) return reply.code(400).send({ error: "Unknown product" });
    try {
      const created = await redeem(app, { userId, vesselId: vessel_id, productId: product_id, transactionId: transaction_id, ranges, joinedDay: joined_date, platform });
      return reply.code(200).send(importSummary(created));
    } catch (error) {
      return sendError(app, reply, error, "redeem");
    }
  });

  // GET /api/history-import/unredeemed - Paid-for imports not yet assigned to a vessel
  fastify.get("/api/history-import/unredeemed", {
    schema: {
      description: "AIS history purchases the user has paid for but not redeemed",
      tags: ["history-import"],
      response: { 200: { type: "object", additionalProperties: true }, 401: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    try {
      return reply.code(200).send({ purchases: await unredeemed(app, userId) });
    } catch (error) {
      return sendError(app, reply, error, "unredeemed");
    }
  });

  // GET /api/history-import/:id - Progress of one import
  fastify.get<{ Params: { id: string } }>("/api/history-import/:id", {
    schema: {
      description: "Status of an AIS history import",
      tags: ["history-import"],
      params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      response: { 200: { type: "object", additionalProperties: true }, 401: errorSchema, 404: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    const [row] = await app.db
      .select()
      .from(schema.history_imports)
      .where(and(eq(schema.history_imports.id, request.params.id), eq(schema.history_imports.user_id, userId)));
    if (!row) return reply.code(404).send({ error: "Import not found" });
    return reply.code(200).send(importSummary(row));
  });
}
