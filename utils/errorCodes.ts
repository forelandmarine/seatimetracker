/**
 * Shared error codes returned by the backend.
 *
 * The backend includes a `code` field in every error JSON response.
 * The frontend uses these codes instead of string-matching error messages.
 */

// --- Retryable (server/network) ---
export const RETRYABLE_CODES = new Set([
  'NETWORK_ERROR',
  'TIMEOUT',
  'SERVER_ERROR',
  'SERVICE_UNAVAILABLE',
  'CONNECT_TIMEOUT',
  'DATABASE_INITIALIZING',
]);

// --- Non-retryable (client) ---
export const CLIENT_ERROR_CODES = new Set([
  'INVALID_CREDENTIALS',
  'USER_NOT_FOUND',
  'EMAIL_EXISTS',
  'INVALID_TOKEN',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'VALIDATION_ERROR',
  'AUTH_IN_PROGRESS',
  'BACKEND_NOT_CONFIGURED',
]);

// --- User-facing messages keyed by error code ---
export const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Invalid email or password. Please check your credentials and try again.',
  USER_NOT_FOUND: 'No account found with that email address. Please sign up first.',
  EMAIL_EXISTS: 'An account with this email already exists. Please sign in instead.',
  INVALID_TOKEN: 'Your session has expired. Please sign in again.',
  UNAUTHORIZED: 'You are not authorized. Please sign in.',
  SERVER_ERROR: 'Server error. Please try again in a moment.',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable. Please try again shortly.',
  CONNECT_TIMEOUT: 'The server is experiencing connectivity issues. Please try again in a few moments.',
  DATABASE_INITIALIZING: 'The server is starting up. Please try again in a few moments.',
  NETWORK_ERROR: 'Cannot connect to server. Please check your internet connection.',
  TIMEOUT: 'Request timed out. Please check your internet connection and try again.',
};

/** Check whether an error code is retryable. */
export function isRetryableCode(code: string | undefined): boolean {
  return !!code && RETRYABLE_CODES.has(code);
}

/** Get a user-facing message for an error code, with a fallback. */
export function messageForCode(code: string | undefined, fallback?: string): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return fallback || 'Something went wrong. Please try again.';
}
