import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import crypto from "crypto";
import * as schema from "../db/schema.js";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import {
  ENTRY_SIGNATURE_LIMIT,
  SIGNATURE_CLEARED,
  cannotSignReason,
  entrySignatureView,
  entrySnapshot,
  servedAsMaster,
  signatureColumns,
  signatureFingerprint,
  validateEntrySignature,
  type EntrySnapshot,
} from "../utils/entrySignature.js";
import { entrySignPage, entrySignPageMessage } from "../utils/entrySignPage.js";

/**
 * Signatures on single sea time entries (MGN 496 5.3: the Master, or a
 * responsible person where the seafarer was Master).
 *
 * Two ways to sign: on the seafarer's phone, handed to the signer
 * (POST /api/sea-time/:id/signature), or from a one-time link the app shares
 * (POST /api/sea-time/:id/signature-requests). The link works like the
 * testimonial countersign link: only the SHA-256 of the token is stored, it works
 * once, lapses after LINK_DAYS and can be cancelled. The entry as the signer sees
 * it is frozen in the request, and the link stops working if the entry changes.
 */

export const LINK_DAYS = 30;

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const baseUrl = () => (process.env.BETTER_AUTH_URL || "").replace(/\/+$/, "");
export const entrySignUrl = (token: string) => `${baseUrl()}/public/entry-signature/${token}`;

const SIGN_BODY_LIMIT = ENTRY_SIGNATURE_LIMIT + 10_000;

function requestView(r: any) {
  return {
    id: r.id,
    entry_id: r.entry_id,
    status: r.status,
    signer_name: r.signer_name,
    signed_at: r.signed_at,
    expires_at: r.expires_at,
    created_at: r.created_at,
    expired: r.status === "pending" && new Date(r.expires_at) <= new Date(),
  };
}

