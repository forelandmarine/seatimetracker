import { describe, test, expect } from "bun:test";
import { createClassifierFromFiles } from "../src/utils/seaAreas/load";
import {
  cachedMeasures,
  coastalDayBreakdown,
  coastalLimitByEntry,
  coastalLimitForFixes,
  coastalReportLabel,
  isNearCoastalPoint,
  NEAR_COASTAL_IRELAND_NM,
  NEAR_COASTAL_SAFE_HAVEN_NM,
  type NearCoastalMeasures,
} from "../src/utils/nearCoastal";

// MSN 1856 section 5 / MSN 1857 3.8.1: "150 miles from a safe haven on the coast
// of the UK and 30 miles from Ireland".
describe("near-coastal limits (MSN 1856 s.5, MSN 1857 3.8.1)", () => {
  test("150 nm from a UK safe haven and 30 nm from Ireland", () => {
    expect(NEAR_COASTAL_SAFE_HAVEN_NM).toBe(150);
    expect(NEAR_COASTAL_IRELAND_NM).toBe(30);
  });
});

/** Fake measures: the safe haven is at longitude 0, one degree of longitude is 60 nm; land is 10 nm off everywhere. */
const flat = (land = 10): NearCoastalMeasures => ({
  distanceFromCategorisedNm: (p) => Math.abs(p.lon) * 60,
  distanceFromLandNm: () => land,
});
const fix = (lat: number, lon: number, area: string | null = "sea") => ({ latitude: lat, longitude: lon, area_category: area });

describe("near coastal or unlimited for a set of fixes", () => {
  test("every fix within 150 nm of a safe haven is near coastal", () => {
    const r = coastalLimitForFixes([fix(50, 1), fix(50, 2.5)], flat());
    expect(r.limit).toBe("near_coastal");
    expect(r.max_from_safe_haven_nm).toBe(150);
  });

  test("one fix beyond 150 nm makes it unlimited", () => {
    expect(coastalLimitForFixes([fix(50, 1), fix(50, 2.6)], flat()).limit).toBe("unlimited");
  });

  test("a fix in categorised water is at a safe haven", () => {
    const r = coastalLimitForFixes([fix(50, 9, "C")], flat());
    expect(r.limit).toBe("near_coastal");
    expect(r.max_from_safe_haven_nm).toBe(0);
  });

  test("beyond 150 nm but within 30 nm of Ireland is near coastal; further off is not", () => {
    // Off south-west Ireland, more than 150 nm from the safe haven at longitude 0
    expect(isNearCoastalPoint({ lat: 51.4, lon: -10.2 }, flat(25))).toBe(true);
    expect(isNearCoastalPoint({ lat: 51.4, lon: -10.2 }, flat(31))).toBe(false);
    // The 30 nm rule is for Ireland only, not land anywhere
    expect(isNearCoastalPoint({ lat: 43.4, lon: -8.5 }, flat(5))).toBe(false);
  });

  test("no usable fixes gives no label", () => {
    const r = coastalLimitForFixes([{ latitude: null, longitude: null }], flat());
    expect(r.limit).toBeNull();
    expect(r.fixes).toBe(0);
  });

  test("report labels", () => {
    expect(coastalReportLabel("near_coastal")).toBe("Near coastal");
    expect(coastalReportLabel("unlimited")).toBe("Unlimited");
    expect(coastalReportLabel(null)).toBe("");
  });

  test("cached measures give the same answer and measure once per spot", () => {
    let calls = 0;
    const m = cachedMeasures({ distanceFromCategorisedNm: () => (calls++, 200), distanceFromLandNm: () => 100 });
    coastalLimitForFixes([fix(50.001, 3), fix(50.002, 3), fix(50.003, 3)], m);
    expect(calls).toBe(1);
  });
});

