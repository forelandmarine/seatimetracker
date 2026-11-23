/**
 * Sign-up flow (2.5.0 activation): confirm the new user's boat on AIS and say
 * how much it has been underway lately, with AT MOST ONE paid Datalastic call
 * per user before a trial starts.
 *
 * previewVessel: the picked MMSI (then any alternate MMSIs, then the IMO) is
 * asked for the last 10 complete days in ONE vessel_history call. A 404 (vessel
 * unknown) costs nothing, so trying the alternates is free; the first known
 * identifier is the only paid call. Positions go into the shared per-MMSI
 * history cache (ais_history_days / ais_history_positions), so a crewmate on
 * the same boat, a later preview and a later history import reuse them free.
 * Days already in the cache are not fetched again: a crewmate's sign-up can
 * cost nothing at all.
 *
 * This replaces the vessel_info confirm (POST /api/vessels/lookup/confirm) in
 * the sign-up path. Below CREDIT_FLOOR the history call is skipped and the MMSI
 * is checked with one vessel_info call instead (1 credit); the stat then comes
 * from the cache only.
 *
 * recentActivity: cache only, never calls Datalastic (locked Home, paywall).
 */

import { and, asc, eq, gte, lt } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { App } from '../index.js';
import {
  CREDIT_FLOOR,
  EMPTY_DAY_RECHECK_MS,
  apiKey,
  cachedDays,
  creditsRemaining,
  fetchAndStoreDetailed,
  isFresh,
  toFix,
  type HistoryMeta,
} from './historyImport.js';
import { fetchVesselInfo } from '../routes/ais.js';
import { addDays, underwayDays, utcDay } from '../utils/historyImport.js';
import {
  ACTIVITY_MAX_LAG_DAYS,
  ACTIVITY_WINDOW_DAYS,
  CallBudget,
  latestKnownWindow,
  missingRun,
  recentWindow,
  type RecentActivity,
} from '../utils/recentActivity.js';
import { countryName, isImo, isShipMmsi, vesselFromInfo } from '../utils/vesselLookup.js';

/** Paid calls a user without a trial or subscription may cause, per 24 h. */
const UNSUBSCRIBED_PAID_CALLS_PER_DAY = 1;
/** All users' paid preview calls per UTC day (protects the monthly allowance). */
const PREVIEW_DAILY_CAP = Number(process.env.ONBOARDING_PREVIEW_DAILY_CAP || 40);

const budget = new CallBudget(UNSUBSCRIBED_PAID_CALLS_PER_DAY, 24 * 3_600_000);
let daily = { day: '', count: 0 };

/** For tests: forget every user's spent budget and the daily count. */
export function resetPreviewBudgets(): void {
  (budget as any).calls = new Map();
  daily = { day: '', count: 0 };
}

export interface PreviewInput {
  mmsi: string;
  imo?: string | null;
  alt_mmsis?: string[] | null;
  /** The name the user picked; used when Datalastic sends none. */
  name?: string | null;
}

export interface PreviewVessel {
  mmsi: string;
  name?: string;
  imo?: string;
  flag?: string;
  flag_iso?: string;
  type?: string;
  last_position_at?: string;
  former_mmsi?: string;
}

export interface PreviewResult {
  status: 'live' | 'not_found' | 'unavailable';
  vessel: PreviewVessel | null;
  note: string | null;
  activity: RecentActivity | null;
  /** Where the answer came from: cache (free), history (one call), info (vessel_info, 1 credit), none. */
  source: 'cache' | 'history' | 'info' | 'none';
}

