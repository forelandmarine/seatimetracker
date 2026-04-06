import { describe, test, expect } from "bun:test";
import {
  calculateDurationHours,
  calculateSeaDays,
  calculateDistanceNauticalMiles,
  getCalendarDay,
  isValidServiceType,
} from "../src/utils/seaTime";

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
// calculateSeaDays — MCA 4-hour threshold
// ---------------------------------------------------------------------------
describe("calculateSeaDays", () => {
  test("returns 0 for 0 hours", () => {
    expect(calculateSeaDays(0)).toBe(0);
  });

  test("returns 0 for 3.99 hours (just under threshold)", () => {
    expect(calculateSeaDays(3.99)).toBe(0);
  });

  test("returns 1 for exactly 4 hours (boundary)", () => {
    expect(calculateSeaDays(4)).toBe(1);
  });

  test("returns 1 for 4.01 hours (just over threshold)", () => {
    expect(calculateSeaDays(4.01)).toBe(1);
  });

  test("returns 1 for 24 hours", () => {
    expect(calculateSeaDays(24)).toBe(1);
  });

  test("returns 0 for negative hours", () => {
    expect(calculateSeaDays(-1)).toBe(0);
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
