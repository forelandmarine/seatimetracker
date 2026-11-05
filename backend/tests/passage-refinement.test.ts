import { describe, test, expect, afterEach } from "bun:test";
import underwayDay from "./fixtures/history-underway-day.json";
import mooredDay from "./fixtures/history-moored-day.json";
import type { HistoryFix } from "../src/utils/historyImport.js";
import {
  refinePassage,
  isSettled,
  newLiveEntryStatus,
  isCommercialSector,
  extendableStatuses,
  CHECKING_STATUS,
  type LivePassage,
} from "../src/utils/passageRefinement.js";

const H = 3_600_000;
const t = (iso: string) => new Date(iso);

function fromDatalastic(positions: any[]): HistoryFix[] {
  return positions.map((p) => ({
    time: new Date(p.last_position_UTC),
    latitude: p.lat,
    longitude: p.lon,
    speed_knots: p.speed,
    destination: p.destination,
  }));
}

/**
 * A synthetic day: moored from `from` until `depart`, east at 10 kn until `arrive`,
 * then moored until `to`. One fix every 30 minutes, like Datalastic history.
 */
function day(from: string, depart: string, arrive: string, to: string, knots = 10): HistoryFix[] {
  const out: HistoryFix[] = [];
  const degPerNm = 1 / (60 * Math.cos((50 * Math.PI) / 180));
  const d = t(depart).getTime();
  const a = t(arrive).getTime();
  for (let ms = t(from).getTime(); ms <= t(to).getTime(); ms += 0.5 * H) {
    const underwayHours = (Math.min(Math.max(ms, d), a) - d) / H;
    out.push({
      time: new Date(ms),
      latitude: 50,
      longitude: -1 + knots * underwayHours * degPerNm,
      speed_knots: ms > d && ms <= a ? knots : 0,
      destination: null,
    });
  }
  return out;
}

function live(start: string, end: string): LivePassage {
  return { start_time: t(start), end_time: t(end), start_latitude: 50, start_longitude: -1, end_latitude: 50, end_longitude: -0.2, };
}

describe("refinePassage", () => {
  const track = day("2026-10-20T00:00:00Z", "2026-10-20T08:00:00Z", "2026-10-20T13:00:00Z", "2026-10-20T20:00:00Z");

  test("moves a stale in-port start and a late end in to the real track", () => {
    // Live start from a port check 6 hours before departure, end 2.5 hours after arrival
    const r = refinePassage(live("2026-10-20T02:00:00Z", "2026-10-20T15:30:00Z"), track);
    expect(r.outcome).toBe("refined");
    expect(r.start_time.toISOString()).toBe("2026-10-20T08:00:00.000Z");
    expect(r.end_time.toISOString()).toBe("2026-10-20T13:00:00.000Z");
    expect(r.duration_hours).toBe(5);
    expect(r.distance_nm).toBeCloseTo(50, 0);
  });

  test("a passage recorded over 4 hours can come out under 4 hours", () => {
    const short = day("2026-10-20T00:00:00Z", "2026-10-20T03:00:00Z", "2026-10-20T06:00:00Z", "2026-10-20T09:00:00Z");
    const r = refinePassage(live("2026-10-20T01:00:00Z", "2026-10-20T06:30:00Z"), short);
    expect(r.outcome).toBe("refined");
    expect(r.duration_hours).toBe(3);
  });

  test("never lengthens a passage", () => {
    const r = refinePassage(live("2026-10-20T09:00:00Z", "2026-10-20T12:00:00Z"), track);
    expect(r.outcome).toBe("unchanged");
    expect(r.start_time.toISOString()).toBe("2026-10-20T09:00:00.000Z");
    expect(r.end_time.toISOString()).toBe("2026-10-20T12:00:00.000Z");
  });

  test("keeps the live start when the track has nothing before departure", () => {
    const fromUnderway = track.filter((f) => f.time >= t("2026-10-20T08:30:00Z"));
    const r = refinePassage(live("2026-10-20T02:00:00Z", "2026-10-20T15:30:00Z"), fromUnderway);
    expect(r.start_time.toISOString()).toBe("2026-10-20T02:00:00.000Z");
    expect(r.end_time.toISOString()).toBe("2026-10-20T13:00:00.000Z");
  });

  test("keeps the live end when the track stops before the arrival is confirmed", () => {
    const toArrival = track.filter((f) => f.time <= t("2026-10-20T13:00:00Z"));
    const r = refinePassage(live("2026-10-20T02:00:00Z", "2026-10-20T15:30:00Z"), toArrival);
    expect(r.start_time.toISOString()).toBe("2026-10-20T08:00:00.000Z");
    expect(r.end_time.toISOString()).toBe("2026-10-20T15:30:00.000Z");
  });

  test("a hole in the track is not taken as the vessel being stopped", () => {
    // Offshore: one fix at 03:00, then nothing until 09:00, underway after that
    const holed = track.filter((f) => f.time.getTime() === t("2026-10-20T03:00:00Z").getTime() || f.time >= t("2026-10-20T09:00:00Z"));
    const r = refinePassage(live("2026-10-20T02:00:00Z", "2026-10-20T15:30:00Z"), holed);
    expect(r.start_time.toISOString()).toBe("2026-10-20T02:00:00.000Z");
  });

  test("never moves past a live check that saw the vessel moving", () => {
    const r = refinePassage(live("2026-10-20T02:00:00Z", "2026-10-20T15:30:00Z"), track, [
      t("2026-10-20T06:00:00Z"),
      t("2026-10-20T14:00:00Z"),
    ]);
    expect(r.start_time.toISOString()).toBe("2026-10-20T06:00:00.000Z");
    expect(r.end_time.toISOString()).toBe("2026-10-20T14:00:00.000Z");
  });

  test("a track with no movement is flagged, times kept", () => {
    const moored = fromDatalastic(mooredDay);
    const first = moored.reduce((a, b) => (a.time < b.time ? a : b)).time;
    const r = refinePassage(
      { ...live("2026-10-20T00:00:00Z", "2026-10-20T00:00:00Z"), start_time: new Date(first.getTime() + 2 * H), end_time: new Date(first.getTime() + 8 * H) },
      moored
    );
    expect(r.outcome).toBe("no_movement");
    expect(r.duration_hours).toBe(6);
  });

  test("no track means no change", () => {
    const r = refinePassage(live("2026-10-20T02:00:00Z", "2026-10-20T15:30:00Z"), []);
    expect(r.outcome).toBe("no_history");
    expect(r.duration_hours).toBe(13.5);
  });

  test("a ship underway all day on a real track stays underway all day", () => {
    const fixes = fromDatalastic(underwayDay);
    const times = fixes.map((f) => f.time.getTime()).sort((a, b) => a - b);
    const start = new Date(times[2]);
    const end = new Date(times[times.length - 3]);
    const r = refinePassage({ ...live("2026-10-20T00:00:00Z", "2026-10-20T00:00:00Z"), start_time: start, end_time: end }, fixes);
    // Underway before and after the live window: nothing to shorten
    expect(r.outcome).toBe("unchanged");
    expect(r.start_time).toEqual(start);
    expect(r.end_time).toEqual(end);
  });
});