/** Activity for an MMSI from the cache alone. Null when no recent window is fully cached. */
export async function recentActivity(app: App, mmsi: string, today = utcDay(new Date())): Promise<RecentActivity | null> {
  const since = Date.now() - EMPTY_DAY_RECHECK_MS;
  const cache = await cachedDays(app, mmsi, addDays(today, -(ACTIVITY_WINDOW_DAYS + ACTIVITY_MAX_LAG_DAYS)), today);
  const known = new Map<string, number>();
  for (const [day, row] of cache) if (isFresh(row, since)) known.set(day, row.position_count);
  const w = latestKnownWindow(new Set(known.keys()), today);
  if (!w) return null;

  let withAis = 0;
  for (const [day, count] of known) if (day >= w.from && day < w.to && count > 0) withAis++;
  let underway = 0;
  let last: Date | null = null;
  if (withAis > 0) {
    const rows = await app.db
      .select()
      .from(schema.ais_history_positions)
      .where(and(
        eq(schema.ais_history_positions.mmsi, mmsi),
        gte(schema.ais_history_positions.position_time, new Date(`${w.from}T00:00:00Z`)),
        lt(schema.ais_history_positions.position_time, new Date(`${w.to}T00:00:00Z`)),
      ))
      .orderBy(asc(schema.ais_history_positions.position_time));
    underway = [...underwayDays(rows.map(toFix))].filter((d) => d >= w.from && d < w.to).length;
    last = rows.length ? rows[rows.length - 1].position_time : null;
  }
  return {
    from: w.from,
    to: w.to,
    window_days: ACTIVITY_WINDOW_DAYS,
    days_with_ais: withAis,
    days_underway: underway,
    last_position_at: last ? last.toISOString() : null,
  };
}

const clean = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** Only the fields we know, so the app's merge never blanks what the picked match already had. */
function vesselFrom(mmsi: string, meta: HistoryMeta | null, input: PreviewInput, last: string | null, formerMmsi: string | null): PreviewVessel {
  const v: PreviewVessel = { mmsi };
  const name = meta?.name || input.name?.trim();
  if (name) v.name = name;
  const imo = clean(meta?.imo) || clean(input.imo);
  if (isImo(imo)) v.imo = imo;
  if (meta?.country_iso) {
    v.flag_iso = meta.country_iso.toUpperCase();
    const flag = countryName(v.flag_iso);
    if (flag) v.flag = flag;
  }
  if (meta?.type) v.type = meta.type;
  if (last) v.last_position_at = last;
  if (formerMmsi) v.former_mmsi = formerMmsi;
  return v;
}

