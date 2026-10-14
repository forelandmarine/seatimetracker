import { eq, inArray } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { App } from "../index.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Send a push notification to every device registered for a user, via the Expo
 * push service. Never throws: returns the number of devices Expo accepted.
 *
 * Delivery depends on EAS push credentials (APNs key for iOS, FCM V1 for Android).
 * Tokens Expo reports as DeviceNotRegistered are removed.
 */
export async function sendPushToUser(app: App, userId: string, msg: PushMessage): Promise<number> {
  try {
    const rows = await app.db
      .select()
      .from(schema.push_tokens)
      .where(eq(schema.push_tokens.user_id, userId));
    if (rows.length === 0) return 0;

    const messages = rows.map((r) => ({
      to: r.token,
      title: msg.title,
      body: msg.body,
      data: msg.data ?? {},
      sound: "default",
      channelId: "sea-time-entries",
    }));

    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;

    const res = await fetch(EXPO_PUSH_URL, { method: "POST", headers, body: JSON.stringify(messages) });
    if (!res.ok) {
      app.logger.warn({ userId, status: res.status }, "Expo push request failed");
      return 0;
    }

    const json = (await res.json()) as { data?: Array<{ status: string; details?: { error?: string } }> };
    const tickets = json.data ?? [];
    const dead: string[] = [];
    let accepted = 0;
    tickets.forEach((t, i) => {
      if (t.status === "ok") accepted++;
      else if (t.details?.error === "DeviceNotRegistered" && rows[i]) dead.push(rows[i].token);
    });

    if (dead.length > 0) {
      await app.db.delete(schema.push_tokens).where(inArray(schema.push_tokens.token, dead));
      app.logger.info({ userId, removed: dead.length }, "Removed unregistered push tokens");
    }

    app.logger.info({ userId, devices: rows.length, accepted }, "Push notification sent");
    return accepted;
  } catch (err) {
    app.logger.warn({ err, userId }, "Push notification failed (non-critical)");
    return 0;
  }
}
