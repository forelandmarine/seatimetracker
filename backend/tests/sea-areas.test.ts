import { describe, test, expect } from "bun:test";
import { aggregateFixClassifications, fixArea } from "../src/utils/seaAreas/aggregate";
import { createClassifierFromFiles } from "../src/utils/seaAreas/load";
import { areaDayBreakdown, ticketsForTrip, wbc3AreaForTrack, type Wbc3Measures } from "../src/utils/workboatArea";
import { workboatService, countWorkboatDays } from "../src/utils/workboat";
import { isAtSeaOutside } from "../src/utils/tugService";

describe("entry roll-up from fixes", () => {
  test("most exposed category wins, any tidal fix makes it tidal", () => {
    const r = aggregateFixClassifications([
      { area_category: "A", is_tidal: false },
      { area_category: "C", is_tidal: true },
      { area_category: "B", is_tidal: false },
    ]);
    expect(r).toEqual({ area_category: "C", is_tidal: true, is_categorised_water: true });
  });

  test("D beats C, and the sea beats D", () => {
    expect(aggregateFixClassifications([{ area_category: "C", is_tidal: true }, { area_category: "D", is_tidal: true }]).area_category).toBe("D");
    const r = aggregateFixClassifications([{ area_category: "D", is_tidal: true }, { area_category: "sea", is_tidal: true }]);
    expect(r.area_category).toBe("sea");
    expect(r.is_categorised_water).toBe(true);
  });

  test("older at-sea fixes (no category, tidal set) read as sea", () => {
    expect(fixArea({ area_category: null, is_tidal: true })).toBe("sea");
    expect(fixArea({ area_category: null, is_tidal: null })).toBeNull();
  });

  test("sea outside the UK has no tidal value", () => {
    const r = aggregateFixClassifications([{ area_category: "sea", is_tidal: null }]);
    expect(r).toEqual({ area_category: "sea", is_tidal: null, is_categorised_water: false });
  });

  test("non-tidal only when fixes say non-tidal and none tidal", () => {
    expect(aggregateFixClassifications([{ area_category: "A", is_tidal: false }]).is_tidal).toBe(false);
  });

  test("no classified fixes leave the entry untouched", () => {
    expect(aggregateFixClassifications([{ area_category: null, is_tidal: null }])).toEqual({
      area_category: null, is_tidal: null, is_categorised_water: null,
    });
  });
});

describe("classifier accuracy fixes", () => {
  const c = createClassifierFromFiles();
  const summer = { season: "summer" as const };
  const winter = { season: "winter" as const };

  test("Barrow Walney Channel is Cat C all year (MSN 1837 Amendment 3)", () => {
    expect(c.classifyPoint({ lat: 54.08, lon: -3.2 }, winter).areaCategory).toBe("C");
    expect(c.classifyPoint({ lat: 54.08, lon: -3.2 }, summer).areaCategory).toBe("C");
  });

  test("Barrow summer line moves out to Foulney Island", () => {
    const between = { lat: 54.062, lon: -3.171 };
    expect(c.classifyPoint(between, summer).areaCategory).toBe("C");
    expect(c.classifyPoint(between, winter).areaCategory).not.toBe("C");
  });

  test("Morecambe Bay is Cat D in summer only", () => {
    expect(c.classifyPoint({ lat: 54.0, lon: -3.0 }, summer).areaCategory).toBe("D");
    const w = c.classifyPoint({ lat: 54.0, lon: -3.0 }, winter);
    expect(w.areaCategory).toBeNull();
    expect(w.atSea).toBe(true);
  });

  test("Leith within the breakwaters is Cat B", () => {
    expect(c.classifyPoint({ lat: 55.987, lon: -3.185 }, summer).areaCategory).toBe("B");
  });

  test("tidal is only set inside UK waters", () => {
    const med = c.classifyPoint({ lat: 39.5, lon: 2.6 });
    expect(med.isTidal).toBeNull();
    expect(med.atSea).toBe(true);
    expect(med.inUk).toBe(false);
    const channel = c.classifyPoint({ lat: 50.5, lon: -1.0 });
    expect(channel.isTidal).toBe(true);
    expect(channel.inUk).toBe(true);
  });

  test("a harbour-edge fix on the coastline snaps into the water body", () => {
    const yarmouth = c.classifyPoint({ lat: 52.575, lon: 1.7305 });
    expect(yarmouth.snapped).toBe(true);
    expect(yarmouth.areaCategory).not.toBeNull();
  });

  test("Wells inner harbour is not classified, not land", () => {
    const wells = c.classifyPoint({ lat: 52.9555, lon: 0.8515 });
    expect(wells.areaCategory).toBeNull();
    expect(wells.isTidal).toBeNull();
    expect(wells.atSea).toBe(false);
  });
});

