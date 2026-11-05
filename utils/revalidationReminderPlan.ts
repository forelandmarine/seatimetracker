/**
 * Which revalidation reminders to schedule, from GET /api/certificates/revalidation.
 *
 * A held CoC whose logged service is short of the revalidation figure (met is
 * false) gets a reminder 12 months before it expires and again at 6 months.
 * MSN 1861 2.4: a CoC received for revalidation within 6 months of expiry is
 * revalidated to the fifth anniversary of its current expiry date, so the
 * 6-month reminder says so for MSN 1861 CoCs. Workboat (MGN 496) and
 * Boatmasters' (MSN 1853) licences have no such rule and get the plain wording.
 *
 * Pure and free of React Native imports so it can be tested in Node. The log
 * records when each reminder was set to fire: one whose time has passed has
 * fired and is never sent again for that expiry date. If the app first sees a
 * short CoC after a reminder date has passed, the latest missed reminder is
 * sent once, a minute later.
 */

import type { CertificateRevalidation } from './certificatesApi';

export type RevalidationReminderStage = '12m' | '6m';

export const REVALIDATION_REMINDER_STAGES: Array<{ stage: RevalidationReminderStage; months: number }> = [
  { stage: '12m', months: 12 },
  { stage: '6m', months: 6 },
];

/** MSN 1861 CoCs, the only ones the 2.4 anniversary rule covers. */
const MSN_1861_RULES = new Set(['deck', 'engine', 'yacht_deck', 'code_vessel']);

/** Reminder key -> time it was set to fire (ms). */
export type RevalidationReminderLog = Record<string, number>;

export interface PlannedRevalidationReminder {
  id: string;
  certificateId: string;
  stage: RevalidationReminderStage;
  fireAt: Date;
  title: string;
  body: string;
}

export interface RevalidationReminderPlan {
  /** Every reminder id the app may have scheduled: cancel these first. */
  cancelIds: string[];
  schedule: PlannedRevalidationReminder[];
  log: RevalidationReminderLog;
}

const CATCH_UP_DELAY_MS = 60_000;

export function revalidationReminderId(certificateId: string, stage: RevalidationReminderStage): string {
  return `reval-${certificateId}-${stage}`;
}

const logKey = (certificateId: string, expiry: string, stage: RevalidationReminderStage) =>
  `${certificateId}|${expiry}|${stage}`;

/** Local 09:00 on the date `months` before a YYYY-MM-DD date (31 Mar less 1 month is 28 or 29 Feb). */
export function monthsBefore(isoDate: string, months: number): Date {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const first = new Date(y, m - 1 - months, 1, 9, 0, 0, 0);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  first.setDate(Math.min(d, last));
  return first;
}

const expiryDate = (isoDate: string) => {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

function reminderText(
  item: CertificateRevalidation,
  stage: RevalidationReminderStage,
  label: string,
): { title: string; body: string } {
  const on = expiryDate(item.expiry_date as string).toLocaleDateString('en-GB');
  const within = stage === '12m' ? '12 months' : '6 months';
  let body = `${label} expires within ${within}, on ${on}. Your logged sea service is short of the revalidation requirement (${item.notice}).`;
  if (stage === '6m' && MSN_1861_RULES.has(item.rule)) {
    body += ' Applying before it expires keeps your current anniversary date (MSN 1861 2.4).';
  } else {
    body += ' Open Certificates to see what is left.';
  }
  return { title: 'Revalidation sea service short', body };
}

export function planRevalidationReminders(
  items: CertificateRevalidation[],
  previous: RevalidationReminderLog,
  labelFor: (certificateType: string) => string,
  now: Date = new Date(),
): RevalidationReminderPlan {
  const nowMs = now.getTime();
  const cancel = new Set<string>();
  for (const key of Object.keys(previous)) {
    const [certificateId, , stage] = key.split('|');
    if (certificateId && (stage === '12m' || stage === '6m')) cancel.add(revalidationReminderId(certificateId, stage));
  }

  const log: RevalidationReminderLog = {};
  const schedule: PlannedRevalidationReminder[] = [];

  for (const item of items) {
    for (const { stage } of REVALIDATION_REMINDER_STAGES) cancel.add(revalidationReminderId(item.certificate_id, stage));
    const expiry = item.expiry_date ? String(item.expiry_date).slice(0, 10) : null;
    if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) continue;

    // Reminders already sent for this expiry date stay sent
    for (const { stage } of REVALIDATION_REMINDER_STAGES) {
      const key = logKey(item.certificate_id, expiry, stage);
      if (previous[key] != null && previous[key] <= nowMs) log[key] = previous[key];
    }

    if (item.met || expiryDate(expiry).getTime() <= nowMs) continue;

    const label = labelFor(item.certificate_type);
    const passed: RevalidationReminderStage[] = [];
    for (const { stage, months } of REVALIDATION_REMINDER_STAGES) {
      const key = logKey(item.certificate_id, expiry, stage);
      const fireAt = monthsBefore(expiry, months);
      if (fireAt.getTime() > nowMs) {
        log[key] = fireAt.getTime();
        schedule.push({ id: revalidationReminderId(item.certificate_id, stage), certificateId: item.certificate_id, stage, fireAt, ...reminderText(item, stage, label) });
      } else {
        passed.push(stage);
      }
    }

    // Only the latest missed reminder, and only if it has not been sent
    const latest = passed[passed.length - 1];
    if (latest && log[logKey(item.certificate_id, expiry, latest)] == null) {
      const fireAt = new Date(nowMs + CATCH_UP_DELAY_MS);
      log[logKey(item.certificate_id, expiry, latest)] = fireAt.getTime();
      schedule.push({ id: revalidationReminderId(item.certificate_id, latest), certificateId: item.certificate_id, stage: latest, fireAt, ...reminderText(item, latest, label) });
    }
  }

  return { cancelIds: [...cancel], schedule, log };
}
