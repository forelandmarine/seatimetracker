import { describe, test, expect, afterEach, mock } from "bun:test";
import * as drizzle from "drizzle-orm";

// Only the conditions are needed: inArray keeps the tokens a delete was given.
mock.module("drizzle-orm", () => ({ ...drizzle, inArray: (_col: unknown, tokens: string[]) => ({ tokens }) }));
const { sendPushToUser } = await import("../src/utils/push");

const realFetch = globalThis.fetch;
const realTimeout = globalThis.setTimeout;
afterEach(() => { globalThis.fetch = realFetch; globalThis.setTimeout = realTimeout; });

function fakeApp(rows: { token: string; platform: string }[], deleted: string[][]) {
  const noop = () => {};
  return {
    logger: { info: noop, warn: noop, error: noop },
    db: {
      select: () => ({ from: () => ({ where: async () => rows }) }),
      delete: () => ({ where: async (cond: { tokens: string[] }) => { deleted.push(cond.tokens); } }),
    },
  } as any;
}

describe("sendPushToUser receipts", () => {
  test("a failed ticket before an accepted one does not shift which token a receipt belongs to", async () => {
    const rows = [
      { token: "ExponentPushToken[ios-a]", platform: "ios" },
      { token: "ExponentPushToken[android-b]", platform: "android" },
    ];
    const deleted: string[][] = [];
    let receiptCheck: (() => void) | null = null;
    globalThis.setTimeout = ((fn: () => void) => { receiptCheck = fn; return { unref() {} }; }) as any;
    globalThis.fetch = (async (url: string) => {
      if (url.endsWith("/push/send")) {
        return new Response(JSON.stringify({ data: [
          { status: "error", message: "bad creds", details: { error: "InvalidCredentials" } },
          { status: "ok", id: "r-b" },
        ] }));
      }
      return new Response(JSON.stringify({ data: { "r-b": { status: "error", details: { error: "DeviceNotRegistered" } } } }));
    }) as any;

    const accepted = await sendPushToUser(fakeApp(rows, deleted), "u1", { title: "t", body: "b" });
    expect(accepted).toBe(1);
    expect(receiptCheck).not.toBeNull();
    receiptCheck!();
    await new Promise((r) => realTimeout(r, 20));
    expect(deleted).toEqual([["ExponentPushToken[android-b]"]]);
  });
});
