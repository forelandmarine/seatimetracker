import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import * as schema from "../db/schema.js";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import { formatSubscriptionStatus, safeParseDateValue } from "../utils/subscription.js";
import { askPathwayQuestion, isAuthorityEnabled, buildUserContext, type PathwayAnswer } from "../utils/pathwayAssistant.js";

const errorSchema = { type: "object", properties: { error: { type: "string" }, code: { type: "string" } } };

/** Questions a trial user gets for the whole trial. */
export const TRIAL_QUESTION_LIMIT = 5;
/** Daily cap for subscribers: generous for real use, a ceiling on runaway cost. */
const DAILY_QUESTION_LIMIT = Number(process.env.PATHWAY_ASSISTANT_DAILY_LIMIT || 25);
const MAX_QUESTION_LENGTH = 500;
/** Earlier turns replayed into a follow-up question. */
const HISTORY_TURNS = 4;

interface Quota {
  status: "trial" | "active" | "inactive" | "expired";
  allowed: boolean;
  limit: number | null;
  used: number;
  remaining: number;
  period: "trial" | "day" | null;
}

/**
 * Trial users get TRIAL_QUESTION_LIMIT answered questions across the whole trial;
 * subscribers get DAILY_QUESTION_LIMIT per UTC day. Failed calls (no answer saved)
 * are not counted against either.
 */
async function getQuota(app: App, user: any): Promise<Quota> {
  const status = formatSubscriptionStatus(
    user.subscription_status,
    safeParseDateValue(user.subscription_expires_at),
    safeParseDateValue(user.trial_ends_at),
  );
  if (status !== "trial" && status !== "active") {
    return { status, allowed: false, limit: null, used: 0, remaining: 0, period: null };
  }

  const answered = and(eq(schema.pathway_questions.user_id, user.id), isNotNull(schema.pathway_questions.answer));
  const where =
    status === "trial"
      ? and(answered, eq(schema.pathway_questions.subscription_status, "trial"))
      : and(answered, gte(schema.pathway_questions.created_at, sql`date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`));
  const [{ count }] = await app.db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.pathway_questions)
    .where(where);

  const limit = status === "trial" ? TRIAL_QUESTION_LIMIT : DAILY_QUESTION_LIMIT;
  return { status, allowed: count < limit, limit, used: count, remaining: Math.max(0, limit - count), period: status === "trial" ? "trial" : "day" };
}

const quotaSchema = {
  type: "object",
  properties: {
    status: { type: "string" },
    allowed: { type: "boolean" },
    limit: { type: ["number", "null"] },
    used: { type: "number" },
    remaining: { type: "number" },
    period: { type: ["string", "null"] },
    authority: { type: "string" },
    supported: { type: "boolean" },
  },
};

