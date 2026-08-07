/**
 * aggregate.ts — roll per-fix classifications up to a sea-time entry.
 *
 * COMMERCIAL PATHWAYS PREP. Once ais_checks fixes carry area_category / is_tidal
 * (see classifyFix.ts), a sea-time entry that spans those fixes gets an
 * entry-level summary stored on sea_time_entries.{area_category, is_tidal,
 * is_categorised_water}. This module is the pure roll-up; the DB read/write
 * wiring lives in enrichEntry.ts.
 *
 * SEMANTIC CHOICES (documented so the qualifying-service engine can rely on them):
 *  - area_category = the MOST EXPOSED categorised water reached (D > C > B > A).
 *    Rationale: area/sea service is claimed "up to" a category — the widest water
 *    the vessel actually operated in is the qualifying ceiling. Null when no fix
 *    fell in categorised waters (e.g. offshore / non-GB).
 *  - is_tidal = true if ANY fix was in tidal waters (the entry touched tidal
 *    water). The engine that needs a tidal/non-tidal mileage split should use the
 *    per-fix rows, not this single flag.
 *  - is_categorised_water = true if any fix had an A–D category at all.
 * Pure and dependency-free; unit-verifiable without a DB.
 */
import type { CategorisedWater } from './areaClassification.js';

export interface FixClassification {
  area_category?: string | null;
  is_tidal?: boolean | null;
}

export interface EntryClassification {
  area_category: CategorisedWater | null;
  is_tidal: boolean | null;
  is_categorised_water: boolean | null;
}

// D is the most exposed (widest) categorised water, A the most sheltered.
const EXPOSURE_ORDER: CategorisedWater[] = ['A', 'B', 'C', 'D'];

function isCategorised(v: string | null | undefined): v is CategorisedWater {
  return v === 'A' || v === 'B' || v === 'C' || v === 'D';
}

/**
 * Roll a set of per-fix classifications up to one entry-level summary.
 * Returns all-null when there are no fixes with any classification signal
 * (so a flag-off / unclassified entry stays untouched).
 */
export function aggregateFixClassifications(fixes: FixClassification[]): EntryClassification {
  let mostExposed: CategorisedWater | null = null;
  let anyTidal = false;
  let sawTidalSignal = false;
  let anyCategorised = false;

  for (const f of fixes) {
    if (isCategorised(f.area_category)) {
      anyCategorised = true;
      if (mostExposed === null || EXPOSURE_ORDER.indexOf(f.area_category) > EXPOSURE_ORDER.indexOf(mostExposed)) {
        mostExposed = f.area_category;
      }
    }
    if (f.is_tidal === true || f.is_tidal === false) {
      sawTidalSignal = true;
      if (f.is_tidal === true) anyTidal = true;
    }
  }

  // No classified fixes at all => leave the entry columns null.
  if (!anyCategorised && !sawTidalSignal) {
    return { area_category: null, is_tidal: null, is_categorised_water: null };
  }

  return {
    area_category: mostExposed,
    is_tidal: sawTidalSignal ? anyTidal : null,
    is_categorised_water: anyCategorised,
  };
}
