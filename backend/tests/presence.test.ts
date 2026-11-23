import { describe, test, expect } from "bun:test";
import {
  addDays,
  countryTotals,
  findOverlap,
  latestStayFrom,
  dayNum,
  planSchengenTrip,
  resolveToday,
  schengenDays,
  schengenSummary,
  sedSummary,
  taxCountrySummary as rawTaxSummary,
  taxYearStart,
  validateStay,
  type Stay,
} from "../src/utils/presence/presence";
import { isSchengenCountry } from "../src/utils/presence/schengen";
import { guessHomeCountry } from "../src/utils/presence/home";

const TODAY = "2026-11-10";

const stay = (country: string, start: string, end: string | null, extra: Partial<Stay> = {}): Stay => ({
  country_code: country,
  start_date: start,
  end_date: end,
  kind: "ashore",
  counts_schengen: true,
  counts_tax: true,
  ...extra,
});
/**
 * The gaps between the given stays logged as time somewhere else (`where`).
 * Unlogged days between two stays in the same place now count as days there
 * (caution rule, 2026-11-22). In the worked examples a gap is time spent
 * elsewhere, which a user would log, so the tests log it too.
 */
const away = (stays: Stay[], where = "TR"): Stay[] => {
  const sorted = [...stays].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const out = [...stays];
  let lastEnd: string | null = null;
  for (const s of sorted) {
    if (lastEnd && s.start_date > addDays(lastEnd, 1)) out.push(stay(where, addDays(lastEnd, 1), addDays(s.start_date, -1)));
    const end = s.end_date ?? s.start_date;
    if (!lastEnd || end > lastEnd) lastEnd = end;
  }
  return out;
};
/** Tax summary with the gaps between stays logged as elsewhere (see `away`). */
const taxCountrySummary = (stays: Stay[], country: string, today: string, yearsBack?: number) => rawTaxSummary(away(stays), country, today, yearsBack);
/** A stay of `days` days ending `endOffset` days from TODAY (0 = today). */
const block = (country: string, days: number, endOffset = 0, extra: Partial<Stay> = {}) =>
  stay(country, addDays(TODAY, endOffset - days + 1), addDays(TODAY, endOffset), extra);

describe("Schengen membership", () => {
  test("members, new members and non-members", () => {
    for (const c of ["FR", "ES", "HR", "BG", "RO", "CH", "NO", "IS", "LI"]) expect(isSchengenCountry(c)).toBe(true);
    for (const c of ["GB", "IE", "CY", "GP", "MQ", "RE", "TR", "ME", "ZZ"]) expect(isSchengenCountry(c)).toBe(false);
  });
  test("Gibraltar counts from 15 July 2026; Bulgaria and Romania from 31 March 2024", () => {
    expect(isSchengenCountry("GI")).toBe(true);
    expect(isSchengenCountry("GI", "2026-07-14")).toBe(false);
    expect(isSchengenCountry("GI", "2026-07-15")).toBe(true);
    expect(isSchengenCountry("BG", "2024-03-30")).toBe(false);
    expect(isSchengenCountry("RO", "2024-03-31")).toBe(true);
    // A Gibraltar stay across the start date only counts from 15 July.
    const days = schengenDays([stay("GI", "2026-07-10", "2026-07-20")], "2026-11-22");
    expect(days.size).toBe(6);
  });
  test("microstates with open borders count", () => {
    for (const c of ["MC", "SM", "VA", "AD"]) expect(isSchengenCountry(c)).toBe(true);
  });
});

