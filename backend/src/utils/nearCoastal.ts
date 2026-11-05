/**
 * Near coastal or unlimited, per day and per entry, from AIS fixes. Guidance
 * only, like the sea-area figures: nothing here changes any sea service count.
 *
 * The MCA's definition, word for word in MSN 1856 (M) Amendment 1 section 5 and
 * MSN 1857 (M) Amendment 1 3.8.1:
 *   "'Near-coastal' means an area of operation restricted to 150 miles from a
 *   safe haven on the coast of the UK and 30 miles from Ireland."
 * MGN 496 limits Master (Workboat) <500 GT near coastal to "UK near coastal
 * waters only", so the same area applies to workboat CoCs.
 *
 * A point is near coastal when it is within 150 nm of a UK safe haven, or within
 * 30 nm of the coast of Ireland. A day (or entry) is unlimited when any AIS fix
 * in it was outside that area, near coastal when every fix was inside, and not
 * measured when it has no fixes.
 *
 * Limits of the AIS check, as for the Workboat Code area guidance:
 *  - "Safe haven" is not a fixed list. The distance is measured to the nearest MSN
 *    1837 categorised water (the UK harbours and estuaries the classifier holds),
 *    so a fix off a small harbour that is not listed reads further out than it was.
 *  - Ireland is the island's coast in the land layer, picked out by a box around
 *    the island. Northern Ireland's harbours are UK safe havens anyway.
 *  - Positions are fixes some time apart, so a short run outside between two fixes
 *    is missed.
 */

import { distinctSeaDates } from './seaTime.js';

/** MSN 1856 section 5 / MSN 1857 3.8.1: miles from a safe haven on the coast of the UK. */
export const NEAR_COASTAL_SAFE_HAVEN_NM = 150;
/** MSN 1856 section 5 / MSN 1857 3.8.1: miles from Ireland. */
export const NEAR_COASTAL_IRELAND_NM = 30;

// A box around the island of Ireland, wide enough to hold every point within 30 nm
// of its coast. Inside it, and outside 150 nm of a UK harbour, the nearest land is
// always Ireland (Scotland, Wales and Cornwall are well inside the 150 nm).
const IRELAND_BOX = { latMin: 50.9, latMax: 55.95, lonMin: -11.2, lonMax: -5.4 };

export type CoastalLimit = 'near_coastal' | 'unlimited';

export interface NearCoastalMeasures {
  /** Distance to the nearest categorised water (0 inside). Used as the safe haven. */
  distanceFromCategorisedNm(p: { lat: number; lon: number }): number;
  distanceFromLandNm(p: { lat: number; lon: number }): number;
}

export interface CoastalFix {
  latitude: string | number | null;
  longitude: string | number | null;
  /** Stored fix area: 'A' to 'D' means inside categorised water, so 0 nm from a safe haven. */
  area_category?: string | null;
}

const inIrelandBox = (p: { lat: number; lon: number }) =>
  p.lat >= IRELAND_BOX.latMin && p.lat <= IRELAND_BOX.latMax && p.lon >= IRELAND_BOX.lonMin && p.lon <= IRELAND_BOX.lonMax;

const CATEGORISED = new Set(['A', 'B', 'C', 'D']);

/**
 * Wraps the measures with a cache by position (to 0.01 degrees, under 0.6 nm),
 * so a long list of fixes from one area is measured once.
 */
export function cachedMeasures(m: NearCoastalMeasures): NearCoastalMeasures {
  const haven = new Map<string, number>();
  const land = new Map<string, number>();
  const key = (p: { lat: number; lon: number }) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
  return {
    distanceFromCategorisedNm(p) {
      const k = key(p);
      let d = haven.get(k);
      if (d === undefined) haven.set(k, (d = m.distanceFromCategorisedNm(p)));
      return d;
    },
    distanceFromLandNm(p) {
      const k = key(p);
      let d = land.get(k);
      if (d === undefined) land.set(k, (d = m.distanceFromLandNm(p)));
      return d;
    },
  };
}

/** Whether one position is inside the near-coastal area. */
export function isNearCoastalPoint(p: { lat: number; lon: number }, m: NearCoastalMeasures, inCategorised = false): boolean {
  if (inCategorised) return true;
  if (m.distanceFromCategorisedNm(p) <= NEAR_COASTAL_SAFE_HAVEN_NM) return true;
  return inIrelandBox(p) && m.distanceFromLandNm(p) <= NEAR_COASTAL_IRELAND_NM;
}

export interface CoastalTrackResult {
  limit: CoastalLimit | null;
  /** Furthest distance from a UK safe haven, in nm (rounded to 0.1), or null without fixes. */
  max_from_safe_haven_nm: number | null;
  fixes: number;
}

const num = (v: string | number | null) => (v == null || v === '' ? NaN : Number(v));
const toPoint = (f: CoastalFix) => ({ lat: num(f.latitude), lon: num(f.longitude) });
const valid = (p: { lat: number; lon: number }) =>
  Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;

