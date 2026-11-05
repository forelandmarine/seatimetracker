/**
 * CoC revalidation progress, per certificate the user holds.
 *
 * Every figure is the issuing authority's own:
 * - MSN 1861 (M) Amendment 1, 3.2: 12 months of approved seagoing service in the
 *   5 years before revalidating, or 3 months in the 6 months before. (The
 *   supernumerary and 30-month shore occupation routes cannot be seen in sea
 *   time, so they are notes.) A month is a calendar month or 30 days (3.1, 3.5).
 * - MSN 1861 3.3, vessel and capacity:
 *   - Deck CoC: Master or deck officer on seagoing ships of more than 80 GT or 24 m.
 *   - Engineer CoC: engineer officer on seagoing ships of at least 750 kW. This
 *     covers the Small Vessel engineer CoCs too (MSN 1904 refers revalidation to
 *     MSN 1861).
 *   - Yacht restricted deck CoC: Master or deck officer on yachts of more than
 *     15 m, onboard yacht service (actual sea, stand-by and yard service).
 *   - Code vessel CoC (Master (Code Vessels) <200 GT): 6 months seagoing service
 *     on code vessels (commercial vessels under 24 m) in the 5 years before.
 * - MSN 1861 3.4: service counts on vessels operating outside UK categorised
 *   waters. An entry that stayed inside them (its most exposed area is A to D,
 *   or it is logged as inland) is left out.
 * - Master (Workboat) <500 GT, MGN 496 12.1: officer service on vessels of 15 m
 *   or over in the last 5 years, 12 months (utils/workboat.ts).
 * - Boatmasters' Licence, MSN 1853 19.3: Tier 1 (Level 1 or 2) 120 days of
 *   qualifying service in the 5 years before applying. Endorsement figures and
 *   LKE rules (19.5) are not checked here.
 *
 * Days are distinct dates with at least 4 hours of logged service, as every
 * other MCA figure in the app is counted. MSN 1861 reckons service from
 * engagement to discharge, so this can only under-count. Capacity comes from the
 * entry's rank: entries with no rank are reported separately, so the user can set
 * the rank rather than have the app assume it.
 */

import { distinctSeaDates, getCalendarDay, serviceDatesAnyHours } from './seaTime.js';
import { DECK_OFFICER_RANKS, ENGINE_RANKS } from './tugService.js';
import { DAYS_PER_MONTH, countWorkboatDays, isOfficerEntry, type WorkboatEntry } from './workboat.js';

export type RevalidationRuleId = 'deck' | 'engine' | 'yacht_deck' | 'code_vessel' | 'workboat' | 'bml';

export interface RevalidationRule {
  id: RevalidationRuleId;
  notice: string;
  /** What service counts, in a line. */
  counts: string;
}

export const REVALIDATION_RULES: Record<RevalidationRuleId, RevalidationRule> = {
  deck: {
    id: 'deck',
    notice: 'MSN 1861 3.2, 3.3',
    counts: 'Master or deck officer on seagoing ships over 80 GT or 24 m, outside UK categorised waters',
  },
  engine: {
    id: 'engine',
    notice: 'MSN 1861 3.2, 3.3',
    counts: 'Engineer officer on seagoing ships of at least 750 kW, outside UK categorised waters',
  },
  yacht_deck: {
    id: 'yacht_deck',
    notice: 'MSN 1861 3.2, 3.3',
    counts: 'Master or deck officer on yachts over 15 m (sea, stand-by and yard service), outside UK categorised waters',
  },
  code_vessel: {
    id: 'code_vessel',
    notice: 'MSN 1861 3.3',
    counts: 'Seagoing service on code vessels (commercial vessels under 24 m), outside UK categorised waters',
  },
  workboat: {
    id: 'workboat',
    notice: 'MGN 496 12.1',
    counts: 'Officer service on vessels of 15 m or over',
  },
  bml: {
    id: 'bml',
    notice: 'MSN 1853 19.3',
    counts: 'Qualifying service as a boatmaster on commercial vessels',
  },
};

/**
 * Certificate types that carry a revalidation rule. CoCs the user records
 * through the oral checklist are saved as course_<code>.
 */