describe("Schengen 90/180", () => {
  test("entry and exit on the same day is one day", () => {
    const s = schengenSummary([stay("FR", TODAY, TODAY)], TODAY);
    expect(s.used).toBe(1);
    expect(s.remaining).toBe(89);
  });

  test("entry and exit days both count", () => {
    const s = schengenSummary([stay("ES", "2026-11-01", "2026-11-05")], TODAY);
    expect(s.used).toBe(5);
  });

  test("moving between Schengen countries on one day counts that day once", () => {
    const s = schengenSummary([stay("FR", "2026-11-01", "2026-11-05"), stay("IT", "2026-11-05", "2026-11-08")], TODAY);
    expect(s.used).toBe(8);
  });

  test("exactly 90 days is allowed, but not a day more", () => {
    const s = schengenSummary([block("FR", 90)], TODAY);
    expect(s.used).toBe(90);
    expect(s.over).toBe(false);
    expect(s.remaining).toBe(0);
    expect(s.warn).toBe(true);
    expect(s.latest_stay_date).toBe(TODAY);
  });

  test("91 days is over the limit", () => {
    const s = schengenSummary([block("FR", 91)], TODAY);
    expect(s.used).toBe(91);
    expect(s.over).toBe(true);
    expect(s.latest_stay_date).toBeNull();
  });

  test("days drop out of the window after 180 days", () => {
    // Ends 180 days ago: just outside the window (today and the 179 days before).
    expect(schengenSummary([block("FR", 90, -180)], TODAY).used).toBe(0);
    // Ends 179 days ago: its last day is the first day of the window.
    expect(schengenSummary([block("FR", 90, -179)], TODAY).used).toBe(1);
  });

  test("a stay that crosses the window start counts only the days inside", () => {
    const s = schengenSummary([stay("DE", addDays(TODAY, -199), addDays(TODAY, -160))], TODAY);
    // Window starts at TODAY - 179, so days -179 .. -160 count: 20.
    expect(s.used).toBe(20);
    expect(s.window_start).toBe(addDays(TODAY, -179));
    expect(s.segments).toEqual([{ start_date: addDays(TODAY, -179), end_date: addDays(TODAY, -160), days: 20 }]);
  });

  test("with no days used you can stay 90 days from today", () => {
    const s = schengenSummary([], TODAY);
    expect(s.used).toBe(0);
    expect(s.latest_stay_date).toBe(addDays(TODAY, 89));
  });

  test("old days rolling off extend the latest date", () => {
    // 60 days that ended 120 days ago: they leave the window one by one from day +60.
    const days = schengenDays([block("FR", 60, -120)], TODAY);
    const t = dayNum(TODAY);
    // From today: 30 left at first, but the old days start dropping off as you stay,
    // so the stay can run until the window first holds 91 days.
    const latest = latestStayFrom(days, t)!;
    expect(latest).toBeGreaterThan(t + 29);
    // Check by brute force that the day after the latest date breaks the rule.
    const trial = new Set(days);
    for (let d = t; d <= latest + 1; d++) trial.add(d);
    const count = (day: number) => [...trial].filter((x) => x >= day - 179 && x <= day).length;
    expect(count(latest)).toBeLessThanOrEqual(90);
    expect(count(latest + 1)).toBe(91);
  });

  test("time on board counts unless the crew member turns it off; ashore always counts", () => {
    const onBoardOff = stay("FR", "2026-11-01", "2026-11-05", { kind: "on_board", counts_schengen: false });
    const onBoardOn = stay("FR", "2026-11-01", "2026-11-05", { kind: "on_board", counts_schengen: true });
    const ashoreFlagOff = stay("FR", "2026-11-01", "2026-11-05", { kind: "ashore", counts_schengen: false });
    expect(schengenSummary([onBoardOff], TODAY).used).toBe(0);
    expect(schengenSummary([onBoardOn], TODAY).used).toBe(5);
    expect(schengenSummary([ashoreFlagOff], TODAY).used).toBe(5);
  });

  test("non-Schengen days do not count", () => {
    const s = schengenSummary([stay("GB", "2026-10-01", "2026-10-20"), stay("CY", "2026-10-21", "2026-11-01"), stay("ZZ", "2026-11-02", TODAY)], TODAY);
    expect(s.used).toBe(0);
  });

  test("an open stay runs to today", () => {
    const s = schengenSummary([stay("HR", addDays(TODAY, -9), null)], TODAY);
    expect(s.used).toBe(10);
  });

  test("a future trip that fits is ok", () => {
    const stays = [block("FR", 60, -10)];
    const plan = planSchengenTrip(stays, TODAY, { start_date: addDays(TODAY, 1), end_date: addDays(TODAY, 30) });
    expect(plan.ok).toBe(true);
    expect(plan.max_used).toBe(90);
    expect(plan.first_breach).toBeNull();
  });

  test("a future trip that breaks the rule shows the first bad day", () => {
    const stays = [block("FR", 60, -10)];
    const plan = planSchengenTrip(stays, TODAY, { start_date: addDays(TODAY, 1), end_date: addDays(TODAY, 31) });
    expect(plan.ok).toBe(false);
    expect(plan.first_breach).toBe(addDays(TODAY, 31));
    expect(plan.latest_stay_if_enter).toBe(addDays(TODAY, 30));
  });

  test("a trip can break the rule for a stay already logged after it", () => {
    // 80 planned days logged later; a 20-day trip just before pushes them over.
    const stays = [stay("ES", addDays(TODAY, 40), addDays(TODAY, 119))];
    const plan = planSchengenTrip(stays, TODAY, { start_date: addDays(TODAY, 10), end_date: addDays(TODAY, 29) });
    expect(plan.ok).toBe(false);
    expect(plan.first_breach).not.toBeNull();
    expect(plan.first_breach! > plan.end_date).toBe(true);
  });

  test("logged future stays that break the rule are flagged", () => {
    const s = schengenSummary([stay("IT", addDays(TODAY, 5), addDays(TODAY, 100))], TODAY);
    expect(s.future_breach).toBe(addDays(TODAY, 95));
    expect(s.future_segments[0].days).toBe(96);
  });

  test("the summary includes a plan when asked", () => {
    const s = schengenSummary([], TODAY, { start_date: "2026-12-01", end_date: "2026-12-10" });
    expect(s.plan?.ok).toBe(true);
    expect(s.plan?.days).toBe(10);
  });

  test("days come back as old days leave the window", () => {
    const s = schengenSummary([block("FR", 10, -175)], TODAY);
    // Days -184..-175: 5 inside the window today (-179..-175). One leaves tomorrow.
    expect(s.used).toBe(5);
    expect(s.next_release).toEqual({ date: addDays(TODAY, 1), remaining: 86 });
  });
});

