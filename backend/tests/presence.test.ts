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
  taxCountrySummary,
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
/** A stay of `days` days ending `endOffset` days from TODAY (0 = today). */
const block = (country: string, days: number, endOffset = 0, extra: Partial<Stay> = {}) =>
  stay(country, addDays(TODAY, endOffset - days + 1), addDays(TODAY, endOffset), extra);

describe("Schengen membership", () => {
  test("members, new members and non-members", () => {
    for (const c of ["FR", "ES", "HR", "BG", "RO", "CH", "NO", "IS", "LI"]) expect(isSchengenCountry(c)).toBe(true);
    for (const c of ["GB", "IE", "CY", "GP", "MQ", "RE", "GI", "TR", "ME", "ZZ"]) expect(isSchengenCountry(c)).toBe(false);
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

  test("a country with no rule gets a plain calendar-year count", () => {
    const r = taxCountrySummary([stay("NL", "2026-02-01", "2026-02-10")], "NL", TODAY);
    expect(r.has_rule).toBe(false);
    expect(r.years[0].label).toBe("2026");
    expect(r.years[0].days).toBe(10);
    expect(r.years[0].status).toBe("none");
  });

  test("planned and unrecorded days", () => {
    const r = taxCountrySummary([stay("FR", "2026-01-01", "2026-10-31"), stay("FR", "2026-12-01", "2026-12-10")], "FR", TODAY);
    expect(r.years[0].planned_days).toBe(10);
    expect(r.years[0].unrecorded_days).toBe(10); // 1 to 10 November
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
