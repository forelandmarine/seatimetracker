import { describe, test, expect } from "bun:test";
import { workboatService } from "../src/utils/workboat";

const ctv = { length_metres: "26.5", is_workboat: true };
const smallBoat = { length_metres: "12", is_workboat: true };
const yacht = { length_metres: "45", is_workboat: false };
const unsized = { length_metres: null, is_workboat: true };

/** A confirmed entry of `hours` starting at 06:00 UTC on `day`. */
const entry = (day: string, vessel: any, service_type = "actual_sea_service", hours = 10, vessel_id = "v") => ({
  vessel_id,
  start_time: `${day}T06:00:00Z`,
  end_time: new Date(Date.parse(`${day}T06:00:00Z`) + hours * 3_600_000).toISOString(),
  status: "confirmed",
  service_type,
  vessel,
});

describe("workboat service (MGN 496)", () => {
  test("splits sea service by vessel size and workboat flag", () => {
    const r = workboatService([
      entry("2026-03-01", ctv, "actual_sea_service", 10, "ctv"),
      entry("2026-03-02", ctv, "watchkeeping_service", 10, "ctv"),
      entry("2026-03-03", smallBoat, "actual_sea_service", 10, "small"),
      entry("2026-03-04", yacht, "watchkeeping_service", 10, "yacht"),
    ], new Date("2026-10-25T00:00:00Z"));
    expect(r.sea_service).toBe(4);
    expect(r.sea_service_15m).toBe(3);
    expect(r.watchkeeping_15m).toBe(2);
    expect(r.workboat_15m).toBe(2);
    expect(r.recent_sea_service).toBe(4);
  });

  test("port work counts, yard time does not (MGN 496 4.1)", () => {
    const r = workboatService([
      entry("2026-04-01", ctv, "service_in_port"),
      entry("2026-04-02", ctv, "yard_service"),
    ], new Date("2026-10-25T00:00:00Z"));
    expect(r.sea_service).toBe(1);
    expect(r.workboat_15m).toBe(1);
  });

  test("days under 4 hours are not counted, and a day is counted once", () => {
    const r = workboatService([
      entry("2026-05-01", ctv, "actual_sea_service", 3),
      entry("2026-05-02", ctv, "actual_sea_service", 5),
      entry("2026-05-02", ctv, "watchkeeping_service", 5),
    ], new Date("2026-10-25T00:00:00Z"));
    expect(r.sea_service).toBe(1);
  });

  test("only the last 5 years count toward recency", () => {
    const r = workboatService([
      entry("2020-06-01", ctv),
      entry("2024-06-01", ctv),
    ], new Date("2026-10-25T00:00:00Z"));
    expect(r.sea_service).toBe(2);
    expect(r.recent_sea_service).toBe(1);
  });

  test("workboats without a length are reported, not guessed", () => {
    const r = workboatService([entry("2026-06-01", unsized, "actual_sea_service", 10, "u1")], new Date("2026-10-25T00:00:00Z"));
    expect(r.workboat_15m).toBe(0);
    expect(r.workboats_without_length).toBe(1);
  });
});