describe("Schengen caution rules (2026-11-22)", () => {
  const sea = (a: string, b: string | null, on = true) => stay("ZZ", a, b, { kind: "on_board", counts_schengen: on });
  const used = (stays: Stay[], today = TODAY) => schengenSummary(stays, today).used;

  test("at sea between two Schengen ports counts (Palma to Antibes)", () => {
    const s = [stay("ES", "2026-06-01", "2026-06-10"), sea("2026-06-10", "2026-06-14"), stay("FR", "2026-06-14", "2026-06-20")];
    const r = schengenSummary(s, "2026-06-30");
    expect(r.used).toBe(20);
    expect(r.at_sea_days).toBe(3); // 11 to 13 June
    expect(r.unlogged_days).toBe(0);
  });

  test("at sea after a Schengen port with nothing logged after still counts", () => {
    expect(used([stay("ES", "2026-06-01", "2026-06-10"), sea("2026-06-10", "2026-06-30")], "2026-07-15")).toBe(30);
    // Open passage: runs to today.
    expect(used([stay("ES", "2026-06-01", "2026-06-10"), sea("2026-06-10", null)], "2026-06-20")).toBe(20);
  });

  test("at sea after a non-Schengen port does not count", () => {
    expect(used([stay("GB", "2026-06-01", "2026-06-10"), sea("2026-06-10", "2026-06-20"), stay("FR", "2026-06-20", "2026-06-25")], "2026-06-30")).toBe(6);
    expect(used([stay("GI", "2026-03-01", "2026-03-05"), sea("2026-03-05", "2026-03-20")], "2026-06-30")).toBe(0);
  });

  test("turned off (cleared out with an exit check) does not count", () => {
    const s = [stay("ES", "2026-06-01", "2026-06-10"), sea("2026-06-10", "2026-06-20", false), stay("FR", "2026-06-20", "2026-06-25")];
    expect(used(s, "2026-06-30")).toBe(16); // 1 to 10 and 20 to 25 June
    expect(schengenSummary(s, "2026-06-30").at_sea_days).toBe(0);
  });

  test("unlogged days before the passage are outside the area, so the passage does not count", () => {
    const s = [stay("ES", "2026-06-01", "2026-06-05"), sea("2026-06-10", "2026-06-15")];
    const r = schengenSummary(s, "2026-06-30");
    expect(r.used).toBe(5);
    expect(r.at_sea_days).toBe(0);
    // Sailing the day after the port stay ends still joins.
    expect(used([stay("ES", "2026-06-01", "2026-06-05"), sea("2026-06-06", "2026-06-15")], "2026-06-30")).toBe(15);
  });

  test("at sea from Gibraltar counts only from 15 July 2026", () => {
    const s = [stay("GI", "2026-07-01", "2026-07-05"), sea("2026-07-05", "2026-07-25")];
    const days = schengenDays(s, "2026-08-01");
    expect(days.size).toBe(11); // 15 to 25 July
    expect(days.has(dayNum("2026-07-14"))).toBe(false);
    expect(days.has(dayNum("2026-07-15"))).toBe(true);
  });

  test("a run of at-sea stays follows the first port; one turned off stops the chain", () => {
    expect(used([stay("IT", "2026-06-01", "2026-06-01"), sea("2026-06-01", "2026-06-05"), sea("2026-06-05", "2026-06-10")], "2026-06-30")).toBe(10);
    expect(used([stay("IT", "2026-06-01", "2026-06-01"), sea("2026-06-01", "2026-06-05", false), sea("2026-06-05", "2026-06-10")], "2026-06-30")).toBe(1);
  });

  test("at sea with nothing logged before it does not count", () => {
    expect(used([sea("2026-06-01", "2026-06-10")], "2026-06-30")).toBe(0);
  });

  test("the summary names the at-sea stays that count", () => {
    const s = [
      { ...stay("ES", "2026-06-01", "2026-06-10"), id: "a" },
      { ...sea("2026-06-10", "2026-06-14"), id: "b" },
      { ...stay("GB", "2026-06-14", "2026-06-20"), id: "c" },
      { ...sea("2026-06-20", "2026-06-24"), id: "d" },
    ];
    expect(schengenSummary(s, "2026-06-30").at_sea_counted_ids).toEqual(["b"]);
  });

  test("unlogged days between two Schengen stays are outside the area (2026-11-23) and are reported", () => {
    const r = schengenSummary([stay("FR", "2026-06-01", "2026-06-05"), stay("IT", "2026-06-11", "2026-06-15")], "2026-06-30");
    expect(r.used).toBe(10);
    expect(r.unlogged_days).toBe(5); // 6 to 10 June, shown on the card
    // Next to a non-Schengen stay or before a planned stay: not reported.
    expect(schengenSummary([stay("FR", "2026-06-01", "2026-06-05"), stay("GB", "2026-06-11", "2026-06-15")], "2026-06-30").unlogged_days).toBe(0);
    expect(schengenSummary([stay("FR", "2026-06-01", "2026-06-05"), stay("IT", "2026-07-11", "2026-07-15")], "2026-06-30").unlogged_days).toBe(0);
    expect(used([stay("FR", "2026-06-01", "2026-06-05"), stay("IT", "2026-07-11", "2026-07-15")], "2026-06-30")).toBe(5);
  });
});

describe("tax: days away and days with nothing logged, per country (2026-11-23)", () => {
  test("Spain: unlogged days between two Spanish stays count (TEAC 25 Apr 2023)", () => {
    const r = rawTaxSummary([stay("ES", "2026-01-01", "2026-03-31"), stay("ES", "2026-05-01", "2026-07-31")], "ES", TODAY);
    expect(r.years[0].days).toBe(90 + 30 + 92);
    expect(r.years[0].assumed_days).toBe(30);
    expect(r.years[0].unrecorded_days).toBe(30 + (dayNum(TODAY) - dayNum("2026-07-31")));
    // No Spanish stay after it: nothing to bridge.
    const r2 = rawTaxSummary([stay("ES", "2026-01-01", "2026-03-31"), stay("FR", "2026-05-01", "2026-07-31")], "ES", TODAY);
    expect(r2.years[0].days).toBe(90);
    expect(r2.years[0].assumed_days).toBe(0);
    // A stay left out of tax days does not bridge.
    const r3 = rawTaxSummary([stay("ES", "2026-01-01", "2026-03-31"), stay("ES", "2026-05-01", "2026-07-31", { counts_tax: false })], "ES", TODAY);
    expect(r3.years[0].days).toBe(90);
    // The next Spanish stay is a plan: nothing bridged.
    const r4 = rawTaxSummary([stay("ES", "2026-01-01", "2026-03-31"), stay("ES", "2026-12-20", "2026-12-24")], "ES", TODAY);
    expect(r4.years[0].assumed_days).toBe(0);
  });

  test("Spain: a logged trip abroad between Spanish stays is a sporadic absence and counts; over 183 days it does not", () => {
    // ES 1 Jan to 31 Mar, FR 1 to 30 Apr, ES 1 May to 31 Jul: April is added (31 Mar and 1 May already Spanish days).
    const r = rawTaxSummary([stay("ES", "2026-01-01", "2026-03-31"), stay("FR", "2026-04-01", "2026-04-30"), stay("ES", "2026-05-01", "2026-07-31")], "ES", TODAY);
    expect(r.years[0].days).toBe(90 + 30 + 92);
    expect(r.years[0].assumed_days).toBe(30);
    // 184 days logged in France between Spanish stays: not sporadic (STS 28 Nov 2017), not added.
    const long = [stay("ES", "2025-11-01", "2025-11-30"), stay("FR", "2025-12-01", "2026-06-02"), stay("ES", "2026-06-03", "2026-06-30")];
    expect(rawTaxSummary(long, "ES", TODAY).years[0].assumed_days).toBe(0);
    // Unlogged and longer than 183 days: still counted (nothing shows you were outside Spain).
    const unlogged = [stay("ES", "2025-11-01", "2025-11-30"), stay("ES", "2026-06-03", "2026-06-30")];
    expect(rawTaxSummary(unlogged, "ES", TODAY).years[0].assumed_days).toBe(153); // 1 Jan to 2 Jun 2026
  });

  test("other countries count only days there: unlogged days between stays are not added", () => {
    // UK: 1 to 10 May = 9 midnights, 11 to 19 May unlogged, 20 to 25 May = 5 midnights.
    const uk = rawTaxSummary([stay("GB", "2026-05-01", "2026-05-10"), stay("GB", "2026-05-20", "2026-05-25")], "GB", TODAY);
    expect(uk.years[0].days).toBe(9 + 5);
    expect(uk.years[0].assumed_days).toBe(0);
    for (const c of ["US", "AU", "NZ", "ZA", "IE", "CA", "FR", "IT"]) {
      const r = rawTaxSummary([stay(c, "2026-08-01", "2026-08-10"), stay(c, "2026-08-21", "2026-08-30")], c, TODAY);
      expect(r.years[0].days).toBe(20);
      expect(r.years[0].assumed_days).toBe(0);
    }
  });

  test("a day spent in two countries counts for both (any part of a day), UK by midnight only", () => {
    const s = [stay("ES", "2026-05-01", "2026-05-10"), stay("FR", "2026-05-10", "2026-05-20"), stay("GB", "2026-05-20", "2026-05-25"), stay("IE", "2026-05-25", "2026-05-30")];
    expect(rawTaxSummary(s, "ES", TODAY).years[0].days).toBe(10);
    expect(rawTaxSummary(s, "FR", TODAY).years[0].days).toBe(11);
    expect(rawTaxSummary(s, "IE", TODAY).years[0].days).toBe(6);
    expect(rawTaxSummary(s, "GB", TODAY).years[0].days).toBe(5); // 20 to 24 May; left on the 25th
  });

  test("Germany: short breaks (logged or not, up to six weeks) do not end the unbroken stay", () => {
    const r = rawTaxSummary([stay("DE", "2026-01-01", "2026-03-31"), stay("DE", "2026-04-10", "2026-07-15")], "DE", TODAY);
    expect(r.years[0].detail.longest_stay).toBe(196);
    expect(r.years[0].status).toBe("met");
    // A two-week trip home logged in GB still joins.
    const trip = rawTaxSummary([stay("DE", "2026-01-01", "2026-03-31"), stay("GB", "2026-04-01", "2026-04-14"), stay("DE", "2026-04-15", "2026-07-15")], "DE", TODAY);
    expect(trip.years[0].detail.longest_stay).toBe(196);
    expect(trip.years[0].status).toBe("met");
    // A break longer than six weeks ends it.
    const long = rawTaxSummary([stay("DE", "2026-01-01", "2026-03-31"), stay("DE", "2026-05-20", "2026-07-15")], "DE", TODAY);
    expect(long.years[0].detail.longest_stay).toBe(90);
  });
});

