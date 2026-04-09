/**
 * Sentry crash reporting initialisation for the backend.
 *
 * To enable:
 * 1. Run `npm install @sentry/node` in /backend
 * 2. Set SENTRY_DSN in Railway environment variables
 * 3. The init function below will be called automatically on app startup
 *
 * This file is safe to import even if Sentry is not installed — it lazy-loads
 * the package and silently no-ops when missing or unconfigured.
 */

const SENTRY_DSN = process.env.SENTRY_DSN;
const NODE_ENV = process.env.NODE_ENV || "development";

let initialized = false;

export async function initSentry(): Promise<void> {
  if (initialized) return;
  if (!SENTRY_DSN) {
    console.log("[Sentry] No DSN configured, skipping init");
    return;
  }

  try {
    // Lazy import — only loads if package is installed
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: NODE_ENV,
      tracesSampleRate: NODE_ENV === "production" ? 0.1 : 0,
      release: process.env.RAILWAY_GIT_COMMIT_SHA
        ? `seatimetracker@${process.env.RAILWAY_GIT_COMMIT_SHA}`
        : undefined,
    });
    initialized = true;
    console.log("[Sentry] Initialized");
  } catch (err) {
    console.warn("[Sentry] Init failed (package may not be installed):", err);
  }
}

export async function captureException(
  error: unknown,
  context?: Record<string, unknown>
): Promise<void> {
  if (!initialized) return;
  try {
    const Sentry = await import("@sentry/node");
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // silent fail
  }
}