export function register(app: App, fastify: FastifyInstance) {
  const ownEntry = async (userId: string, id: string) => {
    const entry = await app.db.query.sea_time_entries.findFirst({
      with: { vessel: true },
      where: eq(schema.sea_time_entries.id, id),
    });
    return entry && entry.user_id === userId ? entry : null;
  };

  // GET /api/sea-time/:id/signature - The entry's signature, whether it can be signed, and any open link
  fastify.get<{ Params: { id: string } }>("/api/sea-time/:id/signature", {
    schema: { description: "Signature state of a sea time entry (no image)", tags: ["sea-time"] },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    const entry = await ownEntry(userId, request.params.id);
    if (!entry) return reply.code(404).send({ error: "Sea time entry not found" });
    const [link] = await app.db.select().from(schema.entry_signature_requests)
      .where(and(eq(schema.entry_signature_requests.entry_id, entry.id), eq(schema.entry_signature_requests.status, "pending")))
      .orderBy(desc(schema.entry_signature_requests.created_at))
      .limit(1);
    const open = link && new Date(link.expires_at) > new Date() && link.fingerprint === signatureFingerprint(entry) ? link : null;
    return reply.code(200).send({
      signature: entrySignatureView(entry),
      cannot_sign_reason: cannotSignReason(entry),
      served_as_master: servedAsMaster(entry.rank),
      pending_link: open ? requestView(open) : null,
    });
  });

  // POST /api/sea-time/:id/signature - Signed on the seafarer's phone
  fastify.post<{ Params: { id: string }; Body: any }>("/api/sea-time/:id/signature", {
    schema: {
      description: "Sign a sea time entry on this device: the Master or a responsible person signs on the seafarer's phone",
      tags: ["sea-time"],
    },
    bodyLimit: SIGN_BODY_LIMIT,
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    const entry = await ownEntry(userId, request.params.id);
    if (!entry) return reply.code(404).send({ error: "Sea time entry not found" });
    const blocked = cannotSignReason(entry);
    if (blocked) return reply.code(409).send({ error: blocked });
    const result = validateEntrySignature(request.body, { served_as_master: servedAsMaster(entry.rank) });
    if ("error" in result) return reply.code(400).send({ error: result.error });

    const [updated] = await app.db.update(schema.sea_time_entries)
      .set(signatureColumns(entry, result.value, "in_person"))
      .where(eq(schema.sea_time_entries.id, entry.id))
      .returning();
    // A link still open for this entry is no longer needed
    await app.db.update(schema.entry_signature_requests)
      .set({ status: "cancelled" })
      .where(and(eq(schema.entry_signature_requests.entry_id, entry.id), eq(schema.entry_signature_requests.status, "pending")));
    app.logger.info({ userId, entryId: entry.id }, "Sea time entry signed in person");
    return reply.code(200).send({ signature: entrySignatureView(updated) });
  });

  // DELETE /api/sea-time/:id/signature - Remove the signature from an entry
  fastify.delete<{ Params: { id: string } }>("/api/sea-time/:id/signature", {
    schema: { description: "Remove the signature from a sea time entry", tags: ["sea-time"] },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    const entry = await ownEntry(userId, request.params.id);
    if (!entry) return reply.code(404).send({ error: "Sea time entry not found" });
    await app.db.update(schema.sea_time_entries).set(SIGNATURE_CLEARED).where(eq(schema.sea_time_entries.id, entry.id));
    return reply.code(200).send({ signature: null });
  });

  // POST /api/sea-time/:id/signature-requests - Make a one-time signing link for an entry
  fastify.post<{ Params: { id: string } }>("/api/sea-time/:id/signature-requests", {
    schema: {
      description: "Create a one-time link for the Master or a responsible person to sign a sea time entry (requires an active subscription)",
      tags: ["sea-time"],
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

    const entry = await ownEntry(userId, request.params.id);
    if (!entry) return reply.code(404).send({ error: "Sea time entry not found" });
    const blocked = cannotSignReason(entry);
    if (blocked) return reply.code(409).send({ error: blocked });

    const token = crypto.randomBytes(32).toString("base64url");
    const [row] = await app.db.insert(schema.entry_signature_requests).values({
      user_id: userId,
      entry_id: entry.id,
      token_hash: hashToken(token),
      snapshot: entrySnapshot(entry, (entry as any).vessel?.vessel_name || "", user.name || ""),
      fingerprint: signatureFingerprint(entry),
      expires_at: new Date(Date.now() + LINK_DAYS * 86_400_000),
    }).returning();
    app.logger.info({ userId, entryId: entry.id, requestId: row.id }, "Entry signature request created");
    return reply.code(201).send({ ...requestView(row), url: entrySignUrl(token) });
  });

  // GET /api/sea-time/:id/signature-requests - Links made for an entry, newest first (no tokens)
  fastify.get<{ Params: { id: string } }>("/api/sea-time/:id/signature-requests", {
    schema: { description: "List the signature links made for a sea time entry", tags: ["sea-time"] },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    const rows = await app.db.select().from(schema.entry_signature_requests)
      .where(and(eq(schema.entry_signature_requests.user_id, userId), eq(schema.entry_signature_requests.entry_id, request.params.id)))
      .orderBy(desc(schema.entry_signature_requests.created_at));
    return reply.code(200).send(rows.map(requestView));
  });

  // DELETE /api/entry-signature-requests/:id - Cancel a link that has not been used
  fastify.delete<{ Params: { id: string } }>("/api/entry-signature-requests/:id", {
    schema: { description: "Cancel a pending entry signature link", tags: ["sea-time"] },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    const rows = await app.db.update(schema.entry_signature_requests)
      .set({ status: "cancelled" })
      .where(and(
        eq(schema.entry_signature_requests.id, request.params.id),
        eq(schema.entry_signature_requests.user_id, userId),
        eq(schema.entry_signature_requests.status, "pending"),
      ))
      .returning();
    if (rows.length === 0) return reply.code(404).send({ error: "No pending link with that id" });
    return reply.code(200).send(requestView(rows[0]));
  });

  const findByToken = async (token: string) => {
    if (!TOKEN_RE.test(token)) return null;
    const [row] = await app.db.select().from(schema.entry_signature_requests)
      .where(eq(schema.entry_signature_requests.token_hash, hashToken(token)));
    return row ?? null;
  };

  const currentEntry = async (row: { entry_id: string }) => {
    const [entry] = await app.db.select().from(schema.sea_time_entries).where(eq(schema.sea_time_entries.id, row.entry_id));
    return entry ?? null;
  };

  // GET /public/entry-signature/:token - The signing page (no sign-in)
  fastify.get<{ Params: { token: string } }>("/public/entry-signature/:token", {
    schema: { description: "Page for the Master or a responsible person to sign a sea time entry", tags: ["public"] },
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store").header("Referrer-Policy", "no-referrer");
    const row = await findByToken(request.params.token);
    if (!row) return reply.code(404).type("text/html").send(entrySignPageMessage("not_found"));
    if (row.status === "signed") return reply.code(200).type("text/html").send(entrySignPageMessage("signed", row.signed_at));
    if (row.status === "cancelled") return reply.code(410).type("text/html").send(entrySignPageMessage("cancelled"));
    if (new Date(row.expires_at) <= new Date()) return reply.code(410).type("text/html").send(entrySignPageMessage("expired"));
    const entry = await currentEntry(row);
    if (!entry || signatureFingerprint(entry) !== row.fingerprint) {
      return reply.code(409).type("text/html").send(entrySignPageMessage("changed"));
    }
    return reply.code(200).type("text/html")
      .send(entrySignPage(row.snapshot as EntrySnapshot, `/public/entry-signature/${request.params.token}`));
  });

  // POST /public/entry-signature/:token - Submit the signature
  fastify.post<{ Params: { token: string }; Body: any }>("/public/entry-signature/:token", {
    schema: { description: "Sign a sea time entry from its link", tags: ["public"] },
    bodyLimit: SIGN_BODY_LIMIT,
  }, async (request, reply) => {
    const row = await findByToken(request.params.token);
    if (!row) return reply.code(404).send({ error: "This link is not valid." });
    if (row.status !== "pending") return reply.code(409).send({ error: "This entry has already been signed or the request was cancelled." });
    if (new Date(row.expires_at) <= new Date()) return reply.code(410).send({ error: "This link has expired." });
    const snapshot = row.snapshot as EntrySnapshot;
    const result = validateEntrySignature(request.body, { served_as_master: snapshot.served_as_master });
    if ("error" in result) return reply.code(400).send({ error: result.error });
    const entry = await currentEntry(row);
    if (!entry || signatureFingerprint(entry) !== row.fingerprint) {
      return reply.code(409).send({ error: "The seafarer has changed this entry since the link was made. Please ask them for a new link." });
    }

    const signedAt = new Date();
    const claimed = await app.db.transaction(async (tx) => {
      // Only a still-pending row is signed, so a second submission cannot overwrite the first
      const rows = await tx.update(schema.entry_signature_requests)
        .set({ status: "signed", signed_at: signedAt, signer_name: result.value.signer_name })
        .where(and(eq(schema.entry_signature_requests.id, row.id), eq(schema.entry_signature_requests.status, "pending")))
        .returning({ id: schema.entry_signature_requests.id });
      if (rows.length === 0) return false;
      await tx.update(schema.sea_time_entries)
        .set(signatureColumns(entry, result.value, "link", signedAt))
        .where(eq(schema.sea_time_entries.id, entry.id));
      return true;
    });
    if (!claimed) return reply.code(409).send({ error: "This entry has already been signed or the request was cancelled." });
    app.logger.info({ requestId: row.id, userId: row.user_id, entryId: entry.id }, "Sea time entry signed from link");
    return reply.code(200).send({ ok: true });
  });
}