describe("tax options: Spain certificate, New Zealand visitor (2026-11-23)", () => {
  test("Spain: a certificate for the year stops trips away being added; unlogged days still count", () => {
    const trip = [stay("ES", "2026-01-01", "2026-03-31"), stay("FR", "2026-04-01", "2026-04-30"), stay("ES", "2026-05-01", "2026-07-31")];
    expect(rawTaxSummary(trip, "ES", TODAY, 2, { es_certificate_years: [2026] }).years[0].assumed_days).toBe(0);
    expect(rawTaxSummary(trip, "ES", TODAY, 2, { es_certificate_years: [2025] }).years[0].assumed_days).toBe(30);
    const gap = [stay("ES", "2026-01-01", "2026-03-31"), stay("ES", "2026-05-01", "2026-07-31")];
    expect(rawTaxSummary(gap, "ES", TODAY, 2, { es_certificate_years: [2026] }).years[0].assumed_days).toBe(30);
  });

  test("New Zealand visitor: 275 days in any 18 months instead of 183 in 12", () => {
    // 1 May 2026 to 30 Nov 2026 = 214 days: resident under the 183-day rule, not as a visitor.
    const s = [stay("NZ", "2026-05-01", "2026-11-30")];
    expect(rawTaxSummary(s, "NZ", "2026-12-31").years[0].status).toBe("met");
    const v = rawTaxSummary(s, "NZ", "2026-12-31", 2, { nz_visitor: true }).years[0];
    expect(v.status).toBe("under");
    expect(v.detail.best_18_months).toBe(214);
    expect(v.days_to_test).toBe(276 - 214);
    // 1 May 2026 to 31 Jan 2027 = 276 days: resident as a visitor (tax year 2026/27).
    const long = rawTaxSummary([stay("NZ", "2026-05-01", "2027-01-31")], "NZ", "2027-02-28", 2, { nz_visitor: true }).years[0];
    expect(long.detail.best_18_months).toBe(276);
    expect(long.status).toBe("met");
    // Days before 1 April 2026 are not part of the visitor count.
    const early = rawTaxSummary([stay("NZ", "2026-03-01", "2026-04-30")], "NZ", "2026-12-31", 2, { nz_visitor: true }).years[0];
    expect(early.detail.best_18_months).toBe(30);
  });
});

