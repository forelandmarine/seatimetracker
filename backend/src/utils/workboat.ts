/**
 * Service toward Master (Workboat) <500 GT, MGN 496 (M+F).
 *
 * Only what the MCA has written is counted:
 * - Sea service (MGN 496 4.1): time at sea, at anchor, on river or canal transits
 *   and time in port associated with the work on a workboat. Yard service is not
 *   in the definition, so it is left out.
 * - Watchkeeping service (4.1): in full charge of a navigational watch for at least
 *   4 out of every 24 hours. Only entries the user logged as watchkeeping count,
 *   plus sea days on a vessel the user has marked as one where they are the sole
 *   watchkeeper; AIS cannot show who held the watch.
 * - 15 m gates (11.2 to 11.5): service on vessels of 15 m or over, and 6 months on
 *   a workboat of 15 m or over.
 * - Recency (4.3): at least 6 months within the 5 years before applying.
 * - Months are reckoned at 30 days (MSF 4257, "Length of Voyage").
 * - Dual deck and engine capacity (4.5): days on entries the user marked as dual
 *   capacity count at 50%. A day also logged without dual capacity counts in full.
 * - Revalidation (12.1), shown as guidance: officer service on vessels of 15 m or
 *   over in the last 5 years, against the 12 months (360 days) needed. Officer
 *   service is an entry logged with a deck officer rank or as watchkeeping, or on a
 *   vessel marked as one where the user is the sole watchkeeper. The medical, GOC
 *   and the other 12.1 routes are not checked.
 *
 * Days are distinct UTC dates with at least 4 merged hours, the same way every
 * other MCA figure in the app is counted. MGN 496 sets no hours-per-day rule for
 * sea service, so this can only under-count.
 *
 * Not counted, because the MCA has not confirmed it: watchkeeping derived from
 * AIS movements (the CTV watchkeeping question is with the MCA), sea-area or
 * tidal classification, and AIS records as evidence in place of testimonials.
 */

import { distinctSeaDates, isSoleWatchEntry } from './seaTime.js';
import { DECK_OFFICER_RANKS } from './tugService.js';

export const WORKBOAT_MIN_LENGTH_M = 15;
export const DAYS_PER_MONTH = 30;
export const RECENCY_YEARS = 5;
/** MGN 496 4.5: service in a dual deck and engine capacity counts at 50%. */
export const DUAL_CAPACITY_FACTOR = 0.5;
/** MGN 496 12.1: 12 months of officer service on 15 m+ in the last 5 years, at 30 days a month. */
export const REVALIDATION_OFFICER_DAYS = 12 * DAYS_PER_MONTH;

const SEA_SERVICE_TYPES = new Set(['actual_sea_service', 'watchkeeping_service', 'standby_service', 'service_in_port']);

export interface WorkboatEntry {
  vessel_id?: string;
  start_time: Date | string;
  end_time: Date | string | null;
  sea_days?: number | null;
  status?: string | null;
  service_type?: string | null;
  rank?: string | null;
  /** Served in a dual deck and engine capacity (MGN 496 4.5). */
  dual_capacity?: boolean | null;
  vessel?: { length_metres?: string | number | null; is_workboat?: boolean | null; is_sole_watchkeeper?: boolean | null } | null;
}

export interface WorkboatService {
  /** MGN 496 sea service on any vessel. */
  sea_service: number;
  /** Sea service on vessels of 15 m or over (by recorded length). */
  sea_service_15m: number;
  /** Watchkeeping service on vessels of 15 m or over. */
  watchkeeping_15m: number;
  /** Sea service on vessels marked as workboats, 15 m or over. */
  workboat_15m: number;
  /** Sea service in the last 5 years. */
  recent_sea_service: number;
  /** Vessels counted as workboats but with no recorded length, so left out of the 15 m figures. */
  workboats_without_length: number;
  /** Days logged in a dual deck and engine capacity (counted at 50% above). */
  dual_capacity_days: number;
  /** Officer service on 15 m+ in the last 5 years, toward revalidation (12.1). */
  revalidation_officer_15m: number;
  revalidation_required: number;
}

/**
 * Distinct days, with days that appear only on dual-capacity entries counted at
 * 50% (MGN 496 4.5). Can be a half day.
 */
export function countWorkboatDays(entries: WorkboatEntry[]): number {
  const full = distinctSeaDates(entries.filter((e) => e.dual_capacity !== true));
  const dual = distinctSeaDates(entries.filter((e) => e.dual_capacity === true));
  let half = 0;
  for (const d of dual) if (!full.has(d)) half++;
  return full.size + half * DUAL_CAPACITY_FACTOR;
}

const isOfficerEntry = (e: WorkboatEntry) =>
  DECK_OFFICER_RANKS.has(e.rank ?? '') || e.service_type === 'watchkeeping_service' || isSoleWatchEntry(e);

const length = (e: WorkboatEntry) => {
  const n = Number(e.vessel?.length_metres);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function workboatService(entries: WorkboatEntry[], now: Date = new Date()): WorkboatService {
  const sea = entries.filter((e) => SEA_SERVICE_TYPES.has(e.service_type || 'actual_sea_service'));
  const over15 = sea.filter((e) => (length(e) ?? 0) >= WORKBOAT_MIN_LENGTH_M);
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - RECENCY_YEARS);
  const unsized = new Set(sea.filter((e) => e.vessel?.is_workboat && length(e) == null).map((e) => e.vessel_id));
  const recent = sea.filter((e) => new Date(e.start_time) >= cutoff);
  return {
    sea_service: countWorkboatDays(sea),
    sea_service_15m: countWorkboatDays(over15),
    watchkeeping_15m: countWorkboatDays(over15.filter((e) => e.service_type === 'watchkeeping_service' || isSoleWatchEntry(e))),
    workboat_15m: countWorkboatDays(over15.filter((e) => e.vessel?.is_workboat === true)),
    recent_sea_service: countWorkboatDays(recent),
    workboats_without_length: unsized.size,
    dual_capacity_days: distinctSeaDates(sea.filter((e) => e.dual_capacity === true)).size,
    revalidation_officer_15m: countWorkboatDays(
      recent.filter((e) => (length(e) ?? 0) >= WORKBOAT_MIN_LENGTH_M && isOfficerEntry(e)),
    ),
    revalidation_required: REVALIDATION_OFFICER_DAYS,
  };
}
