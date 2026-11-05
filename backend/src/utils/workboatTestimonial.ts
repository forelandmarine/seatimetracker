/**
 * MGN 496 Annex C "Deck (Workboat) Testimonial", one per vessel, pre-filled
 * from the user's confirmed service.
 *
 * What the notice asks for (MGN 496 5.2, 5.3 and Annex C):
 * - Part 1: the capacity served (Master / Chief Mate / OOW / Rating), the
 *   seafarer's name, date of birth and discharge book or national ID, the
 *   vessel's name, length, gross tons, official number and type, the From and
 *   To dates, the sea service in months and days, the watchkeeping service in
 *   days, and leave of absence. A figure with no time of that type is "NIL".
 * - Part 2: the signatory's report on conduct and ability. Left blank.
 * - Part 3: signed by the Master of the vessel, or, where the seafarer served as
 *   Master, by the owner or a responsible person from the management company
 *   (5.3). Left blank to sign.
 *
 * Counting follows MGN 496 the same way the Master (Workboat) progress does
 * (utils/workboat.ts): sea service is time at sea, at anchor, on transits and in
 * port with the work (4.1), so yard service is left out; days need 4 merged
 * hours; dual deck and engine capacity counts at 50% (4.5); months are 30 days
 * (MSF 4257). Watchkeeping is "in full charge of a navigational watch", so only
 * officer entries logged as watchkeeping, or sea days on a vessel the user marked
 * as one where they are the sole watchkeeper, count. AIS cannot show who held
 * the watch, so nothing is inferred from movements.
 *
 * Engine-rank entries are left out: this is the deck testimonial.
 */

import { distinctSeaDates, getCalendarDay, isSoleWatchEntry } from './seaTime.js';
import { ENGINE_RANKS } from './tugService.js';
import { countWorkboatDays, DAYS_PER_MONTH, type WorkboatEntry } from './workboat.js';

export type AnnexCCapacity = 'Master' | 'Chief Mate' | 'OOW' | 'Rating';

/** Annex C lists the four capacities in this order. */
export const ANNEX_C_CAPACITIES: AnnexCCapacity[] = ['Master', 'Chief Mate', 'OOW', 'Rating'];

const CAPACITY_BY_RANK: Record<string, AnnexCCapacity> = {
  master: 'Master',
  chief_officer: 'Chief Mate',
  second_officer: 'OOW',
  third_officer: 'OOW',
  oow: 'OOW',
  rating: 'Rating',
  cadet: 'Rating',
};

/** Annex C capacity for an entry's rank; null when the rank is not recorded. */
export function annexCCapacity(rank: string | null | undefined): AnnexCCapacity | null {
  return CAPACITY_BY_RANK[rank ?? ''] ?? null;
}

const SEA_SERVICE_TYPES = new Set(['actual_sea_service', 'watchkeeping_service', 'standby_service', 'service_in_port']);

export interface TestimonialEntry extends WorkboatEntry {
  id?: string;
  date_joined?: string | null;
  date_left?: string | null;
  from_port?: string | null;
  to_port?: string | null;
  signature_image?: string | null;
}

export interface TestimonialLeave {
  start_date: string;
  end_date: string;
  reason?: string | null;
}

export interface WorkboatTestimonial {
  /** First and last day of service on the vessel, YYYY-MM-DD. */
  from: string;
  to: string;
  /** Capacities served, in Annex C order. */
  capacities: AnnexCCapacity[];
  /** Some entries carry no rank, so the signatory must confirm the capacity. */
  capacity_unrecorded: boolean;
  /** Served as Master: Part 3 must be signed by the owner or company (MGN 496 5.3). */
  served_as_master: boolean;
  /** MGN 496 sea service, dual capacity at 50%. Can be a half day. */
  sea_service_days: number;
  sea_service_months: number;
  /** Days left over after whole 30-day months. */
  sea_service_remaining_days: number;
  watchkeeping_days: number;
  /** Days logged in a dual deck and engine capacity (already counted at 50% above). */
  dual_capacity_days: number;
  /** Leave on this vessel inside From to To, clipped to those dates. */
  leave: TestimonialLeave[];
  /** Entries in the testimonial, oldest first. */
  entries: TestimonialEntry[];
  /** Entries carrying a signature, for the service record appendix. */
  signed_entries: number;
}

const day = (v: Date | string) => getCalendarDay(new Date(v));

/** A rating does not hold the watch in full charge; an unrecorded rank is taken as logged. */
const isOfficer = (e: TestimonialEntry) => annexCCapacity(e.rank) !== 'Rating';

/**
 * Entries that belong on a deck testimonial: confirmed, sea service as MGN 496
 * defines it, not an engine rank.
 */
export function testimonialEntries<T extends TestimonialEntry>(entries: T[]): T[] {
  return entries
    .filter(
      (e) =>
        (e.status == null || e.status === 'confirmed') &&
        SEA_SERVICE_TYPES.has(e.service_type || 'actual_sea_service') &&
        !ENGINE_RANKS.has(e.rank ?? ''),
    )
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
}

/** Annex C figures for one vessel's entries, or null when none qualify. */
export function buildWorkboatTestimonial(
  vesselEntries: TestimonialEntry[],
  leavePeriods: TestimonialLeave[] = [],
): WorkboatTestimonial | null {
  const entries = testimonialEntries(vesselEntries);
  if (entries.length === 0) return null;

  // From and To: the sign-on and sign-off dates where the user recorded them,
  // otherwise the first and last day of service.
  const starts = entries.map((e) => e.date_joined || day(e.start_time));
  const ends = entries.map((e) => e.date_left || day(e.end_time ?? e.start_time));
  const from = starts.reduce((a, b) => (b < a ? b : a));
  const to = ends.reduce((a, b) => (b > a ? b : a));

  const capacitySet = new Set(entries.map((e) => annexCCapacity(e.rank)).filter((c): c is AnnexCCapacity => c != null));
  const seaDays = countWorkboatDays(entries);
  const months = Math.floor(seaDays / DAYS_PER_MONTH);
  const watch = entries.filter(
    (e) => isOfficer(e) && (e.service_type === 'watchkeeping_service' || isSoleWatchEntry(e as any)),
  );

  const leave = leavePeriods
    .filter((l) => l.start_date <= to && l.end_date >= from)
    .map((l) => ({
      ...l,
      start_date: l.start_date < from ? from : l.start_date,
      end_date: l.end_date > to ? to : l.end_date,
    }))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  return {
    from,
    to,
    capacities: ANNEX_C_CAPACITIES.filter((c) => capacitySet.has(c)),
    capacity_unrecorded: entries.some((e) => annexCCapacity(e.rank) == null),
    served_as_master: capacitySet.has('Master'),
    sea_service_days: seaDays,
    sea_service_months: months,
    sea_service_remaining_days: seaDays - months * DAYS_PER_MONTH,
    watchkeeping_days: countWorkboatDays(watch),
    dual_capacity_days: distinctSeaDates(entries.filter((e) => e.dual_capacity === true)).size,
    leave,
    entries,
    signed_entries: entries.filter((e) => typeof e.signature_image === 'string' && e.signature_image.startsWith('data:image/')).length,
  };
}

/** Annex C wording for a figure: the number, or NIL when there is none. */
export function nilOr(n: number, unit: string): string {
  if (!n) return 'NIL';
  const shown = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${shown} ${unit}`;
}