describe("tax years", () => {
  test("tax year start dates", () => {
    expect(taxYearStart({ month: 4, day: 6 }, "2026-04-05")).toBe("2025-04-06");
    expect(taxYearStart({ month: 4, day: 6 }, "2026-04-06")).toBe("2026-04-06");
    expect(taxYearStart({ month: 7, day: 1 }, "2026-11-10")).toBe("2026-07-01");
    expect(taxYearStart({ month: 1, day: 1 }, "2026-11-10")).toBe("2026-01-01");
  });

  test("UK counts midnights: the day you leave does not count", () => {
    const r = taxCountrySummary([stay("GB", "2026-05-01", "2026-05-05")], "GB", TODAY);
    expect(r.years[0].label).toBe("2026/27");
    expect(r.years[0].start_date).toBe("2026-04-06");
    expect(r.years[0].end_date).toBe("2027-04-05");
    expect(r.years[0].days).toBe(4);
  });

  test("UK stay across 5/6 April splits between tax years", () => {
    const r = taxCountrySummary([stay("GB", "2026-04-01", "2026-04-10")], "GB", TODAY);
    expect(r.years[0].days).toBe(4); // nights of 6, 7, 8, 9 April
    expect(r.years[1].days).toBe(5); // nights of 1 to 5 April
  });

  test("UK 183 days or more meets the test", () => {
    const r = taxCountrySummary([stay("GB", "2026-04-06", "2026-10-06")], "GB", TODAY);
    expect(r.years[0].days).toBe(183);
    expect(r.years[0].status).toBe("met");
    const r2 = taxCountrySummary([stay("GB", "2026-04-06", "2026-10-05")], "GB", TODAY);
    expect(r2.years[0].days).toBe(182);
    expect(r2.years[0].status).toBe("near");
    expect(r2.years[0].days_to_test).toBe(1);
  });

  test("an open stay counts today, even with the midnight rule", () => {
    const r = taxCountrySummary([stay("GB", addDays(TODAY, -2), null)], "GB", TODAY);
    expect(r.years[0].days).toBe(3);
  });

  test("stays left out of tax counting are ignored", () => {
    const r = taxCountrySummary([stay("FR", "2026-03-01", "2026-03-10", { counts_tax: false, kind: "on_board" })], "FR", TODAY);
    expect(r.years[0].days).toBe(0);
  });

  test("Spain: more than 183 days", () => {
    const r = taxCountrySummary([stay("ES", "2026-01-01", "2026-07-02")], "ES", TODAY);
    expect(r.years[0].days).toBe(183);
    expect(r.years[0].status).toBe("near");
    const r2 = taxCountrySummary([stay("ES", "2026-01-01", "2026-07-03")], "ES", TODAY);
    expect(r2.years[0].status).toBe("met");
  });

  test("Australia: more than half the income year, 184 days in a leap year", () => {
    const leap = taxCountrySummary([stay("AU", "2027-07-01", "2027-12-30")], "AU", "2028-03-01");
    expect(leap.years[0].label).toBe("2027/28");
    expect(leap.years[0].detail.threshold).toBe(184);
    expect(leap.years[0].days).toBe(183);
    expect(leap.years[0].status).toBe("near");
    const normal = taxCountrySummary([stay("AU", "2026-07-01", "2026-12-30")], "AU", "2027-03-01");
    expect(normal.years[0].detail.threshold).toBe(183);
    expect(normal.years[0].status).toBe("met");
  });

  test("US substantial presence: weighted days over three years", () => {
    const year = (y: number, days: number) => stay("US", `${y}-01-01`, addDays(`${y}-01-01`, days - 1));
    const under = taxCountrySummary([year(2024, 120), year(2025, 120), year(2026, 120)], "US", TODAY);
    expect(under.years[0].detail.weighted_days).toBe(180);
    expect(under.years[0].status).toBe("near");
    const met = taxCountrySummary([year(2024, 120), year(2025, 120), year(2026, 123)], "US", TODAY);
    expect(met.years[0].detail.weighted_days).toBe(183);
    expect(met.years[0].status).toBe("met");
    // Under 31 days this year never meets it.
    const short = taxCountrySummary([year(2024, 365), year(2025, 365), year(2026, 30)], "US", TODAY);
    expect(short.years[0].status).not.toBe("met");
  });

  test("Ireland: 280 days over two years, ignoring a year of 30 days or fewer", () => {
    const two = taxCountrySummary([stay("IE", "2025-01-01", addDays("2025-01-01", 149)), stay("IE", "2026-01-01", addDays("2026-01-01", 139))], "IE", TODAY);
    expect(two.years[0].detail.two_year_total).toBe(290);
    expect(two.years[0].status).toBe("met");
    const fewPrev = taxCountrySummary([stay("IE", "2025-01-01", addDays("2025-01-01", 29)), stay("IE", "2026-01-01", addDays("2026-01-01", 139))], "IE", TODAY);
    expect(fewPrev.years[0].detail.two_year_total).toBe(140);
    expect(fewPrev.years[0].status).toBe("under");
  });

  test("South Africa: physical presence test needs the 5 years before too", () => {
    const yearStay = (y: number, days: number) => stay("ZA", `${y}-03-01`, addDays(`${y}-03-01`, days - 1));
    const all = [2021, 2022, 2023, 2024, 2025].map((y) => yearStay(y, 200));
    const met = taxCountrySummary([...all, yearStay(2026, 92)], "ZA", TODAY, 0);
    expect(met.years[0].label).toBe("2026/27");
    expect(met.years[0].detail.previous_five_total).toBe(1000);
    expect(met.years[0].status).toBe("met");
    const thinYear = [2021, 2022, 2023, 2024].map((y) => yearStay(y, 300)).concat(yearStay(2025, 80));
    expect(taxCountrySummary([...thinYear, yearStay(2026, 150)], "ZA", TODAY, 0).years[0].status).toBe("under");
  });

  test("New Zealand: more than 183 days in any 12 months, across the tax year end", () => {
    // 100 days before 31 March and 90 after: 190 in 12 months, but under 183 in each tax year.
    const stays = [stay("NZ", addDays("2026-03-31", -99), "2026-03-31"), stay("NZ", "2026-04-01", addDays("2026-04-01", 89))];
    const r = taxCountrySummary(stays, "NZ", TODAY);
    expect(r.years[0].days).toBe(90);
    expect(r.years[0].detail.best_12_months).toBe(190);
    expect(r.years[0].status).toBe("met");
  });

  test("Germany: an unbroken stay of six months across the year end", () => {
    const r = taxCountrySummary([stay("DE", "2025-09-01", "2026-03-15")], "DE", TODAY);
    expect(r.years[0].days).toBe(74);
    expect(r.years[0].detail.longest_stay).toBe(196);
    expect(r.years[0].status).toBe("met");
  });

  // ── Worked examples and rules from the official pages (re-checked 2026-11-22) ──

  test("UK: only midnights count, days you leave before midnight do not (RFIG20710, RFIG20720 Example 1)", () => {
    // RFIG20720 Example 1 (Angharad): 35 days in the UK at midnight plus day trips where she left
    // before midnight. The midnight count is 35; the deeming rule (which could add days for someone
    // with 3 UK ties) is not modelled, so the app shows 35.
    const nights = stay("GB", "2026-05-01", addDays("2026-05-01", 35)); // 35 midnights, leaves on day 36
    const dayTrips = [0, 1, 2, 3, 4].map((k) => stay("GB", addDays("2026-08-01", k * 7), addDays("2026-08-01", k * 7)));
    const r = taxCountrySummary([nights, ...dayTrips], "GB", TODAY);
    expect(r.counting).toBe("midnight");
    expect(r.years[0].days).toBe(35);
  });

  test("US: IRS worked example, 120 days in each of 3 years is 180 weighted days, not resident", () => {
    // irs.gov Substantial presence test page and Pub 519: 120 + 40 + 20 = 180, under 183.
    const year = (y: number) => stay("US", `${y}-01-01`, addDays(`${y}-01-01`, 119));
    const r = taxCountrySummary([year(2023), year(2024), year(2025)], "US", "2025-12-31");
    expect(r.years[0].days).toBe(120);
    expect(r.years[0].detail.previous_year).toBe(120);
    expect(r.years[0].detail.year_before).toBe(120);
    expect(r.years[0].detail.weighted_days).toBe(180);
    expect(r.years[0].status).not.toBe("met");
  });

  test("US: a day counts if present at any time during it (26 USC 7701(b)(7)(A))", () => {
    const r = taxCountrySummary([stay("US", "2026-03-01", "2026-03-01")], "US", TODAY);
    expect(r.counting).toBe("any_part");
    expect(r.years[0].days).toBe(1);
  });

  test("Australia: arrival and departure days both count, income year 1 July to 30 June (ATO 183-day test page)", () => {
    const r = taxCountrySummary([stay("AU", "2026-06-29", "2026-07-02")], "AU", TODAY);
    expect(r.years[0].label).toBe("2026/27");
    expect(r.years[0].days).toBe(2); // 1 and 2 July
    expect(r.years[1].days).toBe(2); // 29 and 30 June
  });

  test("New Zealand: part days count as whole days (IRD page, Income Tax Act 2007 s YD 1(8))", () => {
    const r = taxCountrySummary([stay("NZ", "2026-05-10", "2026-05-12")], "NZ", TODAY);
    expect(r.counting).toBe("any_part");
    expect(r.years[0].days).toBe(3);
  });

  test("New Zealand: a 12-month period that spans 29 February has 366 days (s YD 1(3))", () => {
    // 1 March 2027, then 183 days ending 29 February 2028. Any 365-day window holds only 183,
    // but the 12 months 1 March 2027 to 29 February 2028 hold 184, which is more than 183.
    const stays = [stay("NZ", "2027-03-01", "2027-03-01"), stay("NZ", addDays("2028-02-29", -182), "2028-02-29")];
    const r = taxCountrySummary(stays, "NZ", "2028-03-15");
    expect(r.years[0].label).toBe("2027/28");
    expect(r.years[0].detail.best_12_months).toBe(184);
    expect(r.years[0].detail.best_12_months_end).toBe("2028-02-29");
    expect(r.years[0].status).toBe("met");
    // Exactly 183 is not more than 183.
    const r2 = taxCountrySummary([stay("NZ", addDays("2028-02-29", -182), "2028-02-29")], "NZ", "2028-03-15");
    expect(r2.years[0].detail.best_12_months).toBe(183);
    expect(r2.years[0].status).toBe("near");
  });

  test("South Africa: IN4 Example 1, arrive 1 Feb 19:00 and leave 4 Feb 06:00 is 4 days", () => {
    // SARS Interpretation Note 4 (Issue 5), Example 1.
    const r = taxCountrySummary([stay("ZA", "2026-02-01", "2026-02-04")], "ZA", TODAY);
    expect(r.years.find((y) => y.label === "2025/26")?.days).toBe(4);
  });

  // SARS IN4 years of assessment are named by the year they end in: "2018" is 1 March 2017 to 28 February 2018.
  const zaYear = (endYear: number, days: number) => stay("ZA", `${endYear - 1}-03-01`, addDays(`${endYear - 1}-03-01`, days - 1));

  test("South Africa: IN4 Example 2, 563 days in the 5 years before is not more than 915, so not resident", () => {
    const stays = [zaYear(2013, 95), zaYear(2014, 110), zaYear(2015, 115), zaYear(2016, 92), zaYear(2017, 151), zaYear(2018, 355)];
    const r = taxCountrySummary(stays, "ZA", "2018-02-28", 0);
    expect(r.years[0].label).toBe("2017/18");
    expect(r.years[0].days).toBe(355);
    expect(r.years[0].detail.previous_five_total).toBe(563);
    expect(r.years[0].status).not.toBe("met");
  });

  test("South Africa: IN4 Example 3, 108 days this year and 975 over the 5 before is resident", () => {
    const stays = [zaYear(2013, 113), zaYear(2014, 147), zaYear(2015, 208), zaYear(2016, 202), zaYear(2017, 305), stay("ZA", "2017-04-15", "2017-07-31")];
    const r = taxCountrySummary(stays, "ZA", "2018-02-28", 0);
    expect(r.years[0].days).toBe(108);
    expect(r.years[0].detail.previous_five_total).toBe(975);
    expect(r.years[0].status).toBe("met");
  });

  test("South Africa: IN4 Example 4, Z is resident for the 2017 year of assessment (958 days before)", () => {
    const stays = [
      stay("ZA", "2011-06-29", "2012-02-29"), // 246
      stay("ZA", "2012-06-01", "2012-08-31"), // 92
      stay("ZA", "2013-09-01", "2014-02-28"), // 181
      stay("ZA", "2014-03-01", "2014-05-21"), // 82
      stay("ZA", "2014-11-08", "2015-02-28"), // 113
      stay("ZA", "2015-07-01", "2016-02-29"), // 244
      stay("ZA", "2016-06-29", "2016-07-15"), // 17
      stay("ZA", "2016-08-29", "2016-11-30"), // 94
    ];
    const r = taxCountrySummary(stays, "ZA", "2017-02-28", 0);
    expect(r.years[0].label).toBe("2016/17");
    expect(r.years[0].days).toBe(111);
    expect(r.years[0].detail.previous_years).toBe("244,195,181,92,246");
    expect(r.years[0].detail.previous_five_total).toBe(958);
    expect(r.years[0].status).toBe("met");
  });

  test("Ireland: a day counts if present at any time, and a year of 30 days or fewer is ignored (TCA s 819)", () => {
    // Revenue TDM 34-00-01: 30 days or fewer this year means not resident under the 280-day test,
    // even with 300 days last year.
    const r = taxCountrySummary([stay("IE", "2025-01-01", addDays("2025-01-01", 299)), stay("IE", "2026-02-01", addDays("2026-02-01", 29))], "IE", TODAY);
    expect(r.counting).toBe("any_part");
    expect(r.years[0].days).toBe(30);
    expect(r.years[0].detail.two_year_total).toBe(0);
    expect(r.years[0].status).not.toBe("met");
    // 31 days this year and 249 last year is exactly 280: resident.
    const r2 = taxCountrySummary([stay("IE", "2025-01-01", addDays("2025-01-01", 248)), stay("IE", "2026-02-01", addDays("2026-02-01", 30))], "IE", TODAY);
    expect(r2.years[0].detail.two_year_total).toBe(280);
    expect(r2.years[0].status).toBe("met");
  });

  test("Canada: 183 days or more in the year (ITA s 250(1)(a)), part days count", () => {
    const r = taxCountrySummary([stay("CA", "2026-01-01", addDays("2026-01-01", 182))], "CA", TODAY);
    expect(r.years[0].days).toBe(183);
    expect(r.years[0].status).toBe("met");
  });

  test("Italy: Circolare 20/E Example, 9 separate stays in 2024 add up to 184 days, resident", () => {
    const stays = [
      stay("IT", "2024-01-11", "2024-01-31"),
      stay("IT", "2024-02-05", "2024-02-10"),
      stay("IT", "2024-04-01", "2024-04-30"),
      stay("IT", "2024-05-12", "2024-05-26"),
      stay("IT", "2024-06-01", "2024-07-31"),
      stay("IT", "2024-10-01", "2024-10-31"),
      stay("IT", "2024-11-05", "2024-11-12"),
      stay("IT", "2024-11-27", "2024-11-27"),
      stay("IT", "2024-12-02", "2024-12-12"),
    ];
    const r = taxCountrySummary(stays, "IT", "2024-12-31");
    expect(r.years[0].days).toBe(184);
    expect(r.years[0].detail.threshold).toBe(184);
    expect(r.years[0].status).toBe("met");
  });

  test("Italy: Circolare 20/E Example, 23:00 on 1 July to 01:00 on 31 December 2024 is 184 days", () => {
    const r = taxCountrySummary([stay("IT", "2024-07-01", "2024-12-31")], "IT", "2024-12-31");
    expect(r.years[0].days).toBe(184);
    expect(r.years[0].status).toBe("met");
  });

  test("Germany: more than six calendar months from arrival, not a fixed 183 days (AO s 9)", () => {
    // From 1 January six months end on 30 June, so 1 July (day 182 in 2026) is the first day over.
    const jan = taxCountrySummary([stay("DE", "2026-01-01", "2026-07-01")], "DE", TODAY);
    expect(jan.years[0].detail.longest_stay).toBe(182);
    expect(jan.years[0].detail.threshold).toBe(182);
    expect(jan.years[0].status).toBe("met");
    expect(taxCountrySummary([stay("DE", "2026-01-01", "2026-06-30")], "DE", TODAY).years[0].status).toBe("near");
    // From 1 July six months end on 31 December: 183 days (1 July to 30 December) is not more than six months.
    const jul = taxCountrySummary([stay("DE", "2025-07-01", "2025-12-30")], "DE", TODAY);
    expect(jul.years[1].detail.longest_stay).toBe(183);
    expect(jul.years[1].status).toBe("near");
    expect(taxCountrySummary([stay("DE", "2025-07-01", "2026-01-01")], "DE", TODAY).years[1].status).toBe("met");
    // From 31 August there is no 31 February: six months end on the last day of February.
    const aug = taxCountrySummary([stay("DE", "2025-08-31", "2026-03-01")], "DE", TODAY);
    expect(aug.years[0].detail.threshold).toBe(183);
    expect(aug.years[0].status).toBe("met");
    expect(taxCountrySummary([stay("DE", "2025-08-31", "2026-02-28")], "DE", TODAY).years[0].status).toBe("near");
  });

  test("France: more than six months = more than half the year (BOFiP BOI-IR-CHAMP-10 para 130)", () => {
    expect(taxCountrySummary([stay("FR", "2026-01-01", addDays("2026-01-01", 181))], "FR", TODAY).years[0].status).toBe("near"); // 182 days
    expect(taxCountrySummary([stay("FR", "2026-01-01", addDays("2026-01-01", 182))], "FR", TODAY).years[0].status).toBe("met"); // 183 days
    // 2028 is a leap year: 184 needed.
    expect(taxCountrySummary([stay("FR", "2028-01-01", addDays("2028-01-01", 182))], "FR", "2028-12-31").years[0].status).toBe("near");
    expect(taxCountrySummary([stay("FR", "2028-01-01", addDays("2028-01-01", 183))], "FR", "2028-12-31").years[0].status).toBe("met");
  });

  test("a country with no rule gets a plain calendar-year count", () => {
    const r = taxCountrySummary([stay("NL", "2026-02-01", "2026-02-10")], "NL", TODAY);
    expect(r.has_rule).toBe(false);
    expect(r.years[0].label).toBe("2026");
    expect(r.years[0].days).toBe(10);
    expect(r.years[0].status).toBe("none");
  });

  test("planned and unrecorded days", () => {
    const r = rawTaxSummary([stay("FR", "2026-01-01", "2026-10-31"), stay("FR", "2026-12-01", "2026-12-10")], "FR", TODAY);
    expect(r.years[0].planned_days).toBe(10);
    expect(r.years[0].unrecorded_days).toBe(10); // 1 to 10 November
    // The next FR stay is planned, not begun, so 1 to 10 November are not filled.
    expect(r.years[0].assumed_days).toBe(0);
    expect(r.years[0].days).toBe(304 + 10);
  });

  test("country totals", () => {
    const totals = countryTotals([stay("FR", "2026-01-01", "2026-01-10"), stay("FR", "2026-02-01", "2026-02-05"), stay("GB", "2026-03-01", "2026-03-02")], TODAY);
    expect(totals).toEqual([
      { country: "FR", days: 15, stays: 2 },
      { country: "GB", days: 2, stays: 1 },
    ]);
  });
});

