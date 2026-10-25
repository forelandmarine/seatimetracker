import { describe, test, expect, beforeEach, afterAll } from "bun:test";

// Keys are read when ais.ts loads, so set them before importing it
process.env.DATALASTIC_API_KEY = "test-key";
delete process.env.MYSHIPTRACKING_API_KEY;
delete process.env.BASE44_API_KEY;
const { fetchVesselAISDataWithFallback, AIS_NOT_FOUND } = await import("../src/routes/ais.js");

// HBC: renamed and reflagged UK -> Cook Islands, so its old MMSI no longer transmits
const OLD_MMSI = "232056602";
const NEW_MMSI = "518999718";
const IMO = "1009833";

const hbcByImo = {
  data: {
    name: "HBC", mmsi: NEW_MMSI, imo: IMO, country_iso: "CK", callsign: "E5U5698",
    lat: 39.648724, lon: -0.20777333, speed: 0, course: 347, last_position_UTC: "2026-10-05T11:12:00Z",
  },
};

let calls: string[] = [];
let vesselRow: Record<string, any>;
let otherVesselsOnNewMmsi: any[];
let debugLogs: any[];
let updates: any[];
let pushes: any[];

// Just enough of the drizzle query builder for the code under test
function fakeApp() {
  let vesselReads = 0;
  const select = () => ({
    from: (table: any) => ({
      where: () => {
        const name = table?.[Symbol.for("drizzle:Name")];
        let rows: any[] = [];
        // First vessels read is the vessel itself; the next is the clash check on the new MMSI
        if (name === "vessels") rows = vesselReads++ === 0 ? [vesselRow] : otherVesselsOnNewMmsi;
        if (name === "ais_debug_logs") rows = debugLogs.filter((l) => l.authentication_status === "not_found");
        if (name === "push_tokens") rows = [{ token: "ExponentPushToken[test]" }];
        const p: any = Promise.resolve(rows);
        p.limit = () => Promise.resolve(rows);
        return p;
      },
    }),
  });
  return {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    db: {
      select,
      insert: () => ({ values: (v: any) => ({ execute: async () => { debugLogs.push(v); } }) }),
      update: () => ({ set: (v: any) => ({ where: async () => { updates.push(v); Object.assign(vesselRow, v); } }) }),
      delete: () => ({ where: async () => {} }),
    },
  } as any;
}

const realFetch = globalThis.fetch;
function mockDatalastic(byMmsi: Record<string, any>, byImo: Record<string, any>) {
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = new URL(String(input));
    calls.push(url.hostname + url.pathname + "?" + [...url.searchParams].filter(([k]) => k !== "api-key").map(([k, v]) => `${k}=${v}`).join("&"));
    if (url.hostname === "exp.host") {
      pushes.push(JSON.parse(init.body)[0]);
      return new Response(JSON.stringify({ data: [{ status: "ok" }] }));
    }
    const mmsi = url.searchParams.get("mmsi");
    const imo = url.searchParams.get("imo");
    const hit = imo ? byImo[imo] : byMmsi[mmsi ?? ""];
    return hit
      ? new Response(JSON.stringify(hit))
      : new Response(JSON.stringify({ meta: { message: "Not Found", success: false } }), { status: 404 });
  }) as any;
}

beforeEach(() => {
  calls = [];
  debugLogs = [];
  updates = [];
  pushes = [];
  otherVesselsOnNewMmsi = [];
  vesselRow = { id: "v1", mmsi: OLD_MMSI, imo_number: IMO, vessel_name: "HBC" };
});
afterAll(() => { globalThis.fetch = realFetch; });

describe("AIS lookup when the MMSI is unknown", () => {
  test("follows the IMO to the new MMSI, updates the vessel and tells the user", async () => {
    mockDatalastic({}, { [IMO]: hbcByImo });
    const { data, apiSource } = await fetchVesselAISDataWithFallback(OLD_MMSI, fakeApp().logger, "v1", fakeApp(), "u1", true);

    expect(data.error).toBeNull();
    expect(data.latitude).toBeCloseTo(39.6487);
    expect(apiSource).toBe("datalastic");
    expect(updates[0]).toMatchObject({ mmsi: NEW_MMSI, callsign: "E5U5698", flag: "CK" });
    expect(pushes).toHaveLength(1);
    expect(pushes[0].body).toContain(NEW_MMSI);
    // No keyless MyShipTracking call
    expect(calls.some((c) => c.includes("myshiptracking"))).toBe(false);
  });

  test("does not take an MMSI the user already has on another vessel", async () => {
    mockDatalastic({}, { [IMO]: hbcByImo });
    otherVesselsOnNewMmsi = [{ id: "v2" }];
    const { data } = await fetchVesselAISDataWithFallback(OLD_MMSI, fakeApp().logger, "v1", fakeApp(), "u1", true);

    expect(data.error).toBeNull(); // the position is still recorded
    expect(updates).toHaveLength(0);
    expect(pushes).toHaveLength(0);
  });

  test("without an IMO: reports not found, logs it, and notifies only the first time", async () => {
    mockDatalastic({}, {});
    vesselRow.imo_number = null;
    const app = fakeApp();

    const first = await fetchVesselAISDataWithFallback(OLD_MMSI, app.logger, "v1", app, "u1", true);
    expect(first.data.error).toBe(AIS_NOT_FOUND);
    expect(debugLogs.filter((l) => l.authentication_status === "not_found")).toHaveLength(1);
    expect(pushes).toHaveLength(1);
    expect(pushes[0].title).toContain("isn't showing on AIS");

    await fetchVesselAISDataWithFallback(OLD_MMSI, app.logger, "v1", app, "u1", true);
    expect(debugLogs.filter((l) => l.authentication_status === "not_found")).toHaveLength(2);
    expect(pushes).toHaveLength(1);
    expect(calls.some((c) => c.includes("myshiptracking"))).toBe(false);
  });

  test("a known MMSI makes one Datalastic call and changes nothing", async () => {
    mockDatalastic({ [NEW_MMSI]: hbcByImo }, {});
    vesselRow.mmsi = NEW_MMSI;
    const { data } = await fetchVesselAISDataWithFallback(NEW_MMSI, fakeApp().logger, "v1", fakeApp(), "u1", true);

    expect(data.error).toBeNull();
    expect(calls.filter((c) => c.includes("datalastic"))).toHaveLength(1);
    expect(updates).toHaveLength(0);
    expect(pushes).toHaveLength(0);
  });

  test("an outage is not reported as 'not found'", async () => {
    globalThis.fetch = (async () => new Response("busy", { status: 503 })) as any;
    const { data } = await fetchVesselAISDataWithFallback(OLD_MMSI, fakeApp().logger, "v1", fakeApp(), "u1", true);

    expect(data.error).toBe("All AIS data sources unavailable");
    expect(pushes).toHaveLength(0);
  });
});
