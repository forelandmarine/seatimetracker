/**
 * Sentry crash reporting initialisation.
 *
 * To enable:
 * 1. Run `npm install @sentry/react-native` (or `npx expo install @sentry/react-native`)
 * 2. Create a project at https://sentry.io and copy the DSN
 * 3. Add SENTRY_DSN to app.json under expo.extra
 * 4. Wrap the root component with `Sentry.wrap(...)` in app/_layout.tsx
 *
 * This file is safe to import even if Sentry is not installed — it lazy-loads
 * the package and silently no-ops when missing.
 */

import Constants from 'expo-constants';

const SENTRY_DSN = Constants.expoConfig?.extra?.sentryDsn || process.env.EXPO_PUBLIC_SENTRY_DSN;
const APP_VERSION = Constants.expoConfig?.version || 'unknown';
const APP_BUILD =
  Constants.expoConfig?.ios?.buildNumber ||
  String(Constants.expoConfig?.android?.versionCode || 'unknown');

let initialized = false;

export async function initSentry(): Promise<void> {
  if (initialized) return;
  if (!SENTRY_DSN) {
    console.log('[Sentry] No DSN configured, skipping init');
    return;
  }

  try {
    // Lazy import — only loads if package is installed
    const Sentry = await import('@sentry/react-native');
    Sentry.init({
      dsn: SENTRY_DSN,
      release: `seatimetracker@${APP_VERSION}+${APP_BUILD}`,
      environment: __DEV__ ? 'development' : 'production',
      tracesSampleRate: __DEV__ ? 0 : 0.1,
      enableAutoSessionTracking: true,
      attachStacktrace: true,
      // Don't send events while running in Expo Go (they're noisy and irrelevant)
      enabled: Constants.appOwnership !== 'expo',
    });
    initialized = true;
    console.log('[Sentry] Initialized');
  } catch (err) {
    console.warn('[Sentry] Init failed (package may not be installed):', err);
  }
}

export async function captureException(error: unknown, context?: Record<string, unknown>): Promise<void> {
  if (!initialized) return;
  try {
    const Sentry = await import('@sentry/react-native');
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // Sentry not available — silent fail
  }
}

export async function setUser(user: { id?: string; email?: string } | null): Promise<void> {
  if (!initialized) return;
  try {
    const Sentry = await import('@sentry/react-native');
    Sentry.setUser(user);
  } catch {
    // Sentry not available — silent fail
  }
}
