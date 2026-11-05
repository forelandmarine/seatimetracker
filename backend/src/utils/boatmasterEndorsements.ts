/**
 * Service after the Boatmasters' Licence, for its endorsements (MSN 1853 (M)
 * Amendment 1, Annex 5 Tables B and C, and SI 2015/410 reg 24):
 *
 * - Port of London Local Knowledge Endorsement (Table B): at least 60 days of
 *   qualifying service in the area, in varying conditions including trips in
 *   different directions and in the hours of darkness, with the last day at
 *   least 6 months after the first. The PLA sets it by days, not trips (its
 *   2023 proposal to count trips, C05-23, was not adopted). Sections (para 7.2,
 *   footnote 19, PLA wording):
 *   - Full: Margaretness to Putney Bridge
 *   - Lower: Margaretness to London Bridge
 *   - Upper: London Bridge to Putney Bridge
 *   A day counts toward a section when an AIS fix that day was in the tidal
 *   Thames inside it. The section edges are meridians through Putney Bridge,
 *   London Bridge and Margaretness, which the river crosses once each.
 * - Passenger and towing and pushing endorsements (Table C): days in a deck
 *   capacity on a passenger vessel, or on a towing or pushing vessel (the Tug
 *   switch), with at least half the days in the relevant category of water.
 *   Tidal: 120 days over 12 months. Non-tidal: 60 days over 6 months. Age 21.
 * - Fast craft endorsement (Table C, "Fast Craft Operations"): days in a deck
 *   capacity on a high-speed craft (the vessel's High-speed craft switch). The
 *   qualifying service is "As per the requirement for the other operations
 *   undertaken (i.e. cargo and/or passenger operations)", and footnote 68 lets it
 *   run "concurrently with QST for the Cargo or Passenger endorsements", so the
 *   days are counted the same way as the passenger endorsement, with the same
 *   tidal and non-tidal split.
 *
 * All of it must come after the licence service (Table B note 63, Table C), so
 * when a Boatmasters' Licence is on file with an issue date only later days
 * count. Without one every day in the last 5 years counts, and the app says so.
 */

import { serviceDatesAnyHours } from './seaTime.js';
import { ENGINE_RANKS } from './tugService.js';
import { BML_WINDOW_YEARS, monthsSince, type BoatmasterEntry, type BoatmasterFix } from './boatmasterService.js';

export interface EndorsementEntry extends BoatmasterEntry {
  vessel?: {
    default_trade_area?: string | null;
    is_passenger?: boolean | null;
    is_tug?: boolean | null;
    is_high_speed?: boolean | null;
  } | null;
}

export interface EndorsementCount {
  /** Days in a deck capacity on these vessels, after the licence. */
  days: number;
  /** Of those, days with an AIS fix in tidal waters. */
  tidal_days: number;
  /** Of those, days whose placed AIS fixes were all in non-tidal waters. */
  non_tidal_days: number;
  /** Whole months from the first of those days to today. */
  months: number;
}

export interface LkeSection {
  days: number;
  /** Whole months from the first to the last day in the section. */
  months: number;
}

export interface BoatmasterEndorsements {
  /** Issue date of the earliest Boatmasters' Licence on file (YYYY-MM-DD), or null. */
  licence_issued: string | null;
  passenger: EndorsementCount;
  towing: EndorsementCount;
  /** Deck service on high-speed craft, for the fast craft endorsement. */
  fast_craft: EndorsementCount;
  lke_full: LkeSection;
  lke_lower: LkeSection;
  lke_upper: LkeSection;
  /** LKE days with a fix in the area in the hours of darkness. */
  lke_night_days: number;
  /** LKE days with movement upriver (westward) inside the area. */
  lke_upriver_days: number;
  /** LKE days with movement downriver (eastward) inside the area. */
  lke_downriver_days: number;
}

// Section edges (WGS84). London Bridge and Putney Bridge are the bridge
// centres; Margaretness is the London VTS reporting point (51°30'.70N 0°05'.50E).
export const LKE_PUTNEY_LON = -0.2131;
export const LKE_LONDON_BRIDGE_LON = -0.0877;
export const LKE_MARGARETNESS_LON = 0.0917;
// The tidal Thames between them stays inside this latitude band.
const LKE_LAT_MIN = 51.455;
const LKE_LAT_MAX = 51.525;