export const REVALIDATION_RULE_BY_TYPE: Record<string, RevalidationRuleId> = {
  course_coc_oow_unlimited: 'deck',
  occ_oow_3000gt: 'yacht_deck',
  occ_master_3000gt: 'yacht_deck',
  course_coc_oow_yachts_3000: 'yacht_deck',
  course_coc_master_yachts_500: 'yacht_deck',
  course_coc_master_yachts_3000: 'yacht_deck',
  course_coc_cm_yachts_unlimited: 'yacht_deck',
  course_coc_master_code_200: 'code_vessel',
  coc_master_workboat_500: 'workboat',
  occ_chief_engineer: 'engine',
  occ_second_engineer: 'engine',
  course_coc_eoow_sv: 'engine',
  course_coc_ce_sv_500: 'engine',
  course_boatmaster: 'bml',
  course_coc_bml_t1l2: 'bml',
};

const MONTHS_12 = 12 * DAYS_PER_MONTH;
const MONTHS_3 = 3 * DAYS_PER_MONTH;
const MONTHS_6 = 6 * DAYS_PER_MONTH;
/** MSN 1853 19.3: Tier 1 Level 1 and Level 2. */
export const BML_REVALIDATION_DAYS = 120;
/** MSN 1861 2.4: within 6 months of expiry the new CoC runs from the old expiry date. */
export const ANNIVERSARY_WINDOW_MONTHS = 6;

export interface RevalidationEntry extends WorkboatEntry {
  trade_area?: string | null;
  area_category?: string | null;
  vessel?: (WorkboatEntry['vessel'] & {
    gross_tonnes?: string | number | null;
    engine_kilowatts?: string | number | null;
    sector?: string | null;
    default_trade_area?: string | null;
    is_tug?: boolean | null;
  }) | null;
}

export interface RevalidationRoute {
  /** 'five_years': 12 months in 5 years (or 6 months for code vessels). 'six_months': 3 months in 6 months. */
  key: 'five_years' | 'six_months';
  days: number;
  required: number;
  /** Matching days on entries with no rank recorded, not counted in days. */
  unranked_days: number;
}

export interface RevalidationProgress {
  rule: RevalidationRule;
  routes: RevalidationRoute[];
  /** Any route met on the logged figures. */
  met: boolean;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && Number.isFinite(n) && n > 0 ? n : null;
};

const SEAGOING = new Set(['actual_sea_service', 'watchkeeping_service', 'standby_service']);
const YACHT_ONBOARD = new Set(['actual_sea_service', 'watchkeeping_service', 'standby_service', 'yard_service']);
const CATEGORISED = new Set(['A', 'B', 'C', 'D']);

const type = (e: RevalidationEntry) => e.service_type || 'actual_sea_service';
const confirmed = (e: RevalidationEntry) => e.status == null || e.status === 'confirmed';

/** MSN 1861 3.4: the entry went outside UK categorised waters, or was not placed in them. */
export function outsideCategorised(e: RevalidationEntry): boolean {
  if ((e.trade_area || e.vessel?.default_trade_area) === 'inland') return false;
  return !CATEGORISED.has(e.area_category ?? '');
}

/** Ship over 80 GT or over 24 m (MSN 1861 3.3, deck). */
export function isDeckRevalidationShip(e: RevalidationEntry): boolean {
  const gt = num(e.vessel?.gross_tonnes);
  const len = num(e.vessel?.length_metres);
  return (gt != null && gt > 80) || (len != null && len > 24);
}

const isYacht = (e: RevalidationEntry) => (e.vessel?.sector ?? 'yachting') !== 'commercial' && !e.vessel?.is_workboat && !e.vessel?.is_tug;

type Capacity = 'yes' | 'no' | 'unranked';

const deckCapacity = (e: RevalidationEntry): Capacity => {
  if (DECK_OFFICER_RANKS.has(e.rank ?? '') || type(e) === 'watchkeeping_service') return 'yes';
  return e.rank ? 'no' : 'unranked';
};
const engineCapacity = (e: RevalidationEntry): Capacity => {
  if (ENGINE_RANKS.has(e.rank ?? '')) return 'yes';
  return e.rank ? 'no' : 'unranked';
};
const anyCapacity = (): Capacity => 'yes';

function windowStart(now: Date, months: number): string {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return getCalendarDay(d);
}

