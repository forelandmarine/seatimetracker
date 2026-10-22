import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { log, error as logError } from '@/utils/log';

/**
 * Store review requests, kept inside Apple's and Google's rules:
 * - Only the native sheet (SKStoreReviewController / Play In-App Review) is used. It has its
 *   own Submit and Not Now buttons, so there is no custom pre-prompt or "do you like it?" question.
 * - Never fired from a button tap; it runs on the Home screen when nothing else is open.
 * - First asked a week after purchase, then again every week. The OS decides whether the
 *   sheet actually appears: it stops once the user has reviewed and caps how often it shows
 *   (Apple: 3 times a year), so asking weekly never nags past those limits.
 * Users can also leave a review any time from Settings (openWriteReview in utils/storeLinks).
 *
 * Testing: iOS shows the sheet every time in development, never in TestFlight. Android
 * shows it only for builds installed from Play (internal testing track works).
 */

const LAST_ASKED_KEY = 'review_prompt_last_asked_at';

export const REVIEW_AFTER_PURCHASE_MS = 7 * 24 * 60 * 60 * 1000;
export const REVIEW_EVERY_MS = 7 * 24 * 60 * 60 * 1000;

/** A week after purchase, and a week since the last ask. */
export function isReviewDue(purchasedAt: Date | null, lastAskedAt: number | null, now: number): boolean {
  if (!purchasedAt || isNaN(purchasedAt.getTime())) return false;
  if (now - purchasedAt.getTime() < REVIEW_AFTER_PURCHASE_MS) return false;
  return !lastAskedAt || now - lastAskedAt >= REVIEW_EVERY_MS;
}

export async function isReviewDueFor(userId: string, purchasedAt: Date | null): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const raw = await AsyncStorage.getItem(`${LAST_ASKED_KEY}:${userId}`);
  return isReviewDue(purchasedAt, raw ? parseInt(raw, 10) || null : null, Date.now());
}

/** Ask the OS for its review sheet if one is due. Records the ask either way. */
export async function maybeRequestReview(userId: string, purchasedAt: Date | null): Promise<void> {
  try {
    if (!(await isReviewDueFor(userId, purchasedAt))) return;
    if (!(await StoreReview.isAvailableAsync())) return;

    log('[reviewPrompt] requesting review');
    await AsyncStorage.setItem(`${LAST_ASKED_KEY}:${userId}`, String(Date.now()));
    await StoreReview.requestReview();
  } catch (err) {
    logError('[reviewPrompt] maybeRequestReview failed', err);
  }
}
