import { describe, test, expect } from "bun:test";
import { creditedStandbyDates, creditedStandbyDays, qualifyingSeaDays } from "../src/utils/seaTime";

/** `n` consecutive 10-hour days from `start` on `vessel`. */
const days = (start: string, n: number, service_type: string, vessel_id = "v1") =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(`${start}T06:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return {
      start_time: d.toISOString(),
      end_time: new Date(d.getTime() + 10 * 3_600_000).toISOString(),
      status: "confirmed",
      service_type,
      vessel_id,
    };
  });

describe("stand-by service (MSN 1858)", () => {
  test("a stand-by period after a long voyage counts at most 14 days", () => {
    expect(creditedStandbyDays([...days("2026-01-01", 30, "actual_sea_service"), ...days("2026-01-31", 20, "standby_service")])).toBe(14);
  });

  test("a period never counts for more than the voyage before it", () => {
    expect(creditedStandbyDays([...days("2026-01-01", 5, "actual_sea_service"), ...days("2026-01-06", 10, "standby_service")])).toBe(5);
  });

  test("the first days of the period are the ones credited", () => {
    const d = creditedStandbyDates([...days("2026-01-01", 2, "actual_sea_service"), ...days("2026-01-03", 5, "standby_service")]);
    expect([...d].sort()).toEqual(["2026-01-03", "2026-01-04"]);
  });

  test("stand-by with no voyage before it counts nothing", () => {
    expect(creditedStandbyDays(days("2026-01-01", 10, "standby_service"))).toBe(0);
  });

  test("each voyage backs one period: a second period without a new voyage gets nothing", () => {
    expect(creditedStandbyDays([
      ...days("2026-01-01", 10, "actual_sea_service"),
      ...days("2026-01-11", 3, "standby_service"),
      ...days("2026-01-20", 3, "standby_service"),
    ])).toBe(3);
  });

  test("voyage, stand-by, voyage, stand-by: both periods count", () => {
    expect(creditedStandbyDays([
      ...days("2026-01-01", 10, "actual_sea_service"),
      ...days("2026-01-11", 7, "standby_service"),
      ...days("2026-01-18", 4, "actual_sea_service"),
      ...days("2026-01-22", 7, "standby_service"),
    ])).toBe(11); // 7 + min(7, 4)
  });

  test("a voyage on another vessel does not back stand-by on this one", () => {
    expect(creditedStandbyDays([...days("2026-01-01", 10, "actual_sea_service", "a"), ...days("2026-01-11", 5, "standby_service", "b")])).toBe(0);
  });

  test("a date worked as actual service is never stand-by", () => {
    const r = qualifyingSeaDays([
      ...days("2026-01-01", 5, "actual_sea_service"),
      ...days("2026-01-05", 3, "standby_service"),
    ]);
    expect(r.actual).toBe(5);
    expect(r.standby_logged).toBe(2);
    expect(r.standby).toBe(2);
    expect(r.qualifying_total).toBe(7);
  });

  test("total stand-by never exceeds actual sea service", () => {
    const r = qualifyingSeaDays([
      ...days("2026-01-01", 14, "actual_sea_service"),
      ...days("2026-01-15", 14, "standby_service"),
      ...days("2026-02-01", 14, "actual_sea_service", "b"),
      ...days("2026-02-15", 14, "standby_service", "b"),
    ]);
    expect(r.standby).toBeLessThanOrEqual(r.actual);
    expect(r.standby).toBe(28);
  });

  test("yard and port are untouched", () => {
    const r = qualifyingSeaDays([...days("2026-01-01", 3, "actual_sea_service"), ...days("2026-02-01", 100, "yard_service")]);
    expect(r.yard_credited).toBe(90);
    expect(r.standby).toBe(0);
  });
});
