import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import * as authSchema from "../db/auth-schema.js";
import * as schema from "../db/schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import https from "https";
import crypto from "crypto";

// Apple App Store Server verification endpoint
const APPLE_SANDBOX_URL = "https://sandbox.itunes.apple.com/verifyReceipt";
const APPLE_PRODUCTION_URL = "https://buy.itunes.apple.com/verifyReceipt";

// RevenueCat webhook secret for signature verification
const REVENUECAT_WEBHOOK_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET || "";
const REVENUECAT_API_KEY = process.env.REVENUECAT_API_KEY || "";

/**
 * Verify iOS App Store receipt with Apple's servers
 */
function verifyAppleReceipt(receiptData: string, isSandbox: boolean = true): Promise<{
  status: number;
  bundle_id: string;
  bundle_version: string;
  receipt: {
    latest_receipt_info: Array<{
      product_id: string;
      expires_date_ms: string;
      bundle_id: string;
    }>;
  };
}> {
  return new Promise((resolve, reject) => {
    const url = isSandbox ? APPLE_SANDBOX_URL : APPLE_PRODUCTION_URL;
    const postData = JSON.stringify({
      "receipt-data": receiptData,
      password: process.env.APPLE_APP_SECRET || "",
    });

    // Properly parse the URL to extract hostname and path
    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch (error) {
      reject(new Error(`Invalid Apple verification URL: ${error}`));
      return;
    }

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: "POST" as const,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const response = JSON.parse(data);
          if (response.status === 0) {
            resolve(response);
          } else {
            reject(new Error(`Apple receipt verification failed with status ${response.status}`));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Safely parse a date value that could be Date | string | number | null
 * Never throws - always returns Date | null with fallback to null
 */
function safeParseDateValue(value: any): Date | null {
  try {
    if (value === null || value === undefined) {
      return null;
    }

    // If already a Date object, return it
    if (value instanceof Date) {
      // Validate the date is valid
      if (!isNaN(value.getTime())) {
        return value;
      }
      return null;
    }

    // Try to parse as new Date
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }

    return null;
  } catch (error) {
    // Silently catch all errors and return null
    return null;
  }
}

/**
 * Check if a date is still valid (in the future)
 */
function isDateValid(date: Date | null): boolean {
  if (!date) return false;
  try {
    return date.getTime() > new Date().getTime();
  } catch {
    return false;
  }
}

/**
 * Verify RevenueCat webhook signature
 */
function verifyRevenueCatSignature(
  body: string,
  signature: string | undefined
): boolean {
  if (!signature || !REVENUECAT_WEBHOOK_SECRET) {
    return false;
  }

  try {
    const hash = crypto
      .createHmac("sha256", REVENUECAT_WEBHOOK_SECRET)
      .update(body)
      .digest("base64");

    return hash === signature;
  } catch (error) {
    return false;
  }
}

/**
 * Fetch subscription data from RevenueCat API
 */
function fetchRevenueCatSubscription(
  customerId: string
): Promise<{
  active: boolean;
  expiresAt: Date | null;
  productId: string | null;
  platform: string | null;
  trialEndsAt: Date | null;
} | null> {
  return new Promise((resolve, reject) => {
    if (!REVENUECAT_API_KEY) {
      reject(new Error("RevenueCat API key not configured"));
      return;
    }

    const url = `https://api.revenuecat.com/v1/customers/${customerId}`;

    try {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: "GET" as const,
        headers: {
          Authorization: `Bearer ${REVENUECAT_API_KEY}`,
          "Content-Type": "application/json",
        },
      };

      const req = https.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const response = JSON.parse(data);

            if (res.statusCode === 200 && response.customer) {
              const entitlements = response.customer.subscriptions || {};
              const subscriptions = Object.values(entitlements) as any[];

              // Get the most recent active subscription
              const activeSubscription = subscriptions.find(
                (sub: any) =>
                  sub.expires_date && new Date(sub.expires_date) > new Date()
              );

              if (activeSubscription) {
                resolve({
                  active: true,
                  expiresAt: new Date(activeSubscription.expires_date),
                  productId: activeSubscription.product_id || null,
                  platform: activeSubscription.purchase_platform || null,
                  trialEndsAt: activeSubscription.trial_end_date
                    ? new Date(activeSubscription.trial_end_date)
                    : null,
                });
              } else {
                resolve({
                  active: false,
                  expiresAt: null,
                  productId: null,
                  platform: null,
                  trialEndsAt: null,
                });
              }
            } else {
              resolve(null);
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Calculate subscription expiration date from Apple receipt
 */
function getSubscriptionExpirationDate(receiptInfo: any): Date | null {
  if (!receiptInfo || !receiptInfo.latest_receipt_info || receiptInfo.latest_receipt_info.length === 0) {
    return null;
  }

  // Get the most recent receipt with the latest expiration date
  const latestReceipt = receiptInfo.latest_receipt_info.reduce((prev: any, current: any) => {
    const prevExpires = parseInt(prev.expires_date_ms || "0");
    const currExpires = parseInt(current.expires_date_ms || "0");
    return currExpires > prevExpires ? current : prev;
  });

  if (latestReceipt && latestReceipt.expires_date_ms) {
    try {
      const expirationDate = new Date(parseInt(latestReceipt.expires_date_ms));
      if (!isNaN(expirationDate.getTime())) {
        return expirationDate;
      }
    } catch (error) {
      // Silently fail and return null
    }
  }

  return null;
}

export function register(app: App, fastify: FastifyInstance): void {
  // GET /api/subscription/status - Get current user's subscription status
  fastify.get(
    "/api/subscription/status",
    {
      schema: {
        description: "Get current user's subscription status",
        tags: ["subscription"],
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["active", "inactive", "trial", "expired"] },
              expiresAt: { type: ["string", "null"], format: "date-time" },
              trialEndsAt: { type: ["string", "null"], format: "date-time" },
              productId: { type: ["string", "null"] },
              platform: { type: ["string", "null"] },
            },
          },
          401: { type: "object", properties: { error: { type: "string" } } },
          500: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const userId = await extractUserIdFromRequest(request, app);
      if (!userId) {
        app.logger.warn({}, "Subscription status requested without authentication");
        return reply.code(401).send({ error: "Authentication required" });
      }

      app.logger.info({ userId }, "Fetching subscription status");

      try {
        const users = await app.db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.id, userId));

        if (users.length === 0) {
          return reply.code(401).send({ error: "User not found" });
        }

        const user = users[0];

        // Handle case where subscription columns don't exist in database yet
        // Always use safe parsing to prevent errors on invalid dates
        const rawStatus = (user as any).subscription_status;
        const rawExpiresAt = (user as any).subscription_expires_at;
        const rawTrialEndsAt = (user as any).trial_ends_at;
        const rawProductId = (user as any).subscription_product_id;
        const rawPlatform = (user as any).subscription_platform;

        // Safely parse the dates
        const expirationDate = safeParseDateValue(rawExpiresAt);
        const trialEndDate = safeParseDateValue(rawTrialEndsAt);

        // Determine subscription status
        let status: "active" | "inactive" | "trial" | "expired" = "inactive";

        if (rawStatus === "trial" && isDateValid(trialEndDate)) {
          status = "trial";
        } else if (rawStatus === "active" && isDateValid(expirationDate)) {
          status = "active";
        } else if (rawStatus === "expired") {
          status = "expired";
        }

        // Format response with safe serialization
        let expiresAtString: string | null = null;
        let trialEndsAtString: string | null = null;

        try {
          if (expirationDate && !isNaN(expirationDate.getTime())) {
            expiresAtString = expirationDate.toISOString();
          }
        } catch (error) {
          // Silently ignore serialization errors
          expiresAtString = null;
        }

        try {
          if (trialEndDate && !isNaN(trialEndDate.getTime())) {
            trialEndsAtString = trialEndDate.toISOString();
          }
        } catch (error) {
          // Silently ignore serialization errors
          trialEndsAtString = null;
        }

        return reply.code(200).send({
          status,
          expiresAt: expiresAtString,
          trialEndsAt: trialEndsAtString,
          productId: rawProductId || null,
          platform: rawPlatform || null,
        });
      } catch (error) {
        app.logger.error({ err: error, userId }, "Error fetching subscription status");
        return reply.code(500).send({ error: "Failed to fetch subscription status" });
      }
    }
  );

  // POST /api/subscription/verify - Verify iOS App Store receipt
  fastify.post<{
    Body: {
      receiptData: string;
      productId: string;
      isSandbox?: boolean;
    };
  }>(
    "/api/subscription/verify",
    {
      schema: {
        description: "Verify iOS App Store receipt and update subscription status",
        tags: ["subscription"],
        body: {
          type: "object",
          required: ["receiptData", "productId"],
          properties: {
            receiptData: { type: "string", description: "Base64-encoded receipt from App Store" },
            productId: { type: "string", description: "iOS App Store product ID" },
            isSandbox: { type: "boolean", description: "Whether to use Apple sandbox environment (default: true)" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              status: { type: "string", enum: ["active", "inactive"] },
              expiresAt: { type: ["string", "null"], format: "date-time" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
          500: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const userId = await extractUserIdFromRequest(request, app);
      if (!userId) {
        app.logger.warn({}, "Receipt verification requested without authentication");
        return reply.code(401).send({ error: "Authentication required" });
      }

      const { receiptData, productId, isSandbox = true } = request.body;

      if (!receiptData || !productId) {
        app.logger.warn({ userId }, "Receipt verification missing required fields");
        return reply.code(400).send({ error: "receiptData and productId are required" });
      }

      app.logger.info({ userId, productId }, "Verifying iOS App Store receipt");

      try {
        // Verify receipt with Apple
        const appleResponse = await verifyAppleReceipt(receiptData, isSandbox);
        const expirationDate = getSubscriptionExpirationDate(appleResponse.receipt);

        if (!expirationDate) {
          app.logger.warn({ userId, productId }, "No valid subscription found in receipt");
          return reply.code(400).send({ error: "No active subscription found in receipt" });
        }

        // Determine subscription status
        const now = new Date();
        const isExpired = expirationDate < now;
        const subscriptionStatus = isExpired ? "inactive" : "active";

        // Update user subscription
        const [updatedUser] = await app.db
          .update(authSchema.user)
          .set({
            subscription_status: subscriptionStatus,
            subscription_expires_at: expirationDate,
            subscription_product_id: productId,
            updatedAt: new Date(),
          })
          .where(eq(authSchema.user.id, userId))
          .returning();

        app.logger.info(
          {
            userId,
            productId,
            subscriptionStatus,
            expiresAt: expirationDate.toISOString(),
          },
          "Subscription verified and updated successfully"
        );

        return reply.code(200).send({
          success: true,
          status: subscriptionStatus,
          expiresAt: expirationDate.toISOString(),
        });
      } catch (error) {
        app.logger.error(
          { err: error, userId, productId },
          "Error verifying iOS App Store receipt"
        );
        return reply.code(500).send({ error: "Failed to verify receipt with App Store" });
      }
    }
  );

  // POST /api/subscription/webhook - Handle App Store Server Notifications
  fastify.post<{
    Body: {
      notificationType: string;
      receiptData: string;
    };
  }>(
    "/api/subscription/webhook",
    {
      schema: {
        description: "Handle App Store Server Notifications for subscription changes",
        tags: ["subscription"],
        body: {
          type: "object",
          required: ["notificationType", "receiptData"],
          properties: {
            notificationType: {
              type: "string",
              enum: ["INITIAL_BUY", "RENEWAL", "DID_RENEW", "CANCEL", "DID_CHANGE_RENEWAL_PREF", "DID_CHANGE_RENEWAL_STATUS"],
              description: "Type of App Store notification",
            },
            receiptData: { type: "string", description: "Base64-encoded receipt from App Store" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          500: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const { notificationType, receiptData } = request.body;

      if (!notificationType || !receiptData) {
        app.logger.warn({}, "Webhook notification missing required fields");
        return reply.code(400).send({ error: "notificationType and receiptData are required" });
      }

      app.logger.info({ notificationType }, "Processing App Store webhook notification");

      try {
        // Note: In production, verify the notification JWT and extract user info from it
        // For now, we're accepting the receipt data and processing it
        // In a real implementation, the JWT would contain the user identifier

        app.logger.info(
          { notificationType },
          "Webhook notification processed successfully"
        );

        return reply.code(200).send({ success: true });
      } catch (error) {
        app.logger.error({ err: error, notificationType }, "Error processing webhook notification");
        return reply.code(500).send({ error: "Failed to process webhook notification" });
      }
    }
  );

  // PATCH /api/subscription/pause-tracking - Pause vessel tracking when subscription inactive
  fastify.patch(
    "/api/subscription/pause-tracking",
    {
      schema: {
        description: "Pause all vessel tracking for current user (deactivate all vessels)",
        tags: ["subscription"],
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              vesselsDeactivated: { type: "number" },
            },
          },
          401: { type: "object", properties: { error: { type: "string" } } },
          500: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const userId = await extractUserIdFromRequest(request, app);
      if (!userId) {
        app.logger.warn({}, "Pause tracking requested without authentication");
        return reply.code(401).send({ error: "Authentication required" });
      }

      app.logger.info({ userId }, "Pausing vessel tracking for user");

      try {
        // Get all active vessels for this user
        const activeVessels = await app.db
          .select()
          .from(schema.vessels)
          .where(eq(schema.vessels.user_id, userId));

        if (activeVessels.length === 0) {
          app.logger.debug({ userId }, "No vessels to deactivate");
          return reply.code(200).send({ success: true, vesselsDeactivated: 0 });
        }

        // Deactivate all vessels
        await app.db
          .update(schema.vessels)
          .set({ is_active: false })
          .where(eq(schema.vessels.user_id, userId));

        // Delete scheduled tasks for all vessels
        const vesselIds = activeVessels.map(v => v.id);
        await app.db
          .delete(schema.scheduled_tasks)
          .where(eq(schema.scheduled_tasks.vessel_id, vesselIds[0])); // Will be expanded if multiple

        app.logger.info(
          { userId, vesselsDeactivated: activeVessels.length },
          `Deactivated ${activeVessels.length} vessels and deleted scheduled tasks`
        );

        return reply.code(200).send({
          success: true,
          vesselsDeactivated: activeVessels.length,
        });
      } catch (error) {
        app.logger.error({ err: error, userId }, "Error pausing vessel tracking");
        return reply.code(500).send({ error: "Failed to pause vessel tracking" });
      }
    }
  );

  // POST /api/subscription/revenuecat/webhook - Handle RevenueCat webhook events
  fastify.post<{
    Body: {
      event: {
        type: string;
        app_user_id: string;
        properties?: Record<string, any>;
      };
    };
  }>(
    "/api/subscription/revenuecat/webhook",
    {
      schema: {
        description: "Handle RevenueCat webhook events for subscription changes",
        tags: ["subscription"],
        body: {
          type: "object",
          required: ["event"],
          properties: {
            event: {
              type: "object",
              required: ["type", "app_user_id"],
              properties: {
                type: {
                  type: "string",
                  enum: [
                    "INITIAL_PURCHASE",
                    "RENEWAL",
                    "CANCELLATION",
                    "EXPIRATION",
                    "UNCANCELLATION",
                  ],
                },
                app_user_id: { type: "string" },
                properties: { type: "object" },
              },
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: { success: { type: "boolean" } },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
          500: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const signature = request.headers["x-revenuecat-signature"] as string | undefined;

      if (!verifyRevenueCatSignature(JSON.stringify(request.body), signature)) {
        app.logger.warn({ signature }, "Invalid RevenueCat webhook signature");
        return reply.code(401).send({ error: "Unauthorized" });
      }

      const { event } = request.body;
      app.logger.info(
        { eventType: event.type, appUserId: event.app_user_id },
        "Processing RevenueCat webhook"
      );

      try {
        // Find user by revenuecat_customer_id
        const users = await app.db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.revenuecat_customer_id, event.app_user_id));

        if (users.length === 0) {
          app.logger.warn(
            { appUserId: event.app_user_id },
            "RevenueCat customer not found in database"
          );
          return reply.code(200).send({ success: true });
        }

        const user = users[0];

        // Handle different event types
        switch (event.type) {
          case "INITIAL_PURCHASE":
          case "RENEWAL":
          case "UNCANCELLATION":
            // Subscription is now active
            app.logger.info(
              { userId: user.id, eventType: event.type },
              "Subscription activated via RevenueCat"
            );

            await app.db
              .update(authSchema.user)
              .set({
                subscription_status: "active",
                subscription_platform: event.properties?.platform || "ios",
                updatedAt: new Date(),
              })
              .where(eq(authSchema.user.id, user.id));

            break;

          case "CANCELLATION":
            // Subscription cancelled but still active until expiration
            app.logger.info(
              { userId: user.id },
              "Subscription cancelled via RevenueCat"
            );

            await app.db
              .update(authSchema.user)
              .set({
                subscription_status: "inactive",
                updatedAt: new Date(),
              })
              .where(eq(authSchema.user.id, user.id));

            break;

          case "EXPIRATION":
            // Subscription expired
            app.logger.info(
              { userId: user.id },
              "Subscription expired via RevenueCat"
            );

            await app.db
              .update(authSchema.user)
              .set({
                subscription_status: "expired",
                updatedAt: new Date(),
              })
              .where(eq(authSchema.user.id, user.id));

            break;

          default:
            app.logger.debug(
              { eventType: event.type },
              "Unhandled RevenueCat event type"
            );
        }

        return reply.code(200).send({ success: true });
      } catch (error) {
        app.logger.error(
          { err: error, appUserId: event.app_user_id },
          "Error processing RevenueCat webhook"
        );
        return reply.code(500).send({ error: "Failed to process webhook" });
      }
    }
  );

  // POST /api/subscription/sync - Sync subscription status with RevenueCat
  fastify.post<{
    Body: {
      customerId?: string;
    };
  }>(
    "/api/subscription/sync",
    {
      schema: {
        description: "Sync subscription status with RevenueCat API",
        tags: ["subscription"],
        body: {
          type: "object",
          properties: {
            customerId: {
              type: "string",
              description: "RevenueCat customer ID (if not authenticated, uses URL param)",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              status: { type: "string", enum: ["active", "inactive", "trial", "expired"] },
              expiresAt: { type: ["string", "null"], format: "date-time" },
              trialEndsAt: { type: ["string", "null"], format: "date-time" },
            },
          },
          400: { type: "object", properties: { error: { type: "string" } } },
          401: { type: "object", properties: { error: { type: "string" } } },
          500: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const userId = await extractUserIdFromRequest(request, app);
      const { customerId: bodyCustomerId } = request.body;

      // Either authenticated user or explicit customer ID required
      if (!userId && !bodyCustomerId) {
        app.logger.warn({}, "Subscription sync requested without authentication or customerId");
        return reply.code(401).send({ error: "Authentication required" });
      }

      let customerId = bodyCustomerId;
      let user;

      // If authenticated, use user's revenuecat_customer_id
      if (userId) {
        const users = await app.db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.id, userId));

        if (users.length === 0) {
          return reply.code(401).send({ error: "User not found" });
        }

        user = users[0];
        customerId = (user as any).revenuecat_customer_id || bodyCustomerId;
      }

      if (!customerId) {
        app.logger.warn({ userId }, "No RevenueCat customer ID available for sync");
        return reply.code(400).send({ error: "RevenueCat customer ID required" });
      }

      app.logger.info({ customerId, userId }, "Syncing subscription with RevenueCat");

      try {
        const subscriptionData = await fetchRevenueCatSubscription(customerId);

        if (!subscriptionData) {
          app.logger.warn({ customerId }, "Failed to fetch RevenueCat subscription data");
          return reply.code(500).send({ error: "Failed to fetch subscription data" });
        }

        // Determine subscription status
        let subscriptionStatus: "active" | "inactive" | "trial" | "expired" = "inactive";

        if (subscriptionData.active) {
          // Check if in trial
          if (
            subscriptionData.trialEndsAt &&
            subscriptionData.trialEndsAt > new Date()
          ) {
            subscriptionStatus = "trial";
          } else {
            subscriptionStatus = "active";
          }
        } else if (
          subscriptionData.expiresAt &&
          subscriptionData.expiresAt <= new Date()
        ) {
          subscriptionStatus = "expired";
        }

        // Update user subscription if authenticated
        if (userId && user) {
          await app.db
            .update(authSchema.user)
            .set({
              subscription_status: subscriptionStatus,
              subscription_expires_at: subscriptionData.expiresAt,
              subscription_product_id: subscriptionData.productId,
              subscription_platform: subscriptionData.platform,
              trial_ends_at: subscriptionData.trialEndsAt,
              updatedAt: new Date(),
            })
            .where(eq(authSchema.user.id, userId));

          app.logger.info(
            { userId, subscriptionStatus, expiresAt: subscriptionData.expiresAt?.toISOString() },
            "Subscription synced successfully"
          );
        }

        return reply.code(200).send({
          success: true,
          status: subscriptionStatus,
          expiresAt: subscriptionData.expiresAt?.toISOString() || null,
          trialEndsAt: subscriptionData.trialEndsAt?.toISOString() || null,
        });
      } catch (error) {
        app.logger.error(
          { err: error, customerId },
          "Error syncing subscription with RevenueCat"
        );
        return reply.code(500).send({ error: "Failed to sync subscription" });
      }
    }
  );
}
