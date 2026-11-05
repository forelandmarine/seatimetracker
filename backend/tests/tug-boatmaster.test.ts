import { describe, test, expect } from "bun:test";
import { tugService, outsideCategorisedHoursByDate } from "../src/utils/tugService";
import { boatmasterService, monthsSince } from "../src/utils/boatmasterService";

const tug = { vessel_name: "Svitzer Mercia", is_tug: true };
const ferry = { vessel_name: "Thames Clipper", is_tug: false };
const NOW = new Date("2026-10-31T12:00:00Z");

/** A confirmed entry of `hours` starting at 06:00 UTC on `day`. */
const entry = (day: string, vessel: any, extra: Record<string, any> = {}, hours = 10, vessel_id = "t") => ({
  vessel_id,
  start_time: `${day}T06:00:00Z`,
  end_time: new Date(Date.parse(`${day}T06:00:00Z`) + hours * 3_600_000).toISOString(),
  status: "confirmed",
  service_type: "actual_sea_service",
  vessel,
  ...extra,
});

/** Hourly fixes from 06:00 for `hours` hours, all in `area` (null = outside categorised waters). */
const fixes = (day: string, hours: number, area: string | null, vessel_id = "t", extra: Record<string, any> = {}) =>
  Array.from({ length: hours + 1 }, (_, i) => ({
    vessel_id,
    check_time: new Date(Date.parse(`${day}T06:00:00Z`) + i * 3_600_000).toISOString(),
    area_category: area,
    is_tidal: area === "D" || area === "C" || area === null ? true : false,
    latitude: 51.0 + i * 0.01,
    longitude: 1.4,
    ...extra,
  }));

describe("tug service (MGN 495)", () => {
  test("counts deck service on marked tugs only, split by rating and officer", () => {
    const r = tugService([
      entry("2026-03-01", tug, { rank: "rating" }),
      entry("2026-03-02", tug, { rank: "oow" }),
      entry("2026-03-03", tug, { service_type: "watchkeeping_service" }),
      entry("2026-03-04", tug, { rank: "chief_engineer" }),
      entry("2026-03-05", ferry, { rank: "rating" }, 10, "f"),
      entry("2026-03-06", tug, { service_type: "yard_service" }),
      entry("2026-03-07", tug, { service_type: "service_in_port" }),
    ], [], NOW);
    expect(r.tug_service).toBe(4);
    expect(r.tug_officer_service).toBe(2);
    expect(r.tug_rating_service).toBe(2);
    expect(r.recent_tug_service).toBe(4);
    expect(r.tug_vessels).toEqual(["Svitzer Mercia"]);
  });

  test("a day needs 4 hours outside categorised waters, from AIS", () => {
    const r = tugService([
      entry("2026-05-01", tug, { rank: "rating" }),
      entry("2026-05-02", tug, { rank: "rating" }),
      entry("2026-05-03", tug, { service_type: "watchkeeping_service" }),
    ], [
      ...fixes("2026-05-01", 5, null), // 5 h outside
      ...fixes("2026-05-02", 3, null), // only 3 h outside
      ...fixes("2026-05-03", 6, null),
    ], NOW);
    expect(r.outside_categorised).toBe(2);
    // Master certificates need the 4 hours to be bridge watchkeeping
    expect(r.outside_categorised_watch).toBe(1);
  });

  test("time inside categorised waters, and long AIS gaps, do not count as outside", () => {
    const h = outsideCategorisedHoursByDate([
      { vessel_id: "t", check_time: "2026-06-01T06:00:00Z", area_category: null },
      { vessel_id: "t", check_time: "2026-06-01T07:00:00Z", area_category: "D" },
      { vessel_id: "t", check_time: "2026-06-01T08:00:00Z", area_category: null },
      { vessel_id: "t", check_time: "2026-06-01T12:00:00Z", area_category: null }, // 4 h gap
    ]);
    expect(h.get("2026-06-01") ?? 0).toBe(0);
  });

  test("the gap between two separate entries is not time outside", () => {
    // Entries 02:00-08:00 and 09:30-11:00. Outside 06:00-08:00 and 09:30-11:00;
    // the 08:00-09:30 gap is off service.
    const at = (t: string) => ({ vessel_id: "t", check_time: `2026-07-01T${t}:00Z`, area_category: null, is_tidal: true });
    const r = tugService(
      [
        { ...entry("2026-07-01", tug, { rank: "rating" }), start_time: "2026-07-01T02:00:00Z", end_time: "2026-07-01T08:00:00Z" },
        { ...entry("2026-07-01", tug, { rank: "rating" }), start_time: "2026-07-01T09:30:00Z", end_time: "2026-07-01T11:00:00Z" },
      ],
      [at("06:00"), at("07:00"), at("08:00"), at("09:30"), at("10:30"), at("11:00")],
      NOW,
    );
    expect(r.outside_categorised).toBe(0); // 3.5 h inside the entries, not 5 h
  });

  test("entries without a rank take the user's usual capacity on the tug", () => {
    const officerTug = { ...tug, tug_capacity: "officer" };
    const r = tugService([
      entry("2026-08-01", officerTug),
      entry("2026-08-02", officerTug, { rank: "rating" }),
      entry("2026-08-03", tug, { watchkeeping_hours: "6" }),
    ], [], NOW);
    expect(r.tug_officer_service).toBe(2);
    expect(r.tug_rating_service).toBe(1);
  });

  test("fixes the classifier could not place are never outside categorised waters", () => {
    const r = tugService(
      [entry("2026-09-01", tug, { rank: "rating" })],
      fixes("2026-09-01", 6, null).map((f) => ({ ...f, is_tidal: null })),
      NOW,
    );
    expect(r.outside_categorised).toBe(0);
  });

  test("cadet service counts toward the apprentice route", () => {
    const r = tugService([
      entry("2026-07-01", tug, { rank: "cadet" }),
      entry("2026-07-02", ferry, { rank: "cadet" }, 10, "f"),
    ], [], NOW);
    expect(r.apprentice_service).toBe(2);
    expect(r.apprentice_tug_service).toBe(1);
  });

  test("service over 5 years old is not recent", () => {
    const r = tugService([entry("2020-01-01", tug), entry("2026-01-01", tug)], [], NOW);
    expect(r.tug_service).toBe(2);
    expect(r.recent_tug_service).toBe(1);
  });
});

