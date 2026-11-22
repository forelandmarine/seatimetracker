/**
 * Differential test: the app's Schengen engine (src/utils/presence) against an
 * independent oracle (tests/schengen-oracle.ref.ts) written straight from
 * Schengen Borders Code art. 6 without reading the app code.
 *
 * Thousands of seeded random itineraries: same-day in/out, back-to-back stays,
 * overlapping records, open stays to today, leap years (29 Feb 2028), window
 * edges, planned future trips (including ones more than a year ahead), and
 * on-board stays with the Schengen toggle on and off, at-sea stays (counted
 * after a counted stay unless switched off) and unlogged gaps between stays.
 *
 * Compared: the set of counted days, days used on any date, days left today,
 * the latest day you can stay (from today and from a trip's first day), the
 * first future breach, the "days start coming back" line, and the trip tester
 * verdict, first breach day and most days used.
 */
import { describe, test, expect } from "bun:test";
import {
  dayNum as appDayNum,
  isoOf as appIsoOf,
  latestStayFrom,
  planSchengenTrip,
  schengenDays,
  schengenSummary,
  windowCount,
  type Stay,
} from "../src/utils/presence/presence";
import * as R from "./schengen-oracle.ref";

// ── Oracle-side membership, typed in from the Commission's list ───────
// 25 EU states + IS, NO, CH, LI (home-affairs.ec.europa.eu, Schengen area page).
const MEMBERS = new Set([
  "AT", "BE", "BG", "HR", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IT", "LV", "LT",
  "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "NO", "CH", "LI",
]);
// No border checks with a member, so in practice days there are days in the area.
// Andorra is a judgement call (see the research doc); the app counts it, so does this.
const COUNTED_NON_MEMBERS = new Set(["MC", "SM", "VA", "AD"]);
// Gibraltar: time there counts with Schengen time from 15 July 2026 (UK-EU
// agreement, provisional application; GOV.UK Gibraltar entry requirements).
const ORACLE_GI_FROM = R.dayNum("2026-07-15");
// Croatia joined 1 Jan 2023; Bulgaria and Romania 31 Mar 2024 (air and sea).
const JOINED: Record<string, number> = {
  HR: R.dayNum("2023-01-01"),
  BG: R.dayNum("2024-03-31"),
  RO: R.dayNum("2024-03-31"),
  GI: ORACLE_GI_FROM,
};
const inArea = (c: string) => MEMBERS.has(c) || COUNTED_NON_MEMBERS.has(c) || c === "GI";

/** The app's stays as the oracle's log (see daysFromLog for the caution rules). */
function toLog(stays: Stay[]): R.RefLogEntry[] {
  return stays.map((s) => {
    const first = R.dayNum(s.start_date);
    const last = s.end_date ? R.dayNum(s.end_date) : null;
    if (s.country_code === "ZZ") return { first, last, place: "sea" as const, clearedOut: !s.counts_schengen };
    const counted = inArea(s.country_code) && (s.kind === "ashore" || s.counts_schengen);
    return counted
      ? { first, last, place: "area" as const, countsFrom: JOINED[s.country_code] }
      : { first, last, place: "outside" as const };
  });
}

function oracleDays(stays: Stay[], todayIso: string): Set<number> {
  return R.daysFromLog(toLog(stays), R.dayNum(todayIso));
}

// ── Seeded RNG ────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SCHENGEN_PICK = ["FR", "ES", "IT", "GR", "HR", "MT", "PT", "NO", "CH", "BG", "RO", "DE", "NL"];
// "At sea" (ZZ) is listed four times so the at-sea caution rule gets plenty of cases.
const OTHER_PICK = ["GB", "IE", "CY", "US", "TR", "ME", "AL", "GI", "GI", "GP", "MQ", "RE", "FO", "GL", "SJ", "ZZ", "ZZ", "ZZ", "ZZ"];
const MICRO_PICK = ["MC", "SM", "VA", "AD"];

type Gen = { stays: Stay[]; today: string };

