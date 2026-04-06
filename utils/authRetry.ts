/**
 * Auth Retry Utility
 *
 * Provides automatic retry with exponential backoff for auth operations.
 * Only retries on server errors (5xx) and network failures — never on
 * client errors (4xx) like wrong password or email already exists.
 */

import { BACKEND_URL } from '@/utils/api';

const RETRY_DELAYS_MS = [1000, 2000, 4000]; // 3 retries: 1s, 2s, 4s

/**
 * Determines whether an error is retryable (server/network) vs. a definitive
 * client error (wrong credentials, validation, etc.) that should surface immediately.
 */
export function isRetryableError(error: any): boolean {
  const msg: string = error?.message || '';

  // Never retry on explicit 4xx client errors
  const clientErrorPatterns = [
    'Invalid email or password',
    'already exists',
    'already registered',
    'Email already',
    'No account found',
    'Password must',
    'invalid email',
    'invalid password',
    'User not found',
    'Unauthorized',
    '401',
    '403',
    '404',
    '422',
    'No session token received',
    'Invalid identity token',
    'Backend not configured',
    'Authentication in progress',
    'Please wait',
  ];

  for (const pattern of clientErrorPatterns) {
    if (msg.toLowerCase().includes(pattern.toLowerCase())) {
      console.log('[AuthRetry] Non-retryable client error detected:', pattern);
      return false;
    }
  }

  // Retry on network errors
  if (
    error?.name === 'AbortError' ||
    error?.name === 'TypeError' ||
    msg.includes('Network') ||
    msg.includes('network') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('fetch failed')
  ) {
    console.log('[AuthRetry] Retryable network error:', msg);
    return true;
  }

  // Retry on server errors (5xx patterns in message)
  if (
    msg.includes('Server error') ||
    msg.includes('server error') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('initializing') ||
    msg.includes('temporarily unavailable') ||
    msg.includes('connectivity issues') ||
    msg.includes('Connect Timeout') ||
    msg.includes('UND_ERR') ||
    msg.includes('internal error') ||
    msg.includes('database is being set up') ||
    msg.includes('service may be')
  ) {
    console.log('[AuthRetry] Retryable server error:', msg);
    return true;
  }

  // Default: do not retry unknown errors
  console.log('[AuthRetry] Unknown error — not retrying:', msg);
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
        console.log(`[AuthRetry] [${label}] Retry attempt ${attempt}/${RETRY_DELAYS_MS.length}...`);
      }

      const result = await operation();

      if (attempt > 0) {
        console.log(`[AuthRetry] [${label}] Succeeded on retry attempt ${attempt}`);
      }

      return result;
    } catch (error: any) {
      lastError = error;

      console.error(`[AuthRetry] [${label}] Attempt ${attempt + 1} failed:`, error?.message);

      // If this is a client error, surface it immediately — no retry
      if (!isRetryableError(error)) {
        console.log(`[AuthRetry] [${label}] Client error — surfacing immediately`);
        throw error;
      }

      // If we've exhausted all retries, throw the final error
      if (attempt >= RETRY_DELAYS_MS.length) {
        console.error(`[AuthRetry] [${label}] All ${RETRY_DELAYS_MS.length} retries exhausted`);
        break;
      }

      // Wait before next retry
      const delay = RETRY_DELAYS_MS[attempt];
      console.log(`[AuthRetry] [${label}] Waiting ${delay}ms before retry ${attempt + 1}...`);
      await sleep(delay);
    }
  }

  // All retries exhausted — throw a user-friendly connection error
  console.error(`[AuthRetry] [${label}] All retries failed. Last error:`, lastError?.message);
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
  console.log('[AuthRetry] Firing warm-up ping to:', url);

  fetch(url, { method: 'GET' }).catch(() => {
    // Silently ignore — this is best-effort only
    console.log('[AuthRetry] Warm-up ping failed (non-fatal)');
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