export function register(app: App, fastify: FastifyInstance) {
  const loadUser = async (userId: string) => {
    const [user] = await app.db.select().from(authSchema.user).where(eq(authSchema.user.id, userId));
    return user as any;
  };

  // GET /api/pathway-assistant/quota - How many questions the user has left
  fastify.get("/api/pathway-assistant/quota", {
    schema: {
      description: "Pathway assistant allowance: 5 questions per trial, a daily cap for subscribers",
      tags: ["pathway-assistant"],
      response: { 200: quotaSchema, 401: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    const user = await loadUser(userId);
    if (!user) return reply.code(401).send({ error: "User not found" });
    // The authority decides which library answers, so the app can name it on screen.
    const authority = user.maritime_authority || "mca";
    return reply.code(200).send({ ...(await getQuota(app, user)), authority, supported: isAuthorityEnabled(authority) });
  });

  // POST /api/pathway-assistant/ask - Answer one question about training pathways
  fastify.post<{ Body: { question: string; conversation_id?: string } }>("/api/pathway-assistant/ask", {
    schema: {
      description: "Answer a plain-language question about certification pathways from the official guidance library",
      tags: ["pathway-assistant"],
      body: {
        type: "object",
        required: ["question"],
        properties: {
          question: { type: "string", minLength: 3, maxLength: MAX_QUESTION_LENGTH },
          conversation_id: { type: "string", format: "uuid" },
        },
      },
      response: {
        200: { type: "object", additionalProperties: true },
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        429: errorSchema,
        503: errorSchema,
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    const user = await loadUser(userId);
    if (!user) return reply.code(401).send({ error: "User not found" });

    // An authority without a library gets a clear message rather than another body's rules.
    const authority = user.maritime_authority || "mca";
    if (!isAuthorityEnabled(authority)) {
      return reply.code(400).send({ error: "Pathway answers aren't available for your certification authority yet.", code: "authority_not_supported" });
    }

    const quota = await getQuota(app, user);
    if (!quota.allowed) {
      if (quota.period === "trial") {
        return reply.code(403).send({ error: `You've used your ${TRIAL_QUESTION_LIMIT} trial questions. Subscribe to keep asking.`, code: "trial_limit_reached" });
      }
      if (quota.period === "day") {
        return reply.code(429).send({ error: "You've reached today's question limit. Try again tomorrow.", code: "daily_limit_reached" });
      }
      return reply.code(403).send({ error: "Pathway answers are part of a SeaTime subscription.", code: "subscription_required" });
    }

    const question = request.body.question.trim();
    const conversationId = request.body.conversation_id ?? randomUUID();

    const history = request.body.conversation_id
      ? (
          await app.db
            .select({ question: schema.pathway_questions.question, answer: schema.pathway_questions.answer })
            .from(schema.pathway_questions)
            .where(and(
              eq(schema.pathway_questions.user_id, userId),
              eq(schema.pathway_questions.conversation_id, conversationId),
              isNotNull(schema.pathway_questions.answer),
            ))
            .orderBy(desc(schema.pathway_questions.created_at))
            .limit(HISTORY_TURNS)
        ).reverse().map((t) => ({ question: t.question, answer: t.answer as PathwayAnswer }))
      : [];

    try {
      const userContext = await buildUserContext(app.db, user, authority, user.target_certification ?? null);
      const result = await askPathwayQuestion({ db: app.db, authority, question, userContext, history, logger: app.logger });

      const [row] = await app.db
        .insert(schema.pathway_questions)
        .values({
          user_id: userId,
          conversation_id: conversationId,
          authority,
          question,
          answer: result.answer,
          model: result.model,
          subscription_status: quota.status,
          input_tokens: result.usage.input,
          output_tokens: result.usage.output,
          cache_read_tokens: result.usage.cacheRead,
          cache_write_tokens: result.usage.cacheWrite,
          cost_usd: result.usage.costUsd.toFixed(5),
        })
        .returning({ id: schema.pathway_questions.id });

      app.logger.info({ userId, conversationId, model: result.model, costUsd: result.usage.costUsd, inScope: result.answer.in_scope, sources: result.answer.sources.length }, "Pathway question answered");
      return reply.code(200).send({
        id: row.id,
        conversation_id: conversationId,
        answer: result.answer,
        remaining: Math.max(0, quota.remaining - 1),
        period: quota.period,
      });
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionError) {
        app.logger.warn({ err: error, userId }, "Pathway assistant temporarily unavailable");
        return reply.code(503).send({ error: "The pathway assistant is busy. Please try again in a minute.", code: "busy" });
      }
      app.logger.error({ err: error, userId }, "Pathway assistant failed");
      return reply.code(503).send({ error: "Something went wrong answering that. Please try again.", code: "failed" });
    }
  });

  // GET /api/pathway-assistant/conversations/:id - Reopen an earlier conversation
  fastify.get<{ Params: { id: string } }>("/api/pathway-assistant/conversations/:id", {
    schema: {
      description: "Questions and answers in one pathway assistant conversation",
      tags: ["pathway-assistant"],
      params: { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } } },
      response: { 200: { type: "object", additionalProperties: true }, 401: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    const turns = await app.db
      .select({
        id: schema.pathway_questions.id,
        question: schema.pathway_questions.question,
        answer: schema.pathway_questions.answer,
        rating: schema.pathway_questions.rating,
        created_at: schema.pathway_questions.created_at,
      })
      .from(schema.pathway_questions)
      .where(and(
        eq(schema.pathway_questions.user_id, userId),
        eq(schema.pathway_questions.conversation_id, request.params.id),
        isNotNull(schema.pathway_questions.answer),
      ))
      .orderBy(asc(schema.pathway_questions.created_at));
    return reply.code(200).send({ conversation_id: request.params.id, turns });
  });

  // POST /api/pathway-assistant/:id/rating - Thumbs up or down on one answer
  fastify.post<{ Params: { id: string }; Body: { rating: 1 | -1; comment?: string } }>("/api/pathway-assistant/:id/rating", {
    schema: {
      description: "Rate a pathway answer as helpful (1) or not (-1)",
      tags: ["pathway-assistant"],
      params: { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } } },
      body: {
        type: "object",
        required: ["rating"],
        properties: { rating: { type: "integer", enum: [1, -1] }, comment: { type: "string", maxLength: 1000 } },
      },
      response: { 200: { type: "object", properties: { success: { type: "boolean" } } }, 401: errorSchema, 404: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    const updated = await app.db
      .update(schema.pathway_questions)
      .set({ rating: request.body.rating, rating_comment: request.body.comment?.trim() || null })
      .where(and(eq(schema.pathway_questions.id, request.params.id), eq(schema.pathway_questions.user_id, userId)))
      .returning({ id: schema.pathway_questions.id });
    if (!updated.length) return reply.code(404).send({ error: "Answer not found" });
    return reply.code(200).send({ success: true });
  });
}
