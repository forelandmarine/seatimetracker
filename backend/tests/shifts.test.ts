import { describe, test, expect } from "bun:test";
import {
  MAX_SHIFT_HOURS,
  UUID_RE,
  coveredByShift,
  isShiftNote,
  resolveShiftEnd,
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
