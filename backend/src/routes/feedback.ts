import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import { EXIT_TRIGGERS, cleanComment, cleanReasons } from "../utils/feedback.js";

const errorSchema = { type: "object", properties: { error: { type: "string" } } };
const PLATFORMS = ["ios", "android", "web"] as const;

export function register(app: App, fastify: FastifyInstance) {
  // GET /api/exit-survey?key= - Has the user already answered (or skipped) the survey for this cancellation?
  fastify.get<{ Querystring: { key: string } }>("/api/exit-survey", {
    schema: {
      description: "Whether the exit survey for one cancellation has been answered or skipped",
      tags: ["feedback"],
      querystring: { type: "object", required: ["key"], properties: { key: { type: "string", minLength: 1 } } },
      response: { 200: { type: "object", properties: { answered: { type: "boolean" } } }, 401: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });

    const [row] = await app.db
      .select({ id: schema.exit_surveys.id })
      .from(schema.exit_surveys)
      .where(and(eq(schema.exit_surveys.user_id, userId), eq(schema.exit_surveys.cancellation_key, request.query.key)));
    return reply.code(200).send({ answered: !!row });
  });

  // POST /api/exit-survey - Why the user cancelled their trial or subscription
  fastify.post<{
    Body: {
      key: string;
      trigger: (typeof EXIT_TRIGGERS)[number];
      period_type?: string;
      product_id?: string;
      platform?: (typeof PLATFORMS)[number];
      reasons?: string[];
      comment?: string;
      skipped?: boolean;
    };
  }>("/api/exit-survey", {
    schema: {
      description: "Record an exit survey answer (or a skip) for one cancellation",
      tags: ["feedback"],
      body: {
        type: "object",
        required: ["key", "trigger"],
        properties: {
          key: { type: "string", minLength: 1, maxLength: 100 },
          trigger: { type: "string", enum: [...EXIT_TRIGGERS] },
          period_type: { type: "string", maxLength: 20 },
          product_id: { type: "string", maxLength: 200 },
          platform: { type: "string", enum: [...PLATFORMS] },
          reasons: { type: "array", items: { type: "string" }, maxItems: 20 },
          comment: { type: "string" },
          skipped: { type: "boolean" },
        },
      },
      response: { 200: { type: "object", additionalProperties: true }, 400: errorSchema, 401: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });

    const body = request.body;
    const reasons = cleanReasons(body.reasons);
    const comment = cleanComment(body.comment);
    const skipped = body.skipped === true;
    if (!skipped && reasons.length === 0 && !comment) {
      return reply.code(400).send({ error: "Pick a reason or write a comment." });
    }

    await app.db
      .insert(schema.exit_surveys)
      .values({
        user_id: userId,
        cancellation_key: body.key,
        trigger: body.trigger,
        period_type: body.period_type ?? null,
        product_id: body.product_id ?? null,
        platform: body.platform ?? null,
        reasons: skipped ? [] : reasons,
        comment: skipped ? null : comment,
        skipped,
      })
      .onConflictDoNothing();

    app.logger.info({ userId, trigger: body.trigger, periodType: body.period_type, reasons, skipped }, "Exit survey recorded");
    return reply.code(200).send({ success: true });
  });
}
