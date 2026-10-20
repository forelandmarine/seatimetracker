import { describe, test, expect } from "bun:test";
import underwayDay from "./fixtures/history-underway-day.json";
import mooredDay from "./fixtures/history-moored-day.json";
import {
  detectPassages,
  groupPassages,
  splitAtUtcMidnight,
  withoutOverlaps,
  importWindow,
  monthsBefore,
  daysBetween,
  dayRuns,
  cleanFixes,
  isHistoryProduct,
  type HistoryFix,
} from "../src/utils/historyImport";

// Real Datalastic vessel_history days (positions newest first, about every 30 min).
function fromDatalastic(positions: any[]): HistoryFix[] {
  return positions.map((p) => ({
    time: new Date(p.last_position_UTC),
    latitude: p.lat,
    longitude: p.lon,
    speed_knots: p.speed,
    destination: p.destination,
  }));
}

/** A synthetic track: one fix every `stepMin` minutes heading east at `knots`, from `start`. */
function track(start: string, hours: number, knots: number, stepMin = 30, lat = 50, lon = -1): HistoryFix[] {
  const out: HistoryFix[] = [];
  const t0 = new Date(start).getTime();
  const steps = Math.round((hours * 60) / stepMin);
  // 1 nm east at latitude 50 is about 1/(60*cos50) degrees of longitude.
  const degPerNm = 1 / (60 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const h = (i * stepMin) / 60;
    out.push({
      time: new Date(t0 + h * 3_600_000),
      latitude: lat,
      longitude: lon + knots * h * degPerNm,
      speed_knots: knots,
      destination: null,
    });
  }
  return out;
}

const at = (fixes: HistoryFix[]) => fixes[fixes.length - 1];
function stopAt(fix: HistoryFix, start: string, hours: number, stepMin = 30): HistoryFix[] {
  const t0 = new Date(start).getTime();
  const out: HistoryFix[] = [];
  for (let m = stepMin; m <= hours * 60; m += stepMin) {
    out.push({ ...fix, time: new Date(t0 + m * 60_000), speed_knots: 0 });
  }
  return out;
}

