/**
 * Referral system: each user has a referral_code to share. A new account can
 * redeem a friend's code within its first 14 days, and once the new user makes
 * their first payment both of them get a free month (services/referrals.ts).
 * Rows live in the referrals table; user.referred_by_user_id and
 * referral_count are kept up to date for older app builds and reporting.
 */

import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import * as authSchema from "../db/auth-schema.js";
import * as schema from "../db/schema.js";
import { canRedeem, FREE_MONTH_DAYS, REDEEM_WINDOW_DAYS, referralsEnabled } from "../utils/referrals.js";
import { userHasPaid } from "../services/referrals.js";
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
            paid_count: { type: "number" },
            months_earned: { type: "number" },
            months_pending: { type: "number" },
            free_month_days: { type: "number" },
            can_redeem: { type: "boolean" },
            redeem_days_left: { type: "number" },
            referred: {
              type: ["object", "null"],
              properties: {
                friend_paid: { type: "boolean" },
                reward_status: { type: "string" },
              },
            },
          },
        },
        401: { type: "object", properties: { error: { type: "string" } } },
        500: { type: "object", properties: { error: { type: "string" } } },
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

    const mine = await app.db
      .select()
      .from(schema.referrals)
      .where(eq(schema.referrals.referrer_user_id, userId));
    const [asFriend] = await app.db
      .select()
      .from(schema.referrals)
      .where(eq(schema.referrals.referred_user_id, userId));

    const now = new Date();
    const createdAt = new Date(user.createdAt);
    const eligible = !asFriend && !user.referred_by_user_id && canRedeem(createdAt, now);
    const daysLeft = Math.max(0, REDEEM_WINDOW_DAYS - Math.floor((now.getTime() - createdAt.getTime()) / 86_400_000));

    return reply.code(200).send({
      code,
      count: mine.length,
      shareUrl,
      paid_count: mine.filter((r) => r.friend_paid_at).length,
      months_earned: mine.filter((r) => r.referrer_reward_status === "granted").length,
      months_pending: mine.filter((r) => r.friend_paid_at && !["granted", "capped", "skipped"].includes(r.referrer_reward_status)).length,
      free_month_days: FREE_MONTH_DAYS,
      can_redeem: eligible,
      redeem_days_left: eligible ? daysLeft : 0,
      referred: asFriend
        ? { friend_paid: Boolean(asFriend.friend_paid_at), reward_status: asFriend.friend_reward_status }
        : null,
    });
  });

  // POST /api/referral/redeem - Apply a referral code to the current user (one-time)
  fastify.post<{ Body: { code: string } }>("/api/referral/redeem", {
    schema: {
      description: "Redeem a referral code (new accounts only). Both users get a free month when the new user first pays.",
      tags: ["referral"],
      body: {
        type: "object",
        required: ["code"],
        properties: { code: { type: "string" } },
      },
      response: {
        200: { type: "object", properties: { success: { type: "boolean" }, message: { type: "string" } } },
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
    if (!referralsEnabled()) {
      return reply.code(400).send({ error: "Referral codes are paused for now. We'll let you know when they're back." });
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
    const [existing] = await app.db
      .select({ id: schema.referrals.id })
      .from(schema.referrals)
      .where(eq(schema.referrals.referred_user_id, userId));
    if (user.referred_by_user_id || existing) {
      return reply.code(400).send({ error: "You have already used a referral code" });
    }
    if (!canRedeem(new Date(user.createdAt), new Date())) {
      return reply.code(400).send({ error: `Referral codes can only be used in the first ${REDEEM_WINDOW_DAYS} days after signing up` });
    }

    // Find the referrer
    const referrers = await app.db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.referral_code, cleanCode));

    if (referrers.length === 0) {
      return reply.code(404).send({ error: "That code was not found. Check it and try again." });
    }

    const referrer = referrers[0] as any;
    if (referrer.id === userId) {
      return reply.code(400).send({ error: "You cannot use your own code" });
    }
    if (referrer.referred_by_user_id === userId) {
      return reply.code(400).send({ error: "This person joined with your code, so their code cannot be used back" });
    }
    // The reward is for bringing in a new subscriber, so someone who has already paid can't redeem.
    if ((await userHasPaid(userId)) === true) {
      return reply.code(400).send({ error: "Referral codes are for new subscribers" });
    }

    try {
      await app.db.insert(schema.referrals).values({
        referrer_user_id: referrer.id,
        referred_user_id: userId,
        code: cleanCode,
      });
    } catch (err) {
      // Unique on referred_user_id: a double tap or a second device got there first
      app.logger.warn({ err, userId }, "Referral insert failed");
      return reply.code(400).send({ error: "You have already used a referral code" });
    }

    await app.db
      .update(authSchema.user)
      .set({ referred_by_user_id: referrer.id } as any)
      .where(eq(authSchema.user.id, userId));
    await app.db
      .update(authSchema.user)
      .set({ referral_count: sql`coalesce(${authSchema.user.referral_count}, 0) + 1` } as any)
      .where(eq(authSchema.user.id, referrer.id));

    app.logger.info({ userId, referrerId: referrer.id, code: cleanCode }, "Referral code redeemed");

    return reply.code(200).send({
      success: true,
      message: `Code applied. When you start your paid subscription, you and your friend each get a free month.`,
    });
  });

  // GET /api/referral/credits - Legacy (app builds before 2.4.0). Rewards are now given
  // through RevenueCat, so bonus_days stays 0.
  fastify.get("/api/referral/credits", {
    schema: {
      description: "Get the current user's bonus days balance",
      tags: ["referral"],
      response: {
        200: { type: "object", properties: { bonus_days: { type: "number" } } },
        401: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });

    const users = await app.db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.id, userId));

    const days = (users[0] as any)?.bonus_days || 0;
    return reply.code(200).send({ bonus_days: days });
  });
}