describe("Workboat Code area category (WBC3 3.10.1)", () => {
  // Points on a line east of a coast at lon 0: distance from land = lon in nm (approx), categorised water at lon 0.
  const flat: Wbc3Measures = {
    distanceFromLandNm: (p) => p.lon * 60,
    distanceFromCategorisedNm: (p) => p.lon * 60,
    isInUkWaters: (p) => p.lat > 49,
  };
  const trip = (...nm: number[]) => nm.map((d) => ({ lat: 52, lon: d / 60, area: "sea" }));

  test("within 3 miles of land and of the categorised edge: 6 or 5, with conditions", () => {
    const r = wbc3AreaForTrack(trip(0.5, 2, 2.8), flat);
    expect(r.band).toBe("cat_6_5");
    expect(r.options[0]).toEqual({ category: 6, conditions: ["favourable_weather", "daylight"] });
    expect(r.options[1]).toEqual({ category: 5, conditions: ["favourable_weather"] });
    expect(r.category_without_conditions).toBe(3);
  });

  test("20, 60 and 150 mile bands", () => {
    expect(wbc3AreaForTrack(trip(1, 12), flat).band).toBe("cat_4_3");
    expect(wbc3AreaForTrack(trip(1, 45), flat).band).toBe("cat_2");
    expect(wbc3AreaForTrack(trip(1, 140), flat).band).toBe("cat_1");
    expect(wbc3AreaForTrack(trip(1, 200), flat).band).toBe("cat_0");
  });

  test("a trip that stayed in categorised waters has no area category", () => {
    const r = wbc3AreaForTrack([{ lat: 52, lon: 0, area: "C" }], flat);
    expect(r.band).toBe("categorised_only");
    expect(r.options).toEqual([]);
  });

  test("outside UK waters is not measured", () => {
    expect(wbc3AreaForTrack([{ lat: 39, lon: 0.1, area: "sea" }], flat).band).toBe("outside_uk");
  });

  test("tickets from Table A5.1 and the ones on file", () => {
    const r = wbc3AreaForTrack(trip(1, 45), flat); // Area Category 2
    const t = ticketsForTrip(r, [
      { certificate_type: "occ_yachtmaster_offshore", expiry_date: null },
      { certificate_type: "course_boatmaster", expiry_date: "2030-01-01" },
    ], new Date("2026-11-04T00:00:00Z"));
    const ids = t.map((x) => x.id);
    expect(ids).toContain("master_workboat");
    expect(ids).toContain("yachtmaster_offshore");
    expect(ids).not.toContain("boatmaster"); // Boatmaster only 6 to 3
    expect(t.find((x) => x.id === "yachtmaster_offshore")?.held).toBe(true);
  });

  test("Boatmaster covers 6 to 3 within its own area; an expired ticket is not held", () => {
    const r = wbc3AreaForTrack(trip(1, 2), flat);
    const t = ticketsForTrip(r, [{ certificate_type: "course_boatmaster", expiry_date: "2025-01-01" }], new Date("2026-11-04T00:00:00Z"));
    const bml = t.find((x) => x.id === "boatmaster")!;
    expect(bml.covers).toEqual([6, 5, 4, 3]);
    expect(bml.note).toBe("own_area");
    expect(bml.held).toBe(false);
    expect(t.find((x) => x.id === "day_skipper")?.covers).toEqual([6, 4]);
  });
});

describe("days by area (guidance)", () => {
  const e = (day: string, area: string | null, tidal: boolean | null, extra: Record<string, any> = {}) => ({
    start_time: `${day}T06:00:00Z`, end_time: `${day}T16:00:00Z`, status: "confirmed", area_category: area, is_tidal: tidal, ...extra,
  });
  test("one day, most exposed area that day", () => {
    const b = areaDayBreakdown([
      e("2026-10-21", "C", true),
      e("2026-10-21", "sea", true),
      e("2026-10-22", "C", true),
      e("2026-10-23", "A", false),
      e("2026-10-24", null, null),
      e("2026-10-25", "D", true, { status: "pending" }),
      e("2026-10-26", "C", true, { service_type: "yard_service" }),
    ]);
    expect(b).toEqual({ A: 1, B: 0, C: 1, D: 0, sea: 1, not_classified: 1, tidal: 2, non_tidal: 1, total: 4 });
  });
});

describe("dual deck and engine capacity (MGN 496 4.5)", () => {
  const ctv = { length_metres: "26.5", is_workboat: true };
  const entry = (day: string, extra: Record<string, any> = {}) => ({
    vessel_id: "ctv", start_time: `${day}T06:00:00Z`, end_time: `${day}T16:00:00Z`, status: "confirmed",
    service_type: "actual_sea_service", vessel: ctv, ...extra,
  });
  const NOW = new Date("2026-11-04T00:00:00Z");

  test("dual capacity days count at 50%", () => {
    const r = workboatService([
      entry("2026-06-01"),
      entry("2026-06-02", { dual_capacity: true }),
      entry("2026-06-03", { dual_capacity: true }),
    ], NOW);
    expect(r.sea_service).toBe(2);
    expect(r.workboat_15m).toBe(2);
    expect(r.recent_sea_service).toBe(2);
    expect(r.dual_capacity_days).toBe(2);
  });

  test("a day also logged without dual capacity counts in full", () => {
    expect(countWorkboatDays([entry("2026-06-01", { dual_capacity: true }), entry("2026-06-01")])).toBe(1);
  });

  test("revalidation counts officer service on 15 m+ in the last 5 years (MGN 496 12.1)", () => {
    const r = workboatService([
      entry("2026-06-01", { rank: "master" }),
      entry("2026-06-02", { service_type: "watchkeeping_service" }),
      entry("2026-06-03", { rank: "rating" }),
      entry("2026-06-04", { rank: "master", vessel: { length_metres: "12", is_workboat: true } }),
      entry("2020-06-05", { rank: "master" }),
      entry("2026-06-06", { rank: "oow", dual_capacity: true }),
    ], NOW);
    expect(r.revalidation_officer_15m).toBe(2.5);
    expect(r.revalidation_required).toBe(360);
  });
});

describe("tug and Boatmaster counting keep reading the sea", () => {
  test("'sea' fixes and older null-with-tidal fixes are both at sea outside", () => {
    expect(isAtSeaOutside({ area_category: "sea", is_tidal: null })).toBe(true);
    expect(isAtSeaOutside({ area_category: null, is_tidal: true })).toBe(true);
    expect(isAtSeaOutside({ area_category: null, is_tidal: null })).toBe(false);
    expect(isAtSeaOutside({ area_category: "D", is_tidal: true })).toBe(false);
  });
});
