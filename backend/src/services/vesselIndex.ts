/**
 * Vessel lookup: database side. Searches our own vessel_index plus the vessels
 * table (every vessel users have added), saves web and Datalastic results into
 * the index, and logs searches that found nothing.
 *
 * Prod runs SKIP_MIGRATIONS=true and 2026-11-11_vessel_index.sql may not be
 * applied yet, so every call here copes with a missing table or a missing
 * pg_trgm extension: it logs a warning once and carries on without it.
 */

import { sql, type SQL } from "drizzle-orm";
import {
  cleanVesselName, normaliseVesselName, isShipMmsi, isImo,
  type RawCandidate, type CandidateSource,
} from "../utils/vesselLookup.js";

type Db = { execute: (q: SQL) => Promise<any> };
type Logger = { warn: (o: any, m?: string) => void };

const UNDEFINED_TABLE = '42P01';
const UNDEFINED_FUNCTION = '42883';
const UNDEFINED_OBJECT = '42704';

const errCode = (err: any): string | undefined => err?.code ?? err?.cause?.code;
const rowsOf = (res: any): any[] => (Array.isArray(res) ? res : res?.rows ?? []);

// Learnt at run time, so a missing table or extension is only warned about once.
let indexMissing = false;
let missesMissing = false;
let trgmAvailable = true;

/** For tests. */
export function resetVesselIndexState() {
  indexMissing = false;
  missesMissing = false;
  trgmAvailable = true;
}

function noteMissingIndex(err: any, logger: Logger): boolean {
  if (errCode(err) !== UNDEFINED_TABLE) return false;
  if (!indexMissing) logger.warn({}, 'vessel_index table missing: apply 2026-11-11_vessel_index.sql. Lookup continues without it.');
  indexMissing = true;
  return true;
}

function noteMissingTrgm(err: any, logger: Logger): boolean {
  const code = errCode(err);
  if (code !== UNDEFINED_FUNCTION && code !== UNDEFINED_OBJECT) return false;
  if (trgmAvailable) logger.warn({}, 'pg_trgm not available: vessel lookup falls back to ILIKE matching.');
  trgmAvailable = false;
  return true;
}

const ROMAN_BACK: Record<string, string> = {
  '2': 'II', '3': 'III', '4': 'IV', '5': 'V', '6': 'VI', '7': 'VII', '8': 'VIII', '9': 'IX', '10': 'X',
};

/** Spellings to try with LIKE against names that are not normalised (the vessels table). */
export function likeVariants(raw: string): string[] {
  const cleaned = cleanVesselName(raw).replace(/[%_\\]/g, '');
  const norm = normaliseVesselName(raw);
  const roman = norm.split(' ').map((w) => ROMAN_BACK[w] ?? w).join(' ');
  return Array.from(new Set([cleaned, norm, roman].filter((v) => v.length >= 2)));
}

function textArray(values: string[]): SQL {
  return values.length ? sql`ARRAY[${sql.join(values.map((v) => sql`${v}`), sql`, `)}]::text[]` : sql`'{}'::text[]`;
}

const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v: unknown): string | null => (v == null || String(v).trim() === '' ? null : String(v).trim());

async function searchIndexTable(db: Db, query: string, logger: Logger): Promise<RawCandidate[]> {
  if (indexMissing) return [];
  const prefix = `${query}%`;
  const contains = `%${query}%`;
  const run = (useTrgm: boolean) => db.execute(sql`
    SELECT mmsi, imo, name, call_sign, flag_iso, flag, type, length_m, year_built, former_names, source, last_confirmed_at
    FROM vessel_index
    WHERE name_norm LIKE ${prefix}
       OR name_norm LIKE ${contains}
       OR EXISTS (SELECT 1 FROM unnest(former_names) f WHERE upper(f) LIKE ${contains})
       ${useTrgm ? sql`OR similarity(name_norm, ${query}) > 0.3` : sql``}
    ORDER BY ${useTrgm ? sql`similarity(name_norm, ${query}) DESC,` : sql``} (name_norm = ${query}) DESC, updated_at DESC
    LIMIT 40
  `);
  try {
    let res;
    try {
      res = await run(trgmAvailable);
    } catch (err) {
      if (!trgmAvailable || !noteMissingTrgm(err, logger)) throw err;
      res = await run(false);
    }
    return rowsOf(res).map((r) => ({
      mmsi: String(r.mmsi),
      name: String(r.name),
      imo: str(r.imo),
      call_sign: str(r.call_sign),
      flag_iso: str(r.flag_iso),
      flag: str(r.flag),
      type: str(r.type),
      length_m: num(r.length_m),
      year_built: str(r.year_built),
      former_names: Array.isArray(r.former_names) ? r.former_names : [],
      source: (['vessels', 'web', 'datalastic'].includes(r.source) ? r.source : 'web') as CandidateSource,
      last_confirmed_at: r.last_confirmed_at ?? null,
    }));
  } catch (err) {
    if (!noteMissingIndex(err, logger)) logger.warn({ err }, 'vessel_index search failed');
    return [];
  }
}

