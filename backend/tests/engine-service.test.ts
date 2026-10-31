import { describe, test, expect } from "bun:test";
import { engineService } from "../src/utils/engineService";

const ctv = { vessel_name: "Wind Swift", engine_kilowatts: "1440", length_metres: "26" };
const tug = { vessel_name: "Harbour Tug", engine_kilowatts: "500", length_metres: "18" };
const launch = { vessel_name: "Launch", engine_kilowatts: "250", length_metres: "12" };
const unknown = { vessel_name: "No Power", engine_kilowatts: null, length_metres: "30" };

const NOW = new Date("2026-10-31T00:00:00Z");

/** A confirmed entry of `hours` starting at 06:00 UTC on `day`. */
const entry = (day: string, vessel: any, service_type = "actual_sea_service", hours = 10, extra: any = {}) => ({
  id: `${vessel.vessel_name}-${day}-${service_type}`,
  start_time: `${day}T06:00:00Z`,
  end_time: new Date(Date.parse(`${day}T06:00:00Z`) + hours * 3_600_000).toISOString(),
  status: "confirmed",
  service_type,
  vessel,
  ...extra,
});

describe("engine service by propulsion power", () => {
  test("gates sea days at 200, 350 and 750 kW", () => {
    const r = engineService([
      entry("2026-03-01", ctv),
      entry("2026-03-02", tug),
      entry("2026-03-03", launch),
      entry("2026-03-04", unknown),
    ], new Set(), NOW);
    expect(r.seagoing_any).toBe(4);
    expect(r.seagoing_200kw).toBe(3);
    expect(r.seagoing_350kw).toBe(2);
    expect(r.seagoing_750kw).toBe(1);
    expect(r.vessels_without_power).toEqual(["No Power"]);
  });

  test("watch days are watchkeeping entries or 4+ engine watch hours", () => {
    const r = engineService([
      entry("2026-04-01", ctv, "watchkeeping_service"),
      entry("2026-04-02", ctv, "actual_sea_service", 10, { engine_watch_hours: "4" }),
      entry("2026-04-03", ctv, "actual_sea_service", 10, { engine_watch_hours: "2" }),
      entry("2026-04-04", tug, "watchkeeping_service"),
    ], new Set(), NOW);
    expect(r.watch_750kw).toBe(2);
    expect(r.watch_350kw).toBe(3);
  });

  test("onboard counts yard, stand-by and port; seagoing does not", () => {
    const r = engineService([
      entry("2026-05-01", ctv, "yard_service"),
      entry("2026-05-02", ctv, "standby_service"),
      entry("2026-05-03", ctv, "service_in_port"),
      entry("2026-05-04", ctv),
    ], new Set(), NOW);
    expect(r.onboard_200kw).toBe(4);
    expect(r.seagoing_200kw).toBe(1);
  });

  test("rating service caps time not underway at a quarter (MSN 1863 4.4)", () => {
    const days = (from: number, n: number, type: string) =>
      Array.from({ length: n }, (_, i) => entry(`2026-06-${String(from + i).padStart(2, "0")}`, ctv, type));
    const r = engineService([...days(1, 6, "actual_sea_service"), ...days(7, 10, "yard_service")], new Set(), NOW);
    // 6 underway + at most 2 (a third of 6) not underway
    expect(r.rating_350kw).toBe(8);
  });

  test("rating service needs a vessel over 15 m and the last 5 years", () => {
    const r = engineService([
      entry("2026-07-01", { ...ctv, length_metres: "15" }),
      entry("2026-07-02", { ...ctv, length_metres: null }),
      entry("2020-07-03", ctv),
      entry("2026-07-04", ctv),
    ], new Set(), NOW);
    expect(r.rating_350kw).toBe(1);
  });

  test("categorised days come from the flagged entries", () => {
    const inside = entry("2026-08-01", ctv);
    const r = engineService([inside, entry("2026-08-02", ctv), entry("2026-08-03", launch)], new Set([inside.id]), NOW);
    expect(r.categorised_750kw).toBe(1);
    expect(r.categorised_200kw).toBe(1);
    expect(r.seagoing_750kw).toBe(2);
  });
});