export async function previewVessel(
  app: App,
  userId: string,
  input: PreviewInput,
  opts: { subscribed: boolean; today?: string }
): Promise<PreviewResult> {
  const today = opts.today ?? utcDay(new Date());
  const mmsi = clean(input.mmsi);
  const imo = clean(input.imo);
  const alts = (input.alt_mmsis ?? []).map(clean).filter((m) => isShipMmsi(m) && m !== mmsi).slice(0, 3);
  const window = recentWindow(today);
  const since = Date.now() - EMPTY_DAY_RECHECK_MS;

  // 1. Cache first: a crewmate or an earlier check may already have these days.
  const cache = await cachedDays(app, mmsi, window.from, window.to);
  const known = new Set([...cache].filter(([, row]) => isFresh(row, since)).map(([d]) => d));
  const cachedPositions = [...cache.values()].some((r) => r.position_count > 0);
  const run = missingRun(window, known);

  const fromCache = async (): Promise<PreviewResult | null> => {
    if (!cachedPositions) return null;
    const activity = await recentActivity(app, mmsi, today);
    return { status: 'live', vessel: vesselFrom(mmsi, null, input, activity?.last_position_at ?? null, null), note: null, activity, source: 'cache' };
  };

  if (!run) {
    const hit = await fromCache();
    if (hit) return hit;
  }

  // 2. May we spend a call?
  const day = utcDay(new Date());
  if (daily.day !== day) daily = { day, count: 0 };
  const overBudget = !opts.subscribed && !budget.canSpend(userId);
  const overCap = daily.count >= PREVIEW_DAILY_CAP;
  if (!apiKey() || overBudget || overCap) {
    app.logger.info({ userId, mmsi, overBudget, overCap, keySet: !!apiKey() }, 'Vessel preview: no Datalastic call, cache only');
    return (await fromCache()) ?? { status: 'unavailable', vessel: null, note: null, activity: null, source: 'none' };
  }

  const remaining = await creditsRemaining();
  const belowFloor = remaining !== null && remaining < CREDIT_FLOOR;

  // 3a. Default (fewest credits, Dan 2026-11-23): one vessel_info call (1 credit)
  // to check the MMSI; the activity line then comes from the cache only. Also
  // used below the credit floor. VESSEL_PREVIEW_MODE=history switches to the
  // 10-day vessel_history check (about 10 to 20 credits) for the activity line.
  if (belowFloor || previewMode() !== 'history') {
    if (belowFloor) app.logger.warn({ remaining, floor: CREDIT_FLOOR, mmsi }, 'Vessel preview below credit floor: vessel_info only, stat from cache');
    const cached = await fromCache();
    if (cached) return cached;
    // The picked MMSI, then the ship's other MMSIs, then its IMO. Unknown ones
    // answer 404; the first one found is the live one.
    const targets: Array<{ mmsi: string } | { imo: string }> = [{ mmsi }, ...alts.map((m) => ({ mmsi: m }))];
    if (isImo(imo)) targets.push({ imo });
    let answered = false;
    for (const target of targets) {
      const info = await fetchVesselInfo(target, app.logger);
      if (!info) break;
      answered = true;
      if (info.status === 'not_found') continue;
      spend(userId);
      const liveMmsi = 'mmsi' in target ? target.mmsi : (isShipMmsi(clean(info.data?.mmsi)) ? clean(info.data?.mmsi) : mmsi);
      const former = liveMmsi !== mmsi ? mmsi : null;
      const v = vesselFromInfo(info.data, liveMmsi);
      const vessel = vesselFrom(liveMmsi, null, input, v?.last_position_at ?? null, former);
      if (v?.flag) vessel.flag = v.flag;
      if (v?.flag_iso) vessel.flag_iso = v.flag_iso;
      return { status: 'live', vessel, note: former ? `Formerly MMSI ${former}` : null, activity: await recentActivity(app, liveMmsi, today), source: 'info' };
    }
    if (!answered) return { status: 'unavailable', vessel: null, note: null, activity: null, source: 'none' };
    return { status: 'not_found', vessel: null, note: null, activity: null, source: 'info' };
  }

  // 3b. One vessel_history call for the missing days. The picked MMSI, then the
  // ship's other MMSIs, then its IMO: unknown ones answer 404 at no cost.
  const span = run ?? window;
  const tries = [mmsi, ...alts];
  try {
    for (let i = 0; i < tries.length; i++) {
      const last = i === tries.length - 1;
      const target = { mmsi: tries[i], imo: last && isImo(imo) ? imo : null };
      // An alternate MMSI's days are not in the cache we read above: fetch its whole window.
      const res = await fetchAndStoreDetailed(app, target, i === 0 ? span.from : window.from, i === 0 ? span.to : window.to, { storeUnknown: false });
      if (!res.known) continue;
      spend(userId);
      // Found by IMO: Datalastic names the MMSI it is on now, when it says.
      const liveMmsi = res.by === 'imo' && isShipMmsi(clean(res.meta?.mmsi)) ? clean(res.meta?.mmsi) : tries[i];
      const activity = await recentActivity(app, tries[i], today);
      const former = liveMmsi !== mmsi ? mmsi : null;
      app.logger.info({ userId, picked: mmsi, live: liveMmsi, by: res.by, positions: res.count, from: span.from, to: span.to }, 'Vessel preview confirmed on AIS history');
      return {
        status: 'live',
        vessel: vesselFrom(liveMmsi, res.meta, input, activity?.last_position_at ?? null, former),
        note: former ? `Formerly MMSI ${former}` : null,
        activity,
        source: 'history',
      };
    }
  } catch (err) {
    // The call may have been billed; count it so a retry can't spend another.
    spend(userId);
    app.logger.warn({ err, userId, mmsi }, 'Vessel preview: vessel_history failed');
    return (await fromCache()) ?? { status: 'unavailable', vessel: null, note: null, activity: null, source: 'none' };
  }
  app.logger.info({ userId, mmsi, alts: alts.length, imo: isImo(imo) }, 'Vessel preview: not on AIS');
  return { status: 'not_found', vessel: null, note: null, activity: null, source: 'history' };
}

/** 'info' (default): 1 vessel_info credit, stat from cache. 'history': one 10-day vessel_history call. */
export function previewMode(): 'info' | 'history' {
  return process.env.VESSEL_PREVIEW_MODE === 'history' ? 'history' : 'info';
}

function spend(userId: string) {
  budget.spend(userId);
  daily.count++;
}