async function searchVesselsTable(db: Db, raw: string, query: string, logger: Logger): Promise<RawCandidate[]> {
  const patterns = likeVariants(raw).map((v) => `%${v}%`);
  if (!patterns.length) return [];
  const likeAny = (col: SQL) => sql.join(patterns.map((p) => sql`upper(${col}) LIKE ${p}`), sql` OR `);
  const run = (useTrgm: boolean) => db.execute(sql`
    SELECT DISTINCT ON (mmsi) mmsi, vessel_name, ais_name, imo_number, callsign, flag, type, length_metres
    FROM vessels
    WHERE mmsi ~ '^[0-9]{9}$'
      AND (${likeAny(sql`vessel_name`)} OR ${likeAny(sql`ais_name`)}
        ${useTrgm ? sql`OR similarity(upper(vessel_name), ${query}) > 0.35` : sql``})
    ORDER BY mmsi, (ais_name IS NOT NULL) DESC, (imo_number IS NOT NULL) DESC
    LIMIT 40
  `);
  try {
    let res;
    try {
      res = await run(trgmAvailable);
    } catch (err) {
      if (!trgmAvailable || !noteMissingTrgm(err, logger)) throw err;
      res = await run(false);
    }
    return rowsOf(res).map((r) => {
      const imo = String(r.imo_number ?? '').replace(/\D/g, '');
      return {
        mmsi: String(r.mmsi),
        // The AIS name when we have it: the user's own spelling may carry "M/Y" etc.
        name: cleanVesselName(String(r.ais_name || r.vessel_name || '')),
        imo: isImo(imo) ? imo : null,
        call_sign: str(r.callsign),
        flag: str(r.flag),
        type: str(r.type),
        length_m: num(r.length_metres),
        source: 'vessels' as const,
      };
    });
  } catch (err) {
    logger.warn({ err }, 'vessels table search failed');
    return [];
  }
}

/** Our own data only: vessel_index and the vessels table, in parallel. Never calls Datalastic. */
export async function searchOwnData(db: Db, raw: string, logger: Logger): Promise<RawCandidate[]> {
  const query = normaliseVesselName(raw);
  if (query.length < 2) return [];
  const [indexRows, vesselRows] = await Promise.all([
    searchIndexTable(db, query, logger),
    searchVesselsTable(db, raw, query, logger),
  ]);
  return [...indexRows, ...vesselRows];
}

/**
 * Save a vessel into the index. 'web' rows only fill gaps and add former names,
 * never overwrite what a user's vessel or Datalastic told us. 'datalastic' rows
 * overwrite and mark the row confirmed; an old name is kept as a former name.
 * 'vessels' rows (seed script) only fill gaps. Returns false if not saved.
 */
