/**
 * Add Vessel: find a vessel's MMSI from its name, for people who don't have
 * the MMSI to hand. The app shows the matches; the user picks one and it is
 * checked on AIS before the MMSI is used.
 *
 * GET  /api/vessels/lookup?name=&length=&unit=m|ft
 *   Searches our own vessel_index and the vessels table (fuzzy name match,
 *   former names, length ranks). If nothing matches by name, falls back to a
 *   web search (Claude Haiku 5.5, daily cap per user). If a length was typed
 *   and still nothing is within 10% of it, ONE Datalastic vessel_find by name
 *   and length window (a few credits at most; cached a day; daily caps per user
 *   and overall). See services/vesselLookupSearch.ts.
 *   Returns length_match (false = nothing near the typed length) and
 *   suggest_mmsi so the app can steer the user to the MMSI field.
 *   No unit = metres (the 2.4 app sends name and length only).
 *
 * POST /api/vessels/lookup/confirm { mmsi, imo?, alt_mmsis? }
 *   One Datalastic vessel_info call for the picked MMSI (1 credit). If that MMSI
 *   is unknown, tries the alternate MMSIs and then the IMO, and returns the live
 *   one with a "formerly MMSI x" note. Saves the result into vessel_index.
 */

import type { FastifyInstance } from "fastify";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import {
  cleanVesselName, normaliseVesselName, parseLength, vesselFromInfo, findLengthWindow,
  isShipMmsi, isImo, type LengthUnit, type RawCandidate, type ConfirmedVessel,
} from "../utils/vesselLookup.js";
import { searchOwnData, upsertVesselIndex, logLookupMiss } from "../services/vesselIndex.js";
import { searchVesselOnWeb, webSearchConfigured } from "../services/vesselWebSearch.js";
import { findVesselsByNameAndLength, vesselFindConfigured } from "../services/vesselFind.js";
import { runVesselLookup } from "../services/vesselLookupSearch.js";
import { fetchVesselInfo } from "./ais.js";

const SEARCH_DAILY_LIMIT = Number(process.env.VESSEL_LOOKUP_DAILY_LIMIT || 30);
const WEB_DAILY_LIMIT = Number(process.env.VESSEL_WEB_SEARCH_DAILY_LIMIT || 5);
const CONFIRM_DAILY_LIMIT = Number(process.env.VESSEL_CONFIRM_DAILY_LIMIT || 10);
const CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_CANDIDATES = 5;

const FIND_DAILY_LIMIT = Number(process.env.VESSEL_FIND_DAILY_LIMIT || 5);
// All users together: a ceiling on Datalastic vessel_find calls a day (each costs ~0-5 credits).
const FIND_GLOBAL_DAILY_LIMIT = Number(process.env.VESSEL_FIND_GLOBAL_DAILY_LIMIT || 200);

type CacheMap = Map<string, { at: number; rows: RawCandidate[] }>;
const webCache: CacheMap = new Map();
const findCache: CacheMap = new Map();
type Counter = Map<string, { day: string; count: number }>;
const searches: Counter = new Map();
const webSearches: Counter = new Map();
const confirms: Counter = new Map();
const finds: Counter = new Map();
const findsToday = { day: "", count: 0 };

function underGlobalFindLimit(): boolean {
  const day = new Date().toISOString().slice(0, 10);
  if (findsToday.day !== day) { findsToday.day = day; findsToday.count = 0; }
  if (findsToday.count >= FIND_GLOBAL_DAILY_LIMIT) return false;
  findsToday.count++;
  return true;
}

function underDailyLimit(counter: Counter, userId: string, limit: number): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const u = counter.get(userId);
  if (!u || u.day !== day) { counter.set(userId, { day, count: 1 }); return true; }
  if (u.count >= limit) return false;
  u.count++;
  return true;
}

function pruneCache(cache: CacheMap) {
  if (cache.size < 500) return;
  const now = Date.now();
  for (const [k, v] of cache) if (now - v.at > CACHE_MS) cache.delete(k);
}

const nullable = (type: string) => ({ type: [type, "null"] });

const candidateSchema = {
  type: "object",
  properties: {
    mmsi: { type: "string" },
    name: { type: "string" },
    imo: nullable("string"),
    flag: nullable("string"),
    flag_iso: nullable("string"),
    type: nullable("string"),
    app_type: nullable("string"),
    length_metres: nullable("number"),
    year_built: nullable("string"),
    call_sign: nullable("string"),
    former_names: { type: "array", items: { type: "string" } },
    alt_mmsis: { type: "array", items: { type: "string" } },
    source: { type: "string" },
  },
};