describe("isSettled", () => {
  const end = t("2026-10-20T13:00:00Z");
  const stopped = { check_time: end, is_moving: false };

  test("waits for the track to catch up after the vessel stops", () => {
    expect(isSettled({ now: t("2026-10-20T13:30:00Z"), entryEnd: end, latestCheck: stopped })).toBe(false);
    expect(isSettled({ now: t("2026-10-20T13:50:00Z"), entryEnd: end, latestCheck: stopped })).toBe(true);
  });

  test("not while the vessel is still underway", () => {
    const moving = { check_time: end, is_moving: true };
    expect(isSettled({ now: t("2026-10-20T14:00:00Z"), entryEnd: end, latestCheck: moving })).toBe(false);
  });

  test("an entry not extended for 2.5 hours is finished either way", () => {
    const moving = { check_time: t("2026-10-20T15:00:00Z"), is_moving: true };
    expect(isSettled({ now: t("2026-10-20T15:30:00Z"), entryEnd: end, latestCheck: moving })).toBe(true);
  });
});

describe("entry statuses", () => {
  afterEach(() => { delete process.env.PASSAGE_REFINEMENT; });

  test("new on-board passages wait in 'checking'; off-board ones stay off board", () => {
    expect(newLiveEntryStatus("pending")).toBe(CHECKING_STATUS);
    expect(newLiveEntryStatus("off_board")).toBe("off_board");
    expect(extendableStatuses("pending")).toEqual(["pending", CHECKING_STATUS]);
    expect(extendableStatuses("off_board")).toEqual(["off_board"]);
  });

  test("commercial passages go straight to pending", () => {
    expect(newLiveEntryStatus("pending", true)).toBe("pending");
    expect(newLiveEntryStatus("off_board", true)).toBe("off_board");
    expect(isCommercialSector("commercial", null)).toBe(true);
    expect(isCommercialSector(null, "commercial")).toBe(true);
    expect(isCommercialSector("yachting", "yachting")).toBe(false);
    expect(isCommercialSector(null, null)).toBe(false);
  });

  test("the kill switch restores straight-to-pending", () => {
    process.env.PASSAGE_REFINEMENT = "off";
    expect(newLiveEntryStatus("pending")).toBe("pending");
  });
});
