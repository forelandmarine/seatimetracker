
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Platform } from 'react-native';
import Purchases, { 
  CustomerInfo, 
  PurchasesPackage,
  LOG_LEVEL 
} from 'react-native-purchases';
import { useAuth } from './AuthContext';
import { BACKEND_URL } from '@/utils/api';

// RevenueCat API Keys
const REVENUECAT_API_KEY_IOS = 'test_gKMHKEpYSkTiLUtgKWHRbAXGcGd'; // Sandbox test key
const REVENUECAT_API_KEY_ANDROID = 'test_gKMHKEpYSkTiLUtgKWHRbAXGcGd'; // Same for Android

// Product identifier
const PRO_MONTHLY_PRODUCT_ID = 'pro_monthly_15';

interface SubscriptionContextType {
  isSubscribed: boolean;
  isLoading: boolean;
  customerInfo: CustomerInfo | null;
  availablePackages: PurchasesPackage[];
  purchasePackage: (pkg: PurchasesPackage) => Promise<{ customerInfo: CustomerInfo; success: boolean }>;
  restorePurchases: () => Promise<CustomerInfo>;
  checkSubscriptionStatus: () => Promise<void>;
  error: string | null;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [availablePackages, setAvailablePackages] = useState<PurchasesPackage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize RevenueCat SDK
  useEffect(() => {
    const initializeRevenueCat = async () => {
      if (isInitialized) {
        console.log('[Subscription] Already initialized, skipping');
        return;
      }

      try {
        console.log('[Subscription] Initializing RevenueCat SDK...');
        console.log('[Subscription] Platform:', Platform.OS);
        console.log('[Subscription] User authenticated:', isAuthenticated);
        console.log('[Subscription] User ID:', user?.id);

        // Configure SDK
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);

        // Use the appropriate API key for the platform
        const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;
        
        console.log('[Subscription] Configuring with API key:', apiKey.substring(0, 10) + '...');
        
        await Purchases.configure({
          apiKey,
          appUserID: user?.id || undefined, // Use user ID if authenticated
        });

        console.log('[Subscription] RevenueCat SDK configured successfully');
        setIsInitialized(true);

        // Fetch available packages
        try {
          console.log('[Subscription] Fetching available offerings...');
          const offerings = await Purchases.getOfferings();
          
          if (offerings.current && offerings.current.availablePackages.length > 0) {
            console.log('[Subscription] Found', offerings.current.availablePackages.length, 'packages');
            setAvailablePackages(offerings.current.availablePackages);
          } else {
            console.warn('[Subscription] No packages available in current offering');
            setAvailablePackages([]);
          }
        } catch (offeringsError: any) {
          console.error('[Subscription] Failed to fetch offerings:', offeringsError);
          setError('Failed to load subscription options');
        }

        // Check initial subscription status
        await checkSubscriptionStatusInternal();

      } catch (initError: any) {
        console.error('[Subscription] Failed to initialize RevenueCat:', initError);
        console.error('[Subscription] Error details:', initError.message, initError.code);
        setError('Failed to initialize subscription system');
        setIsLoading(false);
      }
    };

    // Only initialize if user is authenticated
    if (isAuthenticated && user?.id) {
      initializeRevenueCat();
    } else {
      console.log('[Subscription] User not authenticated, skipping initialization');
      setIsLoading(false);
    }
  }, [isAuthenticated, user?.id, isInitialized]);

  // Internal function to check subscription status
  const checkSubscriptionStatusInternal = async () => {
    try {
      console.log('[Subscription] Checking subscription status...');
      
      const info = await Purchases.getCustomerInfo();
      console.log('[Subscription] Customer info received');
      console.log('[Subscription] Active entitlements:', Object.keys(info.entitlements.active));
      console.log('[Subscription] Active subscriptions:', Object.keys(info.activeSubscriptions));
      
      setCustomerInfo(info);

      // Check if user has any active entitlements
      const hasActiveEntitlement = Object.keys(info.entitlements.active).length > 0;
      
      // Also check for the specific product ID
      const hasProMonthly = info.activeSubscriptions.includes(PRO_MONTHLY_PRODUCT_ID);
      
      const subscribed = hasActiveEntitlement || hasProMonthly;
      
      console.log('[Subscription] Has active entitlement:', hasActiveEntitlement);
      console.log('[Subscription] Has pro_monthly_15:', hasProMonthly);
      console.log('[Subscription] Final subscription status:', subscribed);
      
      setIsSubscribed(subscribed);

      // Sync with backend if user is authenticated
      if (isAuthenticated && BACKEND_URL) {
        try {
          console.log('[Subscription] Syncing status with backend...');
          const token = await getAuthToken();
          
          if (token) {
            await fetch(`${BACKEND_URL}/api/subscription/sync`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                customerId: info.originalAppUserId,
              }),
            });
            console.log('[Subscription] Backend sync completed');
          }
        } catch (syncError: any) {
          console.error('[Subscription] Failed to sync with backend (non-critical):', syncError);
        }
      }

      setIsLoading(false);
    } catch (statusError: any) {
      console.error('[Subscription] Failed to check subscription status:', statusError);
      setIsSubscribed(false);
      setIsLoading(false);
    }
  };

  // Public function to check subscription status
  const checkSubscriptionStatus = useCallback(async () => {
    if (!isInitialized) {
      console.warn('[Subscription] SDK not initialized, cannot check status');
      return;
    }
    await checkSubscriptionStatusInternal();
  }, [isInitialized, isAuthenticated]);

  // Helper to get auth token
  const getAuthToken = async (): Promise<string | null> => {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem('seatime_auth_token');
      }
      
      const SecureStore = await import('expo-secure-store');
      return await SecureStore.getItemAsync('seatime_auth_token');
    } catch (error) {
      console.error('[Subscription] Failed to get auth token:', error);
      return null;
    }
  };

  // Purchase a package
  const purchasePackage = useCallback(async (pkg: PurchasesPackage) => {
    if (!isInitialized) {
      throw new Error('Subscription system not initialized');
    }

    try {
      console.log('[Subscription] Purchasing package:', pkg.identifier);
      setError(null);
      
      const { customerInfo: info } = await Purchases.purchasePackage(pkg);
      
      console.log('[Subscription] Purchase successful');
      console.log('[Subscription] Active entitlements:', Object.keys(info.entitlements.active));
      
      setCustomerInfo(info);
      
      // Check if purchase was successful
      const hasActiveEntitlement = Object.keys(info.entitlements.active).length > 0;
      const hasProMonthly = info.activeSubscriptions.includes(PRO_MONTHLY_PRODUCT_ID);
      const subscribed = hasActiveEntitlement || hasProMonthly;
      
      setIsSubscribed(subscribed);

      // Sync with backend
      if (isAuthenticated && BACKEND_URL) {
        try {
          const token = await getAuthToken();
          
          if (token) {
            await fetch(`${BACKEND_URL}/api/subscription/sync`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                customerId: info.originalAppUserId,
              }),
            });
          }
        } catch (syncError: any) {
          console.error('[Subscription] Failed to sync purchase with backend (non-critical):', syncError);
        }
      }

      return { customerInfo: info, success: subscribed };
    } catch (purchaseError: any) {
      console.error('[Subscription] Purchase failed:', purchaseError);
      
      // Handle user cancellation gracefully
      if (purchaseError.userCancelled) {
        console.log('[Subscription] User cancelled purchase');
        throw new Error('Purchase cancelled');
      }
      
      setError(purchaseError.message || 'Purchase failed');
      throw purchaseError;
    }
  }, [isInitialized, isAuthenticated]);

  // Restore purchases
  const restorePurchases = useCallback(async () => {
    if (!isInitialized) {
      throw new Error('Subscription system not initialized');
    }

    try {
      console.log('[Subscription] Restoring purchases...');
      setError(null);
      
      const info = await Purchases.restorePurchases();
      
      console.log('[Subscription] Purchases restored');
      console.log('[Subscription] Active entitlements:', Object.keys(info.entitlements.active));
      
      setCustomerInfo(info);
      
      const hasActiveEntitlement = Object.keys(info.entitlements.active).length > 0;
      const hasProMonthly = info.activeSubscriptions.includes(PRO_MONTHLY_PRODUCT_ID);
      const subscribed = hasActiveEntitlement || hasProMonthly;
      
      setIsSubscribed(subscribed);

      // Sync with backend
      if (isAuthenticated && BACKEND_URL) {
        try {
          const token = await getAuthToken();
          
          if (token) {
            await fetch(`${BACKEND_URL}/api/subscription/sync`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                customerId: info.originalAppUserId,
              }),
            });
          }
        } catch (syncError: any) {
          console.error('[Subscription] Failed to sync restore with backend (non-critical):', syncError);
        }
      }

      return info;
    } catch (restoreError: any) {
      console.error('[Subscription] Restore failed:', restoreError);
      setError(restoreError.message || 'Failed to restore purchases');
      throw restoreError;
    }
  }, [isInitialized, isAuthenticated]);

  // Pause tracking when subscription is inactive
  useEffect(() => {
    const pauseTrackingIfNeeded = async () => {
      if (!isAuthenticated || isLoading) {
        return;
      }

      if (!isSubscribed && BACKEND_URL) {
        try {
          console.log('[Subscription] User not subscribed, pausing vessel tracking...');
          const token = await getAuthToken();
          
          if (token) {
            const response = await fetch(`${BACKEND_URL}/api/subscription/pause-tracking`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({}),
            });

            if (response.ok) {
              const data = await response.json();
              console.log('[Subscription] Tracking paused, vessels deactivated:', data.vesselsDeactivated);
            }
          }
        } catch (pauseError: any) {
          console.error('[Subscription] Failed to pause tracking (non-critical):', pauseError);
        }
      }
    };

    pauseTrackingIfNeeded();
  }, [isSubscribed, isAuthenticated, isLoading]);

  return (
    <SubscriptionContext.Provider
      value={{
        isSubscribed,
        isLoading,
        customerInfo,
        availablePackages,
        purchasePackage,
        restorePurchases,
        checkSubscriptionStatus,
        error,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
