import { eq, inArray } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { App } from "../index.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
/** Expo hands tickets to Apple and Google in the background; receipts are ready after this long. */
const RECEIPT_DELAY_MS = 30_000;

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

    const json = (await res.json()) as { data?: Array<{ status: string; id?: string; message?: string; details?: { error?: string } }> };
    const tickets = json.data ?? [];
    const dead: string[] = [];
    let accepted = 0;
    const receiptIds: string[] = [];
    tickets.forEach((t, i) => {
      if (t.status === "ok") {
        accepted++;
        if (t.id) receiptIds.push(t.id);
      } else {
        if (t.details?.error === "DeviceNotRegistered" && rows[i]) dead.push(rows[i].token);
        // InvalidCredentials here means the EAS push credentials (APNs key / FCM V1) are missing
        app.logger.error({ userId, platform: rows[i]?.platform, error: t.details?.error, message: t.message }, "Expo rejected push notification");
      }
    });

    if (dead.length > 0) {
      await app.db.delete(schema.push_tokens).where(inArray(schema.push_tokens.token, dead));
      app.logger.info({ userId, removed: dead.length }, "Removed unregistered push tokens");
    }

    app.logger.info({ userId, devices: rows.length, accepted }, "Push notification sent");
    // An accepted ticket only means Expo queued it. Delivery problems (wrong or missing
    // APNs/FCM credentials, revoked tokens) show up in the receipts, so check them later.
    if (receiptIds.length > 0) {
      const tokenByReceipt = new Map(receiptIds.map((id, i) => [id, rows[i]]));
      setTimeout(() => void checkReceipts(app, userId, receiptIds, tokenByReceipt, headers), RECEIPT_DELAY_MS).unref?.();
    }
    return accepted;
  } catch (err) {
    app.logger.warn({ err, userId }, "Push notification failed (non-critical)");
    return 0;
  }
}

/** Log failed deliveries and drop tokens Apple or Google say are no longer valid. */
async function checkReceipts(
  app: App,
  userId: string,
  ids: string[],
  rowByReceipt: Map<string, { token: string; platform: string | null } | undefined>,
  headers: Record<string, string>,
): Promise<void> {
  try {
    const res = await fetch(EXPO_RECEIPTS_URL, { method: "POST", headers, body: JSON.stringify({ ids }) });
    if (!res.ok) return;
    const json = (await res.json()) as { data?: Record<string, { status: string; message?: string; details?: { error?: string } }> };
    const dead: string[] = [];
    for (const [id, r] of Object.entries(json.data ?? {})) {
      if (r.status === "ok") continue;
      const row = rowByReceipt.get(id);
      app.logger.error({ userId, platform: row?.platform, error: r.details?.error, message: r.message }, "Push notification not delivered");
      if (r.details?.error === "DeviceNotRegistered" && row) dead.push(row.token);
    }
    if (dead.length > 0) {
      await app.db.delete(schema.push_tokens).where(inArray(schema.push_tokens.token, dead));
      app.logger.info({ userId, removed: dead.length }, "Removed unregistered push tokens");
    }
  } catch (err) {
    app.logger.warn({ err, userId }, "Push receipt check failed (non-critical)");
  }
}
