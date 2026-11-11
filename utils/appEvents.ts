/**
 * Anonymous first-run funnel events (POST /api/events), so we can see where new
 * users drop off before and after creating an account. A random install id is
 * made on first use; no user id, email or device id is sent. Fire-and-forget:
 * never throws, never blocks the UI.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { BACKEND_URL } from '@/utils/api';

export type AppEvent =
  | 'onboarding_shown'
  | 'onboarding_done'
  | 'auth_shown'
  | 'auth_mode'
  | 'auth_failed'
  | 'account_created'
  | 'signed_in'
  | 'vessel_lookup'
  | 'vessel_confirmed'
  | 'vessel_lookup_web'
  | 'vessel_check'
  | 'vessel_renamed_mail'
  | 'vessel_added'
  | 'history_offer_shown'
  | 'history_opened'
  | 'history_purchased';

const INSTALL_ID_KEY = 'seatime_install_id';
let installId: Promise<string> | null = null;

function getInstallId(): Promise<string> {
  if (!installId) {
    installId = (async () => {
      try {
        const existing = await AsyncStorage.getItem(INSTALL_ID_KEY);
        if (existing) return existing;
      } catch {}
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      try { await AsyncStorage.setItem(INSTALL_ID_KEY, id); } catch {}
      return id;
    })();
  }
  return installId;
}

export function trackEvent(event: AppEvent, detail?: string | number): void {
  if (!BACKEND_URL) return;
  getInstallId()
    .then((install_id) =>
      fetch(`${BACKEND_URL}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          install_id,
          platform: Platform.OS,
          app_version: Constants.expoConfig?.version || undefined,
          detail: detail === undefined ? undefined : String(detail),
        }),
      })
    )
    .catch(() => {});
}
