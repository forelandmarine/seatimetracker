/**
 * Subscription utility functions for managing subscription states and checks
 */

/**
 * Check if a subscription is currently active
 * @param subscriptionStatus - The subscription status ('active', 'inactive', 'trial', 'expired')
 * @param expirationDate - The expiration date of the subscription
 * @returns boolean indicating if subscription is active
 */
export function isSubscriptionActive(
  subscriptionStatus: string | undefined,
  expirationDate: Date | null
): boolean {
  const status = subscriptionStatus || 'inactive';

  // Trial and active subscriptions are considered active
  const isActiveStatus = status === 'active' || status === 'trial';

  if (!isActiveStatus) {
    return false;
  }

  // If there's an expiration date, verify it's in the future
  if (expirationDate) {
    try {
      const expiryDate = new Date(expirationDate);
      if (isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

/**
 * Safely parse a date value that could be Date | string | number | null
 * Never throws - always returns Date | null
 */
export function safeParseDateValue(value: any): Date | null {
  try {
    if (value === null || value === undefined) {
      return null;
    }

    // If already a Date object, validate it
    if (value instanceof Date) {
      if (!isNaN(value.getTime())) {
        return value;
      }
      return null;
    }

    // Try to parse as new Date
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Format subscription status for API responses
 */
export function formatSubscriptionStatus(
  rawStatus: string | undefined,
  expirationDate: Date | null,
  trialEndDate: Date | null
): "active" | "inactive" | "trial" | "expired" {
  const status = rawStatus || 'inactive';

  // Check trial status first
  if (status === 'trial' && trialEndDate) {
    try {
      const trialEnd = new Date(trialEndDate);
      if (!isNaN(trialEnd.getTime()) && trialEnd > new Date()) {
        return 'trial';
      }
    } catch {
      // Fall through
    }
  }

  // Check active status
  if (status === 'active' && expirationDate) {
    try {
      const expiry = new Date(expirationDate);
      if (!isNaN(expiry.getTime()) && expiry > new Date()) {
        return 'active';
      }
    } catch {
      // Fall through
    }
  }

  // Check expired status
  if (status === 'expired') {
    return 'expired';
  }

  return 'inactive';
}
