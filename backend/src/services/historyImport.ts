/**
 * AIS history import: Datalastic vessel_history fetching with a per-MMSI cache,
 * the pre-purchase availability check, purchase redemption (verified against
 * RevenueCat) and the background job that turns the track into pending entries.
 *
 * Datalastic facts (tested 2026-10-20): `from` is inclusive and `to` exclusive
 * (YYYY-MM-DD); positions come about every 30 minutes, newest first, with lat,
 * lon, speed, course, heading, destination and last_position_UTC (no nav
 * status). A day costs about 2 credits whether the vessel moved or not; empty
 * days are free. The credit allowance is a HARD cap that also stops live
 * tracking, so imports pause below CREDIT_FLOOR.
 */

import { and, asc, eq, gte, inArray, lt, or } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import * as authSchema from '../db/auth-schema.js';
import type { App } from '../index.js';
import { isSubscriptionActive } from '../utils/subscription.js';
import { classifyActivity, hasArrivedAtDestination, resolveDestinationPort, type PortPosition } from '../utils/voyageState.js';
import {
  HISTORY_PRODUCTS,
  LOOKBACK_MONTHS,
  MAX_RANGES,
  PRODUCT_MAX_DAYS,
  type CheckVerdict,
  type DayRange,
  type HistoryFix,
  type HistoryProductId,
  addDays,
  checkVerdict,
  dayRuns,
  dayToDate,
  daysBetween,
  detectPassages,
  monthsBefore,
  normaliseRanges,
  rangeDays,
  sampleDays,
  underwayDays,
  utcDay,
  withoutOverlaps,
} from '../utils/historyImport.js';

const HISTORY_URL = 'https://api.datalastic.com/api/v0/vessel_history';
const STAT_URL = 'https://api.datalastic.com/api/v0/stat';
const FETCH_TIMEOUT_MS = 30_000;

/** Days per vessel_history call. */
export const CHUNK_DAYS = 10;
/** Imports wait while fewer credits than this remain (30% of the 20,000 monthly allowance). */
export const CREDIT_FLOOR = 6_000;
/** A probe day that came back empty is asked again after this long. */
const EMPTY_DAY_RECHECK_MS = 7 * 24 * 3_600_000;
/** Probe points for the availability check, oldest first (months before tracking started). */
const PROBE_MONTHS = [12, 10, 8, 6, 4, 2, 1];
/** Days fetched for a pre-purchase check (about 2 credits each; cached days are free). */
export const CHECK_SAMPLE_DAYS = 8;
/** Pre-purchase checks per user per hour. */
const CHECKS_PER_HOUR = 10;
/** An import that keeps failing for this long is marked failed. */
const FAIL_AFTER_MS = 24 * 3_600_000;

const apiKey = () => process.env.DATALASTIC_API_KEY || '';

export class HistoryImportError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Datalastic
// ---------------------------------------------------------------------------

interface DatalasticPosition {
  lat: number;
  lon: number;
  speed?: number | null;
  course?: number | null;
  destination?: string | null;
  last_position_UTC?: string;
  last_position_epoch?: number;
}