function genItinerary(rnd: () => number): Gen {
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  // Today: 2024-06-01 .. 2030-12-31, with extra weight around 29 Feb 2028 and
  // the dates Bulgaria/Romania (2024-03-31) and Gibraltar (2026-07-15) start counting.
  const r0 = rnd();
  const t =
    r0 < 0.2
      ? R.dayNum("2028-02-29") + int(-200, 200)
      : r0 < 0.35
        ? R.dayNum("2026-07-15") + int(-120, 200)
        : int(R.dayNum("2024-06-01"), R.dayNum("2030-12-31"));
  const pick = () => {
    const r = rnd();
    if (r < 0.6) return SCHENGEN_PICK[int(0, SCHENGEN_PICK.length - 1)];
    if (r < 0.7) return MICRO_PICK[int(0, MICRO_PICK.length - 1)];
    return OTHER_PICK[int(0, OTHER_PICK.length - 1)];
  };
  const stays: Stay[] = [];
  const style = rnd();
  // Long stays (dense Schengen use) are more likely to hit the 90-day edge.
  const maxLen = style < 0.3 ? 5 : style < 0.7 ? 45 : 120;
  let d = t - int(180, 500);
  const horizon = t + (rnd() < 0.3 ? int(200, 700) : int(0, 200));
  let openUsed = false;
  while (d <= horizon && stays.length < 60) {
    const len = rnd() < 0.15 ? 0 : int(0, maxLen); // 0 = same-day in and out
    const start = d;
    let end: number | null = start + len;
    // An open stay to today (only one, starting on or before today, nothing after).
    if (!openUsed && start <= t && end >= t && rnd() < 0.5) {
      end = null;
      openUsed = true;
    }
    const onBoard = rnd() < 0.3;
    stays.push({
      country_code: pick(),
      start_date: R.isoOf(start),
      end_date: end == null ? null : R.isoOf(end),
      kind: onBoard ? "on_board" : "ashore",
      counts_schengen: onBoard ? rnd() < 0.5 : true,
      counts_tax: true,
    });
    if (end == null) break;
    // Next stay: back to back (shared day), next day, gap, or an overlapping record.
    const r = rnd();
    d = r < 0.35 ? end : r < 0.55 ? end + 1 : r < 0.9 ? end + int(1, 90) : end - int(1, 10);
  }
  return { stays, today: R.isoOf(t) };
}

// ── Oracle answers ────────────────────────────────────────────────────
function oracleSummary(stays: Stay[], todayIso: string) {
  const t = R.dayNum(todayIso);
  const days = oracleDays(stays, todayIso);
  const used = R.daysUsed(days, t);
  const lim = R.continuousStayLimit(days, t);
  let futureBreach: number | null = null;
  for (const d of R.overstayDays(days)) {
    if (d > t) {
      futureBreach = d;
      break;
    }
  }
  const past = new Set([...days].filter((d) => d <= t));
  let release: { date: string; remaining: number } | null = null;
  for (let d = t + 1; d <= t + 30; d++) {
    const n = R.daysUsed(past, d);
    if (n < used) {
      release = { date: R.isoOf(d), remaining: Math.max(0, R.LIMIT - n) };
      break;
    }
  }
  return {
    days,
    used,
    remaining: R.daysRemaining(days, t),
    latest: lim.lastLegal == null ? null : R.isoOf(lim.lastLegal),
    over: used > R.LIMIT,
    futureBreach: futureBreach == null ? null : R.isoOf(futureBreach),
    release,
  };
}

/**
 * Trip tester by the regulation: every day of the trip must be within 90 in
 * its own 180-day period, and the trip must not push a later logged day of
 * stay over the limit. A later day that is already over without the trip is
 * not this trip's fault (the summary's future breach line covers it).
 */
