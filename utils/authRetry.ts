/**
 * Auth Retry Utility
 *
 * Provides automatic retry with exponential backoff for auth operations.
 * Only retries on server errors (5xx) and network failures — never on
 * client errors (4xx) like wrong password or email already exists.
 */

import { BACKEND_URL } from '@/utils/api';
import { log, error } from '@/utils/log';
import { isRetryableCode, CLIENT_ERROR_CODES } from '@/utils/errorCodes';

const RETRY_DELAYS_MS = [500, 1500]; // 2 retries: 0.5s, 1.5s — fail faster to reduce perceived loading time

/**
 * Determines whether an error is retryable (server/network) vs. a definitive
 * client error (wrong credentials, validation, etc.) that should surface immediately.
 *
 * Prefers error codes when available, falls back to heuristics for network errors.
 */
export function isRetryableError(err: any): boolean {
  // If the error carries a code from our backend, use it directly
  const code: string | undefined = err?.code;
  if (code) {
    if (CLIENT_ERROR_CODES.has(code)) return false;
    if (isRetryableCode(code)) return true;
  }

  // Network-level errors (no code available — these are fetch/transport failures)
  if (err?.name === 'AbortError' || err?.name === 'TypeError') return true;

  const msg: string = err?.message || '';
  if (/network|timed out|timeout|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(msg)) return true;
  if (/server error|5\d{2}|temporarily unavailable|connectivity issues|Connect Timeout|UND_ERR|initializing/i.test(msg)) return true;

  // Default: do not retry unknown errors
  return false;
}

/**
 * Wraps an async auth operation with automatic exponential-backoff retry.
 * Retries silently (no UI feedback between attempts) up to 3 times.
 * Only retries on server/network errors; client errors surface immediately.
 *
 * @param operation - The async function to execute (and retry if needed)
 * @param label     - Human-readable label for logging (e.g. 'signIn', 'signUp')
 */
export async function withAuthRetry<T>(
  operation: () => Promise<T>,
  label: string
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      if (attempt > 0) {
        log(`[AuthRetry] [${label}] Retry ${attempt}/${RETRY_DELAYS_MS.length}`);
      }

      const result = await operation();

      if (attempt > 0) {
        log(`[AuthRetry] [${label}] Succeeded on retry ${attempt}`);
      }

      return result;
    } catch (err: any) {
      lastError = err;

      error(`[AuthRetry] [${label}] Attempt ${attempt + 1} failed:`, err?.message);

      // If this is a client error, surface it immediately — no retry
      if (!isRetryableError(err)) {
        throw err;
      }

      // If we've exhausted all retries, throw the final error
      if (attempt >= RETRY_DELAYS_MS.length) {
        error(`[AuthRetry] [${label}] All ${RETRY_DELAYS_MS.length} retries exhausted`);
        break;
      }

      // Wait before next retry
      const delay = RETRY_DELAYS_MS[attempt];
      await sleep(delay);
    }
  }

  // All retries exhausted — throw a user-friendly connection error
  throw new Error(
    'Having trouble connecting. Please check your connection and try again.'
  );
}

/**
 * Fire-and-forget warm-up ping to wake the server before auth attempts.
 * Does NOT block — errors are silently swallowed.
 */
export function warmUpServer(): void {
  if (!BACKEND_URL) return;

  const url = `${BACKEND_URL}/api/health`;

  fetch(url, { method: 'GET' }).catch(() => {
    // Silently ignore — this is best-effort only
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