describe("overlap and validation", () => {
  const existing = [
    { id: "a", start_date: "2026-03-01", end_date: "2026-03-10" },
    { id: "b", start_date: "2026-03-10", end_date: "2026-03-20" },
  ];

  test("sharing a boundary day is allowed", () => {
    expect(findOverlap({ start_date: "2026-03-20", end_date: "2026-03-25" }, existing)).toBeNull();
    expect(findOverlap({ start_date: "2026-02-20", end_date: "2026-03-01" }, existing)).toBeNull();
    // A one-day stop on the change-over day.
    expect(findOverlap({ start_date: "2026-03-10", end_date: "2026-03-10" }, existing)).toBeNull();
  });

  test("overlapping by more than a day is refused", () => {
    expect(findOverlap({ start_date: "2026-03-05", end_date: "2026-03-06" }, existing)?.id).toBe("a");
    expect(findOverlap({ start_date: "2026-02-01", end_date: "2026-04-01" }, existing)?.id).toBe("a");
    expect(findOverlap({ start_date: "2026-03-19", end_date: null }, existing)?.id).toBe("b");
  });

  test("only one open stay, and nothing after it", () => {
    const withOpen = [...existing, { id: "c", start_date: "2026-04-01", end_date: null }];
    expect(findOverlap({ start_date: "2026-05-01", end_date: null }, withOpen)?.id).toBe("c");
    expect(findOverlap({ start_date: "2026-05-01", end_date: "2026-05-03" }, withOpen)?.id).toBe("c");
    expect(findOverlap({ start_date: "2026-03-25", end_date: "2026-04-01" }, withOpen)).toBeNull();
  });

  test("a stay does not clash with itself when edited", () => {
    expect(findOverlap({ id: "a", start_date: "2026-03-02", end_date: "2026-03-09" }, existing)).toBeNull();
  });

  test("validation", () => {
    expect(validateStay(stay("FR", "2026-03-01", "2026-03-02"), TODAY)).toBeNull();
    expect(validateStay(stay("fr", "2026-03-01", null), TODAY)).not.toBeNull();
    expect(validateStay(stay("FR", "2026-02-30", null), TODAY)).not.toBeNull();
    expect(validateStay(stay("FR", "2026-03-05", "2026-03-01"), TODAY)).not.toBeNull();
    expect(validateStay(stay("FR", "2026-12-01", null), TODAY)).not.toBeNull(); // open stay in the future
    expect(validateStay(stay("FR", "2026-12-01", "2026-12-05"), TODAY)).toBeNull(); // planned stay is fine
    expect(validateStay({ ...stay("FR", "2026-03-01", null), kind: "boat" as any }, TODAY)).not.toBeNull();
  });

  test("today from the phone is used only within a day of UTC", () => {
    const now = new Date("2026-11-10T23:30:00Z");
    expect(resolveToday("2026-11-11", now)).toBe("2026-11-11");
    expect(resolveToday("2026-11-09", now)).toBe("2026-11-09");
    expect(resolveToday("2026-11-13", now)).toBe("2026-11-10");
    expect(resolveToday(undefined, now)).toBe("2026-11-10");
  });
});