function oraclePlan(stays: Stay[], todayIso: string, ps: number, pe: number) {
  const days = oracleDays(stays, todayIso);
  const v = R.tripVerdict(days, ps, pe);
  const trial = new Set(days);
  for (let d = ps; d <= pe; d++) trial.add(d);
  let laterNew: number | null = null;
  for (const d of [...trial].filter((x) => x > pe).sort((a, b) => a - b)) {
    if (R.daysUsed(trial, d) > R.LIMIT && R.daysUsed(days, d) <= R.LIMIT) {
      laterNew = d;
      break;
    }
  }
  const first = v.firstOver ?? laterNew;
  let latestIfEnter: number | null;
  try {
    latestIfEnter = R.continuousStayLimit(days, ps).lastLegal;
  } catch {
    latestIfEnter = null;
  }
  return {
    ok: first == null,
    firstBreach: first == null ? null : R.isoOf(first),
    maxUsed: v.maxUsed,
    latestIfEnter: latestIfEnter == null ? null : R.isoOf(latestIfEnter),
  };
}

// ── Mismatch collection ───────────────────────────────────────────────
type Mismatch = { seed: number; field: string; app: unknown; oracle: unknown; today: string; stays: Stay[]; extra?: unknown };

function shrinkKey(m: Mismatch) {
  return m.stays.length;
}

const ITINERARIES = 4000;

describe("Schengen 90/180: app engine against the independent oracle", () => {
  test("day helpers agree (incl. 29 Feb 2028 and year ends)", () => {
    for (const iso of ["2028-02-28", "2028-02-29", "2028-03-01", "2027-12-31", "2029-01-01", "2024-02-29"]) {
      expect(appDayNum(iso)).toBe(R.dayNum(iso));
      expect(appIsoOf(R.dayNum(iso))).toBe(iso);
    }
    expect(R.dayNum("2028-03-01") - R.dayNum("2028-02-28")).toBe(2);
  });

  test(`${ITINERARIES} random itineraries: summary figures match`, () => {
    const mismatches: Mismatch[] = [];
    for (let seed = 1; seed <= ITINERARIES; seed++) {
      const rnd = mulberry32(seed);
      const { stays, today } = genItinerary(rnd);
      const app = schengenSummary(stays, today);
      const o = oracleSummary(stays, today);
      const appDays = schengenDays(stays, today);
      const add = (field: string, a: unknown, b: unknown, extra?: unknown) => {
        if (JSON.stringify(a) !== JSON.stringify(b)) mismatches.push({ seed, field, app: a, oracle: b, today, stays, extra });
      };
      add("days", [...appDays].sort((a, b) => a - b), [...o.days].sort((a, b) => a - b));
      add("used", app.used, o.used);
      add("remaining", app.remaining, o.remaining);
      add("latest_stay_date", app.latest_stay_date, o.latest);
      add("over", app.over, o.over);
      add("future_breach", app.future_breach, o.futureBreach);
      add("next_release", app.next_release, o.release);
      // Days used on other dates, including window edges around each stay.
      const probe = new Set<number>();
      for (const s of stays) {
        for (const iso of [s.start_date, s.end_date]) {
          if (!iso) continue;
          const n = R.dayNum(iso);
          for (const k of [-1, 0, 1, 178, 179, 180, 181]) probe.add(n + k);
        }
      }
      for (let i = 0; i < 10; i++) probe.add(R.dayNum(today) + Math.floor((rnd() - 0.5) * 900));
      for (const d of probe) {
        add(`used on ${R.isoOf(d)}`, windowCount(appDays, d), R.daysUsed(o.days, d));
      }
      // Latest stay from a random day (as if entering then).
      const from = R.dayNum(today) + Math.floor((rnd() - 0.3) * 400);
      let oLatest: number | null;
      try {
        oLatest = R.continuousStayLimit(o.days, from).lastLegal;
      } catch {
        oLatest = null;
      }
      add(`latestStayFrom ${R.isoOf(from)}`, latestStayFrom(appDays, from), oLatest);
    }
    if (mismatches.length) {
      const byField = new Map<string, Mismatch>();
      for (const m of mismatches) {
        const f = m.field.replace(/ .*$/, "");
        const prev = byField.get(f);
        if (!prev || shrinkKey(m) < shrinkKey(prev)) byField.set(f, m);
      }
      const counts: Record<string, number> = {};
      for (const m of mismatches) counts[m.field.replace(/ .*$/, "")] = (counts[m.field.replace(/ .*$/, "")] ?? 0) + 1;
      console.log(`${mismatches.length} summary mismatches`, counts, "smallest per field:");
      for (const [f, m] of byField) console.log(f, JSON.stringify(m, null, 1));
    }
    expect(mismatches.length).toBe(0);
  }, 120_000);

  test(`${ITINERARIES} random itineraries: trip tester matches`, () => {
    const mismatches: Mismatch[] = [];
    for (let seed = 1; seed <= ITINERARIES; seed++) {
      const rnd = mulberry32(seed * 7919);
      const { stays, today } = genItinerary(rnd);
      const t = R.dayNum(today);
      for (let k = 0; k < 3; k++) {
        const ps = t + Math.floor(rnd() * 400) - 60;
        const pe = ps + (rnd() < 0.15 ? 0 : Math.floor(rnd() * 120));
        const plan = { start_date: R.isoOf(ps), end_date: R.isoOf(pe) };
        const a = planSchengenTrip(stays, today, plan);
        const o = oraclePlan(stays, today, ps, pe);
        const add = (field: string, x: unknown, y: unknown) => {
          if (JSON.stringify(x) !== JSON.stringify(y)) mismatches.push({ seed, field, app: x, oracle: y, today, stays, extra: plan });
        };
        add("ok", a.ok, o.ok);
        add("first_breach", a.first_breach, o.firstBreach);
        add("max_used", a.max_used, o.maxUsed);
        add("latest_stay_if_enter", a.latest_stay_if_enter, o.latestIfEnter);
        add("days", a.days, pe - ps + 1);
      }
    }
    if (mismatches.length) {
      const byField = new Map<string, Mismatch>();
      for (const m of mismatches) {
        const prev = byField.get(m.field);
        if (!prev || shrinkKey(m) < shrinkKey(prev)) byField.set(m.field, m);
      }
      const counts: Record<string, number> = {};
      for (const m of mismatches) counts[m.field] = (counts[m.field] ?? 0) + 1;
      console.log(`${mismatches.length} plan mismatches`, counts, "smallest per field:");
      for (const [f, m] of byField) console.log(f, JSON.stringify(m, null, 1));
    }
    expect(mismatches.length).toBe(0);
  }, 120_000);
});

