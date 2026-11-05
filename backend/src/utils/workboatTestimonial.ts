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
  signature_signer_name?: string | null;
  signature_signed_at?: Date | string | null;
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
  /** Annex B: calendar days from joining to leaving, both counted. */
  onboard_days: number;
  /** Annex B: distinct days at sea (sea, watchkeeping and stand-by service, not in port), not halved for dual capacity. */
  days_at_sea: number;
  /** Annex B: first departure and last arrival port, where logged. */
  joined_place: string | null;
  left_place: string | null;
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
    onboard_days: Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1,
    days_at_sea: distinctSeaDates(entries.filter((e) => (e.service_type || 'actual_sea_service') !== 'service_in_port')).size,
    joined_place: entries[0].from_port || null,
    left_place: entries[entries.length - 1].to_port || null,
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

// ── Signature requests ────────────────────────────────────────────────

/** Part 1 as shown to the signatory, frozen when the request is made. */
export interface TestimonialSnapshot {
  seafarer: { name: string; date_of_birth: string; discharge_book: string };
  vessel: { name: string; length_m: string | null; gross_tons: string | null; official_number: string | null; type: string | null };
  from: string;
  to: string;
  capacities: AnnexCCapacity[];
  capacity_unrecorded: boolean;
  served_as_master: boolean;
  sea_service_days: number;
  sea_service_months: number;
  sea_service_remaining_days: number;
  watchkeeping_days: number;
  dual_capacity_days: number;
  leave: TestimonialLeave[];
}

export function testimonialSnapshot(
  t: WorkboatTestimonial,
  vessel: TestimonialSnapshot['vessel'],
  seafarer: TestimonialSnapshot['seafarer'],
): TestimonialSnapshot {
  return {
    seafarer,
    vessel,
    from: t.from,
    to: t.to,
    capacities: t.capacities,
    capacity_unrecorded: t.capacity_unrecorded,
    served_as_master: t.served_as_master,
    sea_service_days: t.sea_service_days,
    sea_service_months: t.sea_service_months,
    sea_service_remaining_days: t.sea_service_remaining_days,
    watchkeeping_days: t.watchkeeping_days,
    dual_capacity_days: t.dual_capacity_days,
    leave: t.leave,
  };
}

/** What the signatory fills in: company header, duties, Part 2 and Part 3. */
export interface TestimonialSignature {
  company_name: string | null;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  duties: string | null;
  conduct: string | null;
  ability: string | null;
  signer_name: string;
  signer_position: 'master' | 'responsible_person';
  signer_coc_no: string | null;
  signer_issuing_admin: string | null;
  signer_organisation: string | null;
  signer_org_position: string | null;
  signature_image: string;
}

const TEXT_LIMIT = 2000;
const SIGNATURE_LIMIT = 300_000;

const clean = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, TEXT_LIMIT) : null;
};

/**
 * Checks a submitted signature against Annex C Part 3 and MGN 496 5.3. Returns
 * the cleaned fields, or the first problem as a sentence for the signatory.
 */
export function validateSignature(
  body: any,
  snapshot: Pick<TestimonialSnapshot, 'served_as_master'>,
): { ok: true; value: TestimonialSignature } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Nothing was submitted.' };
  if (body.confirm !== true) return { ok: false, error: 'Please confirm the figures before signing.' };
  const signer_name = clean(body.signer_name);
  if (!signer_name) return { ok: false, error: 'Please print your name.' };
  const position = body.signer_position;
  if (position !== 'master' && position !== 'responsible_person') {
    return { ok: false, error: 'Please say whether you sign as Master or as a responsible person.' };
  }
  if (snapshot.served_as_master && position === 'master') {
    return {
      ok: false,
      error: 'The seafarer served as Master, so MGN 496 5.3 needs the owner or a responsible person from the management company to sign.',
    };
  }
  const signer_coc_no = clean(body.signer_coc_no);
  const signer_organisation = clean(body.signer_organisation);
  if (position === 'master' && !signer_coc_no) return { ok: false, error: 'Please give your CoC number.' };
  if (position === 'responsible_person' && !signer_organisation) return { ok: false, error: 'Please give your organisation.' };
  const sig = body.signature_image;
  if (typeof sig !== 'string' || !sig.startsWith('data:image/png;base64,') || sig.length > SIGNATURE_LIMIT) {
    return { ok: false, error: 'Please sign in the box.' };
  }
  return {
    ok: true,
    value: {
      company_name: clean(body.company_name),
      company_address: clean(body.company_address),
      company_phone: clean(body.company_phone),
      company_email: clean(body.company_email),
      duties: clean(body.duties),
      conduct: clean(body.conduct),
      ability: clean(body.ability),
      signer_name,
      signer_position: position,
      signer_coc_no,
      signer_issuing_admin: clean(body.signer_issuing_admin),
      signer_organisation,
      signer_org_position: clean(body.signer_org_position),
      signature_image: sig,
    },
  };
}
