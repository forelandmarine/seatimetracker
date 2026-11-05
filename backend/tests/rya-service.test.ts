import { describe, test, expect } from "bun:test";
import {
  NO_CERTIFICATES, disciplineOf, nightHours, offshoreMiles, ryaDayStarts, ryaHeldFrom, ryaService, ryaTargets,
} from "../src/utils/ryaService";
import { sunAltitudeDeg } from "../src/utils/solar";
import { createClassifierFromFiles } from "../src/utils/seaAreas/load";

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

describe("RYA reduced targets (Yachtmaster Coastal and Offshore pages)", () => {
  test("without certificates: the full targets", () => {
    const t = ryaTargets(NO_CERTIFICATES, "power");
    expect(t.offshore).toMatchObject({ days: 50, skipper_days_under_24m: 5, miles: 2500, passages: 5, overnight: 2, as_skipper: 2, tidal_days_under_24m: 25, reduced_by: null });
    expect(t.coastal).toMatchObject({ days_under_24m: 30, days_alt_500gt: null, skipper_days_under_24m: 2, miles_under_24m: 800, miles_alt_500gt: null, tidal_days: 15, night_hours: 12, reduced_by: null });
  });

  test("Yachtmaster Offshore in the other discipline: 25 days, 3 as skipper, 1,250 miles, 3 passages", () => {
    const held = ryaHeldFrom([{ certificate_type: "occ_yachtmaster_offshore", discipline: "sail" }]);
    expect(ryaTargets(held, "power").offshore).toMatchObject({
      days: 25, skipper_days_under_24m: 3, miles: 1250, passages: 3, overnight: 1, as_skipper: 1, tidal_days_under_24m: 13, reduced_by: "yachtmaster_offshore",
    });
    // the same discipline reduces nothing
    expect(ryaTargets(held, "sail").offshore.days).toBe(50);
  });

  test("Coastal Skipper Practical course, in either discipline: 12 days and 400 miles under 24 m, or 30 and 800 under 500 GT", () => {
    const held = ryaHeldFrom([{ certificate_type: "course_coastal_skipper" }]);
    for (const d of ["sail", "power"] as const) {
      expect(ryaTargets(held, d).coastal).toMatchObject({
        days_under_24m: 12, days_alt_500gt: 30, skipper_days_under_24m: 2, miles_under_24m: 400, miles_alt_500gt: 800, tidal_days: 6, reduced_by: "coastal_skipper_course",
      });
    }
  });

  test("Yachtmaster Coastal reduces only the other discipline", () => {
    const held = ryaHeldFrom([{ certificate_type: "course_ym_coastal", discipline: "power" }]);
    expect(ryaTargets(held, "sail").coastal.reduced_by).toBe("yachtmaster_coastal");
    expect(ryaTargets(held, "power").coastal.reduced_by).toBeNull();
  });

  test("a Yachtmaster certificate with no discipline reduces nothing and is reported", () => {
    const held = ryaHeldFrom([{ certificate_type: "occ_yachtmaster_offshore", discipline: null }, { certificate_type: "eng1_medical" }]);
    expect(held.no_discipline).toEqual(["occ_yachtmaster_offshore"]);
    expect(ryaTargets(held, "sail").offshore.days).toBe(50);
    expect(ryaTargets(held, "power").offshore.days).toBe(50);
  });

  test("the service carries the targets for each discipline", () => {
    const held = ryaHeldFrom([{ certificate_type: "occ_yachtmaster_offshore", discipline: "sail" }]);
    const r = ryaService([], new Map(), NOW, { held });
    expect(r.power.targets.offshore.days).toBe(25);
    expect(r.sail.targets.offshore.days).toBe(50);
  });
});