export type LkeSectionName = 'lower' | 'upper';

/** Which LKE section a fix is in, or null when it is outside the area. */
export function lkeSectionOf(f: Pick<BoatmasterFix, 'latitude' | 'longitude' | 'area_category' | 'is_tidal'>): LkeSectionName | null {
  const lat = Number(f.latitude);
  const lon = Number(f.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // The tidal Thames here is MSN 1837 Category C; docks and creeks that the
  // classifier does not place are left out.
  if (f.area_category !== 'C' || f.is_tidal === false) return null;
  if (lat < LKE_LAT_MIN || lat > LKE_LAT_MAX) return null;
  if (lon < LKE_PUTNEY_LON || lon > LKE_MARGARETNESS_LON) return null;
  return lon < LKE_LONDON_BRIDGE_LON ? 'upper' : 'lower';
}

/** Sun altitude in degrees at a time and place (NOAA approximation, within a fraction of a degree). */
export function sunAltitudeDeg(when: Date, lat: number, lon: number): number {
  const rad = Math.PI / 180;
  const jd = when.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const epsilon = (23.439 - 0.0000004 * n) * rad;
  const dec = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst = (gmst * 15 + lon) * rad;
  const ha = lst - ra;
  const alt = Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha));
  return alt / rad;
}

/** Hours of darkness: the sun below the horizon (sunset to sunrise). */
const isDark = (when: Date, lat: number, lon: number) => sunAltitudeDeg(when, lat, lon) < -0.833;

const toDate = (v: Date | string) => (v instanceof Date ? v : new Date(v));
const dayOf = (v: Date | string) => toDate(v).toISOString().slice(0, 10);

/** Whole calendar months between two YYYY-MM-DD dates. */
function monthsBetween(first: string | undefined, last: string | undefined): number {
  if (!first || !last) return 0;
  return monthsSince(first, new Date(`${last}T23:59:59Z`));
}

/** One day of deck service with AIS positions inside the Port of London LKE area. */
export interface LkeDay {
  vessel_id: string;
  date: string;
  sections: LkeSectionName[];
  night: boolean;
  upriver: boolean;
  downriver: boolean;
  /** First and last AIS position in the area that day. */
  first: Date;
  last: Date;
}

/** Fixes grouped by "vesselId|YYYY-MM-DD". */
export function groupFixesByVesselDay(fixes: BoatmasterFix[]): Map<string, BoatmasterFix[]> {
  const out = new Map<string, BoatmasterFix[]>();
  for (const f of fixes) {
    const key = `${f.vessel_id}|${dayOf(f.check_time)}`;
    const list = out.get(key) ?? [];
    list.push(f);
    out.set(key, list);
  }
  return out;
}

