import { describe, test, expect } from "bun:test";
import { boatmasterService } from "../src/utils/boatmasterService";
import { boatmasterEndorsements, lkeSectionOf, sunAltitudeDeg } from "../src/utils/boatmasterEndorsements";
import { createClassifierFromFiles } from "../src/utils/seaAreas/load";

const NOW = new Date("2026-11-04T12:00:00Z");

const entry = (day: string, vessel: any, extra: Record<string, any> = {}, vessel_id = "v") => ({
  vessel_id,
  start_time: `${day}T08:00:00Z`,
  end_time: `${day}T18:00:00Z`,
  status: "confirmed",
  service_type: "actual_sea_service",
  vessel,
  ...extra,
});

/** A clipper run Westminster to Greenwich (eastward), then back, with a fix at 17:30 UTC. */
const thamesRun = (day: string, vessel_id = "v") =>
  [
    ["08:00", 51.5008, -0.1218],
    ["08:30", 51.5079, -0.0877 + 0.01],
    ["09:00", 51.5055, -0.0200],
    ["09:30", 51.4855, -0.0080],
    ["10:00", 51.5055, -0.0200],
    ["10:30", 51.5008, -0.1218],
    ["17:30", 51.4900, -0.1500],
  ].map(([t, lat, lon]) => ({
    vessel_id,
    check_time: `${day}T${t}:00Z`,
    area_category: "C",
    is_tidal: true,
    latitude: lat,
    longitude: lon,
  }));

const days = (first: string, n: number, step = 3) =>
  Array.from({ length: n }, (_, i) => new Date(Date.parse(first) + i * step * 86_400_000).toISOString().slice(0, 10));

describe("vessel default trade area", () => {
  test("untagged days on an Inland vessel count toward Tier 1 Level 2", () => {
    const river = { default_trade_area: "inland" };
    const r = boatmasterService([entry("2026-06-01", river), entry("2026-06-02", river, { trade_area: "coastal" })], [], null, NOW);
    expect(r.declared_inland_days).toBe(1);
    expect(r.unclassified_days).toBe(1);
  });
});

describe("Port of London LKE", () => {
  test("sections split at London Bridge and stop at Putney and Margaretness", () => {
    const fix = (lat: number, lon: number) => ({ latitude: lat, longitude: lon, area_category: "C", is_tidal: true });
    expect(lkeSectionOf(fix(51.5008, -0.1218))).toBe("upper"); // Westminster
    expect(lkeSectionOf(fix(51.4855, -0.008))).toBe("lower"); // Greenwich
    expect(lkeSectionOf(fix(51.4650, -0.2300))).toBeNull(); // above Putney
    expect(lkeSectionOf(fix(51.5050, 0.1200))).toBeNull(); // below Margaretness
    expect(lkeSectionOf({ ...fix(51.5008, -0.1218), area_category: null })).toBeNull();
  });

  test("counts days per section, darkness and direction, from the licence", () => {
    const pax = { is_passenger: true };
    const list = days("2025-11-01", 70, 3);
    const entries = list.map((d) => entry(d, pax));
    const fixes = list.flatMap((d) => thamesRun(d));
    const r = boatmasterEndorsements(entries as any, fixes as any, null, NOW);
    expect(r.lke_full.days).toBe(70);
    expect(r.lke_lower.days).toBe(70);
    expect(r.lke_upper.days).toBe(70);
    expect(r.lke_full.months).toBeGreaterThanOrEqual(6);
    expect(r.lke_upriver_days).toBe(70);
    expect(r.lke_downriver_days).toBe(70);
    // 17:30 UTC is dark in London in winter, light in summer
    expect(r.lke_night_days).toBeGreaterThan(0);
    expect(r.lke_night_days).toBeLessThan(70);
    expect(r.passenger.days).toBe(70);
    expect(r.passenger.tidal_days).toBe(70);

    const after = boatmasterEndorsements(entries as any, fixes as any, "2026-03-31", NOW);
    expect(after.lke_full.days).toBe(list.filter((d) => d > "2026-03-31").length);
  });

  test("engine ranks and yard service do not count", () => {
    const r = boatmasterEndorsements(
      [entry("2026-06-01", {}, { rank: "chief_engineer" }), entry("2026-06-02", {}, { service_type: "yard_service" })] as any,
      [...thamesRun("2026-06-01"), ...thamesRun("2026-06-02")] as any,
      null,
      NOW,
    );
    expect(r.lke_full.days).toBe(0);
  });

  test("sun altitude", () => {
    expect(sunAltitudeDeg(new Date("2026-06-21T12:00:00Z"), 51.5, 0)).toBeGreaterThan(60);
    expect(sunAltitudeDeg(new Date("2026-12-21T18:00:00Z"), 51.5, 0)).toBeLessThan(-10);
  });
});

describe("towing and pushing endorsement", () => {
  test("tidal and non-tidal days on tug-flagged vessels", () => {
    const tug = { is_tug: true };
    const r = boatmasterEndorsements(
      [entry("2026-05-01", tug), entry("2026-05-02", tug), entry("2026-05-03", { is_tug: false })] as any,
      [
        { vessel_id: "v", check_time: "2026-05-01T09:00:00Z", area_category: "C", is_tidal: true, latitude: 51.5, longitude: -0.1 },
        { vessel_id: "v", check_time: "2026-05-02T09:00:00Z", area_category: "B", is_tidal: false, latitude: 51.48, longitude: -0.6 },
      ] as any,
      null,
      NOW,
    );
    expect(r.towing).toEqual({ days: 2, tidal_days: 1, non_tidal_days: 1, months: 6 });
  });
});

describe("non-tidal Thames", () => {
  const c = createClassifierFromFiles();
  const at = (lat: number, lon: number) => c.classifyPoint({ lat, lon }, { date: new Date("2026-07-01") });
  test("Teddington to Oxford is Category B, non-tidal", () => {
    for (const [lat, lon] of [[51.4115, -0.3086], [51.5375, -0.9005], [51.7462, -1.2558]]) {
      const r = at(lat, lon);
      expect(r.areaCategory).toBe("B");
      expect(r.isTidal).toBe(false);
    }
  });
  test("tidal Thames stays Category C, tidal", () => {
    for (const [lat, lon] of [[51.4572, -0.3058], [51.5008, -0.1218]]) {
      const r = at(lat, lon);
      expect(r.areaCategory).toBe("C");
      expect(r.isTidal).toBe(true);
    }
  });
});
