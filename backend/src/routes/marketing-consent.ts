import type { FastifyInstance } from "fastify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";

const errorSchema = { type: "object", properties: { error: { type: "string" } } };
const SOURCES = ["signup", "prompt", "settings"] as const;

const unsubscribeSecret = () => process.env.UNSUBSCRIBE_SECRET || process.env.BETTER_AUTH_SECRET || "";

/** Signed token for a user's unsubscribe link, so the link works without signing in. */
export function unsubscribeToken(userId: string): string {
  return createHmac("sha256", unsubscribeSecret()).update(`unsubscribe:${userId}`).digest("base64url");
}

/** The one-click unsubscribe URL every marketing email must carry. */
export function unsubscribeUrl(baseUrl: string, userId: string): string {
  return `${baseUrl}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;
}

function validToken(userId: string, token: string): boolean {
  if (!unsubscribeSecret()) return false;
  const expected = Buffer.from(unsubscribeToken(userId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const unsubscribedPage = (ok: boolean) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>SeaTime Tracker</title></head>
<body style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:480px;margin:64px auto;padding:0 16px;color:#1A1A1A">
<h1 style="font-size:22px">${ok ? "You are unsubscribed" : "Link not recognised"}</h1>
<p>${ok
  ? "You will no longer receive tips and offers from SeaTime Tracker. Account and service emails still reach you. You can opt back in any time from Settings in the app."
  : "This unsubscribe link is not valid. Turn off tips and offers from Settings in the SeaTime Tracker app, or reply to the email and we will do it for you."}</p>
</body></html>`;

export function register(app: App, fastify: FastifyInstance) {
  // GET /api/marketing-consent - The user's current marketing email choice
  fastify.get("/api/marketing-consent", {
    schema: {
      description: "Get the user's marketing email consent. consented_at null = never asked.",
      tags: ["marketing-consent"],
      response: {
        200: {
          type: "object",
          properties: {
            marketing_consent: { type: "boolean" },
            consented_at: { type: ["string", "null"] },
            source: { type: ["string", "null"] },
          },
        },
        401: errorSchema,
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });

    const [u] = await app.db.select().from(authSchema.user).where(eq(authSchema.user.id, userId));
    if (!u) return reply.code(401).send({ error: "Authentication required" });

    return reply.code(200).send({
      marketing_consent: u.marketing_consent,
      consented_at: u.marketing_consent_at ? u.marketing_consent_at.toISOString() : null,
      source: u.marketing_consent_source,
    });
  });

  // PUT /api/marketing-consent - Opt in or out (records when and where)
  fastify.put<{ Body: { marketing_consent: boolean; source: (typeof SOURCES)[number] } }>("/api/marketing-consent", {
    schema: {
      description: "Record the user's marketing email choice with its time and source",
      tags: ["marketing-consent"],
      body: {
        type: "object",
        required: ["marketing_consent", "source"],
        properties: {
          marketing_consent: { type: "boolean" },
          source: { type: "string", enum: [...SOURCES] },
        },
      },
      response: { 200: { type: "object", additionalProperties: true }, 401: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });

    const { marketing_consent, source } = request.body;
    const now = new Date();
    await app.db
      .update(authSchema.user)
      .set({ marketing_consent, marketing_consent_at: now, marketing_consent_source: source })
      .where(eq(authSchema.user.id, userId));

    app.logger.info({ userId, marketing_consent, source }, "Marketing consent updated");
    return reply.code(200).send({ marketing_consent, consented_at: now.toISOString(), source });
  });

  // GET /api/email/unsubscribe - One-click unsubscribe from a marketing email (no sign-in)
  fastify.get<{ Querystring: { u?: string; t?: string } }>("/api/email/unsubscribe", {
    schema: {
      description: "Unsubscribe link target for marketing emails. Signed per user; turns marketing consent off.",
      tags: ["marketing-consent"],
      querystring: { type: "object", properties: { u: { type: "string" }, t: { type: "string" } } },
    },
  }, async (request, reply) => {
    const { u: userId, t: token } = request.query;
    const ok = !!userId && !!token && validToken(userId, token);
    if (ok) {
      await app.db
        .update(authSchema.user)
        .set({ marketing_consent: false, marketing_consent_at: new Date(), marketing_consent_source: "unsubscribe" })
        .where(eq(authSchema.user.id, userId!));
      app.logger.info({ userId }, "User unsubscribed from marketing email");
    }
    return reply.code(ok ? 200 : 400).type("text/html").send(unsubscribedPage(ok));
  });
}
