/**
 * GET /api/vessels/lookup?name=&length= - find a vessel's MMSI from its name
 * and length overall (Datalastic vessel_find). The app shows the matches and
 * the user must confirm one before the MMSI is used.
 *
 * Datalastic charges 1 credit per vessel returned, so the length filter is
 * required, results are cached for a day and each user gets a daily limit.
 */

import type { FastifyInstance } from "fastify";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import { cleanVesselName, lengthWindow, rankCandidates, type VesselCandidate } from "../utils/vesselLookup.js";

const FIND_URL = "https://api.datalastic.com/api/v0/vessel_find";
const DAILY_LIMIT = Number(process.env.VESSEL_LOOKUP_DAILY_LIMIT || 15);
const CACHE_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 10_000;

const cache = new Map<string, { at: number; candidates: VesselCandidate[] }>();
const usage = new Map<string, { day: string; count: number }>();

function underDailyLimit(userId: string): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const u = usage.get(userId);
  if (!u || u.day !== day) { usage.set(userId, { day, count: 1 }); return true; }
  if (u.count >= DAILY_LIMIT) return false;
  u.count++;
  return true;
}

export function register(app: App, fastify: FastifyInstance) {
  fastify.get<{ Querystring: { name?: string; length?: string } }>("/api/vessels/lookup", {
    schema: {
      description: "Find a vessel's MMSI from its name and length overall (Requires authentication)",
      tags: ["vessels"],
      querystring: {
        type: "object",
        required: ["name", "length"],
        properties: { name: { type: "string" }, length: { type: "string" } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });

    const name = cleanVesselName(request.query.name || "");
    const length = Number(String(request.query.length || "").replace(",", "."));
    // Datalastic charges per row returned, so very short names that match hundreds of vessels are refused.
    if (name.length < 3) return reply.code(400).send({ error: "Please enter at least 3 letters of the vessel's name." });
    if (!Number.isFinite(length) || length < 2 || length > 500) {
      return reply.code(400).send({ error: "Please enter the length overall in metres." });
    }

    const { min, max } = lengthWindow(length);
    const key = `${name}|${length}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      return reply.send({ query: { name, length }, candidates: hit.candidates });
    }

    if (!underDailyLimit(userId)) {
      return reply.code(429).send({ error: "Too many searches today. Please enter the MMSI instead, or try again tomorrow." });
    }
    const apiKey = process.env.DATALASTIC_API_KEY || "";
    if (!apiKey) return reply.code(503).send({ error: "Vessel search is not available right now. Please enter the MMSI." });

    const params = new URLSearchParams({ "api-key": apiKey, name, length_min: String(min), length_max: String(max) });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${FIND_URL}?${params}`, { signal: controller.signal });
      if (!res.ok) {
        app.logger.warn({ userId, name, length, status: res.status }, "Vessel lookup failed");
        return reply.code(502).send({ error: "Vessel search is not available right now. Please enter the MMSI." });
      }
      const body: any = await res.json();
      const rows: any[] = Array.isArray(body?.data) ? body.data : [];
      const candidates = rankCandidates(rows, name, length);
      cache.set(key, { at: Date.now(), candidates });
      app.logger.info({ userId, name, length, results: rows.length, shown: candidates.length }, "Vessel lookup");
      return reply.send({ query: { name, length }, candidates });
    } catch (err) {
      app.logger.warn({ err, userId, name, length }, "Vessel lookup error");
      return reply.code(502).send({ error: "Vessel search is not available right now. Please enter the MMSI." });
    } finally {
      clearTimeout(timer);
    }
  });
}
