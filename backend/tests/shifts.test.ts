import { describe, test, expect } from "bun:test";
import {
  MAX_SHIFT_HOURS,
  UUID_RE,
  coveredByShift,
  isShiftNote,
  resolveShiftEnd,
  backfilledShiftMiles,
  shiftMiles,
  totalShiftMiles,
} from "../src/utils/shifts";

const H = 3_600_000;
const start = new Date("2026-10-27T06:00:00.000Z");

describe("resolveShiftEnd", () => {
  test("no end time inside the cap ends the shift now", () => {
    const now = new Date(start.getTime() + 12 * H);
    const r = resolveShiftEnd(start, undefined, now);
    expect(r.ok).toBe(true);
    expect(r.end!.getTime()).toBe(now.getTime());
  });

  test("no end time past the cap asks the user when it ended", () => {
    const now = new Date(start.getTime() + (MAX_SHIFT_HOURS + 1) * H);
    const r = resolveShiftEnd(start, null, now);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("needs_end_time");
  });

  test("a back-dated end inside the cap is accepted", () => {
    const now = new Date(start.getTime() + 30 * H);
    const end = new Date(start.getTime() + 11.5 * H);
    const r = resolveShiftEnd(start, end.toISOString(), now);
    expect(r.ok).toBe(true);
    expect(r.end!.getTime()).toBe(end.getTime());
  });

  test("an end before the start, in the future or past the cap is refused", () => {
    const now = new Date(start.getTime() + 30 * H);
    expect(resolveShiftEnd(start, new Date(start.getTime() - H).toISOString(), now).code).toBe("invalid_end_time");
    expect(resolveShiftEnd(start, start.toISOString(), now).code).toBe("invalid_end_time");
    expect(resolveShiftEnd(start, new Date(now.getTime() + 5 * 60_000).toISOString(), now).code).toBe("invalid_end_time");
    expect(resolveShiftEnd(start, new Date(start.getTime() + (MAX_SHIFT_HOURS + 0.5) * H).toISOString(), now).code).toBe("invalid_end_time");
    expect(resolveShiftEnd(start, "not a date", now).code).toBe("invalid_end_time");
  });

  test("an end a few seconds ahead of the server clock is clamped to now", () => {
    const now = new Date(start.getTime() + 8 * H);
    const r = resolveShiftEnd(start, new Date(now.getTime() + 20_000).toISOString(), now);
    expect(r.ok).toBe(true);
    expect(r.end!.getTime()).toBe(now.getTime());
  });

  test("a shift exactly at the cap is accepted", () => {
    const now = new Date(start.getTime() + MAX_SHIFT_HOURS * H);
    expect(resolveShiftEnd(start, undefined, now).ok).toBe(true);
  });
});

describe("coveredByShift", () => {
  const shiftEnd = new Date(start.getTime() + 12 * H);
  const at = (h: number) => new Date(start.getTime() + h * H);

  test("an AIS passage wholly inside the shift is covered", () => {
    expect(coveredByShift({ start_time: at(1), end_time: at(3) }, start, shiftEnd)).toBe(true);
    expect(coveredByShift({ start_time: start, end_time: shiftEnd }, start, shiftEnd)).toBe(true);
  });

  test("partial overlaps and open passages are not", () => {
    expect(coveredByShift({ start_time: at(-1), end_time: at(3) }, start, shiftEnd)).toBe(false);
    expect(coveredByShift({ start_time: at(11), end_time: at(13) }, start, shiftEnd)).toBe(false);
    expect(coveredByShift({ start_time: at(1), end_time: null }, start, shiftEnd)).toBe(false);
  });
});

describe("shift helpers", () => {
  test("shift notes are recognised, old and new wording alike", () => {
    expect(isShiftNote("Manual shift: clocked in")).toBe(true);
    expect(isShiftNote("Manual shift — 12h on duty")).toBe(true);
    expect(isShiftNote("Passage to Ramsgate")).toBe(false);
    expect(isShiftNote(null)).toBe(false);
  });

  test("vessel ids must be UUIDs", () => {
    expect(UUID_RE.test("3f2b8c1e-9a4d-4c1b-8f2e-1a2b3c4d5e6f")).toBe(true);
    expect(UUID_RE.test("not-a-uuid")).toBe(false);
    expect(UUID_RE.test("")).toBe(false);
  });
});

describe("shiftMiles", () => {
  test("a CTV back at its SOV: the AIS track wins over a near-zero straight line", () => {
    expect(shiftMiles(44.6, 0.03)).toBe(44.6);
  });
  test("no track (under two fixes) falls back to the straight line", () => {
    expect(shiftMiles(undefined, 12.345)).toBe(12.35);
    expect(shiftMiles(null, null)).toBe(0);
  });
  test("keeps the longer figure when sparse fixes understate the line", () => {
    expect(shiftMiles(3, 5)).toBe(5);
  });
});

describe("totalShiftMiles", () => {
  test("sums each shift, track first, stored distance otherwise", () => {
    const track = new Map([["a", 40.5], ["b", 2]]);
    const shifts = [
      { id: "a", distance_nm: "0.10" },
      { id: "b", distance_nm: 6 },
      { id: "c", distance_nm: null },
      { id: "d", distance_nm: "7.25" },
    ];
    expect(totalShiftMiles(shifts, track)).toBe(53.75);
  });
});

describe("backfilledShiftMiles", () => {
  const t0 = new Date("2026-11-01T08:00:00Z").getTime();
  // Out from the SOV to a turbine 0.1 deg of latitude north (6 nm) and back: 12 nm of track.
  const outAndBack = [
    { latitude: 53.0, longitude: 1.0, check_time: new Date(t0) },
    { latitude: "53.1", longitude: "1.0", check_time: new Date(t0 + H) },
    { latitude: 53.0, longitude: 1.0, check_time: new Date(t0 + 2 * H).toISOString() },
  ];

  test("an old shift stored as a near-zero straight line takes the track", () => {
    expect(backfilledShiftMiles(outAndBack, "0.02")).toBeCloseTo(12, 1);
  });
  test("fixes out of order are sorted by time first", () => {
    expect(backfilledShiftMiles([outAndBack[2], outAndBack[0], outAndBack[1]], 0)).toBeCloseTo(12, 1);
  });
  test("no change with under two fixes", () => {
    expect(backfilledShiftMiles([outAndBack[0]], 0)).toBeNull();
    expect(backfilledShiftMiles([], null)).toBeNull();
  });
  test("no change when the stored figure is already as long as the track", () => {
    expect(backfilledShiftMiles(outAndBack, 15)).toBeNull();
    const already = backfilledShiftMiles(outAndBack, 0)!;
    expect(backfilledShiftMiles(outAndBack, already)).toBeNull();
    expect(backfilledShiftMiles(outAndBack, String(already))).toBeNull();
  });
});
