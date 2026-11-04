import { describe, test, expect } from "bun:test";
import { isSoleWatchEntry, mnzCreditableDays, dayInSoleWatchPeriods } from "../src/utils/seaTime";
import {
  applySoleWatchChange,
  findOverlap,
  firstEntryDay,
  legacyFlagChange,
  legacyFlagValue,
  periodDays,
  periodsOverlap,
  previewPeriods,
  validateChange,
  validatePeriod,
  watchkeepingDays,
} from "../src/utils/soleWatch";

// An 8-hour confirmed entry on a UTC date, on vessel V1 unless told otherwise.
const day = (date: string, extra: Record<string, unknown> = {}) => ({
  vessel_id: "v1",
  start_time: `${date}T08:00:00Z`,
  end_time: `${date}T16:00:00Z`,
  status: "confirmed",
  service_type: "actual_sea_service",
  ...extra,
});
const onVessel = (periods: Array<{ start_date: string | null; end_date: string | null }>) => ({ vessel: { sole_watch_periods: periods } });

describe("period matching", () => {
  test("a date inside a period counts, outside does not", () => {
    const periods = [{ start_date: "2025-03-03", end_date: "2025-06-30" }];
    expect(dayInSoleWatchPeriods("2025-03-03", periods)).toBe(true);
    expect(dayInSoleWatchPeriods("2025-06-30", periods)).toBe(true);
    expect(dayInSoleWatchPeriods("2025-03-02", periods)).toBe(false);
    expect(dayInSoleWatchPeriods("2025-07-01", periods)).toBe(false);
  });

  test("null start is from the beginning, null end is ongoing", () => {
    expect(dayInSoleWatchPeriods("1999-01-01", [{ start_date: null, end_date: "2025-01-01" }])).toBe(true);
    expect(dayInSoleWatchPeriods("2099-01-01", [{ start_date: "2025-01-01", end_date: null }])).toBe(true);
    expect(dayInSoleWatchPeriods("2020-05-05", [{ start_date: null, end_date: null }])).toBe(true);
  });

  test("isSoleWatchEntry uses the entry's start date when periods are loaded", () => {
    const periods = [{ start_date: "2025-03-03", end_date: null }];
    expect(isSoleWatchEntry({ ...day("2025-03-03"), ...onVessel(periods) })).toBe(true);
    expect(isSoleWatchEntry({ ...day("2025-03-02"), ...onVessel(periods) })).toBe(false);
  });

  test("only actual sea service is matched", () => {
    const periods = [{ start_date: null, end_date: null }];
    expect(isSoleWatchEntry({ ...day("2025-03-03", { service_type: "standby_service" }), ...onVessel(periods) })).toBe(false);
    expect(isSoleWatchEntry({ ...day("2025-03-03", { service_type: "yard_service" }), ...onVessel(periods) })).toBe(false);
  });

  test("loaded periods win over the old flag", () => {
    expect(isSoleWatchEntry({ ...day("2025-03-03"), vessel: { is_sole_watchkeeper: true, sole_watch_periods: [] } })).toBe(false);
  });

  test("without loaded periods the old flag still works", () => {
    expect(isSoleWatchEntry({ ...day("2025-03-03"), vessel: { is_sole_watchkeeper: true } })).toBe(true);
    expect(isSoleWatchEntry({ ...day("2025-03-03"), vessel: { is_sole_watchkeeper: false } })).toBe(false);
  });

  test("MNZ watchkeeping only counts sea days inside the period", () => {
    const periods = [{ start_date: "2026-01-02", end_date: "2026-01-03" }];
    const r = mnzCreditableDays(
      ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"].map((d) => ({ ...day(d), ...onVessel(periods) })),
      new Date("2026-10-08T00:00:00Z")
    );
    expect(r.watchkeeping).toBe(2);
  });
});