describe("night hours (between local sunset and sunrise)", () => {
  test("sun altitude matches published London times (sunrise 03:43 UTC, sunset 20:21 UTC on 21 June)", () => {
    expect(sunAltitudeDeg(51.5, -0.13, new Date("2026-06-21T03:30:00Z"))).toBeLessThan(-0.833);
    expect(sunAltitudeDeg(51.5, -0.13, new Date("2026-06-21T04:00:00Z"))).toBeGreaterThan(-0.833);
    expect(sunAltitudeDeg(51.5, -0.13, new Date("2026-06-21T20:10:00Z"))).toBeGreaterThan(-0.833);
    expect(sunAltitudeDeg(51.5, -0.13, new Date("2026-06-21T20:35:00Z"))).toBeLessThan(-0.833);
  });

  const solent = { start_latitude: 50.78, start_longitude: -1.3, end_latitude: 50.78, end_longitude: -1.3 };

  test("a midsummer night in the Solent is about 7.5 hours", () => {
    const h = nightHours(e("2026-06-21T18:00:00Z", 12, solent));
    expect(h).toBeGreaterThan(7.2);
    expect(h).toBeLessThan(7.8);
  });

  test("a day sail has none, and an entry with no positions has none", () => {
    expect(nightHours(e("2026-06-21T08:00:00Z", 9, solent))).toBe(0);
    expect(nightHours(e("2026-12-21T20:00:00Z", 6))).toBe(0);
  });

  test("night uses the AIS position: the same UTC hours are night in the Channel and day in the Pacific", () => {
    const at = (lat: number, lon: number) => [
      { latitude: lat, longitude: lon, check_time: "2026-03-20T00:00:00Z" },
      { latitude: lat, longitude: lon, check_time: "2026-03-20T02:00:00Z" },
    ];
    expect(nightHours(e("2026-03-20T00:00:00Z", 2), at(50, -1))).toBe(2);
    expect(nightHours(e("2026-03-20T00:00:00Z", 2), at(0, -140))).toBe(0);
  });

  test("hours between two fixes that both report not moving are not under way", () => {
    const fixes = [
      { latitude: 50, longitude: -1, check_time: "2026-03-20T00:00:00Z", is_moving: false },
      { latitude: 50, longitude: -1, check_time: "2026-03-20T02:00:00Z", is_moving: false },
      { latitude: 50.1, longitude: -1, check_time: "2026-03-20T03:00:00Z", is_moving: true },
    ];
    expect(nightHours(e("2026-03-20T00:00:00Z", 3), fixes)).toBe(1);
  });

  test("the service totals night hours per discipline", () => {
    const r = ryaService([e("2026-06-21T18:00:00Z", 12, solent), e("2026-06-25T08:00:00Z", 9, { ...solent, vessel: bigMotor })], new Map(), NOW);
    expect(r.sail.night_hours).toBeGreaterThan(7);
    expect(r.power.night_hours).toBe(0);
  });
});

describe("Yachtmaster Ocean: 200 miles more than 50 miles from land", () => {
  // A westbound leg along 45N, fixes every 4 hours at 7.5 knots
  const track = Array.from({ length: 26 }, (_, i) => ({
    latitude: 45, longitude: -10 - i * 0.7, check_time: new Date(Date.parse("2026-03-01T00:00:00Z") + i * 4 * 3_600_000).toISOString(),
  }));
  const ocean = e("2026-03-01T00:00:00Z", 100, { id: "o1", rank: "master", distance_nm: "650" });
  const pastTwentyWest = (_lat: number, lon: number) => lon < -20;

  test("counts legs with both fixes far from land", () => {
    const nm = offshoreMiles(ocean, track, pastTwentyWest)!;
    // 11 fixes west of 20W make 10 legs of 0.7 degrees at 45N (about 29.7 miles each)
    expect(nm).toBeGreaterThan(290);
    expect(nm).toBeLessThan(305);
  });

  test("a gap of over six hours between fixes is not counted", () => {
    const sparse = track.filter((_, i) => i % 2 === 0);
    expect(offshoreMiles(ocean, sparse, pastTwentyWest)).toBe(0);
  });

  test("unknown without an AIS track or without a coastline", () => {
    expect(offshoreMiles(ocean, undefined, pastTwentyWest)).toBeNull();
    expect(offshoreMiles(ocean, track, null)).toBeNull();
  });

  test("the service adds offshore miles to each ocean candidate", () => {
    const r = ryaService([ocean], new Map(), NOW, { fixes: new Map([["o1", track]]), farFromLand: pastTwentyWest });
    expect(r.sail.ocean_passages[0].offshore_nm).toBeGreaterThan(290);
  });

  test("the classifier's coastline: mid-Atlantic is far from land, the Channel and Bay of Biscay coast are not", () => {
    const c = createClassifierFromFiles();
    expect(c.isFartherFromLandThan({ lat: 45, lon: -35 }, 50)).toBe(true);
    expect(c.isFartherFromLandThan({ lat: 50.2, lon: -1 }, 50)).toBe(false);
    expect(c.isFartherFromLandThan({ lat: 44.5, lon: -2 }, 50)).toBe(false);
    // on land
    expect(c.isFartherFromLandThan({ lat: 0, lon: 20 }, 50)).toBe(false);
  });
});
