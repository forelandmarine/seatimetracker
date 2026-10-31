/**
 * Referral rewards: pure decisions, kept apart from the RevenueCat calls in
 * services/referrals.ts so they can be tested.
 *
 * The rule (Dan, 2026-10-31): when a friend who signed up with a referral code
 * makes their first payment, both the friend and the referrer get a free month.
 *
 * How a month is given depends on what the person has on RevenueCat:
 * - a paid App Store subscription: Apple's renewal date is pushed back 30 days
 *   (RevenueCat "extend", reason Customer Satisfaction). Apple allows two of
 *   these a year per subscription and none during a free trial.
 * - a paid Google Play subscription: the next billing date is deferred 30 days.
 * - no store subscription (lapsed, never paid): a 30-day promotional "pro"
 *   entitlement, added after any promotional time they already have.
 * - in a free trial or with a billing problem: wait and try again later, since
 *   a month given then would be lost or refused.
 */

export const FREE_MONTH_DAYS = 30;
/** A new account can redeem a code for this long after signing up. */
export const REDEEM_WINDOW_DAYS = 14;
/** Most free months one referrer can earn in any 365 days. */
export const REFERRER_MAX_MONTHS_PER_YEAR = 12;
/** Give up retrying a failed grant after this many attempts (left for a manual look). */
export const MAX_GRANT_ATTEMPTS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const STORES = new Set(['app_store', 'play_store']);

export interface RcSubscription {
  expires_date?: string | null;
  purchase_date?: string | null;
  period_type?: string | null; // 'normal' | 'trial' | 'intro'
  store?: string | null; // 'app_store' | 'play_store' | 'promotional' | ...
  is_sandbox?: boolean | null;
  refunded_at?: string | null;
  billing_issues_detected_at?: string | null;
  store_transaction_id?: string | null;
}

export interface RcSubscriber {
  subscriptions?: Record<string, RcSubscription>;
  entitlements?: Record<string, { expires_date?: string | null; product_identifier?: string | null }>;
}

export type FreeMonthPlan =
  | { kind: 'apple_extend'; transactionId: string }
  | { kind: 'play_defer'; subscriptionId: string }
  | { kind: 'promo'; endTimeMs: number }
  | { kind: 'wait'; reason: string };

const storeSubs = (s: RcSubscriber, allowSandbox: boolean) =>
  Object.entries(s.subscriptions ?? {}).filter(
    ([, sub]) => STORES.has(sub.store ?? '') && (allowSandbox || !sub.is_sandbox) && !sub.refunded_at
  );

/**
 * True once the customer has paid for a store subscription period. RevenueCat
 * marks a period 'normal' only after the free trial has converted (or for a
 * purchase with no trial), so a trial that was cancelled never counts.
 */
export function hasPaid(s: RcSubscriber, allowSandbox = false): boolean {
  return storeSubs(s, allowSandbox).some(([, sub]) => sub.period_type === 'normal');
}

/** Decide how to give this customer a free month right now. */
export function planFreeMonth(s: RcSubscriber, now: Date, allowSandbox = false, entitlementId = 'pro'): FreeMonthPlan {
  const active = storeSubs(s, allowSandbox)
    .filter(([, sub]) => sub.expires_date && Date.parse(sub.expires_date) > now.getTime())
    .sort(([, a], [, b]) => Date.parse(b.expires_date!) - Date.parse(a.expires_date!));

  if (active.length) {
    const [productId, sub] = active[0];
    if (sub.period_type !== 'normal') return { kind: 'wait', reason: 'in_free_trial' };
    if (sub.billing_issues_detected_at) return { kind: 'wait', reason: 'billing_issue' };
    if (sub.store === 'app_store') {
      return sub.store_transaction_id
        ? { kind: 'apple_extend', transactionId: sub.store_transaction_id }
        : { kind: 'wait', reason: 'no_transaction_id' };
    }
    // Play product ids are "<subscription id>:<base plan>"; defer takes the subscription id.
    return { kind: 'play_defer', subscriptionId: productId.split(':')[0] };
  }

  // No live store subscription: promotional time, stacked after any they already have.
  const ent = s.entitlements?.[entitlementId];
  const promoEnd =
    ent?.product_identifier?.startsWith('rc_promo') && ent.expires_date ? Date.parse(ent.expires_date) : 0;
  const from = Math.max(now.getTime(), promoEnd);
  return { kind: 'promo', endTimeMs: from + FREE_MONTH_DAYS * DAY_MS };
}

/** Whether a new account may still redeem a code. */
export function canRedeem(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() <= REDEEM_WINDOW_DAYS * DAY_MS;
}
