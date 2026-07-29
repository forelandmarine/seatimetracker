/**
 * Public profile sharing — verified sea time totals at a shareable URL.
 *
 * GET /public/profile/:slug → returns sanitized profile + sea time totals
 * POST /api/profile/public-slug → user enables public sharing and gets a slug
 *
 * Public response has NO sensitive fields (email, address, etc.) — only:
 *   name, department, total sea days, vessels (names only), member since
 */

import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import { countDistinctSeaDays } from "../utils/seaTime.js";
import crypto from "crypto";

function generateSlug(name: string): string {
  // Normalize the name to a URL-friendly slug, then add 4 random chars
  // for uniqueness even when names collide.
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30) || "captain";
  const suffix = crypto.randomBytes(2).toString("hex");
  return `${base}-${suffix}`;
}

export function register(app: App, fastify: FastifyInstance) {
  // GET /public/profile/:slug - Public-facing profile (no auth)
  fastify.get<{ Params: { slug: string } }>("/public/profile/:slug", {
    schema: {
      description: "Get a public sea time profile by slug",
      tags: ["public"],
      params: {
        type: "object",
        required: ["slug"],
        properties: { slug: { type: "string" } },
      },
      response: {
        200: { type: "object", additionalProperties: true },
        404: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (request, reply) => {
    const { slug } = request.params;

    const users = await app.db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.public_slug, slug));

    if (users.length === 0) {
      return reply.code(404).send({ error: "Profile not found" });
    }

    const user = users[0] as any;

    if (!user.public_profile_enabled) {
      return reply.code(404).send({ error: "Profile is private" });
    }

    // Aggregate sea time stats
    const entries = await app.db
      .select()
      .from(schema.sea_time_entries)
      .where(eq(schema.sea_time_entries.user_id, user.id));

    const confirmed = entries.filter((e: any) => e.status === "confirmed");
    // Distinct calendar days, so multi-day entries count fully and overlaps
    // are not double-counted.
    const totalDays = countDistinctSeaDays(confirmed as any);

    const vessels = await app.db
      .select()
      .from(schema.vessels)
      .where(eq(schema.vessels.user_id, user.id));

    const vesselGroups: Record<string, any[]> = {};
    confirmed.forEach((e: any) => {
      const v = vessels.find((vv: any) => vv.id === e.vessel_id);
      const name = v?.vessel_name || "Unknown";
      (vesselGroups[name] ||= []).push(e);
    });
    const vesselsByDays: Record<string, number> = {};
    for (const [name, group] of Object.entries(vesselGroups)) {
      vesselsByDays[name] = countDistinctSeaDays(group as any);
    }

    // Sanitized response — NEVER include email, address, tel etc.
    return reply.code(200).send({
      slug,
      name: user.name,
      department: user.department || null,
      total_sea_days: totalDays,
      total_entries: confirmed.length,
      vessels: Object.entries(vesselsByDays)
        .sort((a, b) => b[1] - a[1])
        .map(([vessel_name, days]) => ({ vessel_name, days })),
      member_since: user.createdAt
        ? new Date(user.createdAt).toISOString().slice(0, 10)
        : null,
      verified_by: "SeaTime Tracker by Foreland Marine",
    });
  });

  // POST /api/profile/public-slug - Enable public sharing and get a slug
  fastify.post<{ Body: { enabled: boolean } }>("/api/profile/public-slug", {
    schema: {
      description: "Enable or disable the user's public profile",
      tags: ["profile"],
      body: {
        type: "object",
        required: ["enabled"],
        properties: { enabled: { type: "boolean" } },
      },
      response: {
        200: {
          type: "object",
          properties: {
            enabled: { type: "boolean" },
            slug: { type: ["string", "null"] },
            url: { type: ["string", "null"] },
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

    const user = users[0] as any;
    const { enabled } = request.body;

    let slug: string | null = user.public_slug;

    if (enabled && !slug) {
      // Generate a slug
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateSlug(user.name || "captain");
        try {
          await app.db
            .update(authSchema.user)
            .set({ public_slug: candidate, public_profile_enabled: true } as any)
            .where(eq(authSchema.user.id, userId));
          slug = candidate;
          break;
        } catch {
          // collision, retry
        }
      }
    } else {
      await app.db
        .update(authSchema.user)
        .set({ public_profile_enabled: enabled } as any)
        .where(eq(authSchema.user.id, userId));
    }

    return reply.code(200).send({
      enabled,
      slug,
      url: enabled && slug
        ? `https://forelandmarine.com/tools/seatime-tracker/p/${slug}`
        : null,
    });
  });

  // POST /api/lightship/click - Track when a user taps a Lightship CTA
  fastify.post("/api/lightship/click", {
    schema: {
      description: "Track Lightship CTA click for the current user",
      tags: ["analytics"],
      response: {
        200: { type: "object", properties: { success: { type: "boolean" } } },
        401: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    await app.db
      .update(authSchema.user)
      .set({ lightship_interested_at: new Date() } as any)
      .where(eq(authSchema.user.id, userId));

    // Also flag in HubSpot if available
    const users = await app.db
      .select()
      .from(authSchema.user)
      .where(eq(authSchema.user.id, userId));

    if (users[0]?.email) {
      try {
        const { upsertHubspotContact } = await import("../utils/hubspot.js");
        await upsertHubspotContact(
          {
            email: users[0].email,
            firstName: users[0].name || undefined,
            source: "lightship_interest",
          },
          app.logger
        );
      } catch (err) {
        app.logger.warn({ err }, "[Lightship Click] HubSpot tag failed (non-critical)");
      }
    }

    app.logger.info({ userId }, "Lightship CTA clicked");
    return reply.code(200).send({ success: true });
  });
}