// ── Hand-worked cases straight from art. 6 ────────────────────────────
const S = (c: string, a: string, b: string | null, extra: Partial<Stay> = {}): Stay => ({
  country_code: c, start_date: a, end_date: b, kind: "ashore", counts_schengen: true, counts_tax: true, ...extra,
});

describe("Schengen 90/180: hand-worked cases", () => {
  test("same-day in and out counts one day; entry and exit days both count", () => {
    expect(schengenSummary([S("FR", "2026-06-01", "2026-06-01")], "2026-06-10").used).toBe(1);
    expect(schengenSummary([S("FR", "2026-06-01", "2026-06-10")], "2026-06-10").used).toBe(10);
  });

  test("a day in two Schengen states counts once", () => {
    const s = [S("FR", "2026-06-01", "2026-06-05"), S("IT", "2026-06-05", "2026-06-09")];
    expect(schengenSummary(s, "2026-06-30").used).toBe(9);
  });

  test("window is the day itself and the 179 before it", () => {
    // 90 days ending 2026-03-31. On 2026-09-26 (179 days later) day 1 is still in.
    const s = [S("ES", "2026-01-01", "2026-03-31")];
    const days = schengenDays(s, "2026-12-31");
    expect(windowCount(days, appDayNum("2026-06-29"))).toBe(90); // 2026-06-29 - 179 = 2026-01-01
    expect(windowCount(days, appDayNum("2026-06-30"))).toBe(89); // 2026-01-01 drops out
    expect(R.daysUsed(oracleDays(s, "2026-12-31"), R.dayNum("2026-06-30"))).toBe(89);
  });

  test("29 Feb 2028 is a day like any other", () => {
    const s = [S("PT", "2028-02-28", "2028-03-01")];
    expect(schengenSummary(s, "2028-03-01").used).toBe(3);
    // 90 days from 1 Jan 2028 ends on 30 Mar 2028 in a leap year (31 Mar otherwise).
    const p = planSchengenTrip([], "2027-12-01", { start_date: "2028-01-01", end_date: "2028-03-31" });
    expect(p.first_breach).toBe("2028-03-31");
    expect(p.latest_stay_if_enter).toBe("2028-03-30");
  });

  test("a trip does not get the blame for a later stay that is already over", () => {
    // Logged: 100 days in 2027 (already over on its 91st day). Trial: 2 days in 2026.
    const s = [S("GR", "2027-05-01", "2027-08-08")];
    const p = planSchengenTrip(s, "2026-11-22", { start_date: "2026-12-01", end_date: "2026-12-02" });
    expect(p.ok).toBe(true);
    expect(schengenSummary(s, "2026-11-22").future_breach).toBe("2027-07-30");
  });

  test("a planned stay more than a year ahead still shows its breach", () => {
    const s = [S("ES", "2028-01-01", "2028-05-01")];
    expect(schengenSummary(s, "2026-11-22").future_breach).toBe("2028-03-31");
  });
});

