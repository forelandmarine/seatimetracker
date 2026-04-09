import { describe, test, expect } from "bun:test";

// Smoke tests against the deployed backend.
// Run with: TEST_BASE_URL=https://seatimetracker-production.up.railway.app bun test smoke
// These tests verify the live API surface is responding and shaped correctly.
// They don't mutate state — only check public/health endpoints and 401 responses.

const BASE_URL = process.env.TEST_BASE_URL || "https://seatimetracker-production.up.railway.app";

async function api(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, options);
}

describe("smoke: health", () => {
  test("GET /api/health returns 200 ok", async () => {
    const res = await api("/api/health");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
  });
});

describe("smoke: auth required endpoints reject without token", () => {
  test("GET /api/vessels rejects without auth", async () => {
    const res = await api("/api/vessels");
    expect(res.status).toBe(401);
  });

  test("GET /api/profile rejects without auth", async () => {
    const res = await api("/api/profile");
    expect(res.status).toBe(401);
  });

  test("GET /api/sea-time/entries rejects without auth", async () => {
    const res = await api("/api/sea-time/entries");
    expect(res.status).toBe(401);
  });

  test("GET /api/reports/summary rejects without auth", async () => {
    const res = await api("/api/reports/summary");
    expect(res.status).toBe(401);
  });

  test("GET /api/notifications/schedule rejects without auth", async () => {
    const res = await api("/api/notifications/schedule");
    expect(res.status).toBe(401);
  });
});

describe("smoke: signup validation", () => {
  test("POST /api/auth/sign-up/email rejects missing fields", async () => {
    const res = await api("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("POST /api/auth/sign-up/email rejects short password", async () => {
    const res = await api("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "smoke-test@example.com",
        password: "12",
        name: "Smoke Test",
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("smoke: signin validation", () => {
  test("POST /api/auth/sign-in/email rejects bad credentials", async () => {
    const res = await api("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "nonexistent@example.com",
        password: "wrongpassword",
      }),
    });
    expect([400, 401]).toContain(res.status);
  });
});
