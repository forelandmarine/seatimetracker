import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import * as schema from "../src/db/schema";
import {
  recentWindow,
  latestKnownWindow,
  missingRun,
  CallBudget,
  ACTIVITY_WINDOW_DAYS,
} from "../src/utils/recentActivity";
import { daysBetween } from "../src/utils/historyImport";

// The services read the key when called (history) or when loaded (vessel_info), so set it first.
process.env.DATALASTIC_API_KEY = "test-key";
const { previewVessel, recentActivity, resetPreviewBudgets } = await import("../src/services/onboardingPreview");
const { resetCreditCache, CREDIT_FLOOR } = await import("../src/services/historyImport");

const TODAY = "2026-11-22";

describe("activity window", () => {
  test("is the last 10 complete UTC days, today left out", () => {
    const w = recentWindow(TODAY);
    expect(w).toEqual({ from: "2026-11-12", to: "2026-11-22" });
    expect(daysBetween(w.from, w.to)).toHaveLength(ACTIVITY_WINDOW_DAYS);
  });

  test("latestKnownWindow takes the newest fully cached window within the lag", () => {
    const all = new Set(daysBetween("2026-11-05", "2026-11-20")); // up to 19 Nov
    expect(latestKnownWindow(all, TODAY)).toEqual({ from: "2026-11-10", to: "2026-11-20" });
    expect(latestKnownWindow(all, TODAY, 10, 1)).toBeNull(); // too old for a 1-day lag
    // A hole on 15 Nov leaves only 5 to 14 Nov, which ends 7 days back: still in the lag
    const gap = new Set([...all].filter((d) => d !== "2026-11-15"));
    expect(latestKnownWindow(gap, TODAY)).toEqual({ from: "2026-11-05", to: "2026-11-15" });
    const gap2 = new Set([...all].filter((d) => d !== "2026-11-13"));
    expect(latestKnownWindow(gap2, TODAY)).toBeNull();
  });

  test("missingRun is one run from the first to the last unknown day", () => {
    const w = recentWindow(TODAY);
    expect(missingRun(w, new Set())).toEqual(w);
    expect(missingRun(w, new Set(daysBetween(w.from, w.to)))).toBeNull();
    const some = new Set(["2026-11-12", "2026-11-13", "2026-11-21"]);
    expect(missingRun(w, some)).toEqual({ from: "2026-11-14", to: "2026-11-21" });
  });

  test("CallBudget allows max calls per window per key", () => {
    const b = new CallBudget(1, 1000);
    expect(b.canSpend("u", 0)).toBe(true);
    b.spend("u", 0);
    expect(b.canSpend("u", 500)).toBe(false);
    expect(b.canSpend("other", 500)).toBe(true);
    expect(b.canSpend("u", 1001)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// A small in-memory stand-in for the two cache tables. Conditions are not
// evaluated: each test uses one MMSI per table read, so returning the stored
// rows (filtered by MMSI here) is enough.
// ---------------------------------------------------------------------------

function fakeApp() {
  const days: any[] = [];
  const positions: any[] = [];
  const tableRows = (t: any) => (t === schema.ais_history_days ? days : t === schema.ais_history_positions ? positions : []);
  let mmsiFilter: string | null = null;
  const result = (t: any) => {
    const rows = tableRows(t).filter((r) => !mmsiFilter || r.mmsi === mmsiFilter);
    const p: any = Promise.resolve(rows);
    p.orderBy = () => Promise.resolve([...rows].sort((a, b) => a.position_time - b.position_time));
    return p;
  };
  const db: any = {
    select: () => ({ from: (t: any) => ({ where: () => result(t) }) }),
    insert: (t: any) => ({
      values: (v: any) => {
        const list = Array.isArray(v) ? v : [v];
        const add = () => {
          for (const r of list) {
            const rows = tableRows(t);
            const same = t === schema.ais_history_days
              ? rows.findIndex((x) => x.mmsi === r.mmsi && x.day === r.day)
              : rows.findIndex((x) => x.mmsi === r.mmsi && +x.position_time === +r.position_time);
            if (same >= 0) rows[same] = { ...rows[same], ...r, fetched_at: new Date() };
            else rows.push({ fetched_at: new Date(), ...r });
          }
        };
        return { onConflictDoNothing: async () => add(), onConflictDoUpdate: async () => add() };
      },
    }),
    transaction: async (cb: any) => cb(db),
  };
  const logger = { info() {}, warn() {}, error() {}, debug() {} };
  return {
    app: { db, logger } as any,
    days,
    positions,
    /** Reads below are for this MMSI only. */
    only(mmsi: string | null) { mmsiFilter = mmsi; },
  };
}

/** Fixes every 30 min on `day`: moving east at 8 kn from 10:00 to 14:00, else moored. */
function dayTrack(day: string, underway: boolean) {
  const out: any[] = [];
  let lon = -1;
  for (let h = 0; h < 24; h += 0.5) {
    const t = new Date(`${day}T00:00:00Z`).getTime() + h * 3_600_000;
    const moving = underway && h >= 10 && h < 14;
    if (moving) lon += 4 / (60 * Math.cos((50 * Math.PI) / 180)); // 4 nm per half hour = 8 kn
    out.push({ lat: 50, lon, speed: moving ? 8 : 0, course: 90, destination: null, last_position_UTC: new Date(t).toISOString() });
  }
  return out;
}

interface Call { kind: "history" | "info" | "stat"; key: string; value: string; from?: string; to?: string; status: number }
let calls: Call[] = [];
const realFetch = globalThis.fetch;

/** history: vessel id -> positions for any range (filtered by from/to). Unknown ids answer 404. */
function mockDatalastic(history: Record<string, { meta?: any; positions: any[] }>, credits = 15_000, info: Record<string, any> = {}) {
  globalThis.fetch = (async (input: any) => {
    const url = new URL(String(input));
    const mmsi = url.searchParams.get("mmsi");
    const imo = url.searchParams.get("imo");
    const value = mmsi ?? imo ?? "";
    const key = mmsi ? "mmsi" : "imo";
    if (url.pathname.endsWith("/stat")) {
      calls.push({ kind: "stat", key: "", value: "", status: 200 });
      return new Response(JSON.stringify({ data: { requests_remaining: credits } }), { status: 200 });
    }
    if (url.pathname.endsWith("/vessel_info")) {
      const hit = info[value];
      calls.push({ kind: "info", key, value, status: hit ? 200 : 404 });
      return hit ? new Response(JSON.stringify({ data: hit }), { status: 200 }) : new Response("{}", { status: 404 });
    }
    const from = url.searchParams.get("from")!;
    const to = url.searchParams.get("to")!;
    const hit = history[`${key}:${value}`];
    calls.push({ kind: "history", key, value, from, to, status: hit ? 200 : 404 });
    if (!hit) return new Response("{}", { status: 404 });
    const positions = hit.positions.filter((p) => p.last_position_UTC.slice(0, 10) >= from && p.last_position_UTC.slice(0, 10) < to);
    return new Response(JSON.stringify({ data: { ...(hit.meta ?? {}), positions } }), { status: 200 });
  }) as any;
}
afterAll(() => { globalThis.fetch = realFetch; });

const BOAT = "235000001";
const OTHER = "235000002";
// Underway on 3 of the last 10 days (14, 18 and 20 Nov), positions every day.
const boatTrack = daysBetween("2026-11-12", "2026-11-22").flatMap((d) => dayTrack(d, ["2026-11-14", "2026-11-18", "2026-11-20"].includes(d)));
const paid = () => calls.filter((c) => c.kind !== "stat" && c.status === 200);

beforeEach(() => {
  calls = [];
  resetPreviewBudgets();
  resetCreditCache();
  // These tests cover the 10-day history check; the default info mode has its own block below.
  process.env.VESSEL_PREVIEW_MODE = "history";
});
afterAll(() => { delete process.env.VESSEL_PREVIEW_MODE; });

describe("previewVessel", () => {
  test("one vessel_history call confirms the boat and gives days underway", async () => {
    const f = fakeApp();
    f.only(BOAT);
    mockDatalastic({ [`mmsi:${BOAT}`]: { meta: { name: "CALAMITY", mmsi: BOAT, country_iso: "GB" }, positions: boatTrack } });
    const r = await previewVessel(f.app, "u1", { mmsi: BOAT, name: "Calamity" }, { subscribed: false, today: TODAY });
    expect(r.status).toBe("live");
    expect(r.source).toBe("history");
    expect(r.vessel).toMatchObject({ mmsi: BOAT, name: "CALAMITY", flag_iso: "GB", flag: "United Kingdom" });
    expect(r.activity).toMatchObject({ from: "2026-11-12", to: "2026-11-22", window_days: 10, days_with_ais: 10, days_underway: 3 });
    expect(paid()).toHaveLength(1);
    expect(paid()[0]).toMatchObject({ kind: "history", from: "2026-11-12", to: "2026-11-22" });
    // Stored in the shared cache: all 10 days, positions under the MMSI
    expect(f.days.filter((d) => d.mmsi === BOAT)).toHaveLength(10);
    expect(f.positions.length).toBeGreaterThan(0);
  });

  test("a crewmate on the same boat costs nothing (cache)", async () => {
    const f = fakeApp();
    f.only(BOAT);
    mockDatalastic({ [`mmsi:${BOAT}`]: { positions: boatTrack } });
    await previewVessel(f.app, "u1", { mmsi: BOAT }, { subscribed: false, today: TODAY });
    calls = [];
    const r = await previewVessel(f.app, "u2", { mmsi: BOAT, name: "Calamity" }, { subscribed: false, today: TODAY });
    expect(r.status).toBe("live");
    expect(r.source).toBe("cache");
    expect(r.activity?.days_underway).toBe(3);
    expect(calls).toHaveLength(0);
    // recentActivity (locked Home) reads the cache only
    expect((await recentActivity(f.app, BOAT, TODAY))?.days_underway).toBe(3);
    expect(calls).toHaveLength(0);
  });

  test("an old MMSI answers 404 for free and the alternate MMSI is the one paid call", async () => {
    const f = fakeApp();
    f.only(OTHER);
    mockDatalastic({ [`mmsi:${OTHER}`]: { positions: boatTrack } });
    const r = await previewVessel(f.app, "u1", { mmsi: BOAT, alt_mmsis: [OTHER] }, { subscribed: false, today: TODAY });
    expect(r.status).toBe("live");
    expect(r.vessel?.mmsi).toBe(OTHER);
    expect(r.vessel?.former_mmsi).toBe(BOAT);
    expect(r.note).toBe(`Formerly MMSI ${BOAT}`);
    expect(calls.filter((c) => c.kind === "history")).toHaveLength(2);
    expect(paid()).toHaveLength(1);
    // Nothing cached under the unknown MMSI
    expect(f.days.filter((d) => d.mmsi === BOAT)).toHaveLength(0);
  });

  test("not on AIS: not_found, nothing cached, budget not spent", async () => {
    const f = fakeApp();
    f.only(BOAT);
    mockDatalastic({ [`mmsi:${OTHER}`]: { positions: boatTrack } });
    const r = await previewVessel(f.app, "u1", { mmsi: BOAT }, { subscribed: false, today: TODAY });
    expect(r.status).toBe("not_found");
    expect(f.days).toHaveLength(0);
    // The user can still check the right boat
    f.only(OTHER);
    const again = await previewVessel(f.app, "u1", { mmsi: OTHER }, { subscribed: false, today: TODAY });
    expect(again.status).toBe("live");
    expect(paid()).toHaveLength(1);
  });

  test("without a trial, a second boat gets no paid call", async () => {
    const f = fakeApp();
    f.only(BOAT);
    mockDatalastic({ [`mmsi:${BOAT}`]: { positions: boatTrack }, [`mmsi:${OTHER}`]: { positions: boatTrack } });
    await previewVessel(f.app, "u1", { mmsi: BOAT }, { subscribed: false, today: TODAY });
    calls = [];
    f.only(OTHER);
    const r = await previewVessel(f.app, "u1", { mmsi: OTHER }, { subscribed: false, today: TODAY });
    expect(r.status).toBe("unavailable");
    expect(calls).toHaveLength(0);
    // A subscriber is not held to the sign-up budget
    const sub = await previewVessel(f.app, "u1", { mmsi: OTHER }, { subscribed: true, today: TODAY });
    expect(sub.status).toBe("live");
  });

  test("below the credit floor: one vessel_info call, no history", async () => {
    const f = fakeApp();
    f.only(BOAT);
    mockDatalastic({ [`mmsi:${BOAT}`]: { positions: boatTrack } }, CREDIT_FLOOR - 1, {
      [BOAT]: { mmsi: BOAT, name: "CALAMITY", country_iso: "GB" },
    });
    const r = await previewVessel(f.app, "u1", { mmsi: BOAT }, { subscribed: false, today: TODAY });
    expect(r.status).toBe("live");
    expect(r.source).toBe("info");
    expect(r.activity).toBeNull();
    expect(calls.filter((c) => c.kind === "history")).toHaveLength(0);
    expect(paid()).toHaveLength(1);
  });

  test("only the days missing from the cache are fetched", async () => {
    const f = fakeApp();
    f.only(BOAT);
    mockDatalastic({ [`mmsi:${BOAT}`]: { positions: boatTrack } });
    // A crewmate's earlier check cached 12 to 16 Nov
    for (const day of daysBetween("2026-11-12", "2026-11-17")) f.days.push({ mmsi: BOAT, day, position_count: 48, fetched_at: new Date() });
    await previewVessel(f.app, "u1", { mmsi: BOAT }, { subscribed: false, today: TODAY });
    const h = calls.filter((c) => c.kind === "history");
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ from: "2026-11-17", to: "2026-11-22" });
  });
});

describe("previewVessel, default mode (fewest credits)", () => {
  beforeEach(() => { delete process.env.VESSEL_PREVIEW_MODE; });

  test("one vessel_info call (1 credit), no history call, stat only from cache", async () => {
    const f = fakeApp();
    f.only(BOAT);
    mockDatalastic({ [`mmsi:${BOAT}`]: { positions: boatTrack } }, 15_000, {
      [BOAT]: { mmsi: BOAT, name: "CALAMITY", country_iso: "GB" },
    });
    const r = await previewVessel(f.app, "u1", { mmsi: BOAT }, { subscribed: false, today: TODAY });
    expect(r.status).toBe("live");
    expect(r.source).toBe("info");
    expect(r.activity).toBeNull();
    expect(calls.filter((c) => c.kind === "history")).toHaveLength(0);
    expect(paid()).toHaveLength(1);
  });

  test("an old MMSI answers 404 and the alternate MMSI is the one found", async () => {
    const f = fakeApp();
    f.only(BOAT);
    mockDatalastic({}, 15_000, { [OTHER]: { mmsi: OTHER, name: "CALAMITY", country_iso: "CK" } });
    const r = await previewVessel(f.app, "u1", { mmsi: BOAT, alt_mmsis: [OTHER] }, { subscribed: false, today: TODAY });
    expect(r.status).toBe("live");
    expect(r.vessel?.mmsi).toBe(OTHER);
    expect(r.note).toBe(`Formerly MMSI ${BOAT}`);
    expect(paid()).toHaveLength(1);
  });

  test("a crewmate's cached days still give the activity line for free", async () => {
    process.env.VESSEL_PREVIEW_MODE = "history";
    const f = fakeApp();
    f.only(BOAT);
    mockDatalastic({ [`mmsi:${BOAT}`]: { positions: boatTrack } });
    await previewVessel(f.app, "crewmate", { mmsi: BOAT }, { subscribed: true, today: TODAY });
    delete process.env.VESSEL_PREVIEW_MODE;
    calls = [];
    const r = await previewVessel(f.app, "u2", { mmsi: BOAT }, { subscribed: false, today: TODAY });
    expect(r.source).toBe("cache");
    expect(r.activity?.days_underway).toBe(3);
    expect(paid()).toHaveLength(0);
  });
});