// ── European Commission short-stay calculator, run by hand 2026-11-22 ─
// https://ec.europa.eu/assets/home/visa-calculator-2/calculator.htm?lang=en
// "Planning" gives "may be authorised for up to N day(s)" from the entry date;
// "Control" gives "Possible stay until" or the overstay period. Each case was
// entered in the calculator and its answer recorded here.
describe("Schengen 90/180: Commission calculator results", () => {
  const F = (a: string, b: string) => S("FR", a, b);
  // The calculator takes separate trips: between them you were outside the
  // area. In the app you log that (unlogged days between Schengen stays now
  // count, caution rule 2026-11-22), so these cases log the gaps as GB.
  const outside = (stays: Stay[]): Stay[] => {
    const out = [...stays];
    for (let i = 1; i < stays.length; i++) {
      const gapFrom = appDayNum(stays[i - 1].end_date!) + 1;
      const gapTo = appDayNum(stays[i].start_date) - 1;
      if (gapFrom <= gapTo) out.push(S("GB", appIsoOf(gapFrom), appIsoOf(gapTo)));
    }
    return out;
  };
  const upTo = (stays: Stay[], entry: string) => {
    const p = planSchengenTrip(outside(stays), entry, { start_date: entry, end_date: entry });
    return p.latest_stay_if_enter ? appDayNum(p.latest_stay_if_enter) - appDayNum(entry) + 1 : 0;
  };
  const overstay = (stays: Stay[], today: string) => {
    const d = schengenDays(outside(stays), today);
    return [...d].sort((a, b) => a - b).filter((x) => windowCount(d, x) > 90).map(appIsoOf);
  };

  test("planning mode", () => {
    expect(upTo([], "2028-01-01")).toBe(90);
    expect(upTo([F("2026-01-01", "2026-03-31")], "2026-06-30")).toBe(90);
    expect(upTo([F("2026-01-01", "2026-03-31")], "2026-06-29")).toBe(0); // calculator: 0, then 90 from 30/06/26
    expect(upTo([F("2026-02-10", "2026-02-10"), F("2026-02-15", "2026-02-15"), F("2026-02-20", "2026-02-20")], "2026-03-01")).toBe(87);
    expect(upTo([F("2025-10-15", "2025-12-15"), F("2026-02-01", "2026-02-28"), F("2026-04-20", "2026-04-30")], "2026-05-01")).toBe(51);
    // Entry on the last exit day: calculator says 70 more days (the day is already counted).
    const b2b = [F("2026-03-01", "2026-03-10"), F("2026-03-10", "2026-03-20")];
    expect(schengenSummary(outside(b2b), "2026-03-20").remaining).toBe(70);
  });

  test("control mode", () => {
    expect(schengenSummary(outside([F("2026-03-01", "2026-03-10"), F("2026-03-10", "2026-03-20")]), "2026-03-20").latest_stay_date).toBe("2026-05-29");
    expect(schengenSummary(outside([F("2026-01-01", "2026-03-15")]), "2026-06-29").latest_stay_date).toBe("2026-09-26");
    expect(schengenSummary(outside([F("2026-09-01", "2026-10-10")]), "2026-10-10").latest_stay_date).toBe("2026-11-29");
    // Overstays: calculator reports days used and the overstay period.
    const leap = [F("2027-12-01", "2028-02-29")];
    expect(schengenSummary(outside(leap), "2028-02-29").used).toBe(91);
    expect(overstay(leap, "2028-02-29")).toEqual(["2028-02-29"]);
    const long = [F("2026-01-01", "2026-04-15")];
    expect(schengenSummary(outside(long), "2026-04-15").used).toBe(105);
    expect(overstay(long, "2026-04-15")[0]).toBe("2026-04-01");
    expect(overstay(long, "2026-04-15").length).toBe(15);
    expect(overstay([F("2026-01-05", "2026-02-20"), F("2026-04-10", "2026-05-25")], "2026-07-01")).toEqual(["2026-05-23", "2026-05-24", "2026-05-25"]);
    const two = [F("2026-03-01", "2026-05-15"), F("2026-07-01", "2026-07-20")];
    expect(windowCount(schengenDays(outside(two), "2026-08-15"), appDayNum("2026-07-20"))).toBe(96);
    expect(overstay(two, "2026-08-15")).toEqual(["2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18", "2026-07-19", "2026-07-20"]);
    expect(overstay([F("2025-10-15", "2025-12-15"), F("2026-02-01", "2026-03-01"), F("2026-04-20", "2026-04-30")], "2026-05-01")).toEqual(["2026-03-01"]);
  });
});

