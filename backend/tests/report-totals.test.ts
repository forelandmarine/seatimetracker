import { describe, test, expect } from "bun:test";
import { mcaReportFigures } from "../src/utils/reportTotals";

const days = (start: string, n: number, service_type: string, vessel_id = "v1") =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(`${start}T06:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { start_time: d.toISOString(), end_time: new Date(d.getTime() + 10 * 3_600_000).toISOString(), status: "confirmed", service_type, vessel_id, sea_days: 1 };
  });

describe("PDF report MCA totals", () => {
  test("the total matches the capped qualifying total, not the sum of entry days", () => {
    const a = [...days("2026-01-01", 5, "actual_sea_service"), ...days("2026-01-06", 20, "standby_service")];
    const f = mcaReportFigures(a, [a]);
    expect(f.total).toBe(10); // 5 actual + 5 stand-by (not 25)
    expect(f.standby_not_credited).toBe(15);
    expect(f.block_standby_credited).toEqual([5]);
  });

  test("yard over 90 days is reported", () => {
    const a = [...days("2026-01-01", 2, "actual_sea_service"), ...days("2026-02-01", 100, "yard_service")];
    const f = mcaReportFigures(a, [a]);
    expect(f.total).toBe(92);
    expect(f.yard_over_cap).toBe(10);
  });

  test("a renamed vessel split into two blocks keeps the voyage before the stand-by", () => {
    const voyage = days("2026-01-01", 10, "actual_sea_service");
    const standby = days("2026-01-11", 6, "standby_service");
    const f = mcaReportFigures([...voyage, ...standby], [voyage, standby]);
    expect(f.block_standby_credited).toEqual([0, 6]);
  });
});
