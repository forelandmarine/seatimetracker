/**
 * Service toward the tug deck certificates, MGN 495 (M+F).
 *
 * Only what the MCA has written is counted:
 * - Tug service (4.1): time at sea, at anchor, on river or canal transits and
 *   time in port associated with the work in a tug. Yard service is not in the
 *   definition, so it is left out. A tug is a vessel the user has marked as one.
 * - Deck department only (4.2): entries logged with an engineering rank are left out.
 * - Capacity: the rank logged on the entry, or for entries without one (AIS
 *   passages) the user's usual capacity on that tug.
 * - Officer service (10.6, 10.7): a deck officer capacity, watchkeeping service,
 *   4 or more watchkeeping hours, or a vessel where the user is the sole watchkeeper.
 * - Rating service (10.4): tug deck service not logged as officer service.
 * - Deck apprentice route (10.4): entries logged as cadet, on any vessel and on tugs.
 * - Outside categorised waters (10.4 to 10.7): days with at least 4 hours outside
 *   UK categorised waters, from the AIS fixes the sea-area classifier has seen.
 *   A fix counts as outside only when the classifier placed it at sea (no
 *   category, tidal set). Fixes it could not place (both null: narrow rivers,
 *   docks, lakes its coarse coastline treats as land) never count as outside.
 *   For the master certificates the 4 hours must be bridge watchkeeping, so only
 *   days that are also watchkeeping days count there.
 * - Recency (4.3): at least 6 months of tug service within the 5 years before applying.
 *
 * Days are distinct UTC dates with at least 4 merged hours, the same way every
 * other MCA figure in the app is counted. MGN 495 sets no hours-per-day rule for
 * tug service, so this can only under-count.
 *
 * Not counted, because the app cannot see it: service in a dual deck and engine
 * capacity (counted at 50%, 4.5), and the date a Navigational Watch Rating was
 * issued (Tug Able Seafarer service must follow it).
 */

import { distinctSeaDates, hoursByDate, isSoleWatchEntry } from './seaTime.js';

export const TUG_RECENCY_YEARS = 5;
export const OUTSIDE_CATEGORISED_MIN_HOURS = 4;
/** Longest gap between two AIS fixes that is still taken as continuous time outside. */
export const MAX_FIX_GAP_HOURS = 2;

const TUG_SERVICE_TYPES = new Set(['actual_sea_service', 'watchkeeping_service', 'standby_service', 'service_in_port']);
export const ENGINE_RANKS = new Set(['chief_engineer', 'second_engineer', 'eto']);
export const DECK_OFFICER_RANKS = new Set(['master', 'chief_officer', 'second_officer', 'third_officer', 'oow']);

export interface TugEntry {
  id?: string;
  vessel_id?: string;
  start_time: Date | string;
  end_time: Date | string | null;
  sea_days?: number | null;
  status?: string | null;
  service_type?: string | null;
  rank?: string | null;
  watchkeeping_hours?: string | number | null;
  vessel?: {
    vessel_name?: string | null;
    is_tug?: boolean | null;
    tug_capacity?: string | null;
    is_sole_watchkeeper?: boolean | null;
  } | null;
}

/** One AIS fix the sea-area classifier has seen (season set). */
export interface ClassifiedFix {
  vessel_id: string;
  check_time: Date | string;
  /** 'A' to 'D' inside UK categorised waters, 'sea' at sea outside them, null when not placed (or at sea on older fixes). */
  area_category: string | null;
  /** Set for every fix the classifier placed; null with no category means it could not place it. */
  is_tidal?: boolean | null;
}

/**
 * At sea outside UK categorised waters, as the classifier placed it. Fixes from
 * 2.5.0 on store 'sea' (tidal is then only set inside UK waters); older fixes
 * have no category with tidal set.
 */
export const isAtSeaOutside = (f: { area_category: string | null; is_tidal?: boolean | null }) =>
  f.area_category === 'sea' || (f.area_category == null && f.is_tidal != null);

export interface TugService {
  /** Tug service in any deck capacity. */
  tug_service: number;
  /** Tug service as a rating (not logged as officer service). */
  tug_rating_service: number;
  /** Tug service as an officer. */
  tug_officer_service: number;
  /** Tug deck days with at least 4 hours outside categorised waters. */
  outside_categorised: number;
  /** As above, on days that are also bridge watchkeeping days (master certificates). */
  outside_categorised_watch: number;
  /** Tug service in the last 5 years. */
  recent_tug_service: number;
  /** Deck apprentice (cadet) service on any vessel, and on tugs. */
  apprentice_service: number;
  apprentice_tug_service: number;
  /** Vessels the user has marked as tugs. */
  tug_vessels: string[];
}