// ── The owner's caution rules (2026-11-22), oracle and app side by side ──
describe("Schengen caution rules: oracle and app agree on hand-made logs", () => {
  const D = R.dayNum;
  const sea = (a: string, b: string | null, on = true): Stay => S("ZZ", a, b, { kind: "on_board", counts_schengen: on });
  const both = (stays: Stay[], today: string) => {
    const o = [...oracleDays(stays, today)].sort((a, b) => a - b);
    const a = [...schengenDays(stays, today)].sort((x, y) => x - y);
    expect(a).toEqual(o);
    return o.length;
  };

  test("Palma to Antibes: the passage counts", () => {
    expect(both([S("ES", "2026-06-01", "2026-06-10"), sea("2026-06-10", "2026-06-14"), S("FR", "2026-06-14", "2026-06-20")], "2026-06-30")).toBe(20);
  });
  test("after a Schengen port with nothing after; after a non-Schengen port; cleared out", () => {
    expect(both([S("ES", "2026-06-01", "2026-06-10"), sea("2026-06-10", "2026-06-30")], "2026-07-15")).toBe(30);
    expect(both([S("GB", "2026-06-01", "2026-06-10"), sea("2026-06-10", "2026-06-20")], "2026-06-30")).toBe(0);
    expect(both([S("ES", "2026-06-01", "2026-06-10"), sea("2026-06-10", "2026-06-20", false)], "2026-06-30")).toBe(10);
  });
  test("gap of unlogged days before the passage; Gibraltar before 15 July 2026", () => {
    expect(both([S("ES", "2026-06-01", "2026-06-05"), sea("2026-06-10", "2026-06-15")], "2026-06-30")).toBe(15);
    const days = oracleDays([S("GI", "2026-07-01", "2026-07-05"), sea("2026-07-05", "2026-07-25")], "2026-08-01");
    expect(days.size).toBe(11);
    expect(days.has(D("2026-07-14"))).toBe(false);
    expect(both([S("GI", "2026-07-01", "2026-07-05"), sea("2026-07-05", "2026-07-25")], "2026-08-01")).toBe(11);
  });
});