describe("Boatmasters' Licence qualifying service (MSN 1853)", () => {
  test("a day in categorised waters counts, however short", () => {
    const r = boatmasterService([entry("2026-02-01", ferry, {}, 1)], fixes("2026-02-01", 1, "C"), null, NOW);
    expect(r.tier1_level2_days).toBe(1);
    expect(r.tier1_level1_days).toBe(0); // tidal
  });

  test("Level 1 needs every fix in non-tidal A, B or C", () => {
    const r = boatmasterService(
      [entry("2026-02-02", ferry), entry("2026-02-03", ferry)],
      [...fixes("2026-02-02", 3, "B"), ...fixes("2026-02-03", 3, "B").map((f, i) => (i === 0 ? { ...f, area_category: "D", is_tidal: true } : f))],
      null,
      NOW,
    );
    expect(r.tier1_level2_days).toBe(2);
    expect(r.tier1_level1_days).toBe(1);
  });

  test("days outside categorised waters count only within limited coastal", () => {
    const entries = [entry("2026-03-01", ferry), entry("2026-03-02", ferry)];
    const fx = [...fixes("2026-03-01", 3, null), ...fixes("2026-03-02", 3, null)];
    const none = boatmasterService(entries, fx, null, NOW);
    expect(none.tier1_level2_days).toBe(0);
    expect(none.beyond_limited_coastal_days).toBe(2);
    const within = boatmasterService(entries, fx, () => true, NOW);
    expect(within.tier1_level2_days).toBe(2);
    expect(boatmasterService(entries, fx, () => false, NOW).tier1_level2_days).toBe(0);
  });

  test("unplaced fixes count with categorised ones, or alone only when logged as Inland", () => {
    const unplaced = (day: string) => fixes(day, 2, null).map((f) => ({ ...f, is_tidal: null }));
    const r = boatmasterService(
      [entry("2026-05-10", ferry), entry("2026-05-11", ferry), entry("2026-05-12", ferry, { trade_area: "inland" })],
      [...unplaced("2026-05-10"), ...fixes("2026-05-10", 1, "C"), ...unplaced("2026-05-11"), ...unplaced("2026-05-12")],
      () => true,
      NOW,
    );
    expect(r.tier1_level2_days).toBe(2);
    expect(r.declared_inland_days).toBe(1);
    expect(r.unclassified_days).toBe(1);
    expect(r.beyond_limited_coastal_days).toBe(0);
  });

  test("no AIS data: counts toward Level 2 only when logged as Inland", () => {
    const r = boatmasterService(
      [entry("2026-04-01", ferry, { trade_area: "inland" }), entry("2026-04-02", ferry)],
      [],
      null,
      NOW,
    );
    expect(r.tier1_level2_days).toBe(1);
    expect(r.declared_inland_days).toBe(1);
    expect(r.unclassified_days).toBe(1);
    expect(r.tier1_level1_days).toBe(0);
  });

  test("engine ranks, yard time and service over 5 years old are left out", () => {
    const r = boatmasterService(
      [
        entry("2026-05-01", ferry, { rank: "chief_engineer", trade_area: "inland" }),
        entry("2026-05-02", ferry, { service_type: "yard_service", trade_area: "inland" }),
        entry("2021-05-01", ferry, { trade_area: "inland" }),
      ],
      [],
      null,
      NOW,
    );
    expect(r.tier1_level2_days).toBe(0);
  });

  test("minimum qualifying period runs from the first counted day", () => {
    const r = boatmasterService([entry("2024-10-31", ferry, { trade_area: "inland" })], [], null, NOW);
    expect(r.level2_months).toBe(24);
    expect(monthsSince("2024-11-01", NOW)).toBe(23);
    expect(monthsSince(undefined, NOW)).toBe(0);
  });
});
