/**
 * AIS history import purchases (one-off, per vessel) through RevenueCat.
 *
 * The products are fetched by id rather than through the current offering, so
 * the subscription paywall is unaffected. After the store charges, the purchase
 * is redeemed on our backend, which checks it with RevenueCat. If redeeming
 * fails (no signal, app closed), the purchase is remembered on the device and
 * redeemed on the next try: the backend can find an unredeemed purchase without
 * the transaction id.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases, { PRODUCT_CATEGORY, type PurchasesStoreProduct } from 'react-native-purchases';
import {
  redeemHistoryImport,
  type HistoryImport,
  type HistoryProductId,
  type HistoryRange,
} from '@/utils/seaTimeApi';
import { log, error as logError } from '@/utils/log';

export const HISTORY_PRODUCT_IDS: HistoryProductId[] = ['seatime_history_6m', 'seatime_history_12m'];

const PENDING_KEY = 'historyImport.pendingRedeem';
const PENDING_MAX_AGE_MS = 30 * 24 * 3_600_000;

interface PendingRedeem {
  vessel_id: string;
  product_id: HistoryProductId;
  ranges?: HistoryRange[]; // missing on purchases saved before periods existed
  transaction_id: string | null;
  saved_at: number;
}

/** Thrown when the store charged but our backend has not accepted the purchase yet. */
export class RedeemPendingError extends Error {}

/** Store products (with local prices) keyed by id. Missing ids are not on sale in this store. */
export async function getHistoryProducts(): Promise<Partial<Record<HistoryProductId, PurchasesStoreProduct>>> {
  const products = await Purchases.getProducts(HISTORY_PRODUCT_IDS, PRODUCT_CATEGORY.NON_SUBSCRIPTION);
  const out: Partial<Record<HistoryProductId, PurchasesStoreProduct>> = {};
  for (const p of products) {
    if ((HISTORY_PRODUCT_IDS as string[]).includes(p.identifier)) out[p.identifier as HistoryProductId] = p;
  }
  return out;
}

async function savePending(p: PendingRedeem | null) {
  try {
    if (p) await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else await AsyncStorage.removeItem(PENDING_KEY);
  } catch (e) {
    logError('[HistoryPurchase] Could not save pending redeem:', e);
  }
}

async function readPending(): Promise<PendingRedeem | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingRedeem) : null;
  } catch {
    return null;
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function redeemWithRetry(p: PendingRedeem, attempts = 3): Promise<HistoryImport> {
  let lastError: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await redeemHistoryImport({
        vessel_id: p.vessel_id,
        product_id: p.product_id,
        transaction_id: p.transaction_id,
        ranges: p.ranges ?? [],
        platform: Platform.OS,
      });
    } catch (e: any) {
      lastError = e;
      // Not worth retrying: refused for a reason that will not change.
      if (e?.status && [400, 403, 404, 409, 422].includes(e.status)) throw e;
      if (i < attempts - 1) await wait(2000 * (i + 1));
    }
  }
  throw lastError;
}

/**
 * Buy an import for a vessel and redeem it. Resolves with the queued import.
 * Throws an error with `userCancelled` when the user closes the store sheet,
 * or RedeemPendingError when the store charged but redeeming has to wait.
 */
export async function buyHistoryImport(params: {
  vesselId: string;
  product: PurchasesStoreProduct;
  ranges: HistoryRange[];
}): Promise<HistoryImport> {
  const pending: PendingRedeem = {
    vessel_id: params.vesselId,
    product_id: params.product.identifier as HistoryProductId,
    ranges: params.ranges,
    transaction_id: null,
    saved_at: Date.now(),
  };
  // Saved before paying, so a crash after the charge can still be redeemed.
  await savePending(pending);

  let transactionId: string | null = null;
  try {
    log('[HistoryPurchase] Buying', params.product.identifier, 'for vessel', params.vesselId);
    const result = await Purchases.purchaseStoreProduct(params.product);
    transactionId = result.transaction?.transactionIdentifier ?? null;
  } catch (e: any) {
    await savePending(null);
    throw e;
  }

  pending.transaction_id = transactionId;
  await savePending(pending);
  try {
    const created = await redeemWithRetry(pending);
    await savePending(null);
    return created;
  } catch (e) {
    logError('[HistoryPurchase] Paid but not redeemed yet:', e);
    throw new RedeemPendingError('Payment received; the import will start shortly.');
  }
}

/**
 * Redeem a purchase left over from an interrupted buy. Returns the import if one
 * was started, null if there was nothing to do.
 */
export async function resumePendingHistoryImport(): Promise<HistoryImport | null> {
  const pending = await readPending();
  if (!pending) return null;
  try {
    const created = await redeemWithRetry(pending, 1);
    await savePending(null);
    log('[HistoryPurchase] Redeemed pending purchase', created.id);
    return created;
  } catch (e: any) {
    // 402: no unredeemed purchase on the server (never charged, or already used).
    // 400: a request this app version can no longer send (e.g. saved before periods existed).
    if (e?.status === 402 || [400, 403, 404, 409, 422].includes(e?.status) || Date.now() - pending.saved_at > PENDING_MAX_AGE_MS) {
      await savePending(null);
    }
    return null;
  }
}
