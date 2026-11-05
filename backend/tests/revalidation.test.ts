import { describe, test, expect } from "bun:test";
import {
  daysToExpiry,
  inAnniversaryWindow,
  outsideCategorised,
  revalidationProgress,
} from "../src/utils/revalidation";

const NOW = new Date("2026-11-05T12:00:00Z");

const ship = { length_metres: "90", gross_tonnes: "4000", engine_kilowatts: "3000", sector: "commercial" };
const smallShip = { length_metres: "20", gross_tonnes: "60", engine_kilowatts: "500", sector: "commercial" };
const ctv = { length_metres: "26", gross_tonnes: "95", engine_kilowatts: "1400", sector: "commercial", is_workboat: true };
const yacht = { length_metres: "40", gross_tonnes: "400", sector: "yachting" };
const smallYacht = { length_metres: "14", gross_tonnes: "20", sector: "yachting" };

/** `n` consecutive 10-hour days from `start`. */
const days = (start: string, n: number, extra: Record<string, any> = {}) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(`${start}T06:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return {
      start_time: d.toISOString(),
      end_time: new Date(d.getTime() + 10 * 3_600_000).toISOString(),
      status: "confirmed",
      service_type: "actual_sea_service",
      ...extra,
    };
  });

describe("CoC revalidation (MSN 1861, MGN 496 12.1, MSN 1853 19.3)", () => {
  test("deck: 12 months (360 days) in 5 years as an officer on a ship over 80 GT or 24 m", () => {
    const r = revalidationProgress("deck", days("2024-01-01", 360, { rank: "oow", vessel: ship }), NOW);
    expect(r.routes[0]).toEqual({ key: "five_years", days: 360, required: 360, unranked_days: 0 });
    expect(r.met).toBe(true);
  });

  test("deck: 3 months in the last 6 months is the second route", () => {
    const r = revalidationProgress("deck", days("2026-07-01", 95, { rank: "chief_officer", vessel: ship }), NOW);
    expect(r.routes[1].key).toBe("six_months");
    expect(r.routes[1].days).toBe(95);
    expect(r.routes[1].required).toBe(90);
    expect(r.met).toBe(true);
  });

  test("deck: service older than 5 years does not count", () => {
    const r = revalidationProgress("deck", days("2021-01-01", 100, { rank: "oow", vessel: ship }), NOW);
    expect(r.routes[0].days).toBe(0);
  });

  test("deck: a ship of 80 GT or under and 24 m or under does not count", () => {
    const r = revalidationProgress("deck", days("2026-01-01", 30, { rank: "master", vessel: smallShip }), NOW);
    expect(r.routes[0].days).toBe(0);
  });

  test("deck: service as a rating does not count; no rank is reported apart", () => {
    const r = revalidationProgress("deck", [
      ...days("2026-01-01", 10, { rank: "rating", vessel: ship }),
      ...days("2026-02-01", 7, { vessel: ship }),
    ], NOW);
    expect(r.routes[0].days).toBe(0);
    expect(r.routes[0].unranked_days).toBe(7);
  });

  test("deck: service that stayed inside categorised waters is left out (MSN 1861 3.4)", () => {
    const r = revalidationProgress("deck", [
      ...days("2026-01-01", 5, { rank: "oow", vessel: ship, area_category: "C" }),
      ...days("2026-02-01", 4, { rank: "oow", vessel: ship, area_category: "sea" }),
      ...days("2026-03-01", 3, { rank: "oow", vessel: ship, trade_area: "inland" }),
    ], NOW);
    expect(r.routes[0].days).toBe(4);
  });

  test("deck: yard service and service in port are not seagoing", () => {
    const r = revalidationProgress("deck", [
      ...days("2026-01-01", 5, { rank: "oow", vessel: ship, service_type: "yard_service" }),
      ...days("2026-02-01", 5, { rank: "oow", vessel: ship, service_type: "service_in_port" }),
    ], NOW);
    expect(r.routes[0].days).toBe(0);
  });

  test("engine: engineer officer on 750 kW or more", () => {
    const r = revalidationProgress("engine", [
      ...days("2026-01-01", 10, { rank: "chief_engineer", vessel: ship }),
      ...days("2026-02-01", 10, { rank: "chief_engineer", vessel: smallShip }),
      ...days("2026-03-01", 10, { rank: "oow", vessel: ship }),
    ], NOW);
    expect(r.routes[0].days).toBe(10);
  });

  test("yacht deck: onboard yacht service over 15 m includes stand-by and yard", () => {
    const r = revalidationProgress("yacht_deck", [
      ...days("2026-01-01", 10, { rank: "master", vessel: yacht }),
      ...days("2026-02-01", 5, { rank: "master", vessel: yacht, service_type: "yard_service" }),
      ...days("2026-03-01", 5, { rank: "master", vessel: yacht, service_type: "standby_service" }),
      ...days("2026-04-01", 5, { rank: "master", vessel: smallYacht }),
      ...days("2026-05-01", 5, { rank: "master", vessel: ship }),
    ], NOW);
    expect(r.routes[0].days).toBe(20);
  });

  test("code vessel: 6 months on commercial vessels under 24 m, any capacity", () => {
    const r = revalidationProgress("code_vessel", [
      ...days("2025-01-01", 180, { vessel: smallShip }),
      ...days("2026-01-01", 10, { vessel: ship }),
      ...days("2026-02-01", 10, { vessel: smallYacht }),
    ], NOW);
    expect(r.routes).toHaveLength(1);
    expect(r.routes[0].days).toBe(180);
    expect(r.routes[0].required).toBe(180);
    expect(r.met).toBe(true);
  });

  test("workboat: officer service on 15 m or over, dual capacity at 50%", () => {
    const r = revalidationProgress("workboat", [
      ...days("2026-01-01", 10, { rank: "master", vessel: ctv }),
      ...days("2026-02-01", 10, { rank: "master", vessel: ctv, dual_capacity: true }),
      ...days("2026-03-01", 4, { vessel: ctv }),
    ], NOW);
    expect(r.routes[0].days).toBe(15);
    expect(r.routes[0].unranked_days).toBe(4);
  });

  test("BML: 120 days of commercial deck service in 5 years, any hours", () => {
    const r = revalidationProgress("bml", [
      ...days("2026-01-01", 100, { vessel: smallShip }),
      ...days("2026-06-01", 20, { vessel: smallShip, rank: "chief_engineer" }),
      ...days("2026-07-01", 20, { vessel: yacht }),
    ], NOW);
    expect(r.routes[0].days).toBe(100);
    expect(r.routes[0].required).toBe(120);
    expect(r.met).toBe(false);
  });

  test("pending entries never count", () => {
    const r = revalidationProgress("deck", days("2026-01-01", 10, { rank: "oow", vessel: ship, status: "pending" }), NOW);
    expect(r.routes[0].days).toBe(0);
  });

  test("outsideCategorised reads unplaced entries as outside", () => {
    expect(outsideCategorised({ start_time: "", end_time: null, area_category: null } as any)).toBe(true);
    expect(outsideCategorised({ start_time: "", end_time: null, area_category: "A" } as any)).toBe(false);
  });

  test("expiry countdown and the 6-month anniversary window (MSN 1861 2.4)", () => {
    expect(daysToExpiry("2026-11-15", NOW)).toBe(10);
    expect(daysToExpiry("2026-11-01", NOW)).toBe(-4);
    expect(daysToExpiry(null, NOW)).toBeNull();
    expect(inAnniversaryWindow("2027-04-01", NOW)).toBe(true);
    expect(inAnniversaryWindow("2027-06-01", NOW)).toBe(false);
    expect(inAnniversaryWindow("2026-10-01", NOW)).toBe(false);
  });
});