function routes(
  eligible: RevalidationEntry[],
  capacity: (e: RevalidationEntry) => Capacity,
  windows: Array<{ key: RevalidationRoute['key']; months: number; required: number }>,
  now: Date,
  count: (es: RevalidationEntry[]) => Set<string> = distinctSeaDates as any,
): RevalidationRoute[] {
  const today = getCalendarDay(now);
  const ranked = count(eligible.filter((e) => capacity(e) === 'yes'));
  const unranked = count(eligible.filter((e) => capacity(e) === 'unranked'));
  return windows.map(({ key, months, required }) => {
    const from = windowStart(now, months);
    const inWindow = (d: string) => d >= from && d <= today;
    const days = [...ranked].filter(inWindow).length;
    const extra = [...unranked].filter((d) => inWindow(d) && !ranked.has(d)).length;
    return { key, days, required, unranked_days: extra };
  });
}

const STANDARD = [
  { key: 'five_years' as const, months: 60, required: MONTHS_12 },
  { key: 'six_months' as const, months: 6, required: MONTHS_3 },
];

export function revalidationProgress(
  ruleId: RevalidationRuleId,
  entries: RevalidationEntry[],
  now: Date = new Date(),
): RevalidationProgress {
  const rule = REVALIDATION_RULES[ruleId];
  const all = entries.filter(confirmed);
  let out: RevalidationRoute[];

  switch (ruleId) {
    case 'deck':
      out = routes(all.filter((e) => SEAGOING.has(type(e)) && isDeckRevalidationShip(e) && outsideCategorised(e)), deckCapacity, STANDARD, now);
      break;
    case 'engine':
      out = routes(
        all.filter((e) => SEAGOING.has(type(e)) && (num(e.vessel?.engine_kilowatts) ?? 0) >= 750 && outsideCategorised(e)),
        engineCapacity, STANDARD, now,
      );
      break;
    case 'yacht_deck':
      out = routes(
        all.filter((e) => YACHT_ONBOARD.has(type(e)) && isYacht(e) && (num(e.vessel?.length_metres) ?? 0) > 15 && outsideCategorised(e)),
        deckCapacity, STANDARD, now,
      );
      break;
    case 'code_vessel': {
      const code = all.filter(
        (e) => SEAGOING.has(type(e)) && !isYacht(e) && (num(e.vessel?.length_metres) ?? Infinity) < 24 && outsideCategorised(e),
      );
      out = routes(code, anyCapacity, [{ key: 'five_years', months: 60, required: MONTHS_6 }], now);
      break;
    }
    case 'workboat': {
      // Same figure as the Master (Workboat) card (MGN 496 12.1, workboat.ts)
      const cutoff = windowStart(now, 60);
      const recent = all.filter(
        (e) => getCalendarDay(new Date(e.start_time)) >= cutoff && (num(e.vessel?.length_metres) ?? 0) >= 15 &&
          (e.service_type || 'actual_sea_service') !== 'yard_service',
      );
      const officer = recent.filter((e) => isOfficerEntry(e));
      const unranked = recent.filter((e) => !isOfficerEntry(e) && !e.rank);
      const days = countWorkboatDays(officer);
      const officerDates = distinctSeaDates(officer);
      const extra = [...distinctSeaDates(unranked)].filter((d) => !officerDates.has(d)).length;
      out = [{ key: 'five_years', days, required: MONTHS_12, unranked_days: extra }];
      break;
    }
    case 'bml': {
      const deck = all.filter(
        (e) => !isYacht(e) && type(e) !== 'yard_service' && !ENGINE_RANKS.has(e.rank ?? ''),
      );
      out = routes(deck, anyCapacity, [{ key: 'five_years', months: 60, required: BML_REVALIDATION_DAYS }], now, serviceDatesAnyHours as any);
      break;
    }
  }
  return { rule, routes: out, met: out.some((r) => r.days >= r.required) };
}

/** Whole days from today to the expiry date (negative once expired), or null. */
export function daysToExpiry(expiry: string | null | undefined, now: Date = new Date()): number | null {
  if (!expiry) return null;
  const end = Date.parse(`${String(expiry).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(end)) return null;
  const today = Date.parse(`${getCalendarDay(now)}T00:00:00Z`);
  return Math.round((end - today) / 86_400_000);
}

/** Applying now keeps the anniversary date (MSN 1861 2.4). */
export function inAnniversaryWindow(expiry: string | null | undefined, now: Date = new Date()): boolean {
  const days = daysToExpiry(expiry, now);
  if (days == null || days < 0) return false;
  const limit = new Date(now);
  limit.setUTCMonth(limit.getUTCMonth() + ANNIVERSARY_WINDOW_MONTHS);
  return Date.parse(`${String(expiry).slice(0, 10)}T00:00:00Z`) <= limit.getTime();
}
