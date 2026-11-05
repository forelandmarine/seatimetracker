import { describe, test, expect } from "bun:test";
// Under tsx the app's utils load as CommonJS (named exports sit on `default`);
// under bun they load as ES modules.
import * as planNs from "../../utils/revalidationReminderPlan";

const { monthsBefore, planRevalidationReminders, revalidationReminderId } =
  ((planNs as any).default ?? planNs) as typeof planNs;

// Run with TZ=UTC: reminders fire at 09:00 local
const NOW = new Date("2026-11-05T12:00:00Z");
const label = (t: string) => ({ occ_oow_3000gt: "OOW <3000gt", coc_bml_t2l1: "Boatmasters' Licence Tier 2 Level 1" } as Record<string, string>)[t] ?? t;

const item = (over: Record<string, any> = {}) => ({
  certificate_id: "c1",
  certificate_type: "occ_oow_3000gt",
  expiry_date: "2028-03-15",
  days_to_expiry: 0,
  keeps_anniversary: false,
  rule: "yacht_deck" as const,
  notice: "MSN 1861 3.2, 3.3",
  counts: "",
  routes: [],
  met: false,
  ...over,
});

describe("revalidation reminders", () => {
  test("monthsBefore keeps the day, clamped to the month's last day", () => {
    expect(monthsBefore("2028-03-15", 12).toISOString()).toBe("2027-03-15T09:00:00.000Z");
    expect(monthsBefore("2028-03-15", 6).toISOString()).toBe("2027-09-15T09:00:00.000Z");
    expect(monthsBefore("2027-08-31", 6).toISOString()).toBe("2027-02-28T09:00:00.000Z");
    expect(monthsBefore("2028-08-31", 6).toISOString()).toBe("2028-02-29T09:00:00.000Z");
  });

  test("short CoC: reminders at 12 and 6 months before expiry", () => {
    const p = planRevalidationReminders([item()], {}, label, NOW);
    expect(p.schedule.map((s) => [s.id, s.fireAt.toISOString()])).toEqual([
      ["reval-c1-12m", "2027-03-15T09:00:00.000Z"],
      ["reval-c1-6m", "2027-09-15T09:00:00.000Z"],
    ]);
    expect(p.schedule[0].body).toContain("OOW <3000gt expires within 12 months, on 15/03/2028");
    expect(p.schedule[1].body).toContain("keeps your current anniversary date (MSN 1861 2.4)");
    expect(p.cancelIds.sort()).toEqual(["reval-c1-12m", "reval-c1-6m"]);
  });

  test("service met, no expiry, or already expired: nothing scheduled, old ones cancelled", () => {
    for (const over of [{ met: true }, { expiry_date: null }, { expiry_date: "2026-11-01" }]) {
      const p = planRevalidationReminders([item(over)], {}, label, NOW);
      expect(p.schedule).toHaveLength(0);
      expect(p.cancelIds).toContain(revalidationReminderId("c1", "12m"));
    }
  });

  test("first seen inside 12 months: the missed reminder is sent once, a minute later", () => {
    const p = planRevalidationReminders([item({ expiry_date: "2027-08-01" })], {}, label, NOW);
    expect(p.schedule.map((s) => s.stage)).toEqual(["6m", "12m"]);
    expect(p.schedule[1].fireAt.getTime()).toBe(NOW.getTime() + 60_000);

    // A day later the catch-up has fired: only the 6-month one is left
    const later = new Date(NOW.getTime() + 86_400_000);
    const q = planRevalidationReminders([item({ expiry_date: "2027-08-01" })], p.log, label, later);
    expect(q.schedule.map((s) => s.stage)).toEqual(["6m"]);
  });

  test("inside 6 months: only the 6-month reminder catches up, never twice", () => {
    const p = planRevalidationReminders([item({ expiry_date: "2027-03-01" })], {}, label, NOW);
    expect(p.schedule.map((s) => s.stage)).toEqual(["6m"]);
    const later = new Date(NOW.getTime() + 86_400_000);
    expect(planRevalidationReminders([item({ expiry_date: "2027-03-01" })], p.log, label, later).schedule).toHaveLength(0);
  });

  test("a reminder that fired is not sent again, but a new expiry date starts afresh", () => {
    const log = { "c1|2027-08-01|12m": Date.parse("2026-08-01T09:00:00Z") };
    expect(planRevalidationReminders([item({ expiry_date: "2027-08-01" })], log, label, NOW).schedule.map((s) => s.stage)).toEqual(["6m"]);
    expect(planRevalidationReminders([item({ expiry_date: "2027-09-01" })], log, label, NOW).schedule.map((s) => s.stage)).toEqual(["6m", "12m"]);
  });

  test("deleted certificate: its reminders are cancelled and its log dropped", () => {
    const log = { "gone|2028-01-01|6m": Date.parse("2027-07-01T09:00:00Z") };
    const p = planRevalidationReminders([], log, label, NOW);
    expect(p.cancelIds).toEqual(["reval-gone-6m"]);
    expect(p.log).toEqual({});
  });

  test("Boatmasters' and workboat CoCs do not claim the MSN 1861 anniversary rule", () => {
    const p = planRevalidationReminders(
      [item({ certificate_type: "coc_bml_t2l1", rule: "bml_tier2", notice: "MSN 1853 19.3" })], {}, label, NOW,
    );
    expect(p.schedule[1].body).toContain("(MSN 1853 19.3)");
    expect(p.schedule[1].body).not.toContain("anniversary");
  });
});
