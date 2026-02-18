
import { useCallback, useState, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { authenticatedGet, authenticatedPatch } from '@/utils/api';

interface SubscriptionStatus {
  status: 'active' | 'inactive' | 'trial' | 'expired';
  expiresAt: string | null;
  productId: string | null;
  isTrialActive: boolean;
}

/**
 * Hook to enforce subscription requirements for premium features
 * 
 * Usage:
 * const { requireSubscription, handleSubscriptionError } = useSubscriptionEnforcement();
 * 
 * // Before performing a premium action:
 * if (!requireSubscription()) return;
 * // ... perform action
 * 
 * // Or handle API errors:
 * try {
 *   await apiCall();
 * } catch (error) {
 *   if (handleSubscriptionError(error)) return;
 *   // Handle other errors
 * }
 */
export function useSubscriptionEnforcement() {
  const router = useRouter();
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>({
    status: 'inactive',
    expiresAt: null,
    productId: null,
    isTrialActive: false,
  });
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);

  // Check subscription status on mount
  useEffect(() => {
    checkSubscription();
  }, []);

  const checkSubscription = useCallback(async () => {
    try {
      const response = await authenticatedGet<SubscriptionStatus>('/api/subscription/status');
      setSubscriptionStatus(response);
      setHasActiveSubscription(response.status === 'active' || response.status === 'trial');
    } catch (error: any) {
      console.error('[SubscriptionEnforcement] Failed to check subscription:', error);
      setHasActiveSubscription(false);
    }
  }, []);

  /**
   * Check if user has an active subscription
   * If not, show alert and redirect to subscription management
   * Returns true if subscription is active, false otherwise
   */
  const requireSubscription = useCallback((featureName?: string): boolean => {
    if (hasActiveSubscription) {
      return true;
    }

    console.log('[SubscriptionEnforcement] Subscription required for:', featureName || 'this feature');
    console.log('[SubscriptionEnforcement] Current status:', subscriptionStatus.status);

    const featureText = featureName ? ` ${featureName}` : ' this feature';
    
    Alert.alert(
      'Subscription Required',
      `An active subscription is required to use${featureText}. Please subscribe to continue tracking your sea time.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Learn More',
          onPress: () => {
            console.log('[SubscriptionEnforcement] User wants to learn more about subscriptions');
            // User can contact support or check subscription status
          },
        },
      ]
    );

    return false;
  }, [hasActiveSubscription, subscriptionStatus]);

  /**
   * Handle subscription-related API errors (403 SUBSCRIPTION_REQUIRED)
   * Returns true if error was handled, false if it should be handled elsewhere
   */
  const handleSubscriptionError = useCallback((error: any): boolean => {
    // Check if error is a subscription error (403 with SUBSCRIPTION_REQUIRED code)
    const errorMessage = error?.message || error?.toString() || '';
    const isSubscriptionError = 
      errorMessage.includes('403') || 
      errorMessage.includes('SUBSCRIPTION_REQUIRED') ||
      errorMessage.includes('PAYMENT_REQUIRED') ||
      errorMessage.includes('Active subscription required');

    if (!isSubscriptionError) {
      return false;
    }

    console.log('[SubscriptionEnforcement] Subscription error detected:', errorMessage);
    
    // Refresh subscription status
    checkSubscription().catch((err) => {
      console.error('[SubscriptionEnforcement] Failed to refresh subscription:', err);
    });

    // Show subscription required alert
    Alert.alert(
      'Subscription Required',
      'Your subscription has expired or is inactive. Please renew your subscription to continue using this feature.',
      [
        {
          text: 'OK',
          style: 'cancel',
        },
      ]
    );

    return true;
  }, [checkSubscription]);

  /**
   * Check if user has an active subscription without showing alert
   * Returns true if subscription is active, false otherwise
   */
  const hasSubscription = useCallback((): boolean => {
    return hasActiveSubscription;
  }, [hasActiveSubscription]);

  /**
   * Pause all vessel tracking when subscription becomes inactive
   */
  const pauseTracking = useCallback(async (): Promise<boolean> => {
    try {
      console.log('[SubscriptionEnforcement] Pausing vessel tracking');
      
      const response = await authenticatedPatch<{ success: boolean; vesselsDeactivated: number }>(
        '/api/subscription/pause-tracking',
        {}
      );
      
      console.log('[SubscriptionEnforcement] Tracking paused:', response);
      return response.success;
    } catch (error: any) {
      console.error('[SubscriptionEnforcement] Failed to pause tracking:', error);
      return false;
    }
  }, []);

  return {
    requireSubscription,
    handleSubscriptionError,
    hasSubscription,
    pauseTracking,
    subscriptionStatus,
    checkSubscription,
  };
}
