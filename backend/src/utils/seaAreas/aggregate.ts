/**
 * aggregate.ts: roll per-fix classifications up to a sea-time entry.
 *
 * Each ais_checks fix carries area_category ('A' to 'D', 'sea', or null when the
 * classifier could not place it) and is_tidal (UK waters only). A sea-time entry
 * that spans those fixes gets one summary on sea_time_entries.{area_category,
 * is_tidal, is_categorised_water}. This module is the pure roll-up; the DB read
 * and write live in enrichEntry.ts.
 *
 * Rules:
 *  - area_category = the MOST EXPOSED water reached: sea > D > C > B > A. A trip
 *    that left categorised waters for the sea reads 'sea'. Null when no fix was
 *    placed.
 *  - is_tidal = true if ANY fix was in tidal water, false if fixes were placed as
 *    non-tidal and none tidal, null when no fix had a tidal value (outside the UK).
 *  - is_categorised_water = true if any fix had an A to D category.
 * Older fixes (before 2.5.0) mark the sea as no category with tidal set; they are
 * read as 'sea' too.
 */
import type { CategorisedWater } from './areaClassification.js';

export type EntryArea = CategorisedWater | 'sea';

export interface FixClassification {
  area_category?: string | null;
  is_tidal?: boolean | null;
}

export interface EntryClassification {
  area_category: EntryArea | null;
  is_tidal: boolean | null;
  is_categorised_water: boolean | null;
}

/** Least to most exposed. */
export const EXPOSURE_ORDER: EntryArea[] = ['A', 'B', 'C', 'D', 'sea'];

export function isEntryArea(v: unknown): v is EntryArea {
  return v === 'A' || v === 'B' || v === 'C' || v === 'D' || v === 'sea';
}

/** The fix's area, reading older at-sea fixes (no category, tidal set) as 'sea'. */
export function fixArea(f: FixClassification): EntryArea | null {
  if (isEntryArea(f.area_category)) return f.area_category;
  if (f.area_category == null && (f.is_tidal === true || f.is_tidal === false)) return 'sea';
  return null;
}

/** The more exposed of two areas (null loses). */
export function moreExposed(a: EntryArea | null, b: EntryArea | null): EntryArea | null {
  if (a === null) return b;
  if (b === null) return a;
  return EXPOSURE_ORDER.indexOf(b) > EXPOSURE_ORDER.indexOf(a) ? b : a;
}

/**
 * Roll a set of per-fix classifications up to one entry-level summary.
 * Returns all-null when no fix carries any classification, so an unclassified
 * entry stays untouched.
 */
export function aggregateFixClassifications(fixes: FixClassification[]): EntryClassification {
  let area: EntryArea | null = null;
  let anyTidal = false;
  let sawTidalSignal = false;
  let anyCategorised = false;

  for (const f of fixes) {
    const a = fixArea(f);
    if (a && a !== 'sea') anyCategorised = true;
    area = moreExposed(area, a);
    if (f.is_tidal === true || f.is_tidal === false) {
      sawTidalSignal = true;
      if (f.is_tidal === true) anyTidal = true;
    }
  }

  if (area === null && !sawTidalSignal) {
    return { area_category: null, is_tidal: null, is_categorised_water: null };
  }

  return {
    area_category: area,
    is_tidal: sawTidalSignal ? anyTidal : null,
    is_categorised_water: anyCategorised,
  };
}
