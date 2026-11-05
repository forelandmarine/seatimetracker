/**
 * Workboat Code Edition 3 area guidance for one trip, and the days-by-area
 * breakdown shown to commercial users. Guidance only: nothing here changes any
 * sea service count. The vessel's certificate and the MCA decide the area.
 *
 * Area Category of Operation (WBC3 3.10.1):
 *  - 6: within 3 miles of land and no more than 3 miles from the point of departure
 *    to sea or the seaward edge of categorised waters, favourable weather and daylight.
 *  - 5: as 6, favourable weather.
 *  - 4: up to 20 miles from a safe haven, favourable weather and daylight.
 *  - 3: up to 20 miles from a safe haven.
 *  - 2: up to 60 miles. 1: up to 150 miles. 0: unrestricted.
 *
 * Limits of the AIS check:
 *  - "Safe haven" is not a fixed list. The distance is measured to the nearest MSN
 *    1837 categorised water: the WFD estuaries plus the hand-drawn coastal harbours
 *    (harbour-overrides.geojson), not inland waters. A trip near a small harbour
 *    that Annex 1 does not list still reads further out than it was.
 *  - Weather and daylight cannot be checked from AIS, so they are returned as
 *    conditions, never as passed.
 *  - Only UK waters are measured.
 *
 * Tickets from WBC3 Table A5.1 (master qualification by area category).
 */

import { distinctSeaDates } from './seaTime.js';
import { EXPOSURE_ORDER, isEntryArea, type EntryArea } from './seaAreas/aggregate.js';

export const WBC3_NEAR_LAND_NM = 3;
export const WBC3_NEAR_DEPARTURE_NM = 3;

export type Wbc3Condition = 'favourable_weather' | 'daylight';
export type Wbc3Band = 'cat_6_5' | 'cat_4_3' | 'cat_2' | 'cat_1' | 'cat_0' | 'categorised_only' | 'outside_uk' | 'no_fixes';

export interface Wbc3Option {
  category: number;
  conditions: Wbc3Condition[];
}

export interface Wbc3Result {
  band: Wbc3Band;
  /** Area categories the trip fits, most restricted first, with the conditions each needs. */
  options: Wbc3Option[];
  /** Most restricted category that needs no conditions (null when not measured). */
  category_without_conditions: number | null;
  max_from_land_nm: number | null;
  max_from_departure_or_categorised_nm: number | null;
  max_from_safe_haven_nm: number | null;
  fixes: number;
}

export interface TrackPoint {
  lat: number;
  lon: number;
  /** Fix area: 'A' to 'D', 'sea', or null when not placed (normalise stored fixes with fixArea). */
  area?: string | null;
}

/** Distances the classifier can measure for a point. */
export interface Wbc3Measures {
  distanceFromLandNm(p: { lat: number; lon: number }): number;
  /** Distance to the nearest categorised water (0 inside). Used for the seaward edge and as the safe haven. */
  distanceFromCategorisedNm(p: { lat: number; lon: number }): number;
  isInUkWaters(p: { lat: number; lon: number }): boolean;
}

const R_NM = 3440.065;
function haversineNm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function optionsForBand(band: Wbc3Band): Wbc3Option[] {
  switch (band) {
    case 'cat_6_5':
      return [
        { category: 6, conditions: ['favourable_weather', 'daylight'] },
        { category: 5, conditions: ['favourable_weather'] },
        { category: 4, conditions: ['favourable_weather', 'daylight'] },
        { category: 3, conditions: [] },
      ];
    case 'cat_4_3':
      return [
        { category: 4, conditions: ['favourable_weather', 'daylight'] },
        { category: 3, conditions: [] },
      ];
    case 'cat_2':
      return [{ category: 2, conditions: [] }];
    case 'cat_1':
      return [{ category: 1, conditions: [] }];
    case 'cat_0':
      return [{ category: 0, conditions: [] }];
    default:
      return [];
  }
}

