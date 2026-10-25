/**
 * Service toward Master (Workboat) <500 GT, MGN 496 (M+F).
 *
 * Only what the MCA has written is counted:
 * - Sea service (MGN 496 4.1): time at sea, at anchor, on river or canal transits
 *   and time in port associated with the work on a workboat. Yard service is not
 *   in the definition, so it is left out.
 * - Watchkeeping service (4.1): in full charge of a navigational watch for at least
 *   4 out of every 24 hours. Only entries the user logged as watchkeeping count;
 *   AIS cannot show who held the watch.
 * - 15 m gates (11.2 to 11.5): service on vessels of 15 m or over, and 6 months on
 *   a workboat of 15 m or over.
 * - Recency (4.3): at least 6 months within the 5 years before applying.
 * - Months are reckoned at 30 days (MSF 4257, "Length of Voyage").
 *
 * Days are distinct UTC dates with at least 4 merged hours, the same way every
 * other MCA figure in the app is counted. MGN 496 sets no hours-per-day rule for
 * sea service, so this can only under-count.
 *
 * Not counted, because the MCA has not confirmed it: watchkeeping derived from
 * AIS movements (the CTV watchkeeping question is with the MCA), sea-area or
 * tidal classification, and AIS records as evidence in place of testimonials.
 */

import { countDistinctSeaDays } from './seaTime.js';

export const WORKBOAT_MIN_LENGTH_M = 15;
export const DAYS_PER_MONTH = 30;
export const RECENCY_YEARS = 5;

const SEA_SERVICE_TYPES = new Set(['actual_sea_service', 'watchkeeping_service', 'standby_service', 'service_in_port']);

export interface WorkboatEntry {
  vessel_id?: string;
  start_time: Date | string;
  end_time: Date | string | null;
  sea_days?: number | null;
  status?: string | null;
  service_type?: string | null;
  vessel?: { length_metres?: string | number | null; is_workboat?: boolean | null } | null;
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
}

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
  return {
    sea_service: countDistinctSeaDays(sea),
    sea_service_15m: countDistinctSeaDays(over15),
    watchkeeping_15m: countDistinctSeaDays(over15.filter((e) => e.service_type === 'watchkeeping_service')),
    workboat_15m: countDistinctSeaDays(over15.filter((e) => e.vessel?.is_workboat === true)),
    recent_sea_service: countDistinctSeaDays(sea.filter((e) => new Date(e.start_time) >= cutoff)),
    workboats_without_length: unsized.size,
  };
}
