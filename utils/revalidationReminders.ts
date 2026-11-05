/**
 * Local push reminders when a held CoC is short of revalidation service, 12 and
 * 6 months before it expires (plan in utils/revalidationReminderPlan.ts).
 *
 * Like the certificate expiry reminders these are scheduled on the device. The
 * Certificates screen resyncs every time it loads the revalidation list, and
 * Home resyncs once a day, so a reminder is dropped once the service is logged
 * and moves when the expiry date changes.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { CERTIFICATE_TYPE_LABELS, listRevalidation, type CertificateRevalidation } from '@/utils/certificatesApi';
import { replaceRevalidationReminders } from '@/utils/notifications';
import {
  REVALIDATION_REMINDER_STAGES,
  planRevalidationReminders,
  revalidationReminderId,
  type RevalidationReminderLog,
} from '@/utils/revalidationReminderPlan';
import { error as logError } from '@/utils/log';

const LOG_KEY = 'seatime_revalidation_reminders';
const SYNCED_KEY = 'seatime_revalidation_reminders_synced';

const today = () => new Date().toISOString().slice(0, 10);

async function readLog(): Promise<RevalidationReminderLog> {
  try {
    const raw = await AsyncStorage.getItem(LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Reschedule revalidation reminders from a fresh revalidation list. */
export async function syncRevalidationReminders(items: CertificateRevalidation[]): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const now = new Date();
    const plan = planRevalidationReminders(items, await readLog(), (t) => CERTIFICATE_TYPE_LABELS[t] || t, now);
    const scheduled = await replaceRevalidationReminders(plan.cancelIds, plan.schedule);
    // If nothing could be scheduled, keep only reminders already sent so a
    // missed one is tried again next time.
    const log = scheduled
      ? plan.log
      : Object.fromEntries(Object.entries(plan.log).filter(([, at]) => at <= now.getTime()));
    await AsyncStorage.multiSet([[LOG_KEY, JSON.stringify(log)], [SYNCED_KEY, today()]]);
  } catch (err) {
    logError('[RevalidationReminders] Sync failed:', err);
  }
}

/** Home: fetch the revalidation list and resync, at most once a day. */
export async function syncRevalidationRemindersDaily(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if ((await AsyncStorage.getItem(SYNCED_KEY)) === today()) return;
    await syncRevalidationReminders(await listRevalidation());
  } catch (err) {
    logError('[RevalidationReminders] Daily sync failed:', err);
  }
}

/** A certificate was deleted: drop its reminders now rather than at the next sync. */
export async function cancelRevalidationReminders(certificateId: string): Promise<void> {
  await replaceRevalidationReminders(
    REVALIDATION_REMINDER_STAGES.map(({ stage }) => revalidationReminderId(certificateId, stage)),
    [],
  );
}
