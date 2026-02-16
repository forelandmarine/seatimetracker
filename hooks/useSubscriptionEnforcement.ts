
import { useCallback, useState, useEffect } from 'react';
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
 * const { requireSubscription, showSubscriptionPrompt, subscriptionPromptProps } = useSubscriptionEnforcement();
 * 
 * // Before performing a premium action:
 * if (!requireSubscription('vessel activation')) return;
 * // ... perform action
 * 
 * // In your component JSX:
 * <SubscriptionPromptModal {...subscriptionPromptProps} />
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
  const [promptVisible, setPromptVisible] = useState(false);
  const [promptFeatureName, setPromptFeatureName] = useState<string>('this feature');
  const [promptMessage, setPromptMessage] = useState<string | undefined>(undefined);

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
   * Show the subscription prompt modal
   */
  const showSubscriptionPrompt = useCallback((featureName?: string, customMessage?: string) => {
    console.log('[SubscriptionEnforcement] Showing subscription prompt for:', featureName || 'feature');
    setPromptFeatureName(featureName || 'this feature');
    setPromptMessage(customMessage);
    setPromptVisible(true);
  }, []);

  /**
   * Hide the subscription prompt modal
   */
  const hideSubscriptionPrompt = useCallback(() => {
    console.log('[SubscriptionEnforcement] Hiding subscription prompt');
    setPromptVisible(false);
    setPromptMessage(undefined);
  }, []);

  /**
   * Check if user has an active subscription
   * If not, show modal and return false
   * Returns true if subscription is active
   */
  const requireSubscription = useCallback((featureName?: string, customMessage?: string): boolean => {
    if (hasActiveSubscription) {
      return true;
    }

    console.log('[SubscriptionEnforcement] Subscription required for:', featureName || 'this feature');
    console.log('[SubscriptionEnforcement] Current status:', subscriptionStatus.status);

    showSubscriptionPrompt(featureName, customMessage);
    return false;
  }, [hasActiveSubscription, subscriptionStatus, showSubscriptionPrompt]);

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

    // Show subscription prompt
    showSubscriptionPrompt(
      undefined,
      'Your subscription has expired or is inactive. Please renew your subscription to continue using this feature.'
    );

    return true;
  }, [checkSubscription, showSubscriptionPrompt]);

  /**
   * Check if user has an active subscription without showing prompt
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
    showSubscriptionPrompt,
    hideSubscriptionPrompt,
    subscriptionPromptProps: {
      visible: promptVisible,
      onClose: hideSubscriptionPrompt,
      featureName: promptFeatureName,
      message: promptMessage,
    },
  };
}
