import { describe, test, expect } from "bun:test";
import {
  calculateDurationHours,
  calculateSeaDays,
  calendarDaysCovered,
  countDistinctSeaDays,
  qualifyingSeaDays,
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
    expect(calculateSeaDays(d("2025-01-14T00:00:00Z"), d("2025-04-17T00:00:00Z"))).toBe(94);
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