const entry = (id: string, day: string, hours = 10, vessel_id = "v", extra: Record<string, unknown> = {}) => ({
  id,
  vessel_id,
  start_time: `${day}T06:00:00Z`,
  end_time: new Date(Date.parse(`${day}T06:00:00Z`) + hours * 3_600_000).toISOString(),
  status: "confirmed",
  service_type: "actual_sea_service",
  ...extra,
});
const vfix = (day: string, hhmm: string, lon: number, vessel_id = "v", area: string | null = "sea") => ({
  vessel_id,
  check_time: `${day}T${hhmm}:00Z`,
  latitude: 50,
  longitude: lon,
  area_category: area,
});

describe("per entry and per day", () => {
  test("an entry takes the furthest fix inside its own window and vessel", () => {
    const entries = [entry("a", "2026-06-01"), entry("b", "2026-06-02")];
    const fixes = [
      vfix("2026-06-01", "08:00", 1),
      vfix("2026-06-01", "05:00", 9), // before the entry
      vfix("2026-06-01", "09:00", 9, "other"), // another vessel
      vfix("2026-06-02", "10:00", 3),
    ];
    const r = coastalLimitByEntry(entries, fixes, flat());
    expect(r.get("a")?.limit).toBe("near_coastal");
    expect(r.get("b")?.limit).toBe("unlimited");
  });

  test("days: unlimited wins over near coastal; no fixes is not measured; under 4 hours and yard are left out", () => {
    const entries = [
      entry("a", "2026-06-01"), // near coastal
      entry("b", "2026-06-01", 10, "w"), // same day, another vessel, unlimited
      entry("c", "2026-06-02"), // near coastal
      entry("d", "2026-06-03"), // no fixes
      entry("e", "2026-06-04", 3), // under 4 hours
      entry("f", "2026-06-05", 10, "v", { service_type: "yard_service" }),
      entry("g", "2026-06-06", 10, "v", { status: "pending" }),
    ];
    const fixes = [
      vfix("2026-06-01", "08:00", 1),
      vfix("2026-06-01", "09:00", 4, "w"),
      vfix("2026-06-02", "08:00", 2),
      vfix("2026-06-04", "07:00", 9),
      vfix("2026-06-05", "08:00", 9),
      vfix("2026-06-06", "08:00", 9),
    ];
    expect(coastalDayBreakdown(entries, fixes, flat())).toEqual({ near_coastal: 1, unlimited: 1, not_measured: 1, total: 3 });
  });

  test("a voyage over two days labels each day from that day's fixes", () => {
    const voyage = { ...entry("a", "2026-06-01"), end_time: "2026-06-02T18:00:00Z" };
    const fixes = [vfix("2026-06-01", "12:00", 1), vfix("2026-06-02", "12:00", 5)];
    expect(coastalDayBreakdown([voyage], fixes, flat())).toEqual({ near_coastal: 1, unlimited: 1, not_measured: 0, total: 2 });
    expect(coastalLimitByEntry([voyage], fixes, flat()).get("a")?.limit).toBe("unlimited");
  });
});

describe("near coastal with the real classifier", () => {
  const c = cachedMeasures(createClassifierFromFiles());
  const at = (lat: number, lon: number) => isNearCoastalPoint({ lat, lon }, c);

  test("the English Channel and North Sea are near coastal", () => {
    expect(at(50.2, -1.5)).toBe(true); // mid Channel
    expect(at(54.0, 2.0)).toBe(true); // Dogger Bank wind farms
  });

  test("mid Atlantic and the Bay of Biscay are unlimited", () => {
    expect(at(46.0, -6.0)).toBe(false); // Bay of Biscay, about 250 nm from Cornwall
    expect(at(55.0, -25.0)).toBe(false);
  });

  test("off south-west Ireland, over 150 nm from a UK harbour, inside 30 nm of Ireland", () => {
    const p = { lat: 51.35, lon: -10.0 };
    expect(c.distanceFromCategorisedNm(p)).toBeGreaterThan(150);
    expect(at(p.lat, p.lon)).toBe(true);
    // 90 nm west of the Irish coast and beyond 150 nm of the UK
    expect(at(52.0, -12.5)).toBe(false);
  });
});
