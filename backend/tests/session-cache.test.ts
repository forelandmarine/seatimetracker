import { describe, test, expect, beforeEach } from "bun:test";
import Fastify from "fastify";
import {
  clearSessionCache,
  extractUserIdFromRequest,
  findSession,
  registerSessionCacheInvalidation,
} from "../src/middleware/auth";

// A stand-in for app.db that answers the session lookup from a table and counts reads.
function fakeApp(rows: Record<string, { id: string; userId: string; expiresAt: Date }>) {
  const state = { reads: 0, rows };
  const app: any = {
    db: {
      select: () => ({
        from: () => ({
          where: async () => {
            state.reads++;
            const token = Object.keys(state.rows)[0];
            return token ? [state.rows[token]] : [];
          },
        }),
      }),
    },
  };
  return { app, state };
}

const inAnHour = () => new Date(Date.now() + 3_600_000);
const req = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

describe("session cache", () => {
  beforeEach(() => clearSessionCache());

  test("a found session is read from the database once", async () => {
    const { app, state } = fakeApp({ t1: { id: "s1", userId: "u1", expiresAt: inAnHour() } });
    expect(await extractUserIdFromRequest(req("t1"), app)).toBe("u1");
    expect(await extractUserIdFromRequest(req("t1"), app)).toBe("u1");
    expect(state.reads).toBe(1);
  });

  test("an unknown token is never cached", async () => {
    const { app, state } = fakeApp({});
    expect(await extractUserIdFromRequest(req("nope"), app)).toBeNull();
    expect(await extractUserIdFromRequest(req("nope"), app)).toBeNull();
    expect(state.reads).toBe(2);
  });

  test("a cached session that has expired is read again, not refused from the cache", async () => {
    const { app, state } = fakeApp({ t1: { id: "s1", userId: "u1", expiresAt: new Date(Date.now() - 1000) } });
    expect(await extractUserIdFromRequest(req("t1"), app)).toBeNull();
    // The session was extended in the database since
    state.rows.t1 = { id: "s1", userId: "u1", expiresAt: inAnHour() };
    expect(await extractUserIdFromRequest(req("t1"), app)).toBe("u1");
    expect(state.reads).toBe(2);
  });

  test("clearing forgets a session deleted from the database", async () => {
    const { app, state } = fakeApp({ t1: { id: "s1", userId: "u1", expiresAt: inAnHour() } });
    expect(await findSession(app, "t1")).not.toBeNull();
    state.rows = {};
    clearSessionCache();
    expect(await findSession(app, "t1")).toBeNull();
  });

  test("sign out, password changes and account deletion empty the cache; reads do not", async () => {
    const { app, state } = fakeApp({ t1: { id: "s1", userId: "u1", expiresAt: inAnHour() } });
    const fastify = Fastify();
    registerSessionCacheInvalidation(fastify);
    fastify.post("/api/auth/sign-out", async () => ({ ok: true }));
    fastify.put("/api/auth/password", async () => ({ ok: true }));
    fastify.delete("/api/users/me", async () => ({ ok: true }));
    fastify.get("/api/auth/user", async () => ({ ok: true }));
    fastify.post("/api/sea-time/x", async () => ({ ok: true }));

    const cachedThen = async (method: string, url: string) => {
      clearSessionCache();
      await findSession(app, "t1");
      const before = state.reads;
      await fastify.inject({ method: method as any, url });
      await findSession(app, "t1");
      return state.reads - before; // 1 = the cache was emptied
    };

    expect(await cachedThen("POST", "/api/auth/sign-out")).toBe(1);
    expect(await cachedThen("PUT", "/api/auth/password")).toBe(1);
    expect(await cachedThen("DELETE", "/api/users/me")).toBe(1);
    expect(await cachedThen("GET", "/api/auth/user")).toBe(0);
    expect(await cachedThen("POST", "/api/sea-time/x")).toBe(0);
  });
});
