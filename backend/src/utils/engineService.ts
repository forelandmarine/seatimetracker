/**
 * Engine-department service gated by propulsion power, for the MCA engineering
 * certificates (MSN 1904 small vessel, MSN 1857 MEOL/SMEOL, MSN 1863 ratings).
 *
 * Only what the MCA has written is counted:
 * - Power gates: 200 kW (MEOL SV, Experienced Seafarer entry, MEOL/SMEOL),
 *   350 kW (SV EOOW, ERWR, Able Seafarer Engine), 750 kW (SV Chief <3000 GT and
 *   the section 13 conversions). kW is the vessel's recorded engine power; a
 *   vessel with none recorded is left out of every gate and named so the user
 *   can add it.
 * - Seagoing service: actual sea service and watchkeeping entries.
 * - Onboard service (MEOL SV, MSN 1904 3.2): any logged service type.
 * - Watchkeeping or UMS (MSN 1904 5.4, MSN 1857 4.4): watchkeeping entries, or an
 *   entry with at least 4 engine-room watch hours. AIS cannot show who kept the
 *   watch, and the sole-watchkeeper flag is a navigational watch, so neither is used.
 * - Ratings (MSN 1863 4.2 to 4.4): vessels over 15 m and 350 kW or more, all
 *   within 5 years, with time not underway capped at a quarter of the total.
 * - Categorised waters (MSN 1904 5.7, MSN 1857 5.2): seagoing days whose AIS
 *   fixes all fell inside UK categorised waters. Only fixes the sea-area
 *   classifier has seen can say so, so this is a floor, not a full count.
 *
 * Days are distinct UTC dates with at least 4 merged hours, like every other MCA
 * figure in the app.
 */

import { countDistinctSeaDays, distinctSeaDates } from './seaTime.js';

export const ENGINE_POWER_GATES_KW = [200, 350, 750] as const;
export const RATING_MIN_LENGTH_M = 15;
export const RATING_RECENCY_YEARS = 5;

const SEAGOING_TYPES = new Set(['actual_sea_service', 'watchkeeping_service']);
const NOT_UNDERWAY_TYPES = new Set(['standby_service', 'yard_service', 'service_in_port']);
const WATCH_DAY_HOURS = 4;

export interface EngineEntry {
  id?: string;
  vessel_id?: string;
  start_time: Date | string;
  end_time: Date | string | null;
  sea_days?: number | null;
  status?: string | null;
  service_type?: string | null;
  engine_watch_hours?: string | number | null;
  vessel?: { vessel_name?: string | null; engine_kilowatts?: string | number | null; length_metres?: string | number | null } | null;
}

export interface EngineService {
  seagoing_any: number;
  seagoing_200kw: number;
  seagoing_350kw: number;
  seagoing_750kw: number;
  watch_350kw: number;
  watch_750kw: number;
  onboard_200kw: number;
  /** MSN 1863 rating service: over 15 m, 350 kW+, last 5 years, at most 25% not underway. */
  rating_350kw: number;
  /** Seagoing days inside UK categorised waters, per gate (subsets of the seagoing figures). */
  categorised_any: number;
  categorised_200kw: number;
  categorised_350kw: number;
  categorised_750kw: number;
  /** Vessels with logged service but no engine power recorded. */
  vessels_without_power: string[];
}

const num = (v: unknown) => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

const kw = (e: EngineEntry) => num(e.vessel?.engine_kilowatts);
const typeOf = (e: EngineEntry) => e.service_type || 'actual_sea_service';
const isWatch = (e: EngineEntry) =>
  typeOf(e) === 'watchkeeping_service' || (num(e.engine_watch_hours) ?? 0) >= WATCH_DAY_HOURS;

/**
 * @param categorisedIds ids of entries whose classified AIS fixes all fell in
 *   categorised waters (see reports summary).
 */
export function engineService(
  entries: EngineEntry[],
  categorisedIds: Set<string> = new Set(),
  now: Date = new Date(),
): EngineService {
  const sea = entries.filter((e) => SEAGOING_TYPES.has(typeOf(e)));
  const atLeast = (list: EngineEntry[], min: number) => list.filter((e) => (kw(e) ?? 0) >= min);
  const categorised = (list: EngineEntry[]) => list.filter((e) => e.id != null && categorisedIds.has(e.id));

  // Ratings: underway days, plus not-underway days up to a third of them, so the
  // not-underway share never passes 25% of the total.
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - RATING_RECENCY_YEARS);
  const ratingVessel = atLeast(entries, 350).filter(
    (e) => (num(e.vessel?.length_metres) ?? 0) > RATING_MIN_LENGTH_M && new Date(e.start_time) >= cutoff,
  );
  const underway = distinctSeaDates(ratingVessel.filter((e) => SEAGOING_TYPES.has(typeOf(e))));
  const notUnderway = [...distinctSeaDates(ratingVessel.filter((e) => NOT_UNDERWAY_TYPES.has(typeOf(e))))]
    .filter((d) => !underway.has(d)).length;

  const unpowered = new Set(
    entries.filter((e) => kw(e) == null).map((e) => e.vessel?.vessel_name || 'Unknown'),
  );

  return {
    seagoing_any: countDistinctSeaDays(sea),
    seagoing_200kw: countDistinctSeaDays(atLeast(sea, 200)),
    seagoing_350kw: countDistinctSeaDays(atLeast(sea, 350)),
    seagoing_750kw: countDistinctSeaDays(atLeast(sea, 750)),
    watch_350kw: countDistinctSeaDays(atLeast(sea, 350).filter(isWatch)),
    watch_750kw: countDistinctSeaDays(atLeast(sea, 750).filter(isWatch)),
    onboard_200kw: countDistinctSeaDays(atLeast(entries, 200)),
    rating_350kw: underway.size + Math.min(notUnderway, Math.floor(underway.size / 3)),
    categorised_any: countDistinctSeaDays(categorised(sea)),
    categorised_200kw: countDistinctSeaDays(categorised(atLeast(sea, 200))),
    categorised_350kw: countDistinctSeaDays(categorised(atLeast(sea, 350))),
    categorised_750kw: countDistinctSeaDays(categorised(atLeast(sea, 750))),
    vessels_without_power: [...unpowered].sort(),
  };
}