describe("validation and overlap", () => {
  test("rejects bad dates and reversed periods", () => {
    expect(validatePeriod({ start_date: "2025-02-30", end_date: null })).not.toBeNull();
    expect(validatePeriod({ start_date: "3 Mar 2025", end_date: null })).not.toBeNull();
    expect(validatePeriod({ start_date: "2025-06-01", end_date: "2025-05-01" })).not.toBeNull();
    expect(validatePeriod({ start_date: "2025-05-01", end_date: "2025-05-01" })).toBeNull();
    expect(validatePeriod({ start_date: null, end_date: null })).toBeNull();
  });

  test("overlap includes shared end days and open ends", () => {
    const a = { start_date: "2025-01-01", end_date: "2025-03-31" };
    expect(periodsOverlap(a, { start_date: "2025-03-31", end_date: "2025-05-01" })).toBe(true);
    expect(periodsOverlap(a, { start_date: "2025-04-01", end_date: null })).toBe(false);
    expect(periodsOverlap(a, { start_date: null, end_date: "2024-12-31" })).toBe(false);
    expect(periodsOverlap(a, { start_date: null, end_date: null })).toBe(true);
    expect(periodsOverlap({ start_date: "2026-01-01", end_date: null }, { start_date: "2027-01-01", end_date: null })).toBe(true);
  });

  test("findOverlap skips the period being edited", () => {
    const existing = [
      { id: "a", start_date: "2025-01-01", end_date: "2025-03-31" },
      { id: "b", start_date: "2025-06-01", end_date: null },
    ];
    expect(findOverlap(existing, { start_date: "2025-02-01", end_date: "2025-04-30" }, "a")).toBeNull();
    expect(findOverlap(existing, { start_date: "2025-02-01", end_date: "2025-06-01" }, "a")?.id).toBe("b");
    expect(findOverlap(existing, { start_date: "2025-04-01", end_date: "2025-05-31" })).toBeNull();
  });

  test("validateChange checks the option and date", () => {
    expect(validateChange({ action: "on", from: "all" })).toBeNull();
    expect(validateChange({ action: "on", from: "date" })).not.toBeNull();
    expect(validateChange({ action: "off", at: "date", date: "2025-03-03" })).toBeNull();
    expect(validateChange({ action: "off", at: "later" })).not.toBeNull();
    expect(validateChange({ action: "maybe" })).not.toBeNull();
  });
});

describe("toggle changes", () => {
  const today = "2026-11-04";

  test("on: all past service, from a date, from today", () => {
    expect(applySoleWatchChange([], { action: "on", from: "all" }, today)).toEqual([{ start_date: null, end_date: null }]);
    expect(applySoleWatchChange([], { action: "on", from: "date", date: "2025-03-03" }, today)).toEqual([{ start_date: "2025-03-03", end_date: null }]);
    expect(applySoleWatchChange([], { action: "on", from: "today" }, today)).toEqual([{ start_date: today, end_date: null }]);
  });

  test("on keeps earlier periods and merges overlapping ones", () => {
    const periods = [
      { start_date: "2024-01-01", end_date: "2024-06-30" },
      { start_date: "2025-01-01", end_date: "2025-12-31" },
    ];
    expect(applySoleWatchChange(periods, { action: "on", from: "date", date: "2025-06-01" }, today)).toEqual([
      { start_date: "2024-01-01", end_date: "2024-06-30" },
      { start_date: "2025-01-01", end_date: null },
    ]);
    expect(applySoleWatchChange(periods, { action: "on", from: "all" }, today)).toEqual([{ start_date: null, end_date: null }]);
  });

  test("off: today keeps the past, a date cuts later days, never was removes all", () => {
    const periods = [
      { start_date: "2024-01-01", end_date: "2024-06-30" },
      { start_date: "2025-03-03", end_date: null },
    ];
    expect(applySoleWatchChange(periods, { action: "off", at: "today" }, today)).toEqual([
      { start_date: "2024-01-01", end_date: "2024-06-30" },
      { start_date: "2025-03-03", end_date: today },
    ]);
    expect(applySoleWatchChange(periods, { action: "off", at: "date", date: "2024-03-01" }, today)).toEqual([
      { start_date: "2024-01-01", end_date: "2024-03-01" },
    ]);
    expect(applySoleWatchChange(periods, { action: "off", at: "never" }, today)).toEqual([]);
  });

  test("results never overlap", () => {
    const periods = [
      { start_date: null, end_date: "2024-06-30" },
      { start_date: "2025-03-03", end_date: "2025-04-01" },
    ];
    const out = applySoleWatchChange(periods, { action: "on", from: "date", date: "2024-01-01" }, today);
    for (let i = 0; i < out.length; i++) expect(findOverlap(out.slice(i + 1), out[i])).toBeNull();
    expect(out).toEqual([{ start_date: null, end_date: null }]);
  });
});

