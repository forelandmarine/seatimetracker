import { describe, test, expect } from "bun:test";
import { highSpeedNeeds } from "../src/utils/highSpeed";
import { boatmasterEndorsements } from "../src/utils/boatmasterEndorsements";
import { ticketsForTrip, type Wbc3Result } from "../src/utils/workboatArea";

const NOW = new Date("2026-11-05T12:00:00Z");

// Workboat Code Ed. 3 Table A5.1 Note F: "Where the vessel is used in accordance
// with ... 25.4 (High Speed and Planing Mode Operations), the Master must have a
// minimum of an RYA/MCA Advanced Powerboat Certificate".
describe("Advanced Powerboat for the master of a high-speed workboat (WBC3 Note F)", () => {
  const ctv = { id: "v1", vessel_name: "Wind Runner", is_high_speed: true, is_workboat: true };

  test("no high-speed workboat, no need", () => {
    expect(highSpeedNeeds([{ ...ctv, is_high_speed: false }], [], [], null, NOW)).toBeNull();
    expect(highSpeedNeeds([], [], [], "commercial", NOW)).toBeNull();
  });

  test("a high-speed yacht tender is not a workboat, unless the user works commercially", () => {
    const tender = { id: "t", vessel_name: "Tender", is_high_speed: true, sector: "yachting" };
    expect(highSpeedNeeds([tender], [], [], "yachting", NOW)).toBeNull();
    expect(highSpeedNeeds([tender], [], [], "commercial", NOW)?.vessels).toEqual([{ id: "t", name: "Tender" }]);
  });

  test("shows as needed and not held, and whether the user served as master on it", () => {
    const asMate = highSpeedNeeds([ctv], [{ vessel_id: "v1", rank: "mate", status: "confirmed" }], [], null, NOW)!;
    expect(asMate.certificate_type).toBe("course_powerboat_advanced");
    expect(asMate.rule).toBe("wbc3_table_a5_1_note_f");
    expect(asMate.held).toBe(false);
    expect(asMate.served_as_master).toBe(false);
    const asMaster = highSpeedNeeds([ctv], [{ vessel_id: "v1", rank: "master", status: "confirmed" }], [], null, NOW)!;
    expect(asMaster.served_as_master).toBe(true);
    // A pending entry is not service yet
    expect(highSpeedNeeds([ctv], [{ vessel_id: "v1", rank: "master", status: "pending" }], [], null, NOW)!.served_as_master).toBe(false);
  });

  test("held when the certificate is on file and not expired", () => {
    const held = highSpeedNeeds([ctv], [], [{ certificate_type: "course_powerboat_advanced", expiry_date: null }], null, NOW)!;
    expect(held.held).toBe(true);
    const expired = highSpeedNeeds([ctv], [], [{ certificate_type: "course_powerboat_advanced", expiry_date: "2026-01-01" }], null, NOW)!;
    expect(expired.held).toBe(false);
    // Powerboat Level 2 is not the Advanced certificate
    expect(highSpeedNeeds([ctv], [], [{ certificate_type: "course_powerboat_l2" }], null, NOW)!.held).toBe(false);
  });
});

describe("Advanced Powerboat on the WBC3 ticket list", () => {
  test("a course_powerboat_advanced certificate counts as holding the ticket", () => {
    const trip: Wbc3Result = {
      band: "cat_4_3",
      options: [{ category: 4, conditions: ["favourable_weather", "daylight"] }, { category: 3, conditions: [] }],
      category_without_conditions: 3,
      max_from_land_nm: 8,
      max_from_departure_or_categorised_nm: 8,
      max_from_safe_haven_nm: 12,
      fixes: 10,
    };
    const t = ticketsForTrip(trip, [{ certificate_type: "course_powerboat_advanced" }], NOW).find((x) => x.id === "powerboat_advanced");
    expect(t?.held).toBe(true);
  });
});

// MSN 1853 Annex 5 Table C, Fast Craft Operations: QST "As per the requirement for
// the other operations undertaken (i.e. cargo and/or passenger operations)", in a
// deck capacity; footnote 68: counted concurrently with passenger or cargo QST.
describe("BML fast craft endorsement (MSN 1853 Annex 5 Table C)", () => {
  const entry = (day: string, vessel: any, extra: Record<string, unknown> = {}) => ({
    vessel_id: vessel.id,
    start_time: `${day}T07:00:00Z`,
    end_time: `${day}T17:00:00Z`,
    status: "confirmed",
    service_type: "actual_sea_service",
    rank: "deckhand",
    vessel,
    ...extra,
  });
  const fastFerry = { id: "ff", is_high_speed: true, is_passenger: true };
  const slowFerry = { id: "sf", is_high_speed: false, is_passenger: true };
  const tidalFix = (day: string, vessel_id: string) => ({ vessel_id, check_time: `${day}T12:00:00Z`, latitude: 51.5, longitude: -0.1, area_category: "C", is_tidal: true });

  test("counts deck days on high-speed craft only, with tidal days, concurrently with passenger days", () => {
    const entries = [entry("2026-03-01", fastFerry), entry("2026-03-02", fastFerry), entry("2026-03-03", slowFerry)];
    const fixes = [tidalFix("2026-03-01", "ff"), tidalFix("2026-03-03", "sf")];
    const r = boatmasterEndorsements(entries as any, fixes as any, null, NOW);
    expect(r.fast_craft.days).toBe(2);
    expect(r.fast_craft.tidal_days).toBe(1);
    expect(r.passenger.days).toBe(3); // the same fast craft days also count for passenger
    expect(r.fast_craft.months).toBe(8);
  });

  test("engine ranks, yard service and days before the licence do not count", () => {
    const entries = [
      entry("2026-03-01", fastFerry, { rank: "chief_engineer" }),
      entry("2026-03-02", fastFerry, { service_type: "yard_service" }),
      entry("2026-03-03", fastFerry),
      entry("2026-05-01", fastFerry),
    ];
    const r = boatmasterEndorsements(entries as any, [], "2026-04-01", NOW);
    expect(r.fast_craft.days).toBe(1);
  });
});
