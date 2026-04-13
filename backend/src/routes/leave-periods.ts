import type { FastifyInstance } from "fastify";
import { eq, and, desc, lte, gte } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";

const VALID_REASONS = ["annual_leave", "sick_leave", "personal", "training", "other"] as const;
type LeaveReason = (typeof VALID_REASONS)[number];

const VALID_REASONS_SET = new Set<string>(VALID_REASONS);

function isValidReason(r: string): r is LeaveReason {
  return VALID_REASONS_SET.has(r);
}

interface LeavePeriodBody {
  start_date: string;
  end_date: string;
  vessel_id?: string | null;
  reason?: string | null;
  notes?: string | null;
}

export function register(app: App, fastify: FastifyInstance) {
  // GET /api/leave-periods - List all leave periods for the authenticated user
  fastify.get("/api/leave-periods", {
    schema: {
      description: "List all leave periods for the authenticated user",
      tags: ["leave-periods"],
      response: {
        200: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
        401: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    const rows = await app.db
      .select()
      .from(schema.leave_periods)
      .where(eq(schema.leave_periods.user_id, userId))
      .orderBy(desc(schema.leave_periods.start_date));

    return reply.code(200).send(rows);
  });

  // POST /api/leave-periods - Create a new leave period
  fastify.post<{ Body: LeavePeriodBody }>("/api/leave-periods", {
    schema: {
      description: "Create a new leave period",
      tags: ["leave-periods"],
      body: {
        type: "object",
        required: ["start_date", "end_date"],
        properties: {
          start_date: { type: "string" },
          end_date: { type: "string" },
          vessel_id: { type: ["string", "null"] },
          reason: { type: ["string", "null"] },
          notes: { type: ["string", "null"] },
        },
      },
      response: {
        200: { type: "object", additionalProperties: true },
        400: { type: "object", properties: { error: { type: "string" } } },
        401: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    const body = request.body;

    if (body.start_date > body.end_date) {
      return reply.code(400).send({ error: "start_date must be on or before end_date" });
    }

    if (body.reason && !isValidReason(body.reason)) {
      return reply.code(400).send({
        error: `Invalid reason. Must be one of: ${VALID_REASONS.join(", ")}`,
      });
    }

    // Check for overlapping leave periods
    const overlapping = await app.db.select({ id: schema.leave_periods.id }).from(schema.leave_periods)
      .where(and(
        eq(schema.leave_periods.user_id, userId),
        lte(schema.leave_periods.start_date, body.end_date),
        gte(schema.leave_periods.end_date, body.start_date),
      ));
    if (overlapping.length > 0) {
      return reply.code(409).send({ error: 'This leave period overlaps with an existing one' });
    }

    // Validate vessel ownership if provided
    if (body.vessel_id) {
      const vessels = await app.db.select({ id: schema.vessels.id }).from(schema.vessels)
        .where(and(eq(schema.vessels.id, body.vessel_id), eq(schema.vessels.user_id, userId)));
      if (vessels.length === 0) {
        return reply.code(403).send({ error: 'Vessel does not belong to this user' });
      }
    }

    const [created] = await app.db
      .insert(schema.leave_periods)
      .values({
        user_id: userId,
        start_date: body.start_date,
        end_date: body.end_date,
        vessel_id: body.vessel_id || null,
        reason: body.reason || null,
        notes: body.notes || null,
      })
      .returning();

    app.logger.info(
      { userId, leavePeriodId: created.id, reason: body.reason },
      "Leave period created"
    );
    return reply.code(200).send(created);
  });

  // PUT /api/leave-periods/:id - Update a leave period
  fastify.put<{ Params: { id: string }; Body: Partial<LeavePeriodBody> }>(
    "/api/leave-periods/:id",
    {
      schema: {
        description: "Update a leave period",
        tags: ["leave-periods"],
        params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        body: {
          type: "object",
          properties: {
            start_date: { type: "string" },
            end_date: { type: "string" },
            vessel_id: { type: ["string", "null"] },
            reason: { type: ["string", "null"] },
            notes: { type: ["string", "null"] },
          },
        },
        response: {
          200: { type: "object", additionalProperties: true },
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const userId = await extractUserIdFromRequest(request, app);
      if (!userId) return reply.code(401).send({ error: "Authentication required" });

      const { id } = request.params;
      const existing = await app.db
        .select()
        .from(schema.leave_periods)
        .where(and(eq(schema.leave_periods.id, id), eq(schema.leave_periods.user_id, userId)));

      if (existing.length === 0) {
        return reply.code(404).send({ error: "Leave period not found" });
      }

      const body = request.body;

      // Validate date ordering (use existing values as fallback)
      const startDate = body.start_date ?? existing[0].start_date;
      const endDate = body.end_date ?? existing[0].end_date;
      if (startDate > endDate) {
        return reply.code(400).send({ error: "start_date must be on or before end_date" });
      }

      if (body.reason && !isValidReason(body.reason)) {
        return reply.code(400).send({
          error: `Invalid reason. Must be one of: ${VALID_REASONS.join(", ")}`,
        });
      }

      const updateData: Record<string, unknown> = {};
      if (body.start_date !== undefined) updateData.start_date = body.start_date;
      if (body.end_date !== undefined) updateData.end_date = body.end_date;
      if (body.vessel_id !== undefined) updateData.vessel_id = body.vessel_id;
      if (body.reason !== undefined) updateData.reason = body.reason;
      if (body.notes !== undefined) updateData.notes = body.notes;

      const [updated] = await app.db
        .update(schema.leave_periods)
        .set(updateData)
        .where(eq(schema.leave_periods.id, id))
        .returning();

      return reply.code(200).send(updated);
    }
  );

  // DELETE /api/leave-periods/:id - Delete a leave period
  fastify.delete<{ Params: { id: string } }>("/api/leave-periods/:id", {
    schema: {
      description: "Delete a leave period",
      tags: ["leave-periods"],
      params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      response: {
        200: { type: "object", properties: { deleted: { type: "boolean" } } },
        401: { type: "object", properties: { error: { type: "string" } } },
        404: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });

    const { id } = request.params;
    const existing = await app.db
      .select()
      .from(schema.leave_periods)
      .where(and(eq(schema.leave_periods.id, id), eq(schema.leave_periods.user_id, userId)));

    if (existing.length === 0) {
      return reply.code(404).send({ error: "Leave period not found" });
    }

    await app.db.delete(schema.leave_periods).where(eq(schema.leave_periods.id, id));
    return reply.code(200).send({ deleted: true });
  });
}