function result(band: Wbc3Band, fixes: number, land: number | null, dep: number | null, haven: number | null): Wbc3Result {
  const options = optionsForBand(band);
  return {
    band,
    options,
    category_without_conditions: options.find((o) => o.conditions.length === 0)?.category ?? null,
    max_from_land_nm: land == null ? null : round1(land),
    max_from_departure_or_categorised_nm: dep == null ? null : round1(dep),
    max_from_safe_haven_nm: haven == null ? null : round1(haven),
    fixes,
  };
}

/**
 * Work out the WBC3 area category a trip's track fits. Only fixes at sea (outside
 * categorised waters) are measured. A trip that never left categorised waters is
 * not at sea, so no area category applies.
 */
export function wbc3AreaForTrack(track: TrackPoint[], m: Wbc3Measures): Wbc3Result {
  const pts = track.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (pts.length === 0) return result('no_fixes', 0, null, null, null);
  const sea = pts.filter((p) => p.area === 'sea');
  if (sea.length === 0) {
    const anyCategorised = pts.some((p) => p.area != null);
    return result(anyCategorised ? 'categorised_only' : 'no_fixes', pts.length, null, null, null);
  }
  const uk = sea.filter((p) => m.isInUkWaters(p));
  if (uk.length === 0) return result('outside_uk', pts.length, null, null, null);

  // Point of departure to sea: the first fix at sea.
  const departure = uk[0];
  let maxLand = 0;
  let maxDep = 0;
  let maxHaven = 0;
  for (const p of uk) {
    const toCat = m.distanceFromCategorisedNm(p);
    maxLand = Math.max(maxLand, m.distanceFromLandNm(p));
    maxDep = Math.max(maxDep, Math.min(haversineNm(p, departure), toCat));
    maxHaven = Math.max(maxHaven, toCat);
  }
  let band: Wbc3Band;
  if (maxLand <= WBC3_NEAR_LAND_NM && maxDep <= WBC3_NEAR_DEPARTURE_NM) band = 'cat_6_5';
  else if (maxHaven <= 20) band = 'cat_4_3';
  else if (maxHaven <= 60) band = 'cat_2';
  else if (maxHaven <= 150) band = 'cat_1';
  else band = 'cat_0';
  return result(band, pts.length, maxLand, maxDep, maxHaven);
}

// ---------------------------------------------------------------------------
// Tickets (WBC3 Table A5.1)
// ---------------------------------------------------------------------------

export interface Wbc3Ticket {
  id: string;
  /** Area categories the ticket is accepted for. */
  categories: number[];
  /** Certificate types on file that count as holding it. */
  certificate_types: string[];
  /** Short note id for the app (limits from the table notes). */
  note?: 'own_area' | 'daylight_only' | 'open_boats' | 'appropriate_area';
}

export const WBC3_TICKETS: Wbc3Ticket[] = [
  { id: 'master_workboat', categories: [0, 1, 2, 3, 4, 5, 6], certificate_types: [] },
  { id: 'master_code_200gt', categories: [0, 1, 2, 3, 4, 5, 6], certificate_types: [] },
  { id: 'yachtmaster_ocean', categories: [0, 1, 2, 3, 4, 5, 6], certificate_types: ['occ_yachtmaster_ocean', 'course_ym_ocean'] },
  { id: 'master_code_200gt_150nm', categories: [1, 2, 3, 4, 5, 6], certificate_types: [] },
  { id: 'yachtmaster_offshore', categories: [1, 2, 3, 4, 5, 6], certificate_types: ['occ_yachtmaster_offshore', 'course_ym_offshore'] },
  { id: 'boatmaster', categories: [3, 4, 5, 6], certificate_types: ['course_boatmaster', 'coc_bml_t2l1', 'coc_bml_t2l2'], note: 'own_area' },
  { id: 'yachtmaster_coastal', categories: [3, 4, 5, 6], certificate_types: ['course_ym_coastal'] },
  { id: 'powerboat_advanced', categories: [3, 4, 5, 6], certificate_types: ['course_powerboat_advanced'] },
  { id: 'competent_authority_coc', categories: [3, 4, 5, 6], certificate_types: [], note: 'appropriate_area' },
  { id: 'day_skipper', categories: [4, 6], certificate_types: ['course_day_skipper'], note: 'daylight_only' },
  { id: 'powerboat_level_2', categories: [6], certificate_types: ['course_powerboat_l2'], note: 'open_boats' },
  { id: 'local_authority_licence', categories: [6], certificate_types: [], note: 'appropriate_area' },
];

