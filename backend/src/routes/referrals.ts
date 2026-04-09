/**
 * Referral system: each user has a referral_code. Sharing a deep link with
 * the code lets a new signup credit the referrer. Both users get a free
 * month bonus (handled via subscription_expires_at extension or backend
 * promo code) — for now we just track the relationship and bump
 * referral_count for visibility in HubSpot.
 */

import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import crypto from "crypto";

/**
 * Generate a short, URL-safe referral code (8 chars).
 * Avoids ambiguous characters (0/O, 1/l/I).
 */
function generateReferralCode(): string {
  const charset = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += charset[bytes[i] % charset.length];
  }
  return code;
}

export function register(app: App, fastify: FastifyInstance) {
  // GET /api/referral - Get the current user's referral code (creates one if missing)
  fastify.get("/api/referral", {
    schema: {
      description: "Get the current user's referral code and stats",
      tags: ["referral"],
      response: {
        200: {
          type: "object",
          properties: {
            code: { type: "string" },
            count: { type: "number" },
            shareUrl: { type: "string" },
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

    const users = await app.db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.id, userId));

    if (users.length === 0) {
      return reply.code(401).send({ error: "User not found" });
    }

    let user = users[0] as any;
    let code = user.referral_code as string | null;

    // Generate a code if missing
    if (!code) {
      // Try a few times in case of collision
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateReferralCode();
        try {
          await app.db
            .update(authSchema.user)
            .set({ referral_code: candidate } as any)
            .where(eq(authSchema.user.id, userId));
          code = candidate;
          break;
        } catch (err) {
          // Likely a unique constraint collision; retry
          app.logger.debug({ err }, "Referral code collision, retrying");
        }
      }
      if (!code) {
        return reply.code(500).send({ error: "Failed to generate referral code" });
      }
    }

    const shareUrl = `https://forelandmarine.com/tools/seatime-tracker?ref=${code}`;
    return reply.code(200).send({
      code,
      count: user.referral_count || 0,
      shareUrl,
    });
  });

  // POST /api/referral/redeem - Apply a referral code to the current user (one-time)
  fastify.post<{ Body: { code: string } }>("/api/referral/redeem", {
    schema: {
      description: "Redeem a referral code (gives the referrer credit)",
      tags: ["referral"],
      body: {
        type: "object",
        required: ["code"],
        properties: { code: { type: "string" } },
      },
      response: {
        200: { type: "object", properties: { success: { type: "boolean" } } },
        400: { type: "object", properties: { error: { type: "string" } } },
        401: { type: "object", properties: { error: { type: "string" } } },
        404: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    const { code } = request.body;
    const cleanCode = code.trim().toUpperCase();

    const users = await app.db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.id, userId));

    if (users.length === 0) {
      return reply.code(401).send({ error: "User not found" });
    }

    const user = users[0] as any;
    if (user.referred_by_user_id) {
      return reply.code(400).send({ error: "You have already used a referral code" });
    }

    // Find the referrer
    const referrers = await app.db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.referral_code, cleanCode));

    if (referrers.length === 0) {
      return reply.code(404).send({ error: "Invalid referral code" });
    }

    const referrer = referrers[0] as any;
    if (referrer.id === userId) {
      return reply.code(400).send({ error: "You cannot refer yourself" });
    }

    // Mark this user as referred + increment referrer's count
    await app.db
      .update(authSchema.user)
      .set({ referred_by_user_id: referrer.id } as any)
      .where(eq(authSchema.user.id, userId));

    await app.db
      .update(authSchema.user)
      .set({ referral_count: (referrer.referral_count || 0) + 1 } as any)
      .where(eq(authSchema.user.id, referrer.id));

    app.logger.info(
      { userId, referrerId: referrer.id, code: cleanCode },
      "Referral redeemed"
    );

    return reply.code(200).send({ success: true });
  });
}