const toMs = (v: Date | string) => (v instanceof Date ? v.getTime() : new Date(v).getTime());
const typeOf = (e: TugEntry) => e.service_type || 'actual_sea_service';
const CAPACITY_RANK: Record<string, string> = { rating: 'rating', officer: 'oow', cadet: 'cadet' };
/** The entry's rank, or the user's usual capacity on the tug when none was logged. */
const rankOf = (e: TugEntry) => e.rank || (e.vessel?.is_tug ? CAPACITY_RANK[e.vessel?.tug_capacity ?? ''] : undefined) || '';
const isDeck = (e: TugEntry) => !ENGINE_RANKS.has(rankOf(e));
const isWatch = (e: TugEntry) =>
  typeOf(e) === 'watchkeeping_service' ||
  Number(e.watchkeeping_hours ?? 0) >= OUTSIDE_CATEGORISED_MIN_HOURS ||
  isSoleWatchEntry(e as any);
const isOfficer = (e: TugEntry) => DECK_OFFICER_RANKS.has(rankOf(e)) || isWatch(e);

/**
 * Hours outside UK categorised waters per UTC date. Consecutive fixes on the
 * same vessel that are both outside, and no more than MAX_FIX_GAP_HOURS apart,
 * count as continuous time outside. A gap that crosses midnight is split
 * across the two dates.
 *
 * With `windows` (each vessel's entry start/end times), a pair only counts when
 * one entry covers both fixes, so the gap between two separate entries never
 * counts as time outside.
 */
export function outsideCategorisedHoursByDate(
  fixes: ClassifiedFix[],
  windows?: Map<string, [number, number][]>
): Map<string, number> {
  const byVessel = new Map<string, ClassifiedFix[]>();
  for (const f of fixes) {
    const list = byVessel.get(f.vessel_id) ?? [];
    list.push(f);
    byVessel.set(f.vessel_id, list);
  }
  const out = new Map<string, number>();
  for (const list of byVessel.values()) {
    list.sort((a, b) => toMs(a.check_time) - toMs(b.check_time));
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1];
      const b = list[i];
      if (!isAtSeaOutside(a) || !isAtSeaOutside(b)) continue;
      const start = toMs(a.check_time);
      const end = toMs(b.check_time);
      if (!(end > start) || end - start > MAX_FIX_GAP_HOURS * 3_600_000) continue;
      if (windows && !(windows.get(a.vessel_id) ?? []).some(([ws, we]) => ws <= start && end <= we)) continue;
      for (const [d, h] of hoursByDate(new Date(start), new Date(end))) out.set(d, (out.get(d) ?? 0) + h);
    }
  }
  return out;
}

/**
 * @param fixes classified AIS fixes inside the user's confirmed entries. Only
 *   fixes on vessels marked as tugs are used.
 */
export function tugService(entries: TugEntry[], fixes: ClassifiedFix[] = [], now: Date = new Date()): TugService {
  const service = entries.filter((e) => TUG_SERVICE_TYPES.has(typeOf(e)) && isDeck(e));
  const onTug = service.filter((e) => e.vessel?.is_tug === true);
  const officer = onTug.filter(isOfficer);
  const rating = onTug.filter((e) => !isOfficer(e));
  const cadet = service.filter((e) => rankOf(e) === 'cadet');

  const tugIds = new Set(onTug.map((e) => e.vessel_id).filter(Boolean) as string[]);
  const windows = new Map<string, [number, number][]>();
  for (const e of onTug) {
    if (!e.vessel_id) continue;
    const list = windows.get(e.vessel_id) ?? [];
    list.push([toMs(e.start_time), e.end_time ? toMs(e.end_time) : now.getTime()]);
    windows.set(e.vessel_id, list);
  }
  const outsideHours = outsideCategorisedHoursByDate(fixes.filter((f) => tugIds.has(f.vessel_id)), windows);
  const tugDates = distinctSeaDates(onTug as any);
  const watchDates = distinctSeaDates(onTug.filter(isWatch) as any);
  const outside = [...outsideHours]
    .filter(([d, h]) => h >= OUTSIDE_CATEGORISED_MIN_HOURS && tugDates.has(d))
    .map(([d]) => d);

  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - TUG_RECENCY_YEARS);

  return {
    tug_service: tugDates.size,
    tug_rating_service: distinctSeaDates(rating as any).size,
    tug_officer_service: distinctSeaDates(officer as any).size,
    outside_categorised: outside.length,
    outside_categorised_watch: outside.filter((d) => watchDates.has(d)).length,
    recent_tug_service: distinctSeaDates(onTug.filter((e) => toMs(e.start_time) >= cutoff.getTime()) as any).size,
    apprentice_service: distinctSeaDates(cadet as any).size,
    apprentice_tug_service: distinctSeaDates(cadet.filter((e) => e.vessel?.is_tug === true) as any).size,
    tug_vessels: [...new Set(entries.filter((e) => e.vessel?.is_tug === true).map((e) => e.vessel?.vessel_name || 'Unknown'))].sort(),
  };
}