const errorSchema = { type: "object", properties: { error: { type: "string" } } };

const STALE_MS = 30 * 24 * 60 * 60 * 1000;
const isStale = (v: ConfirmedVessel) =>
  !!v.last_position_at && Date.now() - new Date(v.last_position_at).getTime() > STALE_MS;

export function register(app: App, fastify: FastifyInstance) {
  fastify.get<{ Querystring: { name?: string; length?: string; unit?: string } }>("/api/vessels/lookup", {
    schema: {
      description: "Find a vessel's MMSI from its name, with its length overall as a ranking hint (Requires authentication)",
      tags: ["vessels"],
      querystring: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" }, length: { type: "string" }, unit: { type: "string" } },
      },
      response: {
        200: {
          type: "object",
          properties: {
            query: {
              type: "object",
              properties: {
                name: { type: "string" },
                length: nullable("number"),
                unit: { type: "string" },
                length_metres: nullable("number"),
              },
            },
            source: { type: "string" }, // 'index' | 'web' | 'datalastic' | 'none'
            length_match: nullable("boolean"),
            suggest_mmsi: { type: "boolean" },
            candidates: { type: "array", items: candidateSchema },
          },
        },
        400: errorSchema, 401: errorSchema, 429: errorSchema,
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });

    const typedName = String(request.query.name || "").trim().slice(0, 80);
    const name = cleanVesselName(typedName);
    const query = normaliseVesselName(typedName);
    const unit: LengthUnit = String(request.query.unit || "").toLowerCase() === "ft" ? "ft" : "m";
    const rawLength = parseLength(request.query.length);
    // Length is only a hint: an odd number is ignored rather than refused.
    const length = rawLength != null && rawLength >= 1 && rawLength <= (unit === "ft" ? 1700 : 500) ? rawLength : null;
    const lengthMetres = length == null ? null : Math.round((unit === "ft" ? length * 0.3048 : length) * 10) / 10;

    if (query.replace(/[^A-Z0-9]/g, "").length < 3) {
      return reply.code(400).send({ error: "Enter at least 3 letters of the vessel's name." });
    }
    if (!underDailyLimit(searches, userId, SEARCH_DAILY_LIMIT)) {
      return reply.code(429).send({ error: "Too many searches today. Enter the MMSI instead, or try again tomorrow." });
    }
    const echo = { name, length, unit, length_metres: lengthMetres };

    const started = Date.now();
    const result = await runVesselLookup({ typedName, length, unit, lengthMetres, limit: MAX_CANDIDATES }, {
      searchOwn: () => searchOwnData(app.db as any, typedName, app.logger),
      searchWeb: async () => {
        const key = `${query}|${length ?? ""}|${unit}`;
        const hit = webCache.get(key);
        if (hit && Date.now() - hit.at < CACHE_MS) return { status: "yes", rows: hit.rows, fresh: false };
        if (!webSearchConfigured()) return { status: "off", rows: [], fresh: false };
        if (!underDailyLimit(webSearches, userId, WEB_DAILY_LIMIT)) return { status: "capped", rows: [], fresh: false };
        const t = Date.now();
        const rows = await searchVesselOnWeb(name, length, unit, app.logger);
        pruneCache(webCache);
        webCache.set(key, { at: Date.now(), rows });
        app.logger.info({ userId, name, length, unit, found: rows.length, ms: Date.now() - t }, "Vessel lookup (web)");
        return { status: "yes", rows, fresh: true };
      },
      findByLength: async () => {
        // At most one Datalastic call per search; cached a day, empty answers included.
        const w = findLengthWindow(lengthMetres!);
        const key = `${name}|${w.min}|${w.max}`;
        const hit = findCache.get(key);
        if (hit && Date.now() - hit.at < CACHE_MS) return { status: "cached", rows: hit.rows };
        if (!vesselFindConfigured()) return { status: "off", rows: [] };
        if (!underDailyLimit(finds, userId, FIND_DAILY_LIMIT) || !underGlobalFindLimit()) return { status: "capped", rows: [] };
        const res = await findVesselsByNameAndLength(name, lengthMetres!, app.logger);
        if (res.status !== "ok") return { status: res.status, rows: [] };
        pruneCache(findCache);
        findCache.set(key, { at: Date.now(), rows: res.rows });
        app.logger.info({ userId, name, lengthMetres, window: res.window, found: res.rows.length }, "Vessel lookup (datalastic length fallback)");
        return { status: "yes", rows: res.rows };
      },
      // vessel_find rows are Datalastic's registry, not an AIS check: saved as datalastic, not confirmed.
      save: (row, source) => upsertVesselIndex(app.db as any, row, source, app.logger, { confirmed: false }),
    });

    const { candidates, source, length_match } = result;
    app.logger.info({
      userId, name, length, unit, rows: result.ownRows, shown: candidates.length, source,
      length_match, web: result.web, find: result.find, ms: Date.now() - started,
    }, `Vessel lookup (${source})`);
    if (!candidates.length || length_match === false) {
      await logLookupMiss(app.db as any, { userId, name: typedName, length, unit, webSearched: result.web }, app.logger);
    }
    return reply.send({ query: echo, source, length_match, suggest_mmsi: !candidates.length || length_match === false, candidates });
  });

  fastify.post<{ Body: { mmsi?: string; imo?: string | null; alt_mmsis?: string[] | null } }>("/api/vessels/lookup/confirm", {
    schema: {
      description: "Check a picked lookup match on AIS (one Datalastic call) and return its details (Requires authentication)",
      tags: ["vessels"],
      body: {
        type: "object",
        required: ["mmsi"],
        properties: {
          mmsi: { type: "string" },
          imo: nullable("string"),
          alt_mmsis: { type: ["array", "null"], items: { type: "string" } },
        },
      },
      response: {
        200: {
          type: "object",
          properties: {
            // 'live' = found on AIS; 'not_found' = no vessel on that MMSI (or its alternates);
            // 'unavailable' = AIS could not be checked just now.
            status: { type: "string" },
            vessel: {
              type: ["object", "null"],
              properties: {
                ...candidateSchema.properties,
                last_position_at: nullable("string"),
                area: nullable("string"),
                former_mmsi: nullable("string"),
              },
            },
            note: nullable("string"),
          },
        },
        400: errorSchema, 401: errorSchema, 429: errorSchema,
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });

    const mmsi = String(request.body.mmsi || "").replace(/\D/g, "");
    if (!isShipMmsi(mmsi)) return reply.code(400).send({ error: "MMSI must be 9 digits." });
    const imo = String(request.body.imo || "").replace(/\D/g, "");
    const alts = (Array.isArray(request.body.alt_mmsis) ? request.body.alt_mmsis : [])
      .map((m) => String(m).replace(/\D/g, ""))
      .filter((m) => isShipMmsi(m) && m !== mmsi)
      .slice(0, 3);

    if (!underDailyLimit(confirms, userId, CONFIRM_DAILY_LIMIT)) {
      return reply.code(429).send({ error: "Too many AIS checks today. Enter the MMSI instead, or try again tomorrow." });
    }

    // The picked MMSI first, then the same ship's other MMSIs, then its IMO.
    const tries: ({ mmsi: string } | { imo: string })[] = [{ mmsi }, ...alts.map((m) => ({ mmsi: m })), ...(isImo(imo) ? [{ imo }] : [])];
    let unavailable = false;
    let picked: ConfirmedVessel | null = null;
    let stale: ConfirmedVessel | null = null;
    let calls = 0;
    for (let i = 0; i < tries.length; i++) {
      const by = tries[i];
      calls++;
      const result = await fetchVesselInfo(by, app.logger);
      if (!result) { unavailable = true; break; }
      if (result.status === "not_found") continue;
      const vessel = vesselFromInfo(result.data, "mmsi" in by ? by.mmsi : "");
      if (!vessel) continue;
      // An old MMSI can still have a record. If AIS hasn't heard from it for a month
      // and the ship has another MMSI or an IMO to try, try those before settling on it.
      if (isStale(vessel) && i < tries.length - 1) { stale ??= vessel; continue; }
      picked = vessel;
      break;
    }
    picked ??= stale;
    if (picked) {
      if (picked.mmsi !== mmsi) picked.former_mmsi = mmsi;
      await upsertVesselIndex(app.db as any, { ...picked, length_m: picked.length_metres, source: "datalastic" }, "datalastic", app.logger);
      const note = picked.former_mmsi ? `Formerly MMSI ${picked.former_mmsi}` : null;
      app.logger.info({ userId, picked: mmsi, live: picked.mmsi, calls }, "Vessel lookup confirmed");
      return reply.send({ status: "live", vessel: picked, note });
    }
    app.logger.info({ userId, mmsi, unavailable }, unavailable ? "Vessel confirm: AIS unavailable" : "Vessel confirm: not on AIS");
    return reply.send({ status: unavailable ? "unavailable" : "not_found", vessel: null, note: null });
  });
}
