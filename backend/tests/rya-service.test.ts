import { describe, test, expect } from "bun:test";
import { disciplineOf, ryaDayStarts, ryaService } from "../src/utils/ryaService";

const NOW = new Date("2026-11-05T12:00:00Z");
const sail = { type: "Sail", length_metres: "14", gross_tonnes: "15", sector: "yachting" };
const bigMotor = { type: "Motor", length_metres: "40", gross_tonnes: "400", sector: "yachting" };
const ctv = { type: "Motor", length_metres: "26", gross_tonnes: "95", sector: "commercial", is_workboat: true };

/** An entry starting at `start` (ISO) lasting `hours`. */
const e = (start: string, hours: number, extra: Record<string, any> = {}) => ({
  start_time: start,
  end_time: new Date(Date.parse(start) + hours * 3_600_000).toISOString(),
  status: "confirmed",
  service_type: "actual_sea_service",
  vessel: sail,
  ...extra,
});

describe("RYA day (8 consecutive hours, one per 24 hours)", () => {
  test("under 8 hours is not a day and shorter periods are not added together", () => {
    expect(ryaDayStarts([e("2026-05-01T06:00:00Z", 7), e("2026-05-01T14:00:00Z", 6)])).toHaveLength(0);
  });
  test("8 hours is a day; a second 8 hours the same 24 hours is not", () => {
    expect(ryaDayStarts([e("2026-05-01T06:00:00Z", 8), e("2026-05-01T16:00:00Z", 9)])).toHaveLength(1);
  });
  test("a 32-hour passage is two days, a 30-hour passage one", () => {
    expect(ryaDayStarts([e("2026-05-01T06:00:00Z", 32)])).toHaveLength(2);
    expect(ryaDayStarts([e("2026-05-01T06:00:00Z", 30)])).toHaveLength(1);
  });
  test("a 72-hour passage is three days", () => {
    expect(ryaDayStarts([e("2026-05-01T00:00:00Z", 72)])).toHaveLength(3);
  });
});

describe("RYA Yachtmaster sea time", () => {
  test("splits by discipline and leaves out commercial and unknown vessels", () => {
    const r = ryaService([
      e("2026-05-01T06:00:00Z", 10),
      e("2026-05-03T06:00:00Z", 10, { vessel: bigMotor }),
      e("2026-05-05T06:00:00Z", 10, { vessel: ctv }),
      e("2026-05-07T06:00:00Z", 10, { vessel: { length_metres: "12" } }),
    ], new Map(), NOW);
    expect(r.sail.days).toBe(1);
    expect(r.power.days).toBe(1);
    expect(r.power.days_under_24m).toBe(0);
    expect(r.days_commercial).toBe(1);
    expect(r.days_unknown_discipline).toBe(1);
  });

  test("skipper days need the Master rank on a vessel under 24 m", () => {
    const r = ryaService([
      e("2026-05-01T06:00:00Z", 10, { rank: "master" }),
      e("2026-05-03T06:00:00Z", 10, { rank: "oow" }),
      e("2026-05-05T06:00:00Z", 10, { rank: "master", vessel: { ...bigMotor, type: "Sail" } }),
    ], new Map(), NOW);
    expect(r.sail.skipper_days_under_24m).toBe(1);
    expect(r.sail.days).toBe(3);
  });

  test("tidal days come from the sea-area classifier", () => {
    const r = ryaService([e("2026-05-01T06:00:00Z", 10, { is_tidal: true }), e("2026-05-03T06:00:00Z", 10, { is_tidal: false })], new Map(), NOW);
    expect(r.sail.tidal_days_under_24m).toBe(1);
  });

  test("only the last 10 years count, and only time at sea", () => {
    const r = ryaService([
      e("2016-01-01T06:00:00Z", 10),
      e("2026-05-01T06:00:00Z", 10, { service_type: "yard_service" }),
      e("2026-05-03T06:00:00Z", 10, { status: "pending" }),
    ], new Map(), NOW);
    expect(r.sail.days).toBe(0);
  });

  test("miles use the AIS track where there is one", () => {
    const r = ryaService([
      e("2026-05-01T06:00:00Z", 10, { id: "a", distance_nm: "5" }),
      e("2026-05-03T06:00:00Z", 10, { id: "b", distance_nm: "40" }),
    ], new Map([["a", 55]]), NOW);
    expect(r.sail.miles).toBe(95);
  });

  test("a passage needs over 60 miles in a straight line and run", () => {
    // Solent to Cherbourg is about 65 miles in a straight line
    const leg = { start_latitude: 50.78, start_longitude: -1.3, end_latitude: 49.65, end_longitude: -1.62 };
    const r = ryaService([
      e("2026-06-01T20:00:00Z", 12, { id: "p1", ...leg, rank: "master" }),
      // out and back: long track, short straight line
      e("2026-06-05T06:00:00Z", 12, { id: "p2", start_latitude: 50.78, start_longitude: -1.3, end_latitude: 50.79, end_longitude: -1.3 }),
    ], new Map([["p1", 70], ["p2", 90]]), NOW);
    expect(r.sail.passages).toHaveLength(1);
    expect(r.sail.passages[0]).toMatchObject({ overnight: true, as_skipper: true, nm: 70 });
  });

  test("Yachtmaster Ocean: 600 miles over 96 hours as skipper or mate", () => {
    const r = ryaService([
      e("2026-03-01T00:00:00Z", 100, { id: "o1", rank: "oow", distance_nm: "650" }),
      e("2026-04-01T00:00:00Z", 100, { id: "o2", rank: "rating", distance_nm: "650" }),
      e("2026-05-01T00:00:00Z", 90, { id: "o3", rank: "master", distance_nm: "650" }),
    ], new Map(), NOW);
    expect(r.sail.ocean_passages.map((p) => p.id)).toEqual(["o1"]);
  });

  test("discipline from the vessel type", () => {
    expect(disciplineOf("Sail")).toBe("sail");
    expect(disciplineOf("Motor")).toBe("power");
    expect(disciplineOf(null)).toBeNull();
  });
});
