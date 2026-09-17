/**
 * Vessel threshold helper (CTV / workboat expansion).
 *
 * Derives the MCA/STCW threshold flags that certification pathways gate on,
 * from a vessel's measured attributes. Thresholds per the CTV/workboat spec:
 *   - Load line length: 15m, 24m
 *   - Gross tonnage:    80, 200, 500, 3000 GT
 *   - Propulsion power: 200, 350, 750 kW (engineer routes also use 3000/9000 kW)
 *
 * Numeric columns arrive as strings from Drizzle `decimal`, so everything is
 * coerced defensively. A null measurement yields null flags (unknown), never
 * a false positive.
 */

export interface VesselMeasurements {
  length_metres?: string | number | null;
  gross_tonnes?: string | number | null;
  engine_kilowatts?: string | number | null;
  is_workboat?: boolean | null;
  is_high_speed?: boolean | null;
}

export type GtBand = 'under_80' | '80_to_200' | '200_to_500' | '500_to_3000' | '3000_plus';

export interface VesselThresholds {
  lengthMetres: number | null;
  grossTonnes: number | null;
  engineKw: number | null;
  isWorkboat: boolean;
  isHighSpeed: boolean;

  // Load line length
  isAtLeast15m: boolean | null;
  isAtLeast24m: boolean | null;
  isUnder24m: boolean | null;

  // Gross tonnage
  gtBand: GtBand | null;
  isUnder200GT: boolean | null;
  isUnder500GT: boolean | null;
  isUnder3000GT: boolean | null;

  // Propulsion power (engineer routes)
  isAtLeast200kW: boolean | null;
  isAtLeast350kW: boolean | null;
  isAtLeast750kW: boolean | null;
  isUnder3000kW: boolean | null;
  isUnder9000kW: boolean | null;
}

function toNum(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function gtBand(gt: number | null): GtBand | null {
  if (gt === null) return null;
  if (gt < 80) return 'under_80';
  if (gt < 200) return '80_to_200';
  if (gt < 500) return '200_to_500';
  if (gt < 3000) return '500_to_3000';
  return '3000_plus';
}

export function vesselThresholds(v: VesselMeasurements): VesselThresholds {
  const L = toNum(v.length_metres);
  const GT = toNum(v.gross_tonnes);
  const kW = toNum(v.engine_kilowatts);

  return {
    lengthMetres: L,
    grossTonnes: GT,
    engineKw: kW,
    isWorkboat: v.is_workboat === true,
    isHighSpeed: v.is_high_speed === true,

    isAtLeast15m: L === null ? null : L >= 15,
    isAtLeast24m: L === null ? null : L >= 24,
    isUnder24m: L === null ? null : L < 24,

    gtBand: gtBand(GT),
    isUnder200GT: GT === null ? null : GT < 200,
    isUnder500GT: GT === null ? null : GT < 500,
    isUnder3000GT: GT === null ? null : GT < 3000,

    isAtLeast200kW: kW === null ? null : kW >= 200,
    isAtLeast350kW: kW === null ? null : kW >= 350,
    isAtLeast750kW: kW === null ? null : kW >= 750,
    isUnder3000kW: kW === null ? null : kW < 3000,
    isUnder9000kW: kW === null ? null : kW < 9000,
  };
}