describe("detectPassages on real AIS days", () => {
  test("a ship underway all day becomes one passage for that day", () => {
    const passages = detectPassages(fromDatalastic(underwayDay));
    expect(passages.length).toBe(1);
    const p = passages[0];
    expect(p.start_time.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(p.duration_hours).toBeGreaterThan(23);
    // About 16 knots for a day: a long way, but under 45 knots.
    expect(p.distance_nm).toBeGreaterThan(300);
    expect(p.distance_nm).toBeLessThan(24 * 45);
  });

  test("a yacht moored all day gives no passage", () => {
    expect(detectPassages(fromDatalastic(mooredDay))).toEqual([]);
  });
});

describe("groupPassages", () => {
  test("a short stop mid-passage is bridged", () => {
    const leg1 = track("2026-06-01T06:00:00Z", 4, 8);
    const stop = stopAt(at(leg1), "2026-06-01T10:00:00Z", 1);
    const leg2 = track("2026-06-01T11:30:00Z", 3, 8, 30, 50, at(leg1).longitude);
    const passages = detectPassages([...leg1, ...stop, ...leg2]);
    expect(passages.length).toBe(1);
    expect(passages[0].start_time.toISOString()).toBe("2026-06-01T06:00:00.000Z");
    expect(passages[0].end_time.toISOString()).toBe("2026-06-01T14:30:00.000Z");
  });

  test("a stop longer than the leg before it ends the passage", () => {
    const leg1 = track("2026-06-01T06:00:00Z", 2, 8);
    const stop = stopAt(at(leg1), "2026-06-01T08:00:00Z", 3);
    const leg2 = track("2026-06-01T11:30:00Z", 2, 8, 30, 50, at(leg1).longitude);
    expect(detectPassages([...leg1, ...stop, ...leg2]).length).toBe(2);
  });

  test("a stop at the broadcast destination ends the passage", () => {
    const leg1 = track("2026-06-01T06:00:00Z", 4, 8);
    const port = at(leg1);
    const stop = stopAt(port, "2026-06-01T10:00:00Z", 1);
    const leg2 = track("2026-06-01T11:30:00Z", 3, 8, 30, 50, port.longitude);
    const atPort = (f: HistoryFix) => f.longitude === port.longitude && f.latitude === port.latitude;
    expect(detectPassages([...leg1, ...stop, ...leg2], atPort).length).toBe(2);
  });

  test("a coverage gap longer than 6 hours is never counted", () => {
    const leg1 = track("2026-06-01T02:00:00Z", 3, 10);
    const leg2 = track("2026-06-01T13:00:00Z", 3, 10, 30, 50, at(leg1).longitude + 1);
    const passages = detectPassages([...leg1, ...leg2]);
    expect(passages.length).toBe(2);
    const hours = passages.reduce((s, p) => s + p.duration_hours, 0);
    expect(hours).toBeCloseTo(6, 5);
  });

  test("a single bad position does not add distance", () => {
    const leg = track("2026-06-01T06:00:00Z", 4, 8);
    const clean = detectPassages(leg)[0].distance_nm;
    const spiked = [...leg];
    spiked[4] = { ...spiked[4], latitude: 0.5, longitude: 0.5 };
    expect(detectPassages(spiked)[0].distance_nm).toBeCloseTo(clean, 0);
  });

  test("drift at anchor is not a passage", () => {
    const drift: HistoryFix[] = [];
    for (let i = 0; i < 48; i++) {
      drift.push({
        time: new Date(Date.UTC(2026, 5, 1, 0, i * 30)),
        latitude: 50 + (i % 2) * 0.0005,
        longitude: -1,
        speed_knots: 0.3,
        destination: null,
      });
    }
    expect(groupPassages(drift)).toEqual([]);
  });

  test("passages under 0.5 nm are dropped", () => {
    expect(detectPassages(track("2026-06-01T06:00:00Z", 0.1, 3, 3))).toEqual([]);
  });
});

describe("splitAtUtcMidnight", () => {
  test("an overnight passage becomes one entry per UTC day, cut exactly at midnight", () => {
    const passages = detectPassages(track("2026-06-01T20:00:00Z", 8, 10));
    expect(passages.length).toBe(2);
    expect(passages[0].end_time.toISOString()).toBe("2026-06-02T00:00:00.000Z");
    expect(passages[1].start_time.toISOString()).toBe("2026-06-02T00:00:00.000Z");
    expect(passages[0].duration_hours).toBe(4);
    expect(passages[1].duration_hours).toBe(4);
    expect(passages[0].distance_nm).toBeCloseTo(40, 0);
  });

  test("a passage inside one day is unchanged", () => {
    const fixes = track("2026-06-01T06:00:00Z", 2, 8);
    expect(splitAtUtcMidnight(fixes)).toEqual([fixes]);
  });
});

describe("withoutOverlaps", () => {
  test("drops imported passages that overlap an existing entry", () => {
    const passages = detectPassages([
      ...track("2026-06-01T06:00:00Z", 4, 8),
      ...track("2026-06-03T06:00:00Z", 4, 8, 30, 50, 0),
    ]);
    expect(passages.length).toBe(2);
    const kept = withoutOverlaps(passages, [
      { start: new Date("2026-06-01T09:00:00Z"), end: new Date("2026-06-01T18:00:00Z") },
    ]);
    expect(kept.length).toBe(1);
    expect(kept[0].start_time.toISOString().slice(0, 10)).toBe("2026-06-03");
  });
});

describe("windows and days", () => {
  test("monthsBefore clamps to the end of shorter months", () => {
    expect(monthsBefore("2026-10-20", 6)).toBe("2026-04-20");
    expect(monthsBefore("2026-10-20", 12)).toBe("2025-10-20");
    expect(monthsBefore("2026-08-31", 6)).toBe("2026-02-28");
  });

  test("importWindow runs back from tracking start, limited by the joining date", () => {
    expect(importWindow({ months: 6, trackingStartDay: "2026-10-20" })).toEqual({ from: "2026-04-20", to: "2026-10-20" });
    expect(importWindow({ months: 12, trackingStartDay: "2026-10-20", joinedDay: "2026-03-01" })).toEqual({ from: "2026-03-01", to: "2026-10-20" });
    // A joining date before the product's reach does not extend it.
    expect(importWindow({ months: 6, trackingStartDay: "2026-10-20", joinedDay: "2025-01-01" })).toEqual({ from: "2026-04-20", to: "2026-10-20" });
    expect(importWindow({ months: 6, trackingStartDay: "2026-10-20", joinedDay: "2026-10-20" })).toBeNull();
  });

  test("daysBetween excludes the end day", () => {
    expect(daysBetween("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
  });

  test("dayRuns batches contiguous days", () => {
    expect(dayRuns(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-05"], 2)).toEqual([
      { from: "2026-01-01", to: "2026-01-03" },
      { from: "2026-01-03", to: "2026-01-04" },
      { from: "2026-01-05", to: "2026-01-06" },
    ]);
  });
});

test("cleanFixes drops (0,0), sorts and de-duplicates", () => {
  const t = (iso: string, lat: number, lon: number): HistoryFix => ({ time: new Date(iso), latitude: lat, longitude: lon, speed_knots: null, destination: null });
  const out = cleanFixes([t("2026-01-01T02:00:00Z", 1, 1), t("2026-01-01T01:00:00Z", 0, 0), t("2026-01-01T00:00:00Z", 1, 1), t("2026-01-01T00:00:00Z", 1, 1)]);
  expect(out.map((f) => f.time.toISOString())).toEqual(["2026-01-01T00:00:00.000Z", "2026-01-01T02:00:00.000Z"]);
});

test("product ids", () => {
  expect(isHistoryProduct("seatime_history_6m")).toBe(true);
  expect(isHistoryProduct("com.subscription.monthly")).toBe(false);
});