describe("old app builds", () => {
  const today = "2026-11-04";

  test("switching on with no periods means every day, as before", () => {
    expect(legacyFlagChange([], true, today)).toEqual([{ start_date: null, end_date: null }]);
  });

  test("switching on keeps dated history and starts the day after it", () => {
    expect(legacyFlagChange([{ start_date: "2025-01-01", end_date: "2025-06-30" }], true, today)).toEqual([
      { start_date: "2025-01-01", end_date: "2025-06-30" },
      { start_date: "2025-07-01", end_date: null },
    ]);
  });

  test("switching on when already on changes nothing", () => {
    const periods = [{ start_date: "2025-01-01", end_date: null }];
    expect(legacyFlagChange(periods, true, today)).toBe(periods);
  });

  test("switching off ends periods today", () => {
    expect(legacyFlagChange([{ start_date: null, end_date: null }], false, today)).toEqual([{ start_date: null, end_date: today }]);
  });

  test("the flag is on while a period covers today", () => {
    expect(legacyFlagValue([{ start_date: null, end_date: null }], today)).toBe(true);
    expect(legacyFlagValue([{ start_date: null, end_date: "2026-11-03" }], today)).toBe(false);
    expect(legacyFlagValue([{ start_date: "2026-11-05", end_date: null }], today)).toBe(false);
    expect(legacyFlagValue([], today)).toBe(false);
  });
});

describe("preview and day counts", () => {
  const entries = [
    day("2025-03-01"),
    day("2025-03-02"),
    day("2025-03-03"),
    // already logged as watchkeeping on another vessel on the same date
    day("2025-03-03", { vessel_id: "v2", service_type: "watchkeeping_service" }),
    day("2025-03-04", { service_type: "standby_service" }),
    day("2025-03-05", { status: "pending" }),
  ].map((e) => ({ ...e, vessel: { sole_watch_periods: [] } }));

  test("MCA: days stay distinct and only actual sea service is added", () => {
    const p = previewPeriods(entries, "v1", [], [{ start_date: null, end_date: null }], "mca");
    // 03 Mar was already a watchkeeping day, so only 01 and 02 are added
    expect(p.current_days).toBe(1);
    expect(p.proposed_days).toBe(3);
    expect(p.added).toBe(2);
    expect(p.removed).toBe(0);
  });

  test("removing a period reports the days removed", () => {
    const p = previewPeriods(entries, "v1", [{ start_date: null, end_date: null }], [{ start_date: null, end_date: "2025-03-01" }], "mca");
    expect(p.removed).toBe(1);
    expect(p.added).toBe(0);
  });

  test("no watchkeeping figure under USCG or AMSA", () => {
    expect(watchkeepingDays(entries, "uscg")).toBe(0);
    expect(previewPeriods(entries, "v1", [], [{ start_date: null, end_date: null }], "amsa").added).toBe(0);
  });

  test("days in a period and the first entry date", () => {
    expect(periodDays(entries, "v1", { start_date: "2025-03-02", end_date: null }, "mca")).toBe(2);
    expect(firstEntryDay(entries, "v1")).toBe("2025-03-01");
    expect(firstEntryDay(entries, "none")).toBeNull();
  });
});
