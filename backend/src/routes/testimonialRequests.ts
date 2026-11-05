import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import crypto from "crypto";
import * as schema from "../db/schema.js";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import { loadTestimonialBlocks, vesselParticulars } from "./workboatTestimonial.js";
import { testimonialSnapshot, validateSignature, type TestimonialSnapshot } from "../utils/workboatTestimonial.js";
import { signPage, signPageMessage } from "../utils/testimonialSignPage.js";

/**
 * Signature requests for the MGN 496 Annex C workboat testimonial.
 *
 * The seafarer makes a request for one vessel; the app shares the link it gets
 * back (the server sends nothing). The Master or company opens the link, sees
 * Part 1 as it stood when the request was made, and completes and signs it. The
 * testimonial PDF then carries their details and signature.
 *
 * The link token is 32 random bytes; only its SHA-256 is stored. A link works
 * once and lapses after LINK_DAYS.
 */

export const LINK_DAYS = 60;

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const baseUrl = () => (process.env.BETTER_AUTH_URL || "").replace(/\/+$/, "");
export const signUrl = (token: string) => `${baseUrl()}/public/testimonial/${token}`;

function listView(r: any) {
  const p = r.part1 as TestimonialSnapshot;
  return {
    id: r.id,
    vessel_id: r.vessel_id,
    status: r.status,
    from: p?.from ?? null,
    to: p?.to ?? null,
    signer_name: r.signer_name,
    signed_at: r.signed_at,
    expires_at: r.expires_at,
    created_at: r.created_at,
    expired: r.status === "pending" && new Date(r.expires_at) <= new Date(),
  };
}