async function fetchHistory(mmsi: string, from: string, to: string): Promise<DatalasticPosition[]> {
  const url = new URL(HISTORY_URL);
  url.searchParams.set('api-key', apiKey());
  url.searchParams.set('mmsi', mmsi);
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Datalastic vessel_history returned ${res.status}`);
  const body = (await res.json()) as any;
  return Array.isArray(body?.data?.positions) ? body.data.positions : [];
}

let creditCache: { value: number | null; at: number } | null = null;

/** Credits left this cycle (cached 5 minutes). Null if the stat call fails. */
export async function creditsRemaining(): Promise<number | null> {
  if (creditCache && Date.now() - creditCache.at < 5 * 60_000) return creditCache.value;
  let value: number | null = null;
  try {
    const url = new URL(STAT_URL);
    url.searchParams.set('api-key', apiKey());
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const body = (await res.json()) as any;
    const n = body?.data?.requests_remaining;
    value = typeof n === 'number' ? n : null;
  } catch {
    value = null;
  }
  creditCache = { value, at: Date.now() };
  return value;
}

/** Fetch [from, to) for an MMSI and store positions and per-day counts in the cache. */
async function fetchAndStore(app: App, mmsi: string, from: string, to: string): Promise<number> {
  const positions = await fetchHistory(mmsi, from, to);
  const rows = positions
    .map((p) => {
      const time = p.last_position_UTC ? new Date(p.last_position_UTC) : p.last_position_epoch ? new Date(p.last_position_epoch * 1000) : null;
      if (!time || isNaN(time.getTime()) || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
      return {
        mmsi,
        position_time: time,
        latitude: String(p.lat),
        longitude: String(p.lon),
        speed_knots: p.speed != null ? String(p.speed) : null,
        course: p.course != null ? String(p.course) : null,
        destination: p.destination || null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(utcDay(r.position_time), (counts.get(utcDay(r.position_time)) ?? 0) + 1);

  await app.db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 500) {
      await tx.insert(schema.ais_history_positions).values(rows.slice(i, i + 500)).onConflictDoNothing();
    }
    for (const day of daysBetween(from, to)) {
      await tx
        .insert(schema.ais_history_days)
        .values({ mmsi, day, position_count: counts.get(day) ?? 0 })
        .onConflictDoUpdate({
          target: [schema.ais_history_days.mmsi, schema.ais_history_days.day],
          set: { position_count: counts.get(day) ?? 0, fetched_at: new Date() },
        });
    }
  });
  app.logger.info({ mmsi, from, to, positions: rows.length }, 'Fetched AIS history');
  return rows.length;
}

/** Cached day rows for an MMSI within [from, to). */
async function cachedDays(app: App, mmsi: string, from: string, to: string) {
  const rows = await app.db
    .select()
    .from(schema.ais_history_days)
    .where(and(eq(schema.ais_history_days.mmsi, mmsi), gte(schema.ais_history_days.day, from), lt(schema.ais_history_days.day, to)));
  return new Map(rows.map((r) => [String(r.day), r]));
}

function isFresh(row: { position_count: number; fetched_at: Date } | undefined, since: number): boolean {
  if (!row) return false;
  return row.position_count > 0 || row.fetched_at.getTime() >= since;
}

// ---------------------------------------------------------------------------
// Vessel context
// ---------------------------------------------------------------------------

/** First day of live tracking for this vessel: the earlier of when it was added and its first AIS check. */
export async function trackingStartDay(app: App, vessel: typeof schema.vessels.$inferSelect): Promise<string> {
  const [first] = await app.db
    .select({ t: schema.ais_checks.check_time })
    .from(schema.ais_checks)
    .where(eq(schema.ais_checks.vessel_id, vessel.id))
    .orderBy(asc(schema.ais_checks.check_time))
    .limit(1);
  const added = vessel.created_at;
  const start = first?.t && first.t < added ? first.t : added;
  return utcDay(start);
}

async function ownedVessel(app: App, userId: string, vesselId: string) {
  const [vessel] = await app.db
    .select()
    .from(schema.vessels)
    .where(and(eq(schema.vessels.id, vesselId), eq(schema.vessels.user_id, userId)));
  if (!vessel) throw new HistoryImportError(404, 'Vessel not found');
  return vessel;
}

async function activeUser(app: App, userId: string) {
  const [user] = await app.db.select().from(authSchema.user).where(eq(authSchema.user.id, userId));
  if (!user) throw new HistoryImportError(401, 'Authentication required');
  return user;
}

// ---------------------------------------------------------------------------
// Availability (before purchase)
// ---------------------------------------------------------------------------

export interface Availability {
  available: boolean;
  earliest_day: string | null; // furthest-back probe day with positions
  tracking_start_day: string;
  can_purchase: boolean; // subscription or trial active
  range_from: string; // first day that can be picked
  max_ranges: number;
  products: { product_id: HistoryProductId; months: number; max_days: number }[];
  latest_import: ReturnType<typeof importSummary> | null;
}

export async function availability(app: App, userId: string, vesselId: string): Promise<Availability> {
  const user = await activeUser(app, userId);
  const vessel = await ownedVessel(app, userId, vesselId);
  const start = await trackingStartDay(app, vessel);
  const latest = await latestImport(app, userId, vesselId);

  const probeDays = PROBE_MONTHS.map((m) => monthsBefore(start, m));
  const cache = await cachedDays(app, vessel.mmsi, probeDays[0], start);
  const since = Date.now() - EMPTY_DAY_RECHECK_MS;

  // Positions anywhere already in the cache count (crewmates, earlier imports).
  let earliest: string | null = null;
  for (const [day, row] of [...cache.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (row.position_count > 0) { earliest = day; break; }
  }
  if (!earliest || earliest > probeDays[0]) {
    for (const day of probeDays) {
      if (earliest && day >= earliest) break;
      const row = cache.get(day);
      let count = isFresh(row, since) ? row!.position_count : await fetchAndStore(app, vessel.mmsi, day, addDays(day, 1));
      if (count > 0) { earliest = day; break; }
    }
  }

  // Users pick periods anywhere in the lookback; the price follows the total days.
  const products: Availability['products'] = earliest
    ? (Object.entries(HISTORY_PRODUCTS) as [HistoryProductId, number][]).map(([id, months]) => ({
        product_id: id,
        months,
        max_days: PRODUCT_MAX_DAYS[id],
      }))
    : [];

  return {
    available: products.length > 0,
    earliest_day: earliest,
    tracking_start_day: start,
    range_from: monthsBefore(start, LOOKBACK_MONTHS),
    max_ranges: MAX_RANGES,
    can_purchase: isSubscriptionActive(user.subscription_status ?? undefined, user.subscription_expires_at ?? null),
    products,
    latest_import: latest ? importSummary(latest) : null,
  };
}

// ---------------------------------------------------------------------------
// Check picked periods (before purchase, free to the user)
// ---------------------------------------------------------------------------

export interface RangeCheck {
  checked_days: number; // days we have positions or an empty result for
  days_with_ais: number;
  days_underway: number;
  verdict: CheckVerdict;
  days: { day: string; ais: boolean; underway: boolean }[];
}

const checkLog = new Map<string, number[]>();

/**
 * Sample the picked periods so the user can see whether buying is worthwhile:
 * every day already in the cache (free) plus up to CHECK_SAMPLE_DAYS fetched
 * days spread through the selection. Fetched days stay cached, so the import
 * does not pay for them again.
 */
export async function checkRanges(app: App, userId: string, vesselId: string, picked: DayRange[]): Promise<RangeCheck> {
  await activeUser(app, userId);
  const vessel = await ownedVessel(app, userId, vesselId);
  const start = await trackingStartDay(app, vessel);
  const norm = normaliseRanges(picked, { earliest: monthsBefore(start, LOOKBACK_MONTHS), trackingStart: start });
  if (norm.ok === false) throw new HistoryImportError(400, norm.error);

  const now = Date.now();
  const recent = (checkLog.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= CHECKS_PER_HOUR) throw new HistoryImportError(429, 'Too many checks. Please try again later.');
  checkLog.set(userId, [...recent, now]);

  const days = rangeDays(norm.ranges);
  const first = days[0];
  const end = addDays(days[days.length - 1], 1);
  const since = now - EMPTY_DAY_RECHECK_MS;
  let cache = await cachedDays(app, vessel.mmsi, first, end);

  const toFetch = sampleDays(days, CHECK_SAMPLE_DAYS).filter((d) => !isFresh(cache.get(d), since));
  if (toFetch.length) {
    const remaining = await creditsRemaining();
    if (remaining === null || remaining >= CREDIT_FLOOR) {
      for (const run of dayRuns(toFetch, CHUNK_DAYS)) await fetchAndStore(app, vessel.mmsi, run.from, run.to);
      cache = await cachedDays(app, vessel.mmsi, first, end);
    } else {
      app.logger.warn({ remaining, floor: CREDIT_FLOOR }, 'History check using cache only: Datalastic credits below floor');
    }
  }

  const wanted = new Set(days);
  const known = [...cache.entries()].filter(([d, row]) => wanted.has(d) && isFresh(row, since)).map(([d, row]) => ({ day: d, count: row.position_count }));
  const withData = known.filter((k) => k.count > 0).map((k) => k.day);

  let moving = new Set<string>();
  if (withData.length) {
    const rows = await app.db
      .select()
      .from(schema.ais_history_positions)
      .where(and(
        eq(schema.ais_history_positions.mmsi, vessel.mmsi),
        gte(schema.ais_history_positions.position_time, dayToDate(first)),
        lt(schema.ais_history_positions.position_time, dayToDate(end)),
      ))
      .orderBy(asc(schema.ais_history_positions.position_time));
    const dataDays = new Set(withData);
    moving = underwayDays(rows.filter((r) => dataDays.has(utcDay(r.position_time))).map(toFix));
  }

  const out = known
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .map((k) => ({ day: k.day, ais: k.count > 0, underway: moving.has(k.day) }));
  const underway = out.filter((d) => d.underway).length;
  return {
    checked_days: out.length,
    days_with_ais: withData.length,
    days_underway: underway,
    verdict: checkVerdict(out.length, withData.length, underway),
    days: out,
  };
}

function toFix(r: typeof schema.ais_history_positions.$inferSelect): HistoryFix {
  return {
    time: r.position_time,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    speed_knots: r.speed_knots != null ? Number(r.speed_knots) : null,
    destination: r.destination,
  };
}

// ---------------------------------------------------------------------------
// Redeem a purchase
// ---------------------------------------------------------------------------

interface RcPurchase {
  id: string;
  store_transaction_id?: string;
  purchase_date?: string;
  store?: string;
  is_sandbox?: boolean;
}

/** One-off purchases of a product on the user's RevenueCat customer (oldest first). */
async function revenueCatPurchases(userId: string, productId: string): Promise<RcPurchase[]> {
  const key = process.env.REVENUECAT_API_KEY || '';
  if (!key) throw new HistoryImportError(503, 'Purchases cannot be checked right now');
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new HistoryImportError(503, 'Purchases cannot be checked right now');
  const body = (await res.json()) as any;
  const list: RcPurchase[] = body?.subscriber?.non_subscriptions?.[productId] ?? [];
  return [...list].sort((a, b) => String(a.purchase_date).localeCompare(String(b.purchase_date)));
}

export async function redeem(app: App, params: {
  userId: string;
  vesselId: string;
  productId: HistoryProductId;
  transactionId?: string | null;
  ranges: DayRange[];
  platform?: string | null;
}) {
  const user = await activeUser(app, params.userId);
  if (!isSubscriptionActive(user.subscription_status ?? undefined, user.subscription_expires_at ?? null)) {
    throw new HistoryImportError(403, 'An active subscription or trial is needed');
  }
  const vessel = await ownedVessel(app, params.userId, params.vesselId);
  const start = await trackingStartDay(app, vessel);
  // Checked before RevenueCat so a bad selection costs nothing and the purchase stays unredeemed.
  const norm = normaliseRanges(params.ranges, { earliest: monthsBefore(start, LOOKBACK_MONTHS), trackingStart: start });
  if (norm.ok === false) throw new HistoryImportError(422, norm.error);
  if (norm.days > PRODUCT_MAX_DAYS[params.productId]) {
    throw new HistoryImportError(422, `This purchase covers up to ${PRODUCT_MAX_DAYS[params.productId]} days; ${norm.days} were picked`);
  }

  const purchases = await revenueCatPurchases(params.userId, params.productId);
  const used = purchases.length
    ? await app.db
        .select({ t: schema.history_imports.transaction_id })
        .from(schema.history_imports)
        .where(inArray(schema.history_imports.transaction_id, purchases.map((p) => p.id)))
    : [];

  // Same purchase sent twice (app retry): return the import it already made.
  const tx = params.transactionId;
  const match = tx ? purchases.find((p) => p.id === tx || p.store_transaction_id === tx) : undefined;
  if (match && used.some((u) => u.t === match.id)) {
    const [existing] = await app.db.select().from(schema.history_imports).where(eq(schema.history_imports.transaction_id, match.id));
    if (existing.user_id === params.userId && existing.vessel_id === params.vesselId) return existing;
    throw new HistoryImportError(409, 'This purchase has already been used');
  }
  const purchase = match ?? purchases.find((p) => !used.some((u) => u.t === p.id));
  if (!purchase) throw new HistoryImportError(402, 'Purchase not found');

  const months = HISTORY_PRODUCTS[params.productId];
  const ranges = norm.ranges;
  const window = { from: ranges[0].from, to: ranges[ranges.length - 1].to };

  const [created] = await app.db
    .insert(schema.history_imports)
    .values({
      user_id: params.userId,
      vessel_id: vessel.id,
      mmsi: vessel.mmsi,
      product_id: params.productId,
      months,
      transaction_id: purchase.id,
      store_transaction_id: purchase.store_transaction_id ?? null,
      platform: params.platform ?? null,
      is_sandbox: !!purchase.is_sandbox,
      window_from: window.from,
      window_to: window.to,
      ranges,
    })
    .returning();
  app.logger.info({ importId: created.id, userId: params.userId, vesselId: vessel.id, productId: params.productId, ranges, days: norm.days }, 'History import queued');
  return created;
}

/** Purchases this user has paid for but not yet redeemed (app crashed mid-way, etc). */
export async function unredeemed(app: App, userId: string) {
  const out: { product_id: HistoryProductId; transaction_id: string; purchase_date: string | null }[] = [];
  for (const productId of Object.keys(HISTORY_PRODUCTS) as HistoryProductId[]) {
    const purchases = await revenueCatPurchases(userId, productId);
    if (!purchases.length) continue;
    const used = await app.db
      .select({ t: schema.history_imports.transaction_id })
      .from(schema.history_imports)
      .where(inArray(schema.history_imports.transaction_id, purchases.map((p) => p.id)));
    for (const p of purchases) {
      if (!used.some((u) => u.t === p.id)) out.push({ product_id: productId, transaction_id: p.id, purchase_date: p.purchase_date ?? null });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export function importSummary(i: typeof schema.history_imports.$inferSelect) {
  return {
    id: i.id,
    vessel_id: i.vessel_id,
    product_id: i.product_id,
    months: i.months,
    window_from: String(i.window_from),
    window_to: String(i.window_to),
    ranges: importRanges(i),
    status: i.status,
    days_with_data: i.days_with_data,
    passages_created: i.passages_created,
    created_at: i.created_at,
    completed_at: i.completed_at,
  };
}

/** The periods an import covers (early imports stored only a window). */
export function importRanges(i: typeof schema.history_imports.$inferSelect): DayRange[] {
  return i.ranges?.length ? i.ranges : [{ from: String(i.window_from), to: String(i.window_to) }];
}

export async function latestImport(app: App, userId: string, vesselId: string) {
  const rows = await app.db
    .select()
    .from(schema.history_imports)
    .where(and(eq(schema.history_imports.user_id, userId), eq(schema.history_imports.vessel_id, vesselId)))
    .orderBy(asc(schema.history_imports.created_at));
  return rows[rows.length - 1] ?? null;
}

// ---------------------------------------------------------------------------
// Background job (called every scheduler iteration; does one API call at most)
// ---------------------------------------------------------------------------

export async function processHistoryImports(app: App): Promise<void> {
  const [job] = await app.db
    .select()
    .from(schema.history_imports)
    .where(or(eq(schema.history_imports.status, 'queued'), eq(schema.history_imports.status, 'running')))
    .orderBy(asc(schema.history_imports.created_at))
    .limit(1);
  if (!job) return;

  try {
    if (job.status === 'queued') {
      await app.db.update(schema.history_imports).set({ status: 'running', started_at: new Date() }).where(eq(schema.history_imports.id, job.id));
    }

    const days = rangeDays(importRanges(job));
    const wanted = new Set(days);
    const all = await cachedDays(app, job.mmsi, String(job.window_from), String(job.window_to));
    const cache = new Map([...all].filter(([d]) => wanted.has(d)));
    const since = job.created_at.getTime() - EMPTY_DAY_RECHECK_MS;
    const missing = days.filter((d) => !isFresh(cache.get(d), since));

    if (missing.length) {
      const remaining = await creditsRemaining();
      if (remaining !== null && remaining < CREDIT_FLOOR) {
        app.logger.warn({ importId: job.id, remaining, floor: CREDIT_FLOOR }, 'History import waiting: Datalastic credits below floor');
        return;
      }
      const run = dayRuns(missing, CHUNK_DAYS)[0];
      await fetchAndStore(app, job.mmsi, run.from, run.to);
      if (job.error) await app.db.update(schema.history_imports).set({ error: null }).where(eq(schema.history_imports.id, job.id));
      return; // next iteration continues
    }

    await buildEntries(app, job, cache);
  } catch (error: any) {
    const failed = job.started_at && Date.now() - job.started_at.getTime() > FAIL_AFTER_MS;
    app.logger.error({ err: error, importId: job.id, failed }, 'History import step failed');
    await app.db
      .update(schema.history_imports)
      .set({ error: String(error?.message ?? error).slice(0, 500), ...(failed ? { status: 'failed', completed_at: new Date() } : {}) })
      .where(eq(schema.history_imports.id, job.id));
  }
}

async function buildEntries(
  app: App,
  job: typeof schema.history_imports.$inferSelect,
  cache: Awaited<ReturnType<typeof cachedDays>>
) {
  const from = dayToDate(String(job.window_from));
  const to = dayToDate(String(job.window_to));
  const rows = await app.db
    .select()
    .from(schema.ais_history_positions)
    .where(and(
      eq(schema.ais_history_positions.mmsi, job.mmsi),
      gte(schema.ais_history_positions.position_time, from),
      lt(schema.ais_history_positions.position_time, to),
    ))
    .orderBy(asc(schema.ais_history_positions.position_time));

  // Only the days picked: the cache may hold days in between from crewmates or checks.
  const wanted = new Set(rangeDays(importRanges(job)));
  const fixes: HistoryFix[] = rows.filter((r) => wanted.has(utcDay(r.position_time))).map(toFix);

  // Resolve each broadcast destination once, for the arrival rule.
  const ports = new Map<string, PortPosition | null>();
  for (const d of new Set(fixes.map((f) => f.destination).filter((d): d is string => !!d))) {
    ports.set(d, await resolveDestinationPort(d, { logger: app.logger }));
  }
  const isAtDestination = (f: HistoryFix) =>
    hasArrivedAtDestination(classifyActivity(f.speed_knots, null), f.latitude, f.longitude, f.destination ? ports.get(f.destination) ?? null : null);

  const existing = await app.db
    .select({ start: schema.sea_time_entries.start_time, end: schema.sea_time_entries.end_time })
    .from(schema.sea_time_entries)
    .where(and(eq(schema.sea_time_entries.user_id, job.user_id), eq(schema.sea_time_entries.vessel_id, job.vessel_id)));
  const intervals = existing.map((e) => ({ start: e.start, end: e.end ?? new Date(e.start.getTime() + 24 * 3_600_000) }));

  const passages = withoutOverlaps(detectPassages(fixes, isAtDestination), intervals);
  const daysWithData = [...cache.values()].filter((r) => r.position_count > 0).length;

  await app.db.transaction(async (tx) => {
    if (passages.length) {
      await tx.insert(schema.sea_time_entries).values(passages.map((p) => ({
        user_id: job.user_id,
        vessel_id: job.vessel_id,
        start_time: p.start_time,
        end_time: p.end_time,
        duration_hours: String(p.duration_hours),
        start_latitude: String(Math.round(p.start_latitude * 1e6) / 1e6),
        start_longitude: String(Math.round(p.start_longitude * 1e6) / 1e6),
        end_latitude: String(Math.round(p.end_latitude * 1e6) / 1e6),
        end_longitude: String(Math.round(p.end_longitude * 1e6) / 1e6),
        status: 'pending',
        service_type: 'actual_sea_service',
        mca_compliant: p.duration_hours >= 4,
        distance_nm: String(p.distance_nm),
        is_stationary: false,
        notes: `Imported from AIS history: vessel moved ${p.distance_nm} nm over ${p.duration_hours} hours`,
      })));
    }
    await tx
      .update(schema.history_imports)
      .set({ status: 'done', passages_created: passages.length, days_with_data: daysWithData, completed_at: new Date(), error: null })
      .where(eq(schema.history_imports.id, job.id));
  });
  app.logger.info({ importId: job.id, passages: passages.length, daysWithData, fixes: fixes.length }, 'History import done');
}
