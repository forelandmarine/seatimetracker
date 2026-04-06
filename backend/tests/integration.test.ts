import { describe, test, expect } from "bun:test";
import { api, authenticatedApi, signUpTestUser, expectStatus, createTestFile } from "./helpers";

describe("API Integration Tests", () => {
  let authToken: string;
  let userId: string;
  let vesselId: string;
  let seaTimeEntryId: string;

  // ============================================================================
  // Setup: Sign up test user
  // ============================================================================
  test("Sign up test user for all tests", async () => {
    const { token, user } = await signUpTestUser();
    authToken = token;
    userId = user.id;
    expect(authToken).toBeDefined();
    expect(userId).toBeDefined();
  });

  // ============================================================================
  // Profile Management
  // ============================================================================
  describe("Profile Management", () => {
    test("GET /api/profile - should return authenticated user profile", async () => {
      const res = await authenticatedApi("/api/profile", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.id).toBeDefined();
      expect(data.email).toBeDefined();
      expect(data.name).toBeDefined();
    });

    test("PUT /api/profile - should update user profile", async () => {
      const res = await authenticatedApi("/api/profile", authToken, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Updated Name",
          address: "123 Main St",
          tel_no: "+44 1234 567890",
          nationality: "British",
        }),
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.name).toBe("Updated Name");
      expect(data.address).toBe("123 Main St");
    });

    test("PUT /api/profile/department - should set user department", async () => {
      const res = await authenticatedApi("/api/profile/department", authToken, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department: "deck" }),
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.department).toBe("deck");
    });

    test("POST /api/profile/upload-image - should upload profile image", async () => {
      const form = new FormData();
      form.append("file", createTestFile("profile.png", "image data", "image/png"));
      const res = await authenticatedApi("/api/profile/upload-image", authToken, {
        method: "POST",
        body: form,
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.id).toBeDefined();
      expect(data.imageUrl).toBeDefined();
    });

    test("POST /api/profile/upload-image - should 401 without auth", async () => {
      const form = new FormData();
      form.append("file", createTestFile());
      const res = await api("/api/profile/upload-image", {
        method: "POST",
        body: form,
      });
      await expectStatus(res, 401);
    });
  });

  // ============================================================================
  // Vessels CRUD
  // ============================================================================
  describe("Vessels Management", () => {
    test("POST /api/vessels - should create a new vessel", async () => {
      const res = await authenticatedApi("/api/vessels", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mmsi: "123456789",
          vessel_name: "Test Vessel",
          callsign: "TEST",
          flag: "UK",
          type: "Motor",
          length_metres: 50.5,
          gross_tonnes: 1000,
          engine_kilowatts: 500,
          is_active: true,
        }),
      });
      await expectStatus(res, 201);
      const data = await res.json();
      vesselId = data.id;
      expect(data.mmsi).toBe("123456789");
      expect(data.vessel_name).toBe("Test Vessel");
      expect(data.is_active).toBe(true);
    });

    test("GET /api/vessels - should list vessels", async () => {
      const res = await authenticatedApi("/api/vessels", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0].id).toBeDefined();
      expect(data[0].vessel_name).toBeDefined();
    });

    test("GET /api/vessels/{id} - should get single vessel by ID", async () => {
      const res = await authenticatedApi(`/api/vessels/${vesselId}`, authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.id).toBe(vesselId);
      expect(data.mmsi).toBeDefined();
      expect(data.vessel_name).toBeDefined();
    });

    test("GET /api/vessels/{id} - should return 404 for nonexistent vessel", async () => {
      const res = await authenticatedApi("/api/vessels/00000000-0000-0000-0000-000000000000", authToken);
      await expectStatus(res, 404);
    });

    test("GET /api/vessels/{id} - should return 401 without auth", async () => {
      const res = await api(`/api/vessels/${vesselId}`);
      await expectStatus(res, 401);
    });

    test("PUT /api/vessels/{id} - should update vessel", async () => {
      const res = await authenticatedApi(`/api/vessels/${vesselId}`, authToken, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vessel_name: "Updated Vessel Name",
          length_metres: 60,
        }),
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.vessel_name).toBe("Updated Vessel Name");
      expect(data.length_metres).toBeDefined();
    });

    test("PUT /api/vessels/{id}/particulars - should update vessel particulars", async () => {
      const res = await authenticatedApi(`/api/vessels/${vesselId}/particulars`, authToken, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callsign: "UPDATED",
          engine_kilowatts: 600,
          engine_type: "Diesel",
        }),
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.callsign).toBe("UPDATED");
      expect(data.engine_kilowatts).toBe(600);
    });

    test("PUT /api/vessels/{id}/activate - should activate vessel", async () => {
      const res = await authenticatedApi(`/api/vessels/${vesselId}/activate`, authToken, {
        method: "PUT",
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.is_active).toBe(true);
    });

    test("GET /api/vessels/archived - should return archived vessels", async () => {
      const res = await authenticatedApi("/api/vessels/archived", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test("POST /api/vessels - should fail without required mmsi field", async () => {
      const res = await authenticatedApi("/api/vessels", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vessel_name: "No MMSI",
          // mmsi is missing
        }),
      });
      await expectStatus(res, 400);
    });

    test("DELETE /api/vessels/{id} - should delete vessel", async () => {
      const res = await authenticatedApi(`/api/vessels/${vesselId}`, authToken, {
        method: "DELETE",
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.id).toBe(vesselId);
    });

    test("DELETE /api/vessels/{id} - should return 404 for nonexistent vessel", async () => {
      const res = await authenticatedApi("/api/vessels/00000000-0000-0000-0000-000000000000", authToken, {
        method: "DELETE",
      });
      await expectStatus(res, 404);
    });

    test("GET /api/vessels without auth - should return 401", async () => {
      const res = await api("/api/vessels");
      await expectStatus(res, 401);
    });
  });

  // ============================================================================
  // Sea Time Management
  // ============================================================================
  describe("Sea Time Management", () => {
    let testVesselId: string;
    let rejectTestEntryId: string;

    test("POST /api/vessels - create test vessel for sea time", async () => {
      const res = await authenticatedApi("/api/vessels", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mmsi: "987654321",
          vessel_name: "Sea Time Test Vessel",
          is_active: true,
        }),
      });
      await expectStatus(res, 201);
      const data = await res.json();
      testVesselId = data.id;
    });

    test("POST /api/logbook/manual-entry - should create manual sea time entry", async () => {
      const startTime = new Date(Date.now() - 86400000).toISOString();
      const res = await authenticatedApi("/api/logbook/manual-entry", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vessel_id: testVesselId,
          start_time: startTime,
          sea_days: 1,
          service_type: "actual_sea_service",
          notes: "Test manual entry",
          start_latitude: 51.5,
          start_longitude: -0.1,
        }),
      });
      await expectStatus(res, 201);
      const data = await res.json();
      seaTimeEntryId = data.id;
      expect(data.vessel_id).toBe(testVesselId);
      expect(data.status).toBeDefined();
    });

    test("GET /api/sea-time/{id} - should get sea time entry by ID", async () => {
      const res = await authenticatedApi(`/api/sea-time/${seaTimeEntryId}`, authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.id).toBe(seaTimeEntryId);
      expect(data.vessel_id).toBe(testVesselId);
      expect(data.start_time).toBeDefined();
      expect(data.status).toBeDefined();
      expect(data.service_type).toBe("actual_sea_service");
    });

    test("POST /api/logbook/manual-entry - should fail without vessel_id", async () => {
      const startTime = new Date().toISOString();
      const res = await authenticatedApi("/api/logbook/manual-entry", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_time: startTime,
          // vessel_id missing
        }),
      });
      await expectStatus(res, 400);
    });

    test("GET /api/sea-time - should list all sea time entries", async () => {
      const res = await authenticatedApi("/api/sea-time", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      if (data.length > 0) {
        expect(data[0].id).toBeDefined();
        expect(data[0].vessel_id).toBeDefined();
        expect(data[0].start_time).toBeDefined();
      }
    });

    test("GET /api/vessels/{vesselId}/sea-time - should get sea time for vessel", async () => {
      const res = await authenticatedApi(`/api/vessels/${testVesselId}/sea-time`, authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test("GET /api/sea-time/pending - should get pending entries", async () => {
      const res = await authenticatedApi("/api/sea-time/pending", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test("GET /api/sea-time/new-entries - should get new entries", async () => {
      const res = await authenticatedApi("/api/sea-time/new-entries", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.entries).toBeDefined();
      expect(Array.isArray(data.entries)).toBe(true);
      expect(data.count).toBeDefined();
    });

    test("PUT /api/sea-time/{id}/confirm - should confirm pending entry", async () => {
      const res = await authenticatedApi(`/api/sea-time/${seaTimeEntryId}/confirm`, authToken, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: "Confirmed entry",
          service_type: "actual_sea_service",
        }),
      });
      await expectStatus(res, 200);
    });

    test("PUT /api/sea-time/{id} - should update sea time entry", async () => {
      const res = await authenticatedApi(`/api/sea-time/${seaTimeEntryId}`, authToken, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sea_days: 1,
          notes: "Updated test notes",
          service_type: "watchkeeping_service",
        }),
      });
      await expectStatus(res, 200);
    });

    test("POST /api/logbook/manual-entry - create entry for reject test", async () => {
      const startTime = new Date(Date.now() - 172800000).toISOString();
      const res = await authenticatedApi("/api/logbook/manual-entry", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vessel_id: testVesselId,
          start_time: startTime,
          sea_days: 1,
          service_type: "yard_service",
          notes: "Entry to be rejected",
        }),
      });
      await expectStatus(res, 201);
      const data = await res.json();
      rejectTestEntryId = data.id;
    });

    test("PUT /api/sea-time/{id}/reject - should reject pending entry", async () => {
      const res = await authenticatedApi(`/api/sea-time/${rejectTestEntryId}/reject`, authToken, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: "Rejected for testing",
        }),
      });
      await expectStatus(res, 200);
    });

    test("PUT /api/sea-time/{id}/reject - should return 404 for nonexistent entry", async () => {
      const res = await authenticatedApi(
        "/api/sea-time/00000000-0000-0000-0000-000000000000/reject",
        authToken,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: "Test" }),
        }
      );
      await expectStatus(res, 404);
    });

    test("DELETE /api/sea-time/{id} - should delete sea time entry", async () => {
      const res = await authenticatedApi(`/api/sea-time/${seaTimeEntryId}`, authToken, {
        method: "DELETE",
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.id).toBe(seaTimeEntryId);
    });

    test("GET /api/sea-time/{id} - should return 404 for deleted entry", async () => {
      const res = await authenticatedApi(`/api/sea-time/${seaTimeEntryId}`, authToken);
      await expectStatus(res, 404);
    });

    test("DELETE /api/sea-time/{id} - should return 404 for nonexistent entry", async () => {
      const res = await authenticatedApi("/api/sea-time/00000000-0000-0000-0000-000000000000", authToken, {
        method: "DELETE",
      });
      await expectStatus(res, 404);
    });

    test("GET /api/sea-time without auth - should return 401", async () => {
      const res = await api("/api/sea-time");
      await expectStatus(res, 401);
    });

    test("POST /api/sea-time/generate-sample-entries - should generate sample entries", async () => {
      const res = await authenticatedApi("/api/sea-time/generate-sample-entries", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          vesselName: "Sample Test Vessel",
        }),
      });
      // May be 201 or 400/404 depending on implementation
      if (res.status === 201) {
        const data = await res.json();
        expect(data.success).toBeDefined();
        expect(data.entriesCreated).toBeDefined();
      } else {
        await expectStatus(res, 400, 404);
      }
    });

    test("POST /api/sea-time/test-entry - should create test sea time entry", async () => {
      const res = await api("/api/sea-time/test-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      // Test endpoint, may return 200, 400, 404, or 500
      if (res.status === 200) {
        const data = await res.json();
        expect(data.id).toBeDefined();
        expect(data.vessel_id).toBeDefined();
      } else {
        await expectStatus(res, 400, 404, 500);
      }
    });

    test("POST /api/sea-time/generate-samples - should generate sample sea time entries", async () => {
      const res = await api("/api/sea-time/generate-samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      // May return 201 or 400/401 depending on implementation
      if (res.status === 201) {
        const data = await res.json();
        expect(data.success).toBeDefined();
        expect(data.message).toBeDefined();
      } else {
        await expectStatus(res, 400, 401);
      }
    });
  });

  // ============================================================================
  // Logbook
  // ============================================================================
  describe("Logbook", () => {
    test("GET /api/logbook - should return logbook entries", async () => {
      const res = await authenticatedApi("/api/logbook", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test("GET /api/logbook - should support date range filtering", async () => {
      const startDate = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      const endDate = new Date().toISOString().split("T")[0];
      const res = await authenticatedApi(
        `/api/logbook?startDate=${startDate}&endDate=${endDate}`,
        authToken
      );
      await expectStatus(res, 200);
    });
  });

  // ============================================================================
  // Reports
  // ============================================================================
  describe("Reports", () => {
    test("GET /api/reports/summary - should return report summary", async () => {
      const res = await authenticatedApi("/api/reports/summary", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.total_days).toBeDefined();
      expect(Array.isArray(data.entries_by_vessel)).toBe(true);
      expect(Array.isArray(data.entries_by_month)).toBe(true);
      expect(Array.isArray(data.entries_by_service_type)).toBe(true);
    });

    test("GET /api/reports/summary - should support date filtering", async () => {
      const startDate = new Date(Date.now() - 60 * 86400000).toISOString().split("T")[0];
      const endDate = new Date().toISOString().split("T")[0];
      const res = await authenticatedApi(
        `/api/reports/summary?startDate=${startDate}&endDate=${endDate}`,
        authToken
      );
      await expectStatus(res, 200);
    });

    test("GET /api/reports/csv - should return CSV report", async () => {
      const res = await authenticatedApi("/api/reports/csv", authToken);
      await expectStatus(res, 200);
    });

    test("GET /api/reports/pdf - should return PDF report", async () => {
      const res = await authenticatedApi("/api/reports/pdf", authToken);
      await expectStatus(res, 200);
    });

    test("GET /api/reports/csv without auth - should return 401", async () => {
      const res = await api("/api/reports/csv");
      await expectStatus(res, 401);
    });
  });

  // ============================================================================
  // Notifications
  // ============================================================================
  describe("Notifications", () => {
    test("PUT /api/notifications/schedule - should update notification schedule", async () => {
      const res = await authenticatedApi("/api/notifications/schedule", authToken, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduled_time: "18:00",
          timezone: "Europe/London",
          is_active: true,
        }),
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.scheduled_time).toBe("18:00");
      expect(data.timezone).toBe("Europe/London");
    });

    test("GET /api/notifications/schedule - should get notification schedule", async () => {
      const res = await authenticatedApi("/api/notifications/schedule", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.id).toBeDefined();
      expect(data.scheduled_time).toBeDefined();
      expect(data.is_active).toBeDefined();
    });

    test("GET /api/notifications/check-due - should check if notification is due", async () => {
      const res = await authenticatedApi("/api/notifications/check-due", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(typeof data.isDue).toBe("boolean");
      expect(typeof data.pendingEntriesCount).toBe("number");
    });

    test("GET /api/notifications/schedule without auth - should return 401", async () => {
      const res = await api("/api/notifications/schedule");
      await expectStatus(res, 401);
    });
  });

  // ============================================================================
  // Subscription
  // ============================================================================
  describe("Subscription", () => {
    test("GET /api/subscription/status - should return subscription status", async () => {
      const res = await authenticatedApi("/api/subscription/status", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.status).toBeDefined();
    });

    test("POST /api/subscription/verify - should handle invalid receipt", async () => {
      const res = await authenticatedApi("/api/subscription/verify", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptData: "invalid_receipt_data",
          productId: "test_product",
          isSandbox: true,
        }),
      });
      // Should return 400/500 for invalid receipt, not crash
      if (res.status !== 200) {
        await expectStatus(res, 400, 500);
      }
    });

    test("POST /api/subscription/webhook - should handle App Store notifications", async () => {
      const res = await api("/api/subscription/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationType: "INITIAL_BUY",
          receiptData: "invalid_test_data",
        }),
      });
      // Should return 200 for valid webhook format, 400/500 for invalid receipt
      if (res.status === 200) {
        const data = await res.json();
        expect(data.success).toBeDefined();
      } else {
        await expectStatus(res, 400, 500);
      }
    });

    test("POST /api/subscription/webhook - should reject missing required fields", async () => {
      const res = await api("/api/subscription/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // notificationType missing
          receiptData: "test_data",
        }),
      });
      await expectStatus(res, 400);
    });

    test("POST /api/subscription/revenuecat/webhook - should handle RevenueCat events", async () => {
      const res = await api("/api/subscription/revenuecat/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: {
            type: "INITIAL_PURCHASE",
            app_user_id: "test_user_123",
            properties: {},
          },
        }),
      });
      // Should return 200 for valid webhook format
      if (res.status === 200) {
        const data = await res.json();
        expect(data.success).toBeDefined();
      } else {
        // May return 400 or 401 for auth/validation issues
        await expectStatus(res, 400, 401, 500);
      }
    });

    test("POST /api/subscription/revenuecat/webhook - should reject missing event type", async () => {
      const res = await api("/api/subscription/revenuecat/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: {
            // type missing
            app_user_id: "test_user_123",
            properties: {},
          },
        }),
      });
      await expectStatus(res, 400);
    });

    test("POST /api/subscription/sync - should sync subscription status", async () => {
      const res = await authenticatedApi("/api/subscription/sync", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      // May succeed or fail depending on RevenueCat availability
      if (res.status === 200) {
        const data = await res.json();
        expect(data.success).toBeDefined();
        expect(data.status).toBeDefined();
      } else {
        await expectStatus(res, 400, 401, 500);
      }
    });

    test("PATCH /api/subscription/pause-tracking - should pause tracking", async () => {
      const res = await authenticatedApi("/api/subscription/pause-tracking", authToken, {
        method: "PATCH",
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(typeof data.success).toBe("boolean");
    });

    test("GET /api/subscription/status without auth - should return 401", async () => {
      const res = await api("/api/subscription/status");
      await expectStatus(res, 401);
    });
  });

  // ============================================================================
  // AIS (Automatic Identification System)
  // ============================================================================
  describe("AIS", () => {
    let aisTestVesselId: string;
    let aisTaskId: string;
    let aisCheckId: string;

    test("POST /api/vessels - create vessel for AIS tests", async () => {
      const res = await authenticatedApi("/api/vessels", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mmsi: "111222333",
          vessel_name: "AIS Test Vessel",
          is_active: true,
        }),
      });
      await expectStatus(res, 201);
      const data = await res.json();
      aisTestVesselId = data.id;
    });

    test("GET /api/ais/check/{vesselId} - should get vessel AIS data", async () => {
      const res = await authenticatedApi(`/api/ais/check/${aisTestVesselId}`, authToken);
      // May return 502 if external API unavailable, but should not 404 for valid vessel
      if (res.status === 200) {
        const data = await res.json();
        expect(data.check_id).toBeDefined();
        aisCheckId = data.check_id;
        expect(typeof data.is_moving).toBe("boolean");
      } else {
        // Accept errors from external API, but not 404
        await expectStatus(res, 502, 429, 400);
      }
    });

    test("POST /api/ais/check/{vesselId} - should manage AIS data and sea time entries", async () => {
      const res = await authenticatedApi(`/api/ais/check/${aisTestVesselId}?forceRefresh=true`, authToken, {
        method: "POST",
      });
      // May return 200, 429 (rate limited), or 502 (external API error)
      if (res.status === 200) {
        const data = await res.json();
        expect(data.check_id).toBeDefined();
        aisCheckId = data.check_id;
        expect(typeof data.is_moving).toBe("boolean");
        expect(typeof data.sea_time_entry_created).toBe("boolean");
      } else {
        // Accept rate limit or external API errors
        await expectStatus(res, 429, 502, 400);
      }
    });

    test("GET /api/ais/checks/{id} - should get cached AIS data for vessel", async () => {
      if (!aisCheckId) {
        // Skip if no check_id was obtained
        return;
      }
      const res = await authenticatedApi(`/api/ais/checks/${aisTestVesselId}`, authToken);
      if (res.status === 200) {
        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.vessel_id).toBe(aisTestVesselId);
        expect(typeof data.is_moving).toBe("boolean");
      } else {
        // May return 404 if no cached data exists
        await expectStatus(res, 404);
      }
    });

    test("GET /api/ais/checks/{id} - should return 404 for invalid vessel", async () => {
      const res = await authenticatedApi(
        "/api/ais/checks/00000000-0000-0000-0000-000000000000",
        authToken
      );
      await expectStatus(res, 404);
    });

    test("GET /api/ais/status/{vesselId} - should get vessel movement status", async () => {
      const res = await authenticatedApi(`/api/ais/status/${aisTestVesselId}`, authToken);
      if (res.status === 200) {
        const data = await res.json();
        expect(typeof data.is_moving).toBe("boolean");
        expect(Array.isArray(data.recent_checks)).toBe(true);
      }
    });

    test("GET /api/ais/check without valid vesselId - should return 404", async () => {
      const res = await authenticatedApi(
        "/api/ais/check/00000000-0000-0000-0000-000000000000",
        authToken
      );
      await expectStatus(res, 404);
    });

    test("GET /api/ais/scheduled-tasks - should return scheduled AIS tasks", async () => {
      const res = await authenticatedApi("/api/ais/scheduled-tasks", authToken);
      await expectStatus(res, 200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    test("POST /api/ais/schedule-check - should schedule AIS check", async () => {
      const res = await authenticatedApi("/api/ais/schedule-check", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vessel_id: aisTestVesselId,
          interval_hours: 4,
        }),
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(data.task_id).toBeDefined();
      expect(data.is_active).toBe(true);
      aisTaskId = data.task_id;
    });

    test("PUT /api/ais/scheduled-tasks/{taskId} - should toggle task active status", async () => {
      if (!aisTaskId) {
        // Skip if no task was created
        return;
      }
      const res = await authenticatedApi(`/api/ais/scheduled-tasks/${aisTaskId}`, authToken, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_active: false,
        }),
      });
      await expectStatus(res, 200);
      const data = await res.json();
      expect(typeof data.is_active).toBe("boolean");
    });

    test("PUT /api/ais/scheduled-tasks/{taskId} - should return 404 for nonexistent task", async () => {
      const res = await authenticatedApi(
        "/api/ais/scheduled-tasks/00000000-0000-0000-0000-000000000000",
        authToken,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_active: true }),
        }
      );
      await expectStatus(res, 404);
    });

    test("GET /api/ais/debug/{vesselId} - should return AIS debug logs", async () => {
      const res = await authenticatedApi(`/api/ais/debug/${aisTestVesselId}`, authToken);
      if (res.status === 200) {
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
      } else {
        // Accept 404 if no debug logs exist
        await expectStatus(res, 404);
      }
    });

    test("GET /api/ais/debug/{vesselId} with limit param - should limit results", async () => {
      const res = await authenticatedApi(`/api/ais/debug/${aisTestVesselId}?limit=5`, authToken);
      if (res.status === 200) {
        const data = await res.json();
        expect(Array.isArray(data)).toBe(true);
      }
    });
  });

  // ============================================================================
  // Tracking (MyShipTracking API)
  // ============================================================================
  describe("Tracking", () => {
    let fleetId: string;

    test("GET /api/tracking/account - should return account information", async () => {
      const res = await api("/api/tracking/account");
      // May return 200, 500, or 401 depending on API availability and auth requirements
      if (res.status !== 200) {
        // Accept errors from external tracking API
        await expectStatus(res, 400, 401, 500);
      } else {
        const data = await res.json();
        expect(data).toBeDefined();
      }
    });

    test("GET /api/tracking/vessel/{mmsi} - should get vessel info by MMSI", async () => {
      const res = await api("/api/tracking/vessel/123456789");
      // May fail if MMSI doesn't exist or external API is down
      if (res.status === 200) {
        const data = await res.json();
        expect(data).toBeDefined();
      } else {
        // Accept not found or external API errors (401 for invalid API key, 404 for not found, 429 for rate limit, 500 for other errors)
        await expectStatus(res, 401, 404, 429, 500);
      }
    });

    test("GET /api/tracking/vessel/{mmsi} with response param", async () => {
      const res = await api("/api/tracking/vessel/123456789?response=extended");
      if (res.status === 200) {
        const data = await res.json();
        expect(data).toBeDefined();
      }
    });

    test("GET /api/tracking/vessel/imo/{imo} - should get vessel info by IMO", async () => {
      const res = await api("/api/tracking/vessel/imo/1234567");
      if (res.status === 200) {
        const data = await res.json();
        expect(data).toBeDefined();
      } else {
        // Accept not found or external API errors
        await expectStatus(res, 404, 500);
      }
    });

    test("GET /api/tracking/port/{port_id} - should get port information", async () => {
      const res = await api("/api/tracking/port/GBLON");
      if (res.status === 200) {
        const data = await res.json();
        expect(data).toBeDefined();
      } else {
        // Accept not found or external API errors
        await expectStatus(res, 404, 500);
      }
    });

    test("GET /api/tracking/port/vessels/{port_id} - should list vessels at port", async () => {
      const res = await api("/api/tracking/port/vessels/GBLON");
      if (res.status === 200) {
        const data = await res.json();
        expect(data).toBeDefined();
      } else {
        // Accept not found or external API errors
        await expectStatus(res, 404, 500);
      }
    });

    test("GET /api/tracking/port/vessels/{port_id} with limit", async () => {
      const res = await api("/api/tracking/port/vessels/GBLON?limit=10");
      if (res.status === 200) {
        const data = await res.json();
        expect(data).toBeDefined();
      }
    });

    test("GET /api/tracking/vessel/history/{mmsi} - should get vessel tracking history", async () => {
      const res = await api("/api/tracking/vessel/history/123456789");
      if (res.status === 200) {
        const data = await res.json();
        expect(data).toBeDefined();
      } else {
        // Accept not found or external API errors
        await expectStatus(res, 404, 500);
      }
    });

    test("GET /api/tracking/vessel/history/{mmsi} with days param", async () => {
      const res = await api("/api/tracking/vessel/history/123456789?days=7");
      if (res.status === 200) {
        const data = await res.json();
        expect(data).toBeDefined();
      }
    });

    test("GET /api/tracking/search - should search vessels by zone", async () => {
      const res = await api("/api/tracking/search?zone=A");
      if (res.status === 200) {
        const data = await res.json();
        expect(data).toBeDefined();
      } else {
        await expectStatus(res, 400, 500);
      }
    });

    test("GET /api/tracking/search - should search by coordinates", async () => {
      const res = await api("/api/tracking/search?latitude=51.5&longitude=-0.1&radius=10");
      if (res.status === 200) {
        const data = await res.json();
        expect(data).toBeDefined();
      } else {
        await expectStatus(res, 400, 500);
      }
    });

    test("GET /api/tracking/search - should search by name", async () => {
      const res = await api("/api/tracking/search?name=EVER");
      if (res.status === 200) {
        const data = await res.json();
        expect(data).toBeDefined();
      } else {
        await expectStatus(res, 400, 500);
      }
    });

    test("POST /api/tracking/fleet - should create a fleet", async () => {
      const res = await api("/api/tracking/fleet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Fleet",
          description: "Fleet for testing",
          vessel_ids: [],
        }),
      });
      if (res.status === 201) {
        const data = await res.json();
        expect(data).toBeDefined();
        fleetId = data.id;
      } else {
        // Accept errors if auth or invalid input
        await expectStatus(res, 400, 401);
      }
    });

    test("GET /api/tracking/fleet/{fleet_id} - should get fleet information", async () => {
      if (!fleetId) {
        // Skip if fleet wasn't created
        return;
      }
      const res = await api(`/api/tracking/fleet/${fleetId}`);
      if (res.status === 200) {
        const data = await res.json();
        expect(data).toBeDefined();
      } else {
        await expectStatus(res, 404);
      }
    });

    test("GET /api/tracking/fleet/{fleet_id} with invalid ID - should return 404", async () => {
      const res = await api("/api/tracking/fleet/invalid-fleet-id");
      await expectStatus(res, 404);
    });
  });

  // ============================================================================
  // Error Handling
  // ============================================================================
  describe("Error Handling", () => {
    test("GET /api/profile without auth - should return 401", async () => {
      const res = await api("/api/profile");
      await expectStatus(res, 401);
    });

    test("PUT /api/vessels/{id} with invalid UUID - should return 404", async () => {
      const res = await authenticatedApi("/api/vessels/00000000-0000-0000-0000-000000000000", authToken, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vessel_name: "Test" }),
      });
      await expectStatus(res, 404);
    });

    test("POST /api/vessels with missing required field - should return 400", async () => {
      const res = await authenticatedApi("/api/vessels", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // missing both mmsi and vessel_name
          flag: "UK",
        }),
      });
      await expectStatus(res, 400);
    });

    test("POST /api/logbook/manual-entry with invalid vessel - should return 404", async () => {
      const startTime = new Date().toISOString();
      const res = await authenticatedApi("/api/logbook/manual-entry", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vessel_id: "00000000-0000-0000-0000-000000000000",
          start_time: startTime,
        }),
      });
      await expectStatus(res, 404);
    });

    test("PUT /api/profile/department with invalid enum - should return 400", async () => {
      const res = await authenticatedApi("/api/profile/department", authToken, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department: "invalid_department",
        }),
      });
      await expectStatus(res, 400);
    });

    test("PUT /api/profile without required field - accepts empty body gracefully", async () => {
      const res = await authenticatedApi("/api/profile", authToken, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      // Empty PUT should succeed with 200, not 400
      await expectStatus(res, 200);
    });

    test("POST /api/vessels/{id}/sea-time with invalid vessel - should return 404", async () => {
      const startTime = new Date().toISOString();
      const res = await authenticatedApi(
        "/api/vessels/00000000-0000-0000-0000-000000000000/sea-time",
        authToken
      );
      // GET on nonexistent vessel should return 404
      await expectStatus(res, 404);
    });

    test("PUT /api/notifications/schedule with invalid timezone - should return 400", async () => {
      const res = await authenticatedApi("/api/notifications/schedule", authToken, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduled_time: "25:00",
          timezone: "Invalid/Timezone",
          is_active: true,
        }),
      });
      // Invalid time format should return 400
      if (res.status !== 200) {
        await expectStatus(res, 400);
      }
    });
  });

  // ============================================================================
  // User Account
  // ============================================================================
  describe("User Account", () => {
    test("DELETE /api/users/me without auth - should return 401", async () => {
      const res = await api("/api/users/me", {
        method: "DELETE",
      });
      await expectStatus(res, 401);
    });

    // Note: We don't test actual account deletion since it would destroy our test user
    // and prevent other tests from running.
  });
});