/** First day that counts: the day after the licence was issued, or 5 years back. */
export function endorsementFromDay(licenceIssued: string | null, now: Date = new Date()): string {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - BML_WINDOW_YEARS);
  const fiveYears = cutoff.toISOString().slice(0, 10);
  if (!licenceIssued || licenceIssued < fiveYears) return fiveYears;
  const next = new Date(`${licenceIssued}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** Deck entries that can count: not yard service, not an engine rank, confirmed. */
export function deckEntries<T extends BoatmasterEntry>(entries: T[]): T[] {
  return entries.filter(
    (e) =>
      (e.service_type || 'actual_sea_service') !== 'yard_service' &&
      !ENGINE_RANKS.has(e.rank ?? '') &&
      (e.status == null || e.status === 'confirmed'),
  );
}

/** Days of deck service, from fromDay, with an AIS fix inside the LKE area. */
export function lkeServiceDays(
  deck: BoatmasterEntry[],
  fixesByDay: Map<string, BoatmasterFix[]>,
  fromDay: string,
): LkeDay[] {
  const serviceDays = new Map<string, Set<string>>();
  for (const e of deck) {
    if (!e.vessel_id) continue;
    const set = serviceDays.get(e.vessel_id) ?? new Set<string>();
    for (const d of serviceDatesAnyHours([e] as any)) if (d >= fromDay) set.add(d);
    serviceDays.set(e.vessel_id, set);
  }
  const out: LkeDay[] = [];
  for (const [key, fx] of fixesByDay) {
    const [vesselId, d] = key.split('|');
    if (!serviceDays.get(vesselId)?.has(d)) continue;
    const inArea = fx
      .map((f) => ({ f, section: lkeSectionOf(f) }))
      .filter((x): x is { f: BoatmasterFix; section: LkeSectionName } => x.section !== null)
      .sort((a, b) => toDate(a.f.check_time).getTime() - toDate(b.f.check_time).getTime());
    if (inArea.length === 0) continue;
    let upriver = false;
    let downriver = false;
    for (let i = 1; i < inArea.length; i++) {
      // Roughly 200 m along the river between fixes, so drifting at a berth is ignored.
      const dLon = Number(inArea[i].f.longitude) - Number(inArea[i - 1].f.longitude);
      if (dLon < -0.003) upriver = true;
      if (dLon > 0.003) downriver = true;
    }
    out.push({
      vessel_id: vesselId,
      date: d,
      sections: [...new Set(inArea.map((x) => x.section))].sort(),
      night: inArea.some(({ f }) => isDark(toDate(f.check_time), Number(f.latitude), Number(f.longitude))),
      upriver,
      downriver,
      first: toDate(inArea[0].f.check_time),
      last: toDate(inArea[inArea.length - 1].f.check_time),
    });
  }
  return out.sort((a, b) => a.first.getTime() - b.first.getTime());
}

const emptyCount = (): EndorsementCount => ({ days: 0, tidal_days: 0, non_tidal_days: 0, months: 0 });

export function boatmasterEndorsements(
  entries: EndorsementEntry[],
  fixes: BoatmasterFix[] = [],
  licenceIssued: string | null = null,
  now: Date = new Date(),
): BoatmasterEndorsements {
  const fromDay = endorsementFromDay(licenceIssued, now);
  const deck = deckEntries(entries);
  const fixesByDay = groupFixesByVesselDay(fixes);

  const count = (pick: (e: EndorsementEntry) => boolean): EndorsementCount => {
    const chosen = deck.filter(pick);
    if (chosen.length === 0) return emptyCount();
    const days = [...serviceDatesAnyHours(chosen as any)].filter((d) => d >= fromDay).sort();
    const vesselIds = [...new Set(chosen.map((e) => e.vessel_id).filter(Boolean) as string[])];
    let tidal = 0;
    let nonTidal = 0;
    for (const d of days) {
      const fx = vesselIds.flatMap((v) => fixesByDay.get(`${v}|${d}`) ?? []);
      const placed = fx.filter((f) => f.is_tidal != null);
      if (placed.some((f) => f.is_tidal === true)) tidal++;
      else if (placed.length > 0) nonTidal++;
    }
    return { days: days.length, tidal_days: tidal, non_tidal_days: nonTidal, months: monthsSince(days[0], now) };
  };

  const passenger = count((e) => e.vessel?.is_passenger === true);
  const towing = count((e) => e.vessel?.is_tug === true);
  const fast_craft = count((e) => e.vessel?.is_high_speed === true);

  const lkeDays = lkeServiceDays(deck, fixesByDay, fromDay);
  const lower = new Set(lkeDays.filter((d) => d.sections.includes('lower')).map((d) => d.date));
  const upper = new Set(lkeDays.filter((d) => d.sections.includes('upper')).map((d) => d.date));
  const night = new Set(lkeDays.filter((d) => d.night).map((d) => d.date));
  const upriver = new Set(lkeDays.filter((d) => d.upriver).map((d) => d.date));
  const downriver = new Set(lkeDays.filter((d) => d.downriver).map((d) => d.date));
  const full = new Set([...lower, ...upper]);
  const section = (s: Set<string>): LkeSection => {
    const sorted = [...s].sort();
    return { days: sorted.length, months: monthsBetween(sorted[0], sorted[sorted.length - 1]) };
  };

  return {
    licence_issued: licenceIssued,
    passenger,
    towing,
    fast_craft,
    lke_full: section(full),
    lke_lower: section(lower),
    lke_upper: section(upper),
    lke_night_days: night.size,
    lke_upriver_days: upriver.size,
    lke_downriver_days: downriver.size,
  };
}
