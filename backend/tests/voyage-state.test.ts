import { describe, test, expect, beforeEach } from "bun:test";
import {
  parseNavStatus,
  classifyActivity,
  hasArrivedAtDestination,
  normaliseLocode,
  shouldCloseVoyageAtStop,
  resolveDestinationPort,
  clearPortCache,
  type PortPosition,
} from "../src/utils/voyageState";

// Datalastic port_find result for ESVLG (Vilanova i la Geltru).
const VILANOVA: PortPosition = { name: "VILANOVA", unlocode: "ESVLG", latitude: 41.21114, longitude: 1.733122 };

describe("parseNavStatus", () => {
  test("numeric AIS codes", () => {
    expect(parseNavStatus(0)).toBe("underway");
    expect(parseNavStatus("8")).toBe("underway");
    expect(parseNavStatus(1)).toBe("anchored");
    expect(parseNavStatus(5)).toBe("moored");
    expect(parseNavStatus(15)).toBe("unknown");
  });

  test("provider text", () => {
    expect(parseNavStatus("Under way using engine")).toBe("underway");
    expect(parseNavStatus("Under Way Sailing")).toBe("underway");
    expect(parseNavStatus("At anchor")).toBe("anchored");
    expect(parseNavStatus("Moored")).toBe("moored");
    expect(parseNavStatus("Not defined")).toBe("unknown");
    expect(parseNavStatus(null)).toBe("unknown");
    expect(parseNavStatus("")).toBe("unknown");
  });
});

describe("classifyActivity", () => {
  test("speed overrides a stale underway status", () => {
    expect(classifyActivity(0, "Under way using engine")).toBe("stopped");
  });

  test("speed overrides a stale anchored status", () => {
    expect(classifyActivity(9.1, "At anchor")).toBe("underway");
  });

  test("stopped vessels take the status when set", () => {
    expect(classifyActivity(0.2, "At anchor")).toBe("at_anchor");
    expect(classifyActivity(0, 5)).toBe("moored");
    expect(classifyActivity(0, null)).toBe("stopped");
  });

  test("no speed falls back on status", () => {
    expect(classifyActivity(null, "At anchor")).toBe("at_anchor");
    expect(classifyActivity(null, null)).toBe("unknown");
  });
});

describe("normaliseLocode", () => {
  test("accepts spaced, hyphenated and compact forms", () => {
    expect(normaliseLocode("ES VLG")).toBe("ESVLG");
    expect(normaliseLocode("esvlg")).toBe("ESVLG");
    expect(normaliseLocode("FR-ANT")).toBe("FRANT");
  });

  test("rejects free text", () => {
    expect(normaliseLocode("SOLLER")).toBeNull();
    expect(normaliseLocode("Palma de Mallorca")).toBeNull();
    expect(normaliseLocode(null)).toBeNull();
  });
});

describe("hasArrivedAtDestination", () => {
  test("SY Lionheart lying at Vilanova after the 14 Sep passage has arrived", () => {
    // AIS fix 2026-09-14T14:47Z, speed 0, no nav status set.
    const activity = classifyActivity(0, null);
    expect(hasArrivedAtDestination(activity, 41.2107, 1.7312, VILANOVA)).toBe(true);
  });

  test("still underway off the destination has not arrived", () => {
    expect(hasArrivedAtDestination("underway", 41.195, 1.7272, VILANOVA)).toBe(false);
  });

  test("stopped far from the destination has not arrived", () => {
    // Stopped at Soller, destination Vilanova.
    expect(hasArrivedAtDestination("at_anchor", 39.7955, 2.6935, VILANOVA)).toBe(false);
  });

  test("no resolved port means no arrival", () => {
    expect(hasArrivedAtDestination("moored", 41.2107, 1.7312, null)).toBe(false);
  });
});

describe("shouldCloseVoyageAtStop", () => {
  test("a stop at the destination always ends the passage", () => {
    expect(shouldCloseVoyageAtStop({ arrivedAtDestination: true, stoppedHours: 0.5, precedingLegHours: 9 })).toBe(true);
  });

  test("a short operational stop mid-passage is bridged", () => {
    expect(shouldCloseVoyageAtStop({ arrivedAtDestination: false, stoppedHours: 2, precedingLegHours: 8 })).toBe(false);
  });

  test("a stop longer than the leg before it ends the passage", () => {
    expect(shouldCloseVoyageAtStop({ arrivedAtDestination: false, stoppedHours: 10, precedingLegHours: 3 })).toBe(true);
  });
});

describe("resolveDestinationPort", () => {
  beforeEach(() => clearPortCache());

  const fakeFetch = (rows: any[], calls: string[]) =>
    (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ data: rows }), { status: 200 });
    }) as unknown as typeof fetch;

  test("looks up a LOCODE and caches it", async () => {
    const calls: string[] = [];
    const f = fakeFetch([{ port_name: "VILANOVA", unlocode: "ESVLG", lat: 41.21114, lon: 1.733122 }], calls);
    const a = await resolveDestinationPort("ES VLG", { apiKey: "k", fetchImpl: f });
    const b = await resolveDestinationPort("ESVLG", { apiKey: "k", fetchImpl: f });
    expect(a?.latitude).toBe(41.21114);
    expect(b?.name).toBe("VILANOVA");
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("unlocode=ESVLG");
  });

  test("free text needs an exact name match", async () => {
    const calls: string[] = [];
    const f = fakeFetch([{ port_name: "SOLLER HARBOUR", unlocode: "ESXXX", lat: 39.79, lon: 2.69 }], calls);
    expect(await resolveDestinationPort("SOLLER", { apiKey: "k", fetchImpl: f })).toBeNull();
  });

  test("skips non-port destinations without calling the API", async () => {
    const calls: string[] = [];
    const f = fakeFetch([], calls);
    expect(await resolveDestinationPort("FOR ORDERS", { apiKey: "k", fetchImpl: f })).toBeNull();
    expect(calls.length).toBe(0);
  });

  test("never throws on network failure", async () => {
    const f = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
    expect(await resolveDestinationPort("ES VLG", { apiKey: "k", fetchImpl: f })).toBeNull();
  });
});