export async function upsertVesselIndex(db: Db, row: RawCandidate, source: CandidateSource, logger: Logger): Promise<boolean> {
  if (indexMissing) return false;
  const mmsi = String(row.mmsi || '').replace(/\D/g, '');
  const name = cleanVesselName(row.name || '');
  if (!isShipMmsi(mmsi) || !name) return false;
  const imo = row.imo && isImo(String(row.imo)) ? String(row.imo) : null;
  const former = Array.from(new Set((row.former_names || []).map((f) => cleanVesselName(f)).filter((f) => f && f !== name))).slice(0, 20);
  const confirmed = source === 'datalastic';

  const onConflict = source === 'datalastic'
    ? sql`
      name = EXCLUDED.name,
      name_norm = EXCLUDED.name_norm,
      imo = COALESCE(EXCLUDED.imo, vessel_index.imo),
      call_sign = COALESCE(EXCLUDED.call_sign, vessel_index.call_sign),
      flag_iso = COALESCE(EXCLUDED.flag_iso, vessel_index.flag_iso),
      flag = COALESCE(EXCLUDED.flag, vessel_index.flag),
      type = COALESCE(EXCLUDED.type, vessel_index.type),
      length_m = COALESCE(EXCLUDED.length_m, vessel_index.length_m),
      year_built = COALESCE(EXCLUDED.year_built, vessel_index.year_built),
      former_names = ARRAY(
        SELECT DISTINCT f FROM unnest(
          vessel_index.former_names || EXCLUDED.former_names ||
          CASE WHEN vessel_index.name <> EXCLUDED.name THEN ARRAY[vessel_index.name] ELSE '{}'::text[] END
        ) AS f WHERE f <> EXCLUDED.name
      ),
      source = 'datalastic',
      last_confirmed_at = now(),
      updated_at = now()`
    : sql`
      name = CASE WHEN vessel_index.source = 'web' AND ${source} = 'vessels' THEN EXCLUDED.name ELSE vessel_index.name END,
      name_norm = CASE WHEN vessel_index.source = 'web' AND ${source} = 'vessels' THEN EXCLUDED.name_norm ELSE vessel_index.name_norm END,
      imo = COALESCE(vessel_index.imo, EXCLUDED.imo),
      call_sign = COALESCE(vessel_index.call_sign, EXCLUDED.call_sign),
      flag_iso = COALESCE(vessel_index.flag_iso, EXCLUDED.flag_iso),
      flag = COALESCE(vessel_index.flag, EXCLUDED.flag),
      type = COALESCE(vessel_index.type, EXCLUDED.type),
      length_m = COALESCE(vessel_index.length_m, EXCLUDED.length_m),
      year_built = COALESCE(vessel_index.year_built, EXCLUDED.year_built),
      former_names = ARRAY(
        SELECT DISTINCT f FROM unnest(vessel_index.former_names || EXCLUDED.former_names) AS f WHERE f <> vessel_index.name
      ),
      source_url = COALESCE(vessel_index.source_url, EXCLUDED.source_url),
      updated_at = now()`;

  try {
    await db.execute(sql`
      INSERT INTO vessel_index (mmsi, imo, name, name_norm, call_sign, flag_iso, flag, type, length_m, year_built,
                                former_names, source, source_url, last_confirmed_at, updated_at)
      VALUES (${mmsi}, ${imo}, ${name}, ${normaliseVesselName(name)}, ${str(row.call_sign)}, ${str(row.flag_iso)?.toUpperCase() ?? null},
              ${str(row.flag)}, ${str(row.type)}, ${num(row.length_m)}, ${str(row.year_built)},
              ${textArray(former)}, ${source}, ${str(row.source_url)}, ${confirmed ? sql`now()` : sql`NULL`}, now())
      ON CONFLICT (mmsi) DO UPDATE SET ${onConflict}
    `);
    return true;
  } catch (err) {
    if (!noteMissingIndex(err, logger)) logger.warn({ err, mmsi, source }, 'vessel_index save failed');
    return false;
  }
}

/** Log a search that found nothing. Never throws. */
export async function logLookupMiss(
  db: Db,
  miss: { userId: string; name: string; length: number | null; unit: string; webSearched: 'yes' | 'no' | 'capped' | 'off' },
  logger: Logger,
): Promise<void> {
  if (missesMissing) return;
  try {
    await db.execute(sql`
      INSERT INTO vessel_lookup_misses (user_id, name, length, unit, web_searched)
      VALUES (${miss.userId}, ${miss.name.slice(0, 120)}, ${miss.length}, ${miss.unit}, ${miss.webSearched})
    `);
  } catch (err) {
    if (errCode(err) === UNDEFINED_TABLE) {
      missesMissing = true;
      logger.warn({}, 'vessel_lookup_misses table missing: apply 2026-11-11_vessel_index.sql. Misses are only logged to the app log.');
    } else {
      logger.warn({ err }, 'vessel_lookup_misses insert failed');
    }
  }
}
