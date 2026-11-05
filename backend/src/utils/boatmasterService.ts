/**
 * Qualifying service time toward the generic Tier 1 Boatmasters' Licence,
 * SI 2015/410 and MSN 1853 (M) Amendment 1, Annex 5.
 *
 * Only what the MCA has written is counted:
 * - Qualifying service (reg 1, MSN 1853 11.2): in the UK, in a deck capacity,
 *   in waters and on vessels the licence covers. Entries logged with an
 *   engineering rank, and yard service, are left out.
 * - A day of service: the notice sets no minimum hours, so any UTC date with
 *   logged time counts once.
 * - Waters, from the AIS fixes the sea-area classifier has seen that day:
 *   - Tier 1 Level 2: every fix in categorised waters A to D, or a day that
 *     stayed within limited coastal waters (no more than 15 miles from the
 *     day's first position and 5 miles from land, Annex 5 note 61).
 *   - Tier 1 Level 1: every fix in non-tidal categorised waters A, B or C. The
 *     classifier cannot tell linked from non-linked category C, so check that
 *     the C waters were non-linked.
 *   - Fixes the classifier could not place (no category and no tidal flag:
 *     narrow rivers, docks and lakes its coarse coastline treats as land) are
 *     taken as inland water alongside categorised fixes on the same day. A day
 *     made up only of those, or with no fixes at all, counts toward Level 2
 *     only when its entry was logged with the Inland trade area; otherwise it is
 *     reported as unclassified and left out. Neither counts toward Level 1,
 *     which needs non-tidal waters the app can confirm.
 * - Window (reg 20(1)(a)): service within the 5 years before applying.
 * - Minimum qualifying period (reg 20(1)(b)): whole months from the first day
 *   of that service to today.
 */

import { serviceDatesAnyHours } from './seaTime.js';
import { ENGINE_RANKS, isAtSeaOutside } from './tugService.js';

export const BML_WINDOW_YEARS = 5;

export interface BoatmasterEntry {
  vessel_id?: string;
  start_time: Date | string;
  end_time: Date | string | null;
  sea_days?: number | null;
  status?: string | null;
  service_type?: string | null;
  rank?: string | null;
  trade_area?: string | null;
}

export interface BoatmasterFix {
  vessel_id: string;
  check_time: Date | string;
  area_category: string | null;
  is_tidal: boolean | null;
  latitude: number | string | null;
  longitude: number | string | null;
}

/** Whether a day's track stayed within limited coastal waters, or null if unknown. */
export type LimitedCoastalCheck = (
  track: { lat: number; lon: number }[],
  departure: { lat: number; lon: number },
) => boolean | null;

export interface BoatmasterService {
  /** Days in waters a Tier 1 Level 2 licence covers (includes declared inland days). */
  tier1_level2_days: number;
  /** Days wholly in non-tidal waters A, B or C. */
  tier1_level1_days: number;
  /** Level 2 days counted only because the entry was logged as Inland (no AIS area data). */
  declared_inland_days: number;
  /** Days that went beyond limited coastal waters, so are not BML service. */
  beyond_limited_coastal_days: number;
  /** Days with no AIS area data and no Inland trade area, so left out. */
  unclassified_days: number;
  /** Whole months from the first counted day to today (minimum qualifying period). */
  level2_months: number;
  level1_months: number;
}

const CATEGORISED = new Set(['A', 'B', 'C', 'D']);
const NON_TIDAL = new Set(['A', 'B', 'C']);

const toDate = (v: Date | string) => (v instanceof Date ? v : new Date(v));
const dayOf = (v: Date | string) => toDate(v).toISOString().slice(0, 10);

/** Whole calendar months from a YYYY-MM-DD date to now. */
export function monthsSince(date: string | undefined, now: Date): number {
  if (!date) return 0;
  const [y, m, d] = date.split('-').map(Number);
  let months = (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m);
  if (now.getUTCDate() < d) months -= 1;
  return Math.max(0, months);
}

export function boatmasterService(
  entries: BoatmasterEntry[],
  fixes: BoatmasterFix[] = [],
  limitedCoastal: LimitedCoastalCheck | null = null,
  now: Date = new Date(),
): BoatmasterService {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - BML_WINDOW_YEARS);
  const cutoffDay = cutoff.toISOString().slice(0, 10);

  const eligible = entries.filter(
    (e) => (e.service_type || 'actual_sea_service') !== 'yard_service' && !ENGINE_RANKS.has(e.rank ?? ''),
  );
  const dates = [...serviceDatesAnyHours(eligible as any)].filter((d) => d >= cutoffDay).sort();
  const inlandDates = serviceDatesAnyHours(eligible.filter((e) => e.trade_area === 'inland') as any);

  const vesselIds = new Set(eligible.map((e) => e.vessel_id).filter(Boolean) as string[]);
  const fixesByDate = new Map<string, BoatmasterFix[]>();
  for (const f of fixes) {
    if (!vesselIds.has(f.vessel_id)) continue;
    const d = dayOf(f.check_time);
    const list = fixesByDate.get(d) ?? [];
    list.push(f);
    fixesByDate.set(d, list);
  }

  const level2: string[] = [];
  const level1: string[] = [];
  let declared = 0;
  let beyond = 0;
  let unclassified = 0;

  for (const d of dates) {
    const fx = fixesByDate.get(d) ?? [];
    const placed = fx.filter((f) => CATEGORISED.has(f.area_category ?? '') || isAtSeaOutside(f));
    if (placed.length === 0) {
      if (inlandDates.has(d)) {
        level2.push(d);
        declared++;
      } else {
        unclassified++;
      }
      continue;
    }
    if (!fx.some(isAtSeaOutside)) {
      level2.push(d);
      if (fx.every((f) => NON_TIDAL.has(f.area_category ?? '') && f.is_tidal === false)) level1.push(d);
      continue;
    }
    const track = fx
      .slice()
      .sort((a, b) => toDate(a.check_time).getTime() - toDate(b.check_time).getTime())
      .map((f) => ({ lat: Number(f.latitude), lon: Number(f.longitude) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (limitedCoastal && track.length > 0 && limitedCoastal(track, track[0]) === true) {
      level2.push(d);
    } else {
      beyond++;
    }
  }

  return {
    tier1_level2_days: level2.length,
    tier1_level1_days: level1.length,
    declared_inland_days: declared,
    beyond_limited_coastal_days: beyond,
    unclassified_days: unclassified,
    level2_months: monthsSince(level2[0], now),
    level1_months: monthsSince(level1[0], now),
  };
}