/** Near coastal or unlimited for a set of fixes (one trip or one day). */
export function coastalLimitForFixes(fixes: CoastalFix[], m: NearCoastalMeasures): CoastalTrackResult {
  let count = 0;
  let maxHaven = 0;
  let outside = false;
  for (const f of fixes) {
    const p = toPoint(f);
    if (!valid(p)) continue;
    count++;
    const inside = CATEGORISED.has(String(f.area_category ?? ''));
    const haven = inside ? 0 : m.distanceFromCategorisedNm(p);
    maxHaven = Math.max(maxHaven, haven);
    if (!isNearCoastalPoint(p, m, inside)) outside = true;
  }
  if (count === 0) return { limit: null, max_from_safe_haven_nm: null, fixes: 0 };
  return {
    limit: outside ? 'unlimited' : 'near_coastal',
    max_from_safe_haven_nm: Math.round(maxHaven * 10) / 10,
    fixes: count,
  };
}

export interface CoastalEntry {
  id: string;
  vessel_id: string | null;
  start_time: Date | string;
  end_time: Date | string | null;
  status?: string | null;
  service_type?: string | null;
}

export interface CoastalVesselFix extends CoastalFix {
  vessel_id: string | null;
  check_time: Date | string;
}

const ms = (v: Date | string) => (v instanceof Date ? v.getTime() : new Date(v).getTime());
const dayOf = (v: Date | string) => new Date(ms(v)).toISOString().slice(0, 10);

/** The fixes of one entry: same vessel, inside its time window. */
function fixesInEntry(e: CoastalEntry, byVessel: Map<string, CoastalVesselFix[]>): CoastalVesselFix[] {
  if (!e.vessel_id) return [];
  const s = ms(e.start_time);
  const end = e.end_time ? ms(e.end_time) : s;
  return (byVessel.get(e.vessel_id) ?? []).filter((f) => {
    const t = ms(f.check_time);
    return t >= s && t <= end;
  });
}

function groupByVessel(fixes: CoastalVesselFix[]): Map<string, CoastalVesselFix[]> {
  const out = new Map<string, CoastalVesselFix[]>();
  for (const f of fixes) {
    if (!f.vessel_id) continue;
    const list = out.get(String(f.vessel_id)) ?? [];
    list.push(f);
    out.set(String(f.vessel_id), list);
  }
  return out;
}

/** Each entry's label from all its fixes (null when it has none). */
export function coastalLimitByEntry(
  entries: CoastalEntry[],
  fixes: CoastalVesselFix[],
  m: NearCoastalMeasures,
): Map<string, CoastalTrackResult> {
  const byVessel = groupByVessel(fixes);
  const out = new Map<string, CoastalTrackResult>();
  for (const e of entries) out.set(e.id, coastalLimitForFixes(fixesInEntry(e, byVessel), m));
  return out;
}

export interface CoastalDays {
  near_coastal: number;
  unlimited: number;
  /** Days with no AIS fixes to measure. */
  not_measured: number;
  total: number;
}

/**
 * Days (UTC dates with 4 or more hours, as every MCA figure) near coastal or
 * unlimited. A day is unlimited when any fix that day, in any of its entries, was
 * outside the near-coastal area. Confirmed entries only; yard service is left out.
 */
export function coastalDayBreakdown(entries: CoastalEntry[], fixes: CoastalVesselFix[], m: NearCoastalMeasures): CoastalDays {
  const byVessel = groupByVessel(fixes);
  const byDay = new Map<string, CoastalLimit | null>();
  for (const e of entries) {
    if (e.status && e.status !== 'confirmed') continue;
    if ((e.service_type || 'actual_sea_service') === 'yard_service') continue;
    const inEntry = fixesInEntry(e, byVessel);
    for (const d of distinctSeaDates([e as any])) {
      const r = coastalLimitForFixes(inEntry.filter((f) => dayOf(f.check_time) === d), m);
      const cur = byDay.get(d) ?? null;
      if (cur === 'unlimited' || r.limit === null) {
        if (!byDay.has(d)) byDay.set(d, cur);
        continue;
      }
      byDay.set(d, r.limit === 'unlimited' ? 'unlimited' : 'near_coastal');
    }
  }
  const out: CoastalDays = { near_coastal: 0, unlimited: 0, not_measured: 0, total: byDay.size };
  for (const v of byDay.values()) {
    if (v === 'unlimited') out.unlimited++;
    else if (v === 'near_coastal') out.near_coastal++;
    else out.not_measured++;
  }
  return out;
}

/** Report label (English; reports are English). */
export function coastalReportLabel(limit: CoastalLimit | null | undefined): string {
  if (limit === 'near_coastal') return 'Near coastal';
  if (limit === 'unlimited') return 'Unlimited';
  return '';
}
