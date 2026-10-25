import Constants from 'expo-constants';
import type { CustomerInfo } from 'react-native-purchases';

const PRO_ENTITLEMENT_ID = Constants.expoConfig?.extra?.revenueCatEntitlementId || 'pro';

/** A lapsed plan is only asked about for this long after it ended. */
const LAPSED_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

export type ExitTrigger = 'cancelled' | 'lapsed';

export interface ExitSurveyCandidate {
  /** One survey per paid/trial period: the same key before and after it lapses. */
  key: string;
  trigger: ExitTrigger;
  periodType: string;
  productId: string;
  expiresAt: string | null;
  isTrial: boolean;
}

/**
 * The cancellation to ask about, if any.
 * 'cancelled': still active but auto-renew turned off (not a billing problem).
 * 'lapsed': the plan ended within the last 60 days.
 * Promotional (granted) access is never asked about.
 */
export function exitSurveyCandidate(
  info: CustomerInfo | null,
  trigger: ExitTrigger,
  now: number = Date.now()
): ExitSurveyCandidate | null {
  const ent = info?.entitlements.all[PRO_ENTITLEMENT_ID];
  if (!ent || ent.store === 'PROMOTIONAL' || !ent.expirationDate) return null;

  if (trigger === 'cancelled') {
    if (!ent.isActive || ent.willRenew || ent.billingIssueDetectedAt) return null;
  } else {
    if (ent.isActive) return null;
    const endedAt = new Date(ent.expirationDate).getTime();
    if (isNaN(endedAt) || now - endedAt > LAPSED_WINDOW_MS) return null;
  }

  const periodType = String(ent.periodType || 'NORMAL').toLowerCase();
  return {
    key: `${ent.productIdentifier}:${ent.expirationDate}`,
    trigger,
    periodType,
    productId: ent.productIdentifier,
    expiresAt: ent.expirationDate,
    isTrial: periodType === 'trial',
  };
}

/** When the active pro plan was first bought (or its trial started). */
export function proPurchasedAt(info: CustomerInfo | null): Date | null {
  const ent = info?.entitlements.active[PRO_ENTITLEMENT_ID];
  return ent?.originalPurchaseDate ? new Date(ent.originalPurchaseDate) : null;
}