describe("Seafarers' Earnings Deduction", () => {
  test("365 days away in a row is an eligible period", () => {
    const r = sedSummary([stay("ZZ", "2025-06-01", "2026-06-01", { kind: "on_board" })], TODAY);
    // Midnights away: 1 June 2025 to 31 May 2026 = 365.
    expect(r.periods).toHaveLength(1);
    expect(r.periods[0].days).toBe(365);
    expect(r.periods[0].eligible).toBe(true);
  });

  test("UK visits of 183 days or fewer join the period while half is away", () => {
    const stays = [
      stay("FR", "2025-01-01", "2025-05-01"), // 120 nights away
      stay("GB", "2025-05-01", "2025-06-30"), // home
      stay("ES", "2025-06-30", "2025-10-28"), // 120 nights away
      stay("GB", "2025-10-28", "2025-12-27"),
      stay("IT", "2025-12-27", "2026-04-26"), // 120 nights away
    ];
    const r = sedSummary(stays, TODAY);
    expect(r.periods).toHaveLength(1);
    expect(r.periods[0].absence_days).toBe(360);
    expect(r.periods[0].days).toBeGreaterThanOrEqual(365);
  });

  test("more than 183 days in the UK breaks the period", () => {
    const stays = [stay("FR", "2025-01-01", "2025-07-01"), stay("GB", "2025-07-01", "2026-01-15"), stay("FR", "2026-01-15", "2026-07-01")];
    const r = sedSummary(stays, TODAY);
    expect(r.periods).toHaveLength(0);
    expect(r.current?.start_date).toBe("2026-01-15");
  });

  test("HMRC EIM33006 worked example: combined period from 1 January 2004 passes 365 days", () => {
    // Absence 1 Jan to 31 Mar 2004 (91), UK 61, absence 92, UK 61, absence 92, UK 59, absence 1 Apr to 30 Jun 2005.
    // A day of absence is abroad at midnight (EIM33004, ITEPA s 378(4)), so each abroad stay ends on the day home.
    const stays = [
      stay("FR", "2004-01-01", "2004-04-01"),
      stay("GB", "2004-04-01", "2004-06-01"),
      stay("FR", "2004-06-01", "2004-09-01"),
      stay("GB", "2004-09-01", "2004-11-01"),
      stay("FR", "2004-11-01", "2005-02-01"),
      stay("GB", "2005-02-01", "2005-04-01"),
      stay("FR", "2005-04-01", "2005-07-01"),
      stay("GB", "2005-07-01", "2005-12-31"),
    ];
    const r = sedSummary(stays, TODAY);
    expect(r.periods).toHaveLength(1);
    expect(r.periods[0].start_date).toBe("2004-01-01");
    expect(r.periods[0].end_date).toBe("2005-06-30");
    // HMRC prints 548 days and 92 days for the last absence; the dates give 547 and 91.
    expect(r.periods[0].days).toBe(547);
    expect(r.periods[0].uk_days).toBe(181);
    expect(r.periods[0].absence_days).toBe(366);
  });

  test("fewer than half the days abroad breaks the combined period (ITEPA s 378(3)(a), EIM33005)", () => {
    // 30 nights away, 180 in the UK, 30 away: each UK stay is under 183 days but only 60 of 240 days are absence.
    const stays = [stay("FR", "2025-01-01", "2025-01-31"), stay("GB", "2025-01-31", "2025-07-30"), stay("FR", "2025-07-30", "2025-08-29")];
    const r = sedSummary(stays, TODAY);
    expect(r.current?.start_date).toBe("2025-07-30");
    expect(r.current?.absence_days).toBe(30);
  });

  test("the current period counts days to go", () => {
    const r = sedSummary([stay("FR", addDays(TODAY, -99), null)], TODAY);
    expect(r.current?.days).toBe(100);
    expect(r.current?.days_to_365).toBe(265);
    expect(r.current?.broken).toBe(false);
  });
});

describe("home country", () => {
  test("from nationality, else authority", () => {
    expect(guessHomeCountry("British", "uscg")).toBe("GB");
    expect(guessHomeCountry("Northern Irish", null)).toBe("GB");
    expect(guessHomeCountry("Irish", null)).toBe("IE");
    expect(guessHomeCountry("South African", null)).toBe("ZA");
    expect(guessHomeCountry("UK", null)).toBe("GB");
    expect(guessHomeCountry("", "amsa")).toBe("AU");
    expect(guessHomeCountry(null, null)).toBeNull();
  });
});
