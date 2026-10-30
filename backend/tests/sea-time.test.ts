import { describe, test, expect } from "bun:test";
import {
  entrySeaDays,
  hoursByDate,
  calculateDurationHours,
  calculateSeaDays,
  calendarDaysCovered,
  countDistinctSeaDays,
  qualifyingSeaDays,
  uscgCreditableDays,
  amsaCreditableDays,
  mnzCreditableDays,
  USCG_DAYS_PER_MONTH,
  USCG_DAYS_PER_YEAR,
  USCG_STANDARD_HOURS_PER_DAY,
  USCG_MINIMUM_HOURS_PER_DAY,
  calculateDistanceNauticalMiles,
  getCalendarDay,
  isValidServiceType,
} from "../src/utils/seaTime";

const d = (s: string) => new Date(s);

// Build an 8-hour (qualifying) entry on a given UTC date with a service type.
const day = (date: string, service_type = "actual_sea_service") => ({
  start_time: `${date}T08:00:00Z`,
  end_time: `${date}T16:00:00Z`,
  service_type,
});
// N sequential daily entries starting at a base date, of a given type.
const days = (startISO: string, n: number, service_type = "actual_sea_service") => {
  const out = [];
  const base = new Date(`${startISO}T00:00:00Z`);
  for (let i = 0; i < n; i++) {
    const dt = new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10);
    out.push(day(dt, service_type));
  }
  return out;
};

// ---------------------------------------------------------------------------
// calculateDurationHours
// ---------------------------------------------------------------------------
describe("calculateDurationHours", () => {
  test("returns 0 for identical timestamps", () => {
    const t = new Date("2025-06-01T08:00:00Z");
    expect(calculateDurationHours(t, t)).toBe(0);
  });

  test("returns exact hours for clean intervals", () => {
    const start = new Date("2025-06-01T08:00:00Z");
    const end = new Date("2025-06-01T12:00:00Z");
    expect(calculateDurationHours(start, end)).toBe(4);
  });

  test("handles fractional hours", () => {
    const start = new Date("2025-06-01T08:00:00Z");
    const end = new Date("2025-06-01T09:30:00Z");
    expect(calculateDurationHours(start, end)).toBe(1.5);
  });

  test("rounds to 2 decimal places", () => {
    const start = new Date("2025-06-01T08:00:00Z");
    // 7 minutes = 0.11666... hours → should round to 0.12
    const end = new Date("2025-06-01T08:07:00Z");
    expect(calculateDurationHours(start, end)).toBe(0.12);
  });

  test("handles overnight (across midnight)", () => {
    const start = new Date("2025-06-01T22:00:00Z");
    const end = new Date("2025-06-02T06:00:00Z");
    expect(calculateDurationHours(start, end)).toBe(8);
  });

  test("handles multi-day spans", () => {
    const start = new Date("2025-06-01T00:00:00Z");
    const end = new Date("2025-06-04T00:00:00Z");
    expect(calculateDurationHours(start, end)).toBe(72);
  });

  test("returns negative for reversed timestamps", () => {
    const start = new Date("2025-06-01T12:00:00Z");
    const end = new Date("2025-06-01T08:00:00Z");
    expect(calculateDurationHours(start, end)).toBe(-4);
  });
});