export function register(app: App, fastify: FastifyInstance) {
  // POST /api/testimonial-requests - Make a signature link for one vessel's testimonial
  fastify.post<{ Body: { vesselId: string } }>("/api/testimonial-requests", {
    schema: {
      description: "Create a one-time link for the Master or company to sign the MGN 496 Annex C testimonial for a vessel (requires an active subscription)",
      tags: ["reports"],
      body: { type: "object", required: ["vesselId"], properties: { vesselId: { type: "string" } } },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    const [user] = await app.db.select().from(authSchema.user).where(eq(authSchema.user.id, userId));
    if (!user) return reply.code(401).send({ error: "User not found" });
    const status = (user as any).subscription_status || "inactive";
    const expires = (user as any).subscription_expires_at ? new Date((user as any).subscription_expires_at) : null;
    const active = (status === "active" || status === "trial") && (!expires || (!isNaN(expires.getTime()) && expires > new Date()));
    if (!active) return reply.code(403).send({ error: "Active subscription required" });

    const { vesselId } = request.body;
    const blocks = await loadTestimonialBlocks(app, userId, vesselId);
    // A renamed vessel has a block per name: the request covers the latest one
    const block = blocks[blocks.length - 1];
    if (!block) return reply.code(404).send({ error: "No confirmed deck sea service on this vessel to put on a testimonial" });

    const dob = (user as any).date_of_birth ? new Date((user as any).date_of_birth).toISOString().slice(0, 10) : "";
    const part1 = testimonialSnapshot(block.t, vesselParticulars(block.vessel), {
      name: user.name || "",
      date_of_birth: dob ? dob.split("-").reverse().join("/") : "",
      discharge_book: (user as any).srb_no || "",
    });
    const token = crypto.randomBytes(32).toString("base64url");
    const [row] = await app.db.insert(schema.testimonial_requests).values({
      user_id: userId,
      vessel_id: vesselId,
      token_hash: hashToken(token),
      part1,
      expires_at: new Date(Date.now() + LINK_DAYS * 86_400_000),
    }).returning();
    app.logger.info({ userId, vesselId, requestId: row.id }, "Testimonial signature request created");
    return reply.code(201).send({ ...listView(row), url: signUrl(token) });
  });

  // GET /api/testimonial-requests - The user's requests, newest first (no links)
  fastify.get<{ Querystring: { vesselId?: string } }>("/api/testimonial-requests", {
    schema: {
      description: "List the user's testimonial signature requests",
      tags: ["reports"],
      querystring: { type: "object", properties: { vesselId: { type: "string" } } },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    const { vesselId } = request.query;
    const rows = await app.db.select().from(schema.testimonial_requests)
      .where(vesselId
        ? and(eq(schema.testimonial_requests.user_id, userId), eq(schema.testimonial_requests.vessel_id, vesselId))
        : eq(schema.testimonial_requests.user_id, userId))
      .orderBy(desc(schema.testimonial_requests.created_at));
    return reply.code(200).send(rows.map(listView));
  });

  // DELETE /api/testimonial-requests/:id - Cancel a request that is not signed yet
  fastify.delete<{ Params: { id: string } }>("/api/testimonial-requests/:id", {
    schema: { description: "Cancel a pending testimonial signature request", tags: ["reports"] },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    const rows = await app.db.update(schema.testimonial_requests)
      .set({ status: "cancelled" })
      .where(and(
        eq(schema.testimonial_requests.id, request.params.id),
        eq(schema.testimonial_requests.user_id, userId),
        eq(schema.testimonial_requests.status, "pending"),
      ))
      .returning();
    if (rows.length === 0) return reply.code(404).send({ error: "No pending request with that id" });
    return reply.code(200).send(listView(rows[0]));
  });

  const findByToken = async (token: string) => {
    if (!TOKEN_RE.test(token)) return null;
    const [row] = await app.db.select().from(schema.testimonial_requests)
      .where(eq(schema.testimonial_requests.token_hash, hashToken(token)));
    return row ?? null;
  };

  // GET /public/testimonial/:token - The signing page (no sign-in)
  fastify.get<{ Params: { token: string } }>("/public/testimonial/:token", {
    schema: { description: "Page for the Master or company to complete and sign a workboat testimonial", tags: ["public"] },
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store").header("Referrer-Policy", "no-referrer");
    const row = await findByToken(request.params.token);
    if (!row) return reply.code(404).type("text/html").send(signPageMessage("not_found"));
    if (row.status === "signed") return reply.code(200).type("text/html").send(signPageMessage("signed", row.signed_at));
    if (row.status === "cancelled") return reply.code(410).type("text/html").send(signPageMessage("cancelled"));
    if (new Date(row.expires_at) <= new Date()) return reply.code(410).type("text/html").send(signPageMessage("expired"));
    return reply.code(200).type("text/html").send(signPage(row.part1 as TestimonialSnapshot, `/public/testimonial/${request.params.token}`));
  });

  // POST /public/testimonial/:token - Submit the completed, signed testimonial
  fastify.post<{ Params: { token: string }; Body: any }>("/public/testimonial/:token", {
    schema: { description: "Sign a workboat testimonial from its link", tags: ["public"] },
    bodyLimit: 400_000,
  }, async (request, reply) => {
    const row = await findByToken(request.params.token);
    if (!row) return reply.code(404).send({ error: "This link is not valid." });
    if (row.status !== "pending") return reply.code(409).send({ error: "This testimonial has already been signed or cancelled." });
    if (new Date(row.expires_at) <= new Date()) return reply.code(410).send({ error: "This link has expired." });
    const result = validateSignature(request.body, row.part1 as TestimonialSnapshot);
    if ("error" in result) return reply.code(400).send({ error: result.error });

    // Only a still-pending row is signed, so a second submission cannot overwrite the first
    const rows = await app.db.update(schema.testimonial_requests)
      .set({ ...result.value, status: "signed", signed_at: new Date() })
      .where(and(eq(schema.testimonial_requests.id, row.id), eq(schema.testimonial_requests.status, "pending")))
      .returning({ id: schema.testimonial_requests.id });
    if (rows.length === 0) return reply.code(409).send({ error: "This testimonial has already been signed or cancelled." });
    app.logger.info({ requestId: row.id, userId: row.user_id }, "Testimonial signed");
    return reply.code(200).send({ ok: true });
  });
}