export interface CertificateOnFile {
  certificate_type: string;
  expiry_date?: string | Date | null;
}

export interface TicketCoverage {
  id: string;
  note?: Wbc3Ticket['note'];
  /** The trip's area categories this ticket covers. */
  covers: number[];
  held: boolean;
}

/** Tickets that cover at least one of the trip's options, and whether the user holds each (not expired). */
export function ticketsForTrip(res: Wbc3Result, certs: CertificateOnFile[], now: Date = new Date()): TicketCoverage[] {
  const today = now.toISOString().slice(0, 10);
  const valid = new Set(
    certs
      .filter((c) => {
        if (!c.expiry_date) return true;
        const d = c.expiry_date instanceof Date ? c.expiry_date.toISOString().slice(0, 10) : String(c.expiry_date).slice(0, 10);
        return d >= today;
      })
      .map((c) => c.certificate_type),
  );
  const cats = res.options.map((o) => o.category);
  const out: TicketCoverage[] = [];
  for (const t of WBC3_TICKETS) {
    const covers = cats.filter((c) => t.categories.includes(c));
    if (covers.length === 0) continue;
    out.push({ id: t.id, note: t.note, covers, held: t.certificate_types.some((ct) => valid.has(ct)) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Days by area (guidance)
// ---------------------------------------------------------------------------

export interface AreaBreakdownEntry {
  start_time: Date | string;
  end_time: Date | string | null;
  status?: string | null;
  service_type?: string | null;
  area_category?: string | null;
  is_tidal?: boolean | null;
}

export interface AreaBreakdown {
  A: number;
  B: number;
  C: number;
  D: number;
  sea: number;
  not_classified: number;
  tidal: number;
  non_tidal: number;
  total: number;
}

/**
 * Days (UTC dates with 4 or more hours, as every MCA figure) by the most exposed
 * area reached that day across the entries, plus tidal and non-tidal days.
 * Confirmed entries only; yard service is left out.
 */
export function areaDayBreakdown(entries: AreaBreakdownEntry[]): AreaBreakdown {
  const byDay = new Map<string, { area: EntryArea | null; tidal: boolean | null }>();
  for (const e of entries) {
    if (e.status && e.status !== 'confirmed') continue;
    if ((e.service_type || 'actual_sea_service') === 'yard_service') continue;
    const area = isEntryArea(e.area_category) ? e.area_category : null;
    for (const d of distinctSeaDates([e as any])) {
      const cur = byDay.get(d) ?? { area: null, tidal: null };
      if (area && (cur.area === null || EXPOSURE_ORDER.indexOf(area) > EXPOSURE_ORDER.indexOf(cur.area))) cur.area = area;
      if (e.is_tidal === true) cur.tidal = true;
      else if (e.is_tidal === false && cur.tidal === null) cur.tidal = false;
      byDay.set(d, cur);
    }
  }
  const out: AreaBreakdown = { A: 0, B: 0, C: 0, D: 0, sea: 0, not_classified: 0, tidal: 0, non_tidal: 0, total: byDay.size };
  for (const v of byDay.values()) {
    if (v.area) out[v.area]++;
    else out.not_classified++;
    if (v.tidal === true) out.tidal++;
    else if (v.tidal === false) out.non_tidal++;
  }
  return out;
}

/** Report label for an entry's sea area (English; reports are English). */
export function areaReportLabel(area: string | null | undefined): string {
  if (area === 'A' || area === 'B' || area === 'C' || area === 'D') return `Cat ${area}`;
  if (area === 'sea') return 'Sea';
  return 'Not classified';
}

export function tidalReportLabel(tidal: boolean | null | undefined): string {
  if (tidal === true) return 'Tidal';
  if (tidal === false) return 'Non-tidal';
  return '';
}

/** Shown wherever the area figures appear. */
export const AREA_GUIDANCE_NOTE = 'For guidance. The MCA decides which waters count.';
