import { describe, test, expect } from "bun:test";
import { annexCCapacity, buildWorkboatTestimonial, nilOr } from "../src/utils/workboatTestimonial";

const ctv = { length_metres: "26.5", is_workboat: true };

/** A confirmed entry of `hours` starting at 06:00 UTC on `day`. */
const entry = (day: string, extra: Record<string, any> = {}, hours = 10) => ({
  vessel_id: "ctv",
  start_time: `${day}T06:00:00Z`,
  end_time: new Date(Date.parse(`${day}T06:00:00Z`) + hours * 3_600_000).toISOString(),
  status: "confirmed",
  service_type: "actual_sea_service",
  vessel: ctv,
  ...extra,
});

/** `n` consecutive days of the same entry from `start`. */
const days = (start: string, n: number, extra: Record<string, any> = {}) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return entry(d.toISOString().slice(0, 10), extra);
  });

describe("MGN 496 Annex C testimonial", () => {
  test("maps ranks to the four Annex C capacities", () => {
    expect(annexCCapacity("master")).toBe("Master");
    expect(annexCCapacity("chief_officer")).toBe("Chief Mate");
    expect(annexCCapacity("second_officer")).toBe("OOW");
    expect(annexCCapacity("oow")).toBe("OOW");
    expect(annexCCapacity("rating")).toBe("Rating");
    expect(annexCCapacity(null)).toBeNull();
  });

  test("states sea service in 30-day months and days (MSF 4257)", () => {
    const t = buildWorkboatTestimonial(days("2026-01-01", 75, { rank: "oow" }))!;
    expect(t.sea_service_days).toBe(75);
    expect(t.sea_service_months).toBe(2);
    expect(t.sea_service_remaining_days).toBe(15);
    expect(t.from).toBe("2026-01-01");
    expect(t.to).toBe("2026-03-16");
    expect(t.capacities).toEqual(["OOW"]);
  });

  test("leaves out yard service and engine-rank entries", () => {
    const t = buildWorkboatTestimonial([
      entry("2026-02-01", { rank: "master" }),
      entry("2026-02-02", { rank: "master", service_type: "yard_service" }),
      entry("2026-02-03", { rank: "chief_engineer" }),
    ])!;
    expect(t.sea_service_days).toBe(1);
    expect(t.entries).toHaveLength(1);
  });

  test("counts in-port and standby service as sea service (MGN 496 4.1)", () => {
    const t = buildWorkboatTestimonial([
      entry("2026-02-01", { service_type: "service_in_port" }),
      entry("2026-02-02", { service_type: "standby_service" }),
    ])!;
    expect(t.sea_service_days).toBe(2);
  });

  test("a day under 4 hours does not count", () => {
    const t = buildWorkboatTestimonial([entry("2026-02-01", {}, 3), entry("2026-02-02", {}, 5)])!;
    expect(t.sea_service_days).toBe(1);
  });

  test("dual deck and engine capacity counts at 50% (MGN 496 4.5)", () => {
    const t = buildWorkboatTestimonial(days("2026-04-01", 4, { dual_capacity: true }))!;
    expect(t.sea_service_days).toBe(2);
    expect(t.dual_capacity_days).toBe(4);
  });

  test("watchkeeping only from officer watch entries, never from AIS movement", () => {
    const t = buildWorkboatTestimonial([
      entry("2026-05-01", { rank: "oow", service_type: "watchkeeping_service" }),
      entry("2026-05-02", { rank: "oow" }),
      entry("2026-05-03", { rank: "rating", service_type: "watchkeeping_service" }),
    ])!;
    expect(t.watchkeeping_days).toBe(1);
    expect(t.sea_service_days).toBe(3);
  });

  test("sole watchkeeper sea days are watchkeeping days", () => {
    const sole = { ...ctv, is_sole_watchkeeper: true };
    const t = buildWorkboatTestimonial(days("2026-05-01", 3, { rank: "master", vessel: sole }))!;
    expect(t.watchkeeping_days).toBe(3);
  });

  test("serving as Master flags that the company must sign (MGN 496 5.3)", () => {
    const t = buildWorkboatTestimonial([entry("2026-06-01", { rank: "master" }), entry("2026-06-02", { rank: "oow" })])!;
    expect(t.served_as_master).toBe(true);
    expect(t.capacities).toEqual(["Master", "OOW"]);
  });

  test("an entry with no rank asks the signatory to confirm the capacity", () => {
    const t = buildWorkboatTestimonial([entry("2026-06-01")])!;
    expect(t.capacity_unrecorded).toBe(true);
    expect(t.capacities).toEqual([]);
    expect(t.served_as_master).toBe(false);
  });

  test("uses recorded sign-on and sign-off dates for From and To", () => {
    const t = buildWorkboatTestimonial([
      entry("2026-07-10", { date_joined: "2026-07-01" }),
      entry("2026-07-20", { date_left: "2026-07-31" }),
    ])!;
    expect(t.from).toBe("2026-07-01");
    expect(t.to).toBe("2026-07-31");
  });

  test("clips leave to the service period and drops leave outside it", () => {
    const t = buildWorkboatTestimonial(days("2026-08-01", 10), [
      { start_date: "2026-07-25", end_date: "2026-08-03", reason: "annual_leave" },
      { start_date: "2026-09-01", end_date: "2026-09-05" },
    ])!;
    expect(t.leave).toEqual([{ start_date: "2026-08-01", end_date: "2026-08-03", reason: "annual_leave" }]);
  });

  test("ignores unconfirmed entries and returns null when nothing qualifies", () => {
    expect(buildWorkboatTestimonial([entry("2026-09-01", { status: "pending" })])).toBeNull();
  });

  test("counts entries carrying a signature", () => {
    const t = buildWorkboatTestimonial([
      entry("2026-09-01", { signature_image: "data:image/png;base64,AAAA" }),
      entry("2026-09-02", { signature_image: null }),
    ])!;
    expect(t.signed_entries).toBe(1);
  });

  test("writes NIL where there is no time of that type", () => {
    expect(nilOr(0, "days")).toBe("NIL");
    expect(nilOr(12, "days")).toBe("12 days");
    expect(nilOr(2.5, "days")).toBe("2.5 days");
  });
});
