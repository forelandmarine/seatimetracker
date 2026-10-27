import type { FastifyInstance } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../db/schema.js";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import { calculateDurationHours, entrySeaDays, isValidServiceType, VALID_SERVICE_TYPES } from "../utils/seaTime.js";

const MAX_IDS = 500;
const errorSchema = { type: "object", properties: { error: { type: "string" } } };

export type BulkFailure = { id: string; error: string };

/**
 * Decides, for one entry, whether a bulk action may go ahead, using the same
 * rules as PUT /api/sea-time/:id/confirm and /reject. Returns the update to
 * apply, or the reason it can't be.
 */
export function planBulkUpdate(
  entry: { user_id: string; status: string; start_time: Date; end_time: Date | null; service_type: string | null; vessel_id: string } | undefined,
  userId: string,
  action: "confirm" | "reject",
  serviceType: string | undefined,
  seaDaysFor: (e: any) => number,
  now: Date = new Date()
): { update: Record<string, unknown> } | { error: string } {
  if (!entry || entry.user_id !== userId) return { error: "Sea time entry not found" };
  if (action === "reject") return { update: { status: "rejected" } };
  if (entry.status !== "pending") return { error: `Entry is already ${entry.status}` };
  const end_time = entry.end_time || now;
  const duration_hours = calculateDurationHours(entry.start_time, end_time);
  if (duration_hours === 0) return { error: "Sea time duration cannot be 0 hours. Cannot confirm entry with 0 hours." };
  const service_type = serviceType || entry.service_type || "actual_sea_service";
  const sea_days = seaDaysFor({ ...entry, end_time, status: "confirmed", service_type });
  return {
    update: { end_time, duration_hours: String(duration_hours), sea_days, status: "confirmed", service_type },
  };
}

export function register(app: App, fastify: FastifyInstance) {
  // POST /api/sea-time/bulk - Confirm or reject many entries in one request (Review tab bulk select)
  fastify.post<{ Body: { ids: string[]; action: "confirm" | "reject"; service_type?: string } }>("/api/sea-time/bulk", {
    schema: {
      description: "Confirm or reject several sea time entries at once. Entries that can't be changed are reported, the rest are applied.",
      tags: ["sea-time"],
      body: {
        type: "object",
        required: ["ids", "action"],
        properties: {
          ids: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1, maxItems: MAX_IDS },
          action: { type: "string", enum: ["confirm", "reject"] },
          service_type: { type: "string" },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            done: { type: "array", items: { type: "string" } },
            failed: { type: "array", items: { type: "object", properties: { id: { type: "string" }, error: { type: "string" } } } },
          },
        },
        400: errorSchema,
        401: errorSchema,
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });

    const { action, service_type } = request.body;
    const ids = Array.from(new Set(request.body.ids));
    if (service_type !== undefined && !isValidServiceType(service_type)) {
      return reply.code(400).send({ error: `Invalid service_type. Must be one of: ${VALID_SERVICE_TYPES.join(", ")}` });
    }

    const entries = await app.db
      .select()
      .from(schema.sea_time_entries)
      .where(and(inArray(schema.sea_time_entries.id, ids), eq(schema.sea_time_entries.user_id, userId)));
    const byId = new Map(entries.map((e) => [e.id, e]));

    // One lookup each for the user's authority and the vessels involved.
    let seaDaysFor: (e: any) => number = () => 0;
    if (action === "confirm") {
      const [u] = await app.db
        .select({ authority: authSchema.user.maritime_authority })
        .from(authSchema.user)
        .where(eq(authSchema.user.id, userId));
      const vesselIds = Array.from(new Set(entries.map((e) => e.vessel_id)));
      const vessels = vesselIds.length
        ? await app.db
            .select({ id: schema.vessels.id, vessel_name: schema.vessels.vessel_name, gross_tonnes: schema.vessels.gross_tonnes, tonnage_itc: schema.vessels.tonnage_itc })
            .from(schema.vessels)
            .where(inArray(schema.vessels.id, vesselIds))
        : [];
      const vesselById = new Map(vessels.map((v) => [v.id, v]));
      seaDaysFor = (e) => entrySeaDays({ ...e, vessel: vesselById.get(e.vessel_id) ?? null }, u?.authority);
    }

    const failed: BulkFailure[] = [];
    const updates: { id: string; set: Record<string, unknown> }[] = [];
    for (const id of ids) {
      const plan = planBulkUpdate(byId.get(id) as any, userId, action, service_type, seaDaysFor);
      if ("error" in plan) failed.push({ id, error: plan.error });
      else updates.push({ id, set: plan.update });
    }

    if (updates.length) {
      await app.db.transaction(async (tx) => {
        if (action === "reject") {
          await tx
            .update(schema.sea_time_entries)
            .set({ status: "rejected" })
            .where(and(inArray(schema.sea_time_entries.id, updates.map((u) => u.id)), eq(schema.sea_time_entries.user_id, userId)));
        } else {
          // Each confirmed entry keeps its own end time, duration and sea days.
          for (const u of updates) {
            await tx
              .update(schema.sea_time_entries)
              .set(u.set as any)
              .where(and(eq(schema.sea_time_entries.id, u.id), eq(schema.sea_time_entries.user_id, userId)));
          }
        }
      });
    }

    app.logger.info({ userId, action, requested: ids.length, done: updates.length, failed: failed.length }, "Bulk sea time update");
    return reply.code(200).send({ done: updates.map((u) => u.id), failed });
  });
}
