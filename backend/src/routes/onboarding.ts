/**
 * Sign-up flow (2.5.0 activation): boat first, paywall second.
 *
 * POST /api/vessels/lookup/preview { mmsi, imo?, alt_mmsis?, name? }
 *   Confirms the picked vessel on AIS and returns its recent activity, with at
 *   most one paid Datalastic call (see services/onboardingPreview.ts). Used by
 *   the sign-up boat screen in place of /api/vessels/lookup/confirm.
 *
 * GET /api/vessels/:id/recent-activity
 *   The same activity line from the cache only. Never calls Datalastic.
 */

import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import { isSubscriptionActive } from "../utils/subscription.js";
import { isShipMmsi } from "../utils/vesselLookup.js";
import { previewVessel, recentActivity } from "../services/onboardingPreview.js";

const REQUESTS_PER_DAY = Number(process.env.VESSEL_PREVIEW_DAILY_LIMIT || 10);
const requests = new Map<string, { day: string; count: number }>();

function underDailyLimit(userId: string): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const u = requests.get(userId);
  if (!u || u.day !== day) { requests.set(userId, { day, count: 1 }); return true; }
  if (u.count >= REQUESTS_PER_DAY) return false;
  u.count++;
  return true;
}

const nullable = (type: string) => ({ type: [type, "null"] });
const errorSchema = { type: "object", properties: { error: { type: "string" } } };

const activitySchema = {
  type: ["object", "null"],
  properties: {
    from: { type: "string" },
    to: { type: "string" },
    window_days: { type: "number" },
    days_with_ais: { type: "number" },
    days_underway: { type: "number" },
    last_position_at: nullable("string"),
  },
};

export function register(app: App, fastify: FastifyInstance) {
  fastify.post<{ Body: { mmsi?: string; imo?: string | null; alt_mmsis?: string[] | null; name?: string | null } }>("/api/vessels/lookup/preview", {
    schema: {
      description: "Sign-up: confirm a picked vessel on AIS and return its recent activity (at most one Datalastic call) (Requires authentication)",
      tags: ["vessels"],
      body: {
        type: "object",
        required: ["mmsi"],
        properties: {
          mmsi: { type: "string" },
          imo: nullable("string"),
          alt_mmsis: { type: ["array", "null"], items: { type: "string" } },
          name: nullable("string"),
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            status: { type: "string" },
            vessel: {
              type: ["object", "null"],
              properties: {
                mmsi: { type: "string" },
                name: { type: "string" },
                imo: { type: "string" },
                flag: { type: "string" },
                flag_iso: { type: "string" },
                type: { type: "string" },
                last_position_at: { type: "string" },
                former_mmsi: { type: "string" },
              },
            },
            note: nullable("string"),
            activity: activitySchema,
            source: { type: "string" },
          },
        },
        400: errorSchema, 401: errorSchema, 429: errorSchema,
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    const mmsi = String(request.body.mmsi || "").replace(/\D/g, "");
    if (!isShipMmsi(mmsi)) return reply.code(400).send({ error: "MMSI must be 9 digits." });
    if (!underDailyLimit(userId)) {
      return reply.code(429).send({ error: "Too many AIS checks today. Try again tomorrow." });
    }
    const [user] = await app.db.select().from(authSchema.user).where(eq(authSchema.user.id, userId));
    if (!user) return reply.code(401).send({ error: "Authentication required" });
    const subscribed = isSubscriptionActive(user.subscription_status ?? undefined, user.subscription_expires_at ?? null);
    const result = await previewVessel(app, userId, {
      mmsi,
      imo: request.body.imo ?? null,
      alt_mmsis: request.body.alt_mmsis ?? null,
      name: typeof request.body.name === "string" ? request.body.name.slice(0, 80) : null,
    }, { subscribed });
    return reply.send(result);
  });

  fastify.get<{ Params: { id: string } }>("/api/vessels/:id/recent-activity", {
    schema: {
      description: "Recent days underway for a vessel, from the AIS history cache only (Requires authentication)",
      tags: ["vessels"],
      params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      response: {
        200: { type: "object", properties: { activity: activitySchema } },
        401: errorSchema, 404: errorSchema,
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    if (!/^[0-9a-f-]{36}$/i.test(request.params.id)) return reply.code(404).send({ error: "Vessel not found" });
    const [vessel] = await app.db
      .select({ mmsi: schema.vessels.mmsi })
      .from(schema.vessels)
      .where(and(eq(schema.vessels.id, request.params.id), eq(schema.vessels.user_id, userId)));
    if (!vessel) return reply.code(404).send({ error: "Vessel not found" });
    return reply.send({ activity: await recentActivity(app, vessel.mmsi) });
  });
}
