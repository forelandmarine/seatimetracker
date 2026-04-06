/**
 * Dev-only logger.
 *
 * In production builds (__DEV__ === false) all calls except `error` are no-ops.
 * This eliminates the I/O overhead of ~300+ console.log calls that slow
 * rendering on lower-end devices and clutter the system log.
 *
 * Usage:
 *   import { log, warn, error } from '@/utils/log';
 *   log('[Auth] Token stored');          // silent in production
 *   error('[Auth] Token write failed');  // always logged
 */

/* eslint-disable no-console */
const noop = (..._args: any[]) => {};

export const log: typeof console.log = __DEV__ ? console.log : noop;
export const warn: typeof console.warn = __DEV__ ? console.warn : noop;
export const error: typeof console.error = console.error; // always log errors
