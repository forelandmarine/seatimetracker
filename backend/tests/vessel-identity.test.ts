import { describe, test, expect } from "bun:test";
import { flagName, identityAsOf, normaliseName, periodKey, sameCode, sameName, changeDays } from "../src/utils/vesselIdentity";

// Lionheart: reflagged 31 Aug 2026 (new MMSI and call sign), then renamed 1 Oct 2026.
const current = { mmsi: "244004647", vessel_name: "SY Aurora", flag: "Malta", callsign: "9HA1234", gross_tonnes: "121" };
const changes = [
  { field: "mmsi", old_value: "244770782", new_value: "244004647", effective_date: "2026-08-31" },
  { field: "flag", old_value: "Netherlands", new_value: "Malta", effective_date: "2026-08-31" },
  { field: "callsign", old_value: "PA2184", new_value: "9HA1234", effective_date: "2026-08-31" },
  { field: "vessel_name", old_value: "SY Lionheart", new_value: "SY Aurora", effective_date: "2026-10-01" },
];

describe("vessel identity", () => {
  test("names match across case, punctuation and type prefixes", () => {
    expect(normaliseName("SY Lionheart")).toBe("LIONHEART");
    expect(sameName("SY Lionheart", "LIONHEART")).toBe(true);
    expect(sameName("M/Y Lady K II", "LADY K II")).toBe(true);
    expect(sameName("MV Ever-Given", "EVER GIVEN")).toBe(true);
    expect(sameName("Lionheart", "Aurora")).toBe(false);
    // A name that merely starts with letters like a prefix is not cut
    expect(normaliseName("Myrtle")).toBe("MYRTLE");
  });

  test("flag codes become country names", () => {
    expect(flagName("CK")).toBe("Cook Islands");
    expect(flagName("nl")).toBe("Netherlands");
    expect(flagName("Malta")).toBe("Malta");
    expect(flagName(null)).toBeNull();
  });

  test("codes compare loosely", () => {
    expect(sameCode("pa 2184", "PA2184")).toBe(true);
    expect(sameCode("Netherlands", "Malta")).toBe(false);
    expect(sameCode(null, "")).toBe(true);
  });

  test("identityAsOf rebuilds the identity in force on a day", () => {
    expect(identityAsOf(current, changes, "2026-07-15")).toEqual({
      mmsi: "244770782", vessel_name: "SY Lionheart", flag: "Netherlands", callsign: "PA2184", gross_tonnes: "121",
    });
    // The change day itself already has the new values
    expect(identityAsOf(current, changes, "2026-08-31")).toMatchObject({ mmsi: "244004647", flag: "Malta", vessel_name: "SY Lionheart" });
    expect(identityAsOf(current, changes, "2026-10-01")).toEqual(current);
    expect(identityAsOf(current, [], "2020-01-01")).toEqual(current);
  });

  test("two changes of the same field unwind in order", () => {
    const twice = [
      { field: "vessel_name", old_value: "A", new_value: "B", effective_date: "2026-03-01" },
      { field: "vessel_name", old_value: "B", new_value: "C", effective_date: "2026-06-01" },
    ];
    const v = { vessel_name: "C" };
    expect(identityAsOf(v, twice, "2026-01-01").vessel_name).toBe("A");
    expect(identityAsOf(v, twice, "2026-04-01").vessel_name).toBe("B");
    expect(identityAsOf(v, twice, "2026-07-01").vessel_name).toBe("C");
  });

  test("periodKey groups days between changes", () => {
    expect(changeDays(changes)).toEqual(["2026-08-31", "2026-10-01"]);
    expect(periodKey(changes, "2026-07-15")).toBe("start");
    expect(periodKey(changes, "2026-09-10")).toBe("2026-08-31");
    expect(periodKey(changes, "2026-10-20")).toBe("2026-10-01");
    expect(periodKey([], "2026-10-20")).toBe("start");
  });
});