// ---------------------------------------------------------------------------
// calculateSeaDays — one day per calendar date, MCA 4-hour threshold
// ---------------------------------------------------------------------------
describe("calculateSeaDays", () => {
  test("returns 0 for identical timestamps", () => {
    const t = d("2025-06-01T08:00:00Z");
    expect(calculateSeaDays(t, t)).toBe(0);
  });

  test("returns 0 just under the 4-hour threshold", () => {
    expect(calculateSeaDays(d("2025-06-01T08:00:00Z"), d("2025-06-01T11:59:00Z"))).toBe(0);
  });

  test("returns 1 for exactly 4 hours within one day", () => {
    expect(calculateSeaDays(d("2025-06-01T08:00:00Z"), d("2025-06-01T12:00:00Z"))).toBe(1);
  });

  test("returns 1 for a long single-day passage", () => {
    expect(calculateSeaDays(d("2025-06-01T02:00:00Z"), d("2025-06-01T22:00:00Z"))).toBe(1);
  });

  test("counts each calendar day of a multi-day passage", () => {
    // 18 Jul 07:45 → 25 Jul 06:45 touches 8 calendar dates
    expect(calculateSeaDays(d("2026-07-18T07:45:00Z"), d("2026-07-25T06:45:00Z"))).toBe(8);
  });

  test("counts a 93-day passage as 93 days, not 1", () => {
    // Ends at 00:00 on 17 Apr, so no time falls on that date
    expect(calculateSeaDays(d("2025-01-14T00:00:00Z"), d("2025-04-17T00:00:00Z"))).toBe(93);
  });

  test("returns 0 for reversed timestamps", () => {
    expect(calculateSeaDays(d("2025-06-02T08:00:00Z"), d("2025-06-01T08:00:00Z"))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calendarDaysCovered
// ---------------------------------------------------------------------------
describe("calendarDaysCovered", () => {
  test("single day", () => {
    expect(calendarDaysCovered(d("2025-06-01T02:00:00Z"), d("2025-06-01T20:00:00Z")))
      .toEqual(["2025-06-01"]);
  });

  test("inclusive of both ends across midnight", () => {
    expect(calendarDaysCovered(d("2025-06-01T22:00:00Z"), d("2025-06-03T01:00:00Z")))
      .toEqual(["2025-06-01", "2025-06-02", "2025-06-03"]);
  });
});

// ---------------------------------------------------------------------------
// countDistinctSeaDays — dedupe overlaps
// ---------------------------------------------------------------------------
describe("countDistinctSeaDays", () => {
  test("sums non-overlapping entries", () => {
    expect(countDistinctSeaDays([
      { start_time: "2025-06-01T08:00:00Z", end_time: "2025-06-01T18:00:00Z" },
      { start_time: "2025-06-03T08:00:00Z", end_time: "2025-06-03T18:00:00Z" },
    ])).toBe(2);
  });

  test("does not double-count overlapping calendar days", () => {
    // 17–19 auto entry overlapping an 18–25 manual block = 9 distinct days
    expect(countDistinctSeaDays([
      { start_time: "2026-07-17T12:00:00Z", end_time: "2026-07-19T09:00:00Z" },
      { start_time: "2026-07-18T07:45:00Z", end_time: "2026-07-25T06:45:00Z" },
    ])).toBe(9);
  });

  test("ignores sub-4-hour entries", () => {
    expect(countDistinctSeaDays([
      { start_time: "2025-06-01T08:00:00Z", end_time: "2025-06-01T10:00:00Z" },
    ])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// qualifyingSeaDays — MSN 1858 crediting caps
// ---------------------------------------------------------------------------
describe("qualifyingSeaDays", () => {
  test("all actual service counts in full", () => {
    const r = qualifyingSeaDays(days("2025-01-01", 250, "actual_sea_service"));
    expect(r.actual).toBe(250);
    expect(r.qualifying_total).toBe(250);
  });

  test("watchkeeping counts as actual service", () => {
    const r = qualifyingSeaDays(days("2025-01-01", 10, "watchkeeping_service"));
    expect(r.actual).toBe(10);
    expect(r.qualifying_total).toBe(10);
  });

  test("caps yard service at 90 days", () => {
    const r = qualifyingSeaDays([
      ...days("2025-01-01", 300, "actual_sea_service"),
      ...days("2026-01-01", 120, "yard_service"),
    ]);
    expect(r.yard).toBe(120);
    expect(r.yard_credited).toBe(90);
    expect(r.qualifying_total).toBe(390); // 300 actual + 90 yard
  });

  test("stand-by is counted in full (its structure limits are left to the assessor)", () => {
    const r = qualifyingSeaDays([
      ...days("2025-01-01", 10, "actual_sea_service"),
      ...days("2026-01-01", 20, "standby_service"),
    ]);
    expect(r.standby).toBe(20);
    expect(r.qualifying_total).toBe(30); // 10 actual + 20 standby, not capped
  });

  test("service in port is excluded from qualifying total", () => {
    const r = qualifyingSeaDays([
      ...days("2025-01-01", 10, "actual_sea_service"),
      ...days("2026-01-01", 30, "service_in_port"),
    ]);
    expect(r.port).toBe(30);
    expect(r.qualifying_total).toBe(10);
  });

  test("a calendar day counts once, at its most valuable classification", () => {
    // Same date logged as both actual and yard -> counts as actual only.
    const r = qualifyingSeaDays([
      day("2025-01-01", "actual_sea_service"),
      day("2025-01-01", "yard_service"),
    ]);
    expect(r.actual).toBe(1);
    expect(r.yard).toBe(0);
    expect(r.qualifying_total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// calculateDistanceNauticalMiles — Haversine
// ---------------------------------------------------------------------------
describe("calculateDistanceNauticalMiles", () => {
  test("returns 0 for identical coordinates", () => {
    expect(calculateDistanceNauticalMiles(51.5, -0.1, 51.5, -0.1)).toBe(0);
  });

  test("London to Paris (~185 nm)", () => {
    const dist = calculateDistanceNauticalMiles(51.5074, -0.1278, 48.8566, 2.3522);
    // Known distance is ~185 nm — allow some tolerance
    expect(dist).toBeGreaterThan(175);
    expect(dist).toBeLessThan(195);
  });

  test("Southampton to Cowes (~7 nm)", () => {
    // Southampton: 50.9025, -1.4042  Cowes: 50.7622, -1.2997
    const dist = calculateDistanceNauticalMiles(50.9025, -1.4042, 50.7622, -1.2997);
    expect(dist).toBeGreaterThan(5);
    expect(dist).toBeLessThan(12);
  });

  test("is symmetric", () => {
    const ab = calculateDistanceNauticalMiles(51.5, -0.1, 48.85, 2.35);
    const ba = calculateDistanceNauticalMiles(48.85, 2.35, 51.5, -0.1);
    expect(ab).toBe(ba);
  });

  test("handles equator crossing", () => {
    const dist = calculateDistanceNauticalMiles(1, 0, -1, 0);
    // 2 degrees of latitude ≈ 120 nm
    expect(dist).toBeGreaterThan(115);
    expect(dist).toBeLessThan(125);
  });

  test("handles antimeridian crossing", () => {
    const dist = calculateDistanceNauticalMiles(0, 179, 0, -179);
    // 2 degrees of longitude at equator ≈ 120 nm
    expect(dist).toBeGreaterThan(115);
    expect(dist).toBeLessThan(125);
  });
});

// ---------------------------------------------------------------------------
// getCalendarDay
// ---------------------------------------------------------------------------
describe("getCalendarDay", () => {
  test("formats a normal date", () => {
    // Note: getCalendarDay uses local time, so we construct a date with explicit components
    const d = new Date(2025, 5, 1); // June 1, 2025 local
    expect(getCalendarDay(d)).toBe("2025-06-01");
  });

  test("pads single-digit month and day", () => {
    const d = new Date(2025, 0, 5); // Jan 5
    expect(getCalendarDay(d)).toBe("2025-01-05");
  });

  test("handles Dec 31", () => {
    const d = new Date(2025, 11, 31); // Dec 31
    expect(getCalendarDay(d)).toBe("2025-12-31");
  });

  test("handles Jan 1", () => {
    const d = new Date(2026, 0, 1); // Jan 1
    expect(getCalendarDay(d)).toBe("2026-01-01");
  });
});

// ---------------------------------------------------------------------------
// isValidServiceType
// ---------------------------------------------------------------------------
describe("isValidServiceType", () => {
  test("accepts all valid types", () => {
    expect(isValidServiceType("actual_sea_service")).toBe(true);
    expect(isValidServiceType("watchkeeping_service")).toBe(true);
    expect(isValidServiceType("standby_service")).toBe(true);
    expect(isValidServiceType("yard_service")).toBe(true);
    expect(isValidServiceType("service_in_port")).toBe(true);
  });

  test("rejects invalid strings", () => {
    expect(isValidServiceType("invalid")).toBe(false);
    expect(isValidServiceType("")).toBe(false);
  });

  test("rejects non-string values", () => {
    expect(isValidServiceType(null)).toBe(false);
    expect(isValidServiceType(undefined)).toBe(false);
    expect(isValidServiceType(42)).toBe(false);
    expect(isValidServiceType({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// uscgCreditableDays - 46 CFR 10.107 / 11.211
// ---------------------------------------------------------------------------
describe("uscgCreditableDays", () => {
  const small = { gross_tonnes: "45.00", tonnage_itc: null };
  const big = { gross_tonnes: "250.00", tonnage_itc: null };

  // An entry of `hours` on a given UTC date, optionally on a given vessel.
  const entry = (date: string, hours: number, vessel: any = null, service_type = "actual_sea_service") => ({
    start_time: `${date}T08:00:00Z`,
    end_time: `${date}T${String(8 + hours).padStart(2, "0")}:00:00Z`,
    service_type,
    vessel,
  });

  test("an 8-hour day is creditable", () => {
    expect(uscgCreditableDays([entry("2025-06-01", 8, big)]).creditable).toBe(1);
  });

  test("a 6-hour day on a vessel under 100 GRT is provisional, not discarded", () => {
    const r = uscgCreditableDays([entry("2025-06-01", 6, small)]);
    expect(r.creditable).toBe(0);
    expect(r.provisional).toBe(1);
    expect(r.short_of_standard_day).toBe(0);
  });

  test("a 6-hour day on a vessel of 100 GRT or more falls short of the standard day", () => {
    const r = uscgCreditableDays([entry("2025-06-01", 6, big)]);
    expect(r.provisional).toBe(0);
    expect(r.short_of_standard_day).toBe(1);
  });

  test("a short day on a vessel with no tonnage is held, not classified", () => {
    const unknown = { vessel_name: "Sea Breeze", gross_tonnes: null, tonnage_itc: null };
    const r = uscgCreditableDays([entry("2025-06-01", 6, unknown)]);
    expect(r.awaiting_tonnage).toBe(1);
    expect(r.provisional).toBe(0);
    expect(r.short_of_standard_day).toBe(0);
    expect(r.vessels_awaiting_tonnage).toEqual(["Sea Breeze"]);
  });

  test("a full day credits even when the tonnage is unknown", () => {
    const unknown = { vessel_name: "Sea Breeze", gross_tonnes: null, tonnage_itc: null };
    const r = uscgCreditableDays([entry("2025-06-01", 8, unknown)]);
    expect(r.creditable).toBe(1);
    expect(r.awaiting_tonnage).toBe(0);
  });

  test("under 4 hours is below the floor rather than held for tonnage", () => {
    const unknown = { vessel_name: "Sea Breeze", gross_tonnes: null, tonnage_itc: null };
    const r = uscgCreditableDays([entry("2025-06-01", 3, unknown)]);
    expect(r.below_minimum).toBe(1);
    expect(r.awaiting_tonnage).toBe(0);
  });

  test("ITC tonnage stands in for GRT when GRT is absent", () => {
    const itcSmall = { gross_tonnes: null, tonnage_itc: "80.00" };
    expect(uscgCreditableDays([entry("2025-06-01", 6, itcSmall)]).provisional).toBe(1);
  });

  test("a day under 4 hours is below the floor on any reading", () => {
    const r = uscgCreditableDays([entry("2025-06-01", 3, small)]);
    expect(r.below_minimum).toBe(1);
    expect(r.provisional).toBe(0);
    expect(r.creditable).toBe(0);
  });

  test("a short watch across midnight cannot yield two days", () => {
    const r = uscgCreditableDays([
      { start_time: "2025-06-01T21:00:00Z", end_time: "2025-06-02T03:00:00Z", service_type: "actual_sea_service", vessel: small },
    ]);
    expect(r.provisional).toBe(1);
  });

  test("a continuous passage credits every calendar day it covers", () => {
    const r = uscgCreditableDays([
      { start_time: "2025-06-01T06:00:00Z", end_time: "2025-06-05T18:00:00Z", service_type: "actual_sea_service", vessel: big },
    ]);
    expect(r.creditable).toBe(5);
  });

  test("a 4-hour day counts for the MCA but never fully for the USCG", () => {
    const e = [entry("2025-06-01", 4, small)];
    expect(qualifyingSeaDays(e as any).qualifying_total).toBe(1);
    expect(uscgCreditableDays(e).creditable).toBe(0);
  });

  describe("two-watch vessels (46 CFR 10.107: a 12-hour day may count as 1.5)", () => {
    const twoWatch = { gross_tonnes: "250.00", tonnage_itc: null, is_two_watch: true };

    test("a 12-hour day on a vessel marked two-watch earns an extra half day", () => {
      const r = uscgCreditableDays([entry("2025-06-01", 12, twoWatch)]);
      expect(r.creditable).toBe(1);
      expect(r.two_watch_days).toBe(1);
      expect(r.two_watch_bonus).toBe(0.5);
      expect(r.creditable_total).toBe(1.5);
    });

    test("a 12-hour day on an unmarked vessel stays at one day", () => {
      const r = uscgCreditableDays([entry("2025-06-01", 12, big)]);
      expect(r.creditable_total).toBe(1);
      expect(r.two_watch_days).toBe(0);
    });

    test("a 10-hour day on a two-watch vessel is one day", () => {
      const r = uscgCreditableDays([entry("2025-06-01", 10, twoWatch)]);
      expect(r.creditable_total).toBe(1);
    });

    test("a full 24-hour period is still capped at 1.5 days", () => {
      const r = uscgCreditableDays([{
        start_time: "2025-06-01T00:00:00Z", end_time: "2025-06-02T00:00:00Z",
        service_type: "actual_sea_service", vessel: twoWatch,
      }]);
      expect(r.creditable_total).toBe(1.5);
    });

    test("no uplift when the period also includes an unmarked vessel", () => {
      const r = uscgCreditableDays([
        entry("2025-06-01", 6, twoWatch),
        { start_time: "2025-06-01T14:00:00Z", end_time: "2025-06-01T20:00:00Z", service_type: "actual_sea_service", vessel: big },
      ]);
      expect(r.creditable).toBe(1);
      expect(r.two_watch_days).toBe(0);
    });

    test("stand-by on a two-watch vessel is still not credited", () => {
      const r = uscgCreditableDays([entry("2025-06-01", 12, twoWatch, "standby_service")]);
      expect(r.creditable_total).toBe(0);
    });

    test("the stored per-entry figure stays a whole day", () => {
      expect(entrySeaDays(entry("2025-06-01", 12, twoWatch) as any, "uscg")).toBe(1);
    });
  });

  test("watchkeeping service is sea service", () => {
    expect(uscgCreditableDays([entry("2025-06-01", 8, big, "watchkeeping_service")]).creditable).toBe(1);
  });

  test("yard, port and stand-by are reported but never credited", () => {
    const r = uscgCreditableDays([
      entry("2025-06-01", 8, big, "yard_service"),
      entry("2025-06-02", 8, big, "service_in_port"),
      entry("2025-06-03", 8, big, "standby_service"),
    ]);
    expect(r.creditable).toBe(0);
    expect(r.yard).toBe(1);
    expect(r.port).toBe(1);
    expect(r.standby).toBe(1);
  });

  test("yard service is not capped and rolled in the way the MCA total does it", () => {
    const yard = days("2025-01-01", 120, "yard_service").map((d) => ({ ...d, vessel: big }));
    expect(qualifyingSeaDays(yard as any).qualifying_total).toBe(90);
    expect(uscgCreditableDays(yard).creditable).toBe(0);
  });

  test("a full day beats a provisional one on the same date", () => {
    const r = uscgCreditableDays([
      entry("2025-06-01", 8, big),
      entry("2025-06-01", 5, small),
    ]);
    expect(r.creditable).toBe(1);
    expect(r.provisional).toBe(0);
  });

  test("a sea day beats yard or port on the same date", () => {
    const r = uscgCreditableDays([
      entry("2025-06-01", 8, big),
      entry("2025-06-01", 8, big, "yard_service"),
      entry("2025-06-01", 8, big, "service_in_port"),
    ]);
    expect(r.creditable).toBe(1);
    expect(r.yard).toBe(0);
    expect(r.port).toBe(0);
  });

  test("two years of 8-hour days reaches the 720-day 200-ton Master target", () => {
    const twoYears = days("2025-01-01", 720).map((d) => ({ ...d, vessel: big }));
    expect(uscgCreditableDays(twoYears).creditable).toBe(720);
    expect(USCG_DAYS_PER_YEAR * 2).toBe(720);
    expect(USCG_DAYS_PER_MONTH * 24).toBe(720);
  });

  test("returns zeroes for no entries", () => {
    const r = uscgCreditableDays([]);
    expect(r.creditable).toBe(0);
    expect(r.provisional).toBe(0);
    expect(r.short_of_standard_day).toBe(0);
    expect(r.below_minimum).toBe(0);
    expect(r.awaiting_tonnage).toBe(0);
    expect(r.vessels_awaiting_tonnage).toEqual([]);
  });
});

// ── AMSA (Marine Order 505) ─────────────────────────────────────────

describe("amsaCreditableDays", () => {
  test("credits a full 8-hour working day", () => {
    const r = amsaCreditableDays(days("2026-01-01", 10));
    expect(r.underway).toBe(10);
    expect(r.not_underway).toBe(0);
    expect(r.part_day_hours).toBe(0);
  });

  test("adds shorter shifts together until they make a day", () => {
    const r = amsaCreditableDays([
      { start_time: "2026-01-01T08:00:00Z", end_time: "2026-01-01T12:00:00Z" },
      { start_time: "2026-01-02T08:00:00Z", end_time: "2026-01-02T12:00:00Z" },
    ]);
    expect(r.qualifying_hours).toBe(8);
    expect(r.underway).toBe(1);
  });

  test("a long day is still one day", () => {
    const r = amsaCreditableDays([
      { start_time: "2026-01-01T00:00:00Z", end_time: "2026-01-01T16:00:00Z" },
    ]);
    expect(r.underway).toBe(1);
    expect(r.qualifying_hours).toBe(8);
  });

  test("yard, stand-by and port service count as not underway", () => {
    const r = amsaCreditableDays([
      ...days("2026-02-01", 3, "yard_service"),
      ...days("2026-03-01", 2, "standby_service"),
      ...days("2026-04-01", 1, "service_in_port"),
    ]);
    expect(r.underway).toBe(0);
    expect(r.not_underway).toBe(6);
  });

  test("sea service logged while stationary is not underway", () => {
    const r = amsaCreditableDays([
      { ...day("2026-05-01"), is_stationary: true },
    ]);
    expect(r.underway).toBe(0);
    expect(r.not_underway).toBe(1);
  });

  test("a date worked both ways counts once, as underway", () => {
    const r = amsaCreditableDays([
      day("2026-06-01"),
      { ...day("2026-06-01", "yard_service") },
    ]);
    expect(r.underway).toBe(1);
    expect(r.not_underway).toBe(0);
  });

  test("navigational watch days come from logged bridge-watch hours", () => {
    const r = amsaCreditableDays([
      { ...day("2026-07-01"), bridge_watch_hours: 40 },
      { ...day("2026-07-02"), bridge_watch_hours: 40 },
    ]);
    expect(r.navigational_watch).toBe(10);
  });
});

// ── Maritime NZ (SeaCert) ───────────────────────────────────────────

describe("mnzCreditableDays", () => {
  const now = new Date("2026-09-16T00:00:00Z");

  test("counts actual, stand-by and yard toward the total", () => {
    const r = mnzCreditableDays([
      ...days("2026-01-01", 10),
      ...days("2026-02-01", 5, "standby_service"),
      ...days("2026-03-01", 3, "yard_service"),
    ], now);
    expect(r.actual).toBe(10);
    expect(r.standby).toBe(5);
    expect(r.yard).toBe(3);
    expect(r.qualifying_total).toBe(18);
  });

  test("does not apply the MCA 90-day yard cap", () => {
    const r = mnzCreditableDays(days("2025-01-01", 100, "yard_service"), now);
    expect(r.yard).toBe(100);
    expect(r.qualifying_total).toBe(100);
  });

  test("service in port is reported but not credited", () => {
    const r = mnzCreditableDays(days("2026-01-01", 4, "service_in_port"), now);
    expect(r.port).toBe(4);
    expect(r.qualifying_total).toBe(0);
  });

  test("service older than 10 years falls outside the window", () => {
    const r = mnzCreditableDays([
      ...days("2010-01-01", 6),
      ...days("2026-01-01", 4),
    ], now);
    expect(r.actual).toBe(4);
    expect(r.outside_window).toBe(6);
  });

  test("hours are totalled for the 200-hour certificates", () => {
    const r = mnzCreditableDays(days("2026-01-01", 10), now);
    expect(r.hours).toBe(80);
  });

  test("watchkeeping days come from logged watch hours", () => {
    const r = mnzCreditableDays([
      { ...day("2026-01-01"), watchkeeping_hours: 24 },
      { ...day("2026-01-02"), watchkeeping_hours: 24 },
    ], now);
    expect(r.watchkeeping).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Declared day entries: confirmed manual entries with a start date, no end
// time and sea_days set, which the logbook already counts as sea days.
// ---------------------------------------------------------------------------
describe("declared day entries", () => {
  const declared = (date: string, extra: Record<string, unknown> = {}) => ({
    start_time: `${date}T07:30:00Z`,
    end_time: null,
    sea_days: 1,
    status: "confirmed",
    service_type: "actual_sea_service",
    ...extra,
  });

  test("count as one MCA sea day each", () => {
    const entries = [declared("2026-09-14"), declared("2026-09-15"), declared("2026-09-16")];
    expect(countDistinctSeaDays(entries)).toBe(3);
    expect(qualifyingSeaDays(entries).actual).toBe(3);
  });

  test("a late start time still credits only its own date", () => {
    expect(countDistinctSeaDays([declared("2026-09-14", { start_time: "2026-09-14T22:30:00Z" })])).toBe(1);
  });

  test("sea_days > 1 credits consecutive dates", () => {
    expect(countDistinctSeaDays([declared("2026-09-14", { sea_days: 3 })])).toBe(3);
  });

  test("do not double count a date already covered by a timed entry", () => {
    expect(countDistinctSeaDays([declared("2026-09-14"), day("2026-09-14")])).toBe(1);
  });

  test("keep their service type", () => {
    const r = qualifyingSeaDays([declared("2026-09-14", { service_type: "standby_service" })]);
    expect(r.standby).toBe(1);
    expect(r.actual).toBe(0);
  });

  test("credit a standard day under USCG, AMSA and MNZ", () => {
    const entries = [declared("2026-09-14"), declared("2026-09-15")];
    expect(uscgCreditableDays(entries).creditable).toBe(2);
    expect(amsaCreditableDays(entries).underway).toBe(2);
    const mnz = mnzCreditableDays(entries, new Date("2026-10-08T00:00:00Z"));
    expect(mnz.actual).toBe(2);
    expect(mnz.hours).toBe(16);
  });

  test("open shifts, pending entries and entries without sea_days still count nothing", () => {
    expect(countDistinctSeaDays([declared("2026-09-14", { status: "active" })])).toBe(0);
    expect(countDistinctSeaDays([declared("2026-09-14", { status: "pending" })])).toBe(0);
    expect(countDistinctSeaDays([declared("2026-09-14", { sea_days: null })])).toBe(0);
    expect(countDistinctSeaDays([declared("2026-09-14", { sea_days: 0 })])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Per-date hours (MCA / MNZ): 4 hours must fall on the date itself
// ---------------------------------------------------------------------------
describe("MCA 4 hours within the calendar day", () => {
  const e = (start: string, end: string, service_type = "actual_sea_service") =>
    ({ start_time: start, end_time: end, service_type, status: "confirmed" });

  test("hoursByDate splits at UTC midnight", () => {
    const m = hoursByDate(d("2026-07-21T18:55:00Z"), d("2026-07-22T02:28:00Z"));
    expect(m.get("2026-07-21")).toBeCloseTo(5.0833, 3);
    expect(m.get("2026-07-22")).toBeCloseTo(2.4667, 3);
  });

  test("a passage crossing midnight only earns the second date with 4 hours after midnight", () => {
    expect(calculateSeaDays(d("2026-07-21T18:55:00Z"), d("2026-07-22T02:28:00Z"))).toBe(1);
    expect(calculateSeaDays(d("2026-07-21T18:00:00Z"), d("2026-07-22T04:00:00Z"))).toBe(2);
    expect(calculateSeaDays(d("2026-07-21T21:00:00Z"), d("2026-07-22T03:00:00Z"))).toBe(0);
  });

  test("overlapping entries are merged, not double counted", () => {
    const entries = [
      e("2026-07-08T18:31:00Z", "2026-07-14T07:09:00Z"),
      e("2026-07-09T00:02:00Z", "2026-07-14T07:09:00Z"),
      e("2026-07-11T00:27:00Z", "2026-07-14T07:09:00Z"),
    ];
    // 8 Jul has 5.5h, 9-13 Jul full, 14 Jul 7.15h
    expect(countDistinctSeaDays(entries)).toBe(7);
    expect(qualifyingSeaDays(entries).actual).toBe(7);
  });

  test("two short passages on one date add up to a day", () => {
    const entries = [e("2026-07-01T06:00:00Z", "2026-07-01T08:30:00Z"), e("2026-07-01T15:00:00Z", "2026-07-01T17:00:00Z")];
    expect(countDistinctSeaDays(entries)).toBe(1);
  });

  test("overlapping short entries do not add up to a day", () => {
    const entries = [e("2026-07-01T06:00:00Z", "2026-07-01T09:00:00Z"), e("2026-07-01T07:00:00Z", "2026-07-01T09:30:00Z")];
    expect(countDistinctSeaDays(entries)).toBe(0);
  });

  test("stand-by and actual on one date make a day, credited as actual", () => {
    const r = qualifyingSeaDays([
      e("2026-07-01T06:00:00Z", "2026-07-01T08:00:00Z"),
      e("2026-07-01T10:00:00Z", "2026-07-01T13:00:00Z", "standby_service"),
    ]);
    expect(r.actual).toBe(1);
    expect(r.standby).toBe(0);
  });

  test("port time never makes a sea day", () => {
    const r = qualifyingSeaDays([
      e("2026-07-01T06:00:00Z", "2026-07-01T08:00:00Z"),
      e("2026-07-01T10:00:00Z", "2026-07-01T18:00:00Z", "service_in_port"),
    ]);
    expect(r.qualifying_total).toBe(0);
    expect(r.port).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 24-hour periods (USCG / AMSA)
// ---------------------------------------------------------------------------
describe("USCG and AMSA 24-hour periods", () => {
  const e = (start: string, end: string, extra: Record<string, unknown> = {}) =>
    ({ start_time: start, end_time: end, service_type: "actual_sea_service", status: "confirmed", ...extra });
  const big = { vessel: { vessel_name: "Big", gross_tonnes: 499 } };

  test("an 8-hour watch across midnight is one USCG day, not two halves", () => {
    expect(uscgCreditableDays([e("2026-07-21T20:00:00Z", "2026-07-22T04:00:00Z", big)]).creditable).toBe(1);
  });

  test("a 10-hour watch is one USCG day, not two", () => {
    expect(uscgCreditableDays([e("2026-07-21T08:00:00Z", "2026-07-21T18:00:00Z", big)]).creditable).toBe(1);
  });

  test("a 72-hour passage is three USCG days", () => {
    expect(uscgCreditableDays([e("2026-07-21T18:00:00Z", "2026-07-24T18:00:00Z", big)]).creditable).toBe(3);
  });

  test("overlapping USCG entries are merged", () => {
    const r = uscgCreditableDays([
      e("2026-07-21T08:00:00Z", "2026-07-21T14:00:00Z", big),
      e("2026-07-21T10:00:00Z", "2026-07-21T15:00:00Z", big),
    ]);
    // 7 merged hours on a 499 GT vessel: short of an 8-hour day
    expect(r.creditable).toBe(0);
    expect(r.short_of_standard_day).toBe(1);
  });

  test("AMSA: an 8-hour watch across midnight is one day", () => {
    expect(amsaCreditableDays([e("2026-07-21T20:00:00Z", "2026-07-22T04:00:00Z")]).underway).toBe(1);
  });

  test("AMSA: overlapping entries are not counted twice", () => {
    const r = amsaCreditableDays([
      e("2026-07-21T08:00:00Z", "2026-07-21T14:00:00Z"),
      e("2026-07-21T08:00:00Z", "2026-07-21T14:00:00Z"),
    ]);
    expect(r.underway).toBe(0);
    expect(r.part_day_hours).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// entrySeaDays: the per-entry stored value by authority
// ---------------------------------------------------------------------------
describe("entrySeaDays", () => {
  const e = (start: string, end: string | null, extra: Record<string, unknown> = {}) =>
    ({ start_time: start, end_time: end, service_type: "actual_sea_service", status: "confirmed", ...extra });
  const now = new Date("2026-10-08T00:00:00Z");

  test("MCA by calendar date", () => {
    expect(entrySeaDays(e("2026-07-21T18:55:00Z", "2026-07-22T02:28:00Z"), "mca", now)).toBe(1);
    expect(entrySeaDays(e("2026-07-21T18:55:00Z", "2026-07-22T02:28:00Z"), null, now)).toBe(1);
    expect(entrySeaDays(e("2026-06-04T08:49:00Z", "2026-06-04T10:02:00Z"), "mca", now)).toBe(0);
  });

  test("MCA: port earns no sea days; stand-by and yard do", () => {
    expect(entrySeaDays(e("2026-07-01T08:00:00Z", "2026-07-01T18:00:00Z", { service_type: "service_in_port" }), "mca", now)).toBe(0);
    expect(entrySeaDays(e("2026-07-01T08:00:00Z", "2026-07-01T18:00:00Z", { service_type: "standby_service" }), "mca", now)).toBe(1);
    expect(entrySeaDays(e("2026-07-01T08:00:00Z", "2026-07-01T18:00:00Z", { service_type: "yard_service" }), "mca", now)).toBe(1);
  });

  test("USCG credits only full 8-hour days of sea service", () => {
    const small = { vessel: { gross_tonnes: 40 } };
    expect(entrySeaDays(e("2026-07-21T20:00:00Z", "2026-07-22T04:00:00Z", small), "uscg", now)).toBe(1);
    expect(entrySeaDays(e("2026-07-21T08:00:00Z", "2026-07-21T14:00:00Z", small), "uscg", now)).toBe(0);
    expect(entrySeaDays(e("2026-07-21T08:00:00Z", "2026-07-21T18:00:00Z", { service_type: "standby_service" }), "uscg", now)).toBe(0);
  });

  test("AMSA whole 8-hour days", () => {
    expect(entrySeaDays(e("2026-07-21T08:00:00Z", "2026-07-21T14:00:00Z"), "amsa", now)).toBe(0);
    expect(entrySeaDays(e("2026-07-21T00:00:00Z", "2026-07-23T00:00:00Z"), "amsa", now)).toBe(2);
  });

  test("MNZ by calendar date inside the 10-year window", () => {
    expect(entrySeaDays(e("2026-07-21T18:00:00Z", "2026-07-22T04:00:00Z"), "mnz", now)).toBe(2);
    expect(entrySeaDays(e("2015-07-21T08:00:00Z", "2015-07-21T18:00:00Z"), "mnz", now)).toBe(0);
  });

  test("declared days keep their count under every authority", () => {
    const declared = e("2026-09-14T08:00:00Z", null, { sea_days: 1 });
    for (const a of ["mca", "uscg", "amsa", "mnz"]) expect(entrySeaDays(declared, a, now)).toBe(1);
  });
});
