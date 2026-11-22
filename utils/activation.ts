/**
 * Sign-up activation flow (2.5.0): boat first, pathway second, paywall third.
 *
 * Per-user progress is kept on the phone (AsyncStorage) so the routing in
 * app/index.tsx knows which step a never-subscribed user is on:
 *   vessel: 'done' (a boat was saved) or 'skipped' (no boat details to hand)
 *   vesselId: the boat saved here, activated when the trial starts
 *   paywallSeen: the sign-up paywall was shown once (later launches say "launch")
 * On a new phone the record is empty; the boat screen then finds the saved
 * vessel through GET /api/vessels and moves on.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { log, warn } from '@/utils/log';
import type { RecentActivity } from '@/utils/seaTimeApi';

export interface ActivationRecord {
  vessel?: 'done' | 'skipped';
  vesselId?: string;
  paywallSeen?: boolean;
  /** The saved boat was switched on for tracking after the trial started. */
  activated?: boolean;
}

const key = (userId: string) => `seatime_activation_${userId}`;

export async function getActivation(userId: string): Promise<ActivationRecord> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as ActivationRecord) : {};
  } catch {
    return {};
  }
}

export async function updateActivation(userId: string, patch: Partial<ActivationRecord>): Promise<ActivationRecord> {
  const next = { ...(await getActivation(userId)), ...patch };
  try {
    await AsyncStorage.setItem(key(userId), JSON.stringify(next));
  } catch (e) {
    warn('[Activation] Could not save progress:', e);
  }
  return next;
}

/**
 * The boat saved in the sign-up flow is created switched off (no free tier: the
 * backend makes no AIS call for it). Once a trial or subscription is active,
 * switch it on so the scheduler starts tracking. Only when the user has no
 * tracked vessel already, so it never takes over a choice they made themselves.
 */
export async function activateOnboardingVessel(userId: string): Promise<void> {
  const record = await getActivation(userId);
  if (record.vessel !== 'done' || record.activated) return;
  try {
    const api = await import('@/utils/seaTimeApi');
    const vessels: any[] = (await api.getVessels()) || [];
    if (vessels.some((v) => v?.is_active)) {
      await updateActivation(userId, { activated: true });
      return;
    }
    const target = vessels.find((v) => v?.id === record.vesselId) || (vessels.length === 1 ? vessels[0] : null);
    if (!target) return;
    await api.activateVessel(target.id);
    await updateActivation(userId, { activated: true });
    log('[Activation] Sign-up boat switched on for tracking:', target.vessel_name);
  } catch (e) {
    warn('[Activation] Could not switch on the sign-up boat (will retry next launch):', e);
  }
}

const shortDate = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

/**
 * "9 days underway in the last 10 days", or null when there is nothing honest
 * to say (no window cached, or no AIS positions at all in it).
 */
export function activityLine(a: RecentActivity | null | undefined): string | null {
  if (!a || a.days_with_ais === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const lastDay = new Date(new Date(`${a.to}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
  const period = a.to === today ? `the last ${a.window_days} days` : `the ${a.window_days} days to ${shortDate(lastDay)}`;
  if (a.days_underway === 0) return `No days underway in ${period}`;
  return `${a.days_underway} ${a.days_underway === 1 ? 'day' : 'days'} underway in ${period}`;
}
