/**
 * POST /api/events - anonymous first-run funnel events from the app, so sign-up
 * drop-off can be measured on both stores (there was no data before sign-in).
 * No auth, no user id, no IP stored. Only known event names are kept.
 */

import type { FastifyInstance } from "fastify";
import * as schema from "../db/schema.js";
import type { App } from "../index.js";

export const APP_EVENTS = new Set([
  "onboarding_shown",   // first launch, intro slides on screen
  "onboarding_done",    // tapped Get started or Skip
  "auth_shown",         // account screen on screen
  "auth_mode",          // switched between create account and sign in (detail: signup | signin)
  "auth_failed",        // detail: signin | signup_exists | apple | network
  "account_created",    // detail: email | apple
  "signed_in",          // detail: email | apple | biometric
  "vessel_lookup",      // detail: number of matches (0-5) or error
  "vessel_confirmed",   // picked a lookup match
  "vessel_lookup_web",  // lookup fell back to web search (detail: number of matches)
  "vessel_check",       // AIS check of a picked match (detail: live | not_found | unavailable | error)
  "vessel_renamed_mail", // tapped My vessel was renamed on the no-results pop-up
  "vessel_added",       // detail: lookup | manual
  "history_offer_shown", // AIS history import offered (detail: home | profile)
  "history_opened",     // history import screen opened (detail: entry point)
  "history_purchased",  // detail: <entry point>:<6m|12m>
]);

const perIp = new Map<string, { at: number; n: number }>();
function allowed(ip: string): boolean {
  const now = Date.now();
  const e = perIp.get(ip);
  if (!e || now - e.at > 60_000) { perIp.set(ip, { at: now, n: 1 }); return true; }
  return ++e.n <= 60;
}

const clip = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

export function register(app: App, fastify: FastifyInstance) {
  fastify.post<{ Body: { event?: string; install_id?: string; platform?: string; app_version?: string; detail?: string } }>("/api/events", {
    schema: {
      description: "Record an anonymous app funnel event",
      tags: ["events"],
      body: {
        type: "object",
        required: ["event", "install_id"],
        properties: {
          event: { type: "string" },
          install_id: { type: "string" },
          platform: { type: "string" },
          app_version: { type: "string" },
          detail: { type: "string" },
        },
      },
    },
  }, async (request, reply) => {
    const b = request.body || {};
    if (!allowed(request.ip) || !b.event || !APP_EVENTS.has(b.event)) return reply.code(204).send();
    const install_id = clip(b.install_id, 64);
    if (!install_id) return reply.code(204).send();
    app.db.insert(schema.app_events).values({
      event: b.event,
      install_id,
      platform: clip(b.platform, 16),
      app_version: clip(b.app_version, 32),
      detail: clip(b.detail, 40),
    }).catch((err: unknown) => app.logger.warn({ err, event: b.event }, "App event not stored"));
    return reply.code(204).send();
  });
}
