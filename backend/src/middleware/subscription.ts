import type { FastifyRequest, FastifyReply } from "fastify";
import type { App } from "../index.js";
import { eq } from "drizzle-orm";
import * as authSchema from "../db/auth-schema.js";

/**
 * Middleware to check if user has active subscription
 * Attaches subscription info to request object
 */
export async function checkSubscription(
  request: FastifyRequest,
  reply: FastifyReply,
  app: App
) {
  // Extract user ID from request (assuming auth middleware ran first)
  const userId = (request as any).userId;

  if (!userId) {
    return reply.code(401).send({ error: "Authentication required" });
  }

  try {
    const users = await app.db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.id, userId));

    if (users.length === 0) {
      return reply.code(401).send({ error: "User not found" });
    }

    const user = users[0];
    const subscriptionStatus = (user as any).subscription_status || "inactive";
    const subscriptionExpiresAt = (user as any).subscription_expires_at;

    // Attach to request for use in route handlers
    (request as any).subscription = {
      status: subscriptionStatus,
      expiresAt: subscriptionExpiresAt,
    };

    // Check if subscription is actually active
    // Must be 'active' status AND expiration date must be in the future
    let isActive = subscriptionStatus === "active";

    if (isActive && subscriptionExpiresAt) {
      try {
        const expiryDate = new Date(subscriptionExpiresAt);
        if (isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
          isActive = false;
        }
      } catch {
        isActive = false;
      }
    }

    if (!isActive) {
      app.logger.warn(
        { userId, subscriptionStatus },
        "Access denied: subscription not active"
      );
      return reply.code(403).send({
        error: "Active subscription required",
      });
    }

    // Subscription is valid, continue to next handler
  } catch (error) {
    app.logger.error(
      { err: error, userId },
      "Error checking subscription status"
    );
    return reply.code(500).send({ error: "Failed to verify subscription" });
  }
}

/**
 * Helper function to create subscription check hook
 * Usage: fastify.addHook('preHandler', createSubscriptionCheck(app))
 */
export function createSubscriptionCheck(app: App) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await checkSubscription(request, reply, app);
  };
}
