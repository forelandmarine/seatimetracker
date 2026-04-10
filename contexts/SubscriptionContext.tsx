
import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  PurchasesPackage,
  LOG_LEVEL
} from 'react-native-purchases';
import { useAuth } from './AuthContext';
import { BACKEND_URL } from '@/utils/api';
import Constants from 'expo-constants';
import { log, warn, error as logError } from '@/utils/log';

// Environment detection
const isTestFlight = Constants.appOwnership === 'expo' ||
                     (Platform.OS === 'ios' && Constants.isDevice && !__DEV__);
const isDevelopment = __DEV__;
const isProduction = !isDevelopment && !isTestFlight;

// RevenueCat API Keys - Read from app.json extra config
const REVENUECAT_API_KEY_IOS = Constants.expoConfig?.extra?.revenueCatIosApiKey || 'appl_JGAVizuUPjFzvacGxciCepqaqAJ';
const REVENUECAT_API_KEY_ANDROID = Constants.expoConfig?.extra?.revenueCatAndroidApiKey || 'appl_JGAVizuUPjFzvacGxciCepqaqAJ';

// Product & entitlement identifiers — read from app.json config so they can
// change without a code update.
const PRO_ENTITLEMENT_ID = Constants.expoConfig?.extra?.revenueCatEntitlementId || 'pro';
const PRO_MONTHLY_PRODUCT_ID = 'com.subscription.monthly';

interface SubscriptionContextType {
  isSubscribed: boolean;
  isLoading: boolean;
  revenueCatFailed: boolean;
  customerInfo: CustomerInfo | null;
  availablePackages: PurchasesPackage[];
  purchasePackage: (pkg: PurchasesPackage) => Promise<{ customerInfo: CustomerInfo; success: boolean }>;
  restorePurchases: () => Promise<CustomerInfo>;
  checkSubscriptionStatus: () => Promise<void>;
  refreshOfferings: () => Promise<void>;
  error: string | null;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [revenueCatSubscribed, setRevenueCatSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [availablePackages, setAvailablePackages] = useState<PurchasesPackage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initializationFailed, setInitializationFailed] = useState(false);
  const [isStatusChecked, setIsStatusChecked] = useState(false);
  // Track the last user ID we initialised for, so we can re-initialise on
  // account switch (sign out → sign in with a different account).
  const [initializedForUserId, setInitializedForUserId] = useState<string | null>(null);

  // FIX 1: Idempotency guard — pause-tracking should fire at most once per
  // confirmed lapsed-subscription event. Reset when subscription becomes active.
  const hasPausedTracking = useRef(false);

  // Backend subscription expiry — used as fallback when RevenueCat is unavailable.
  const [backendSubscriptionActive, setBackendSubscriptionActive] = useState<boolean | null>(null);

  // When RevenueCat init fails, ask the backend whether the user's subscription
  // is still valid (based on subscription_expires_at stored in the DB).
  useEffect(() => {
    if (!initializationFailed || !isAuthenticated || !BACKEND_URL) return;

    (async () => {
      try {
        const { getToken } = await import('@/utils/tokenStorage');
        const token = await getToken();
        if (!token) return;

        const res = await fetch(`${BACKEND_URL}/api/subscription/status`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const active = data.status === 'active' || data.status === 'trial';
          setBackendSubscriptionActive(active);
        }
      } catch {
        // Network failure — leave as null (unknown)
      }
    })();
  }, [initializationFailed, isAuthenticated]);

  // Determine subscription status with 3-state fail-open logic:
  //  1. Test flag bypass
  //  2. RevenueCat SDK (primary source when available)
  //  3. Backend DB expiry (fallback when RevenueCat is unavailable)
  //  4. Unknown (RevenueCat failed AND backend unreachable) — fail open
  const isSubscribed = useMemo(() => {
    // Priority 1: Test subscription bypass (for testing)
    if (user?.testSubscriptionActive) {
      return true;
    }

    // Priority 2: RevenueCat is working — trust it
    if (!initializationFailed) {
      return revenueCatSubscribed;
    }

    // Priority 3: RevenueCat failed — use backend expiry as fallback
    if (backendSubscriptionActive !== null) {
      return backendSubscriptionActive;
    }

    // Priority 4: Both RevenueCat and backend are unreachable — fail open
    // so verified paying users are not locked out during an outage.
    return true;
  }, [user?.testSubscriptionActive, revenueCatSubscribed, initializationFailed, backendSubscriptionActive]);

  // FIX 1 (continued): Reset hasPausedTracking whenever subscription is confirmed active
  // so the guard can fire again if they later lapse.
  useEffect(() => {
    if (isSubscribed) {
      hasPausedTracking.current = false;
    }
  }, [isSubscribed]);

  // Initialize RevenueCat SDK
  useEffect(() => {
    const initializeRevenueCat = async () => {
      // Re-initialise if the authenticated user has changed (e.g. sign out → sign in).
      // This ensures isStatusChecked is reset and RevenueCat is configured for the
      // correct user ID rather than carrying over state from a previous session.
      const userChanged = user?.id !== initializedForUserId;
      if (isInitialized && !userChanged) {
        return;
      }

      if (userChanged && isInitialized) {
        log('[Subscription] User changed, re-initialising RevenueCat');
        // Reset all guards so the pause-tracking effect cannot fire until the
        // new user's subscription status has been fully confirmed.
        setIsInitialized(false);
        setIsStatusChecked(false);
        setRevenueCatSubscribed(false);
        setInitializationFailed(false);
      }

      // Reset guards so the pause-tracking effect cannot fire until this
      // initialisation run has fully confirmed subscription status.
      setIsLoading(true);
      setIsStatusChecked(false);

      // In Expo Go, RevenueCat native modules are not available.
      // Detect this early and fall back to backend subscription check.
      if (Constants.appOwnership === 'expo') {
        warn('[Subscription] Running in Expo Go — RevenueCat unavailable, using backend fallback');
        setInitializationFailed(true);
        setIsInitialized(true);
        setIsLoading(false);
        setInitializedForUserId(user?.id ?? null);
        return;
      }

      try {
        // Configure SDK with appropriate logging level
        // Use WARN for TestFlight/Production to avoid blocking dialogs
        // Use DEBUG only in development
        const logLevel = isDevelopment ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN;
        Purchases.setLogLevel(logLevel);

        // Use the appropriate API key for the platform
        const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;

        // Configure RevenueCat
        // usesStoreKit2IfAvailable: true enables StoreKit 2 on iOS 15+, which is
        // required for Purchases.presentCodeRedemptionSheet() to work correctly.
        await Purchases.configure({
          apiKey,
          appUserID: user?.id || undefined,
          usesStoreKit2IfAvailable: true,
          observerMode: false, // We want RevenueCat to handle purchases
        });

        log('[Subscription] SDK initialized for user:', user?.id || 'anonymous');
        setIsInitialized(true);
        setInitializationFailed(false);
        // Record which user this initialisation belongs to so we can detect
        // account switches and re-initialise for the new user.
        setInitializedForUserId(user?.id ?? null);

        // Check subscription status first — this gates the UI, so it's the
        // critical path. Offerings are only needed on the paywall screen and
        // can load in the background without blocking app startup.
        await checkSubscriptionStatusInternal();

        // Fetch available packages in background (non-blocking)
        Purchases.getOfferings()
          .then((offerings) => {
            if (offerings.current && offerings.current.availablePackages.length > 0) {
              log('[Subscription] Found', offerings.current.availablePackages.length, 'packages in offering:', offerings.current.identifier);
              setAvailablePackages(offerings.current.availablePackages);
            } else {
              warn('[Subscription] No current offering or 0 packages');
            }
          })
          .catch((offeringsError: any) => {
            logError('[Subscription] Failed to fetch offerings (non-critical):', offeringsError?.message);
          });

      } catch (initError: any) {
        logError('[Subscription] SDK initialization failed:', initError?.message);

        // CRITICAL: Mark initialization as failed
        // FIX 5: Do NOT reset revenueCatSubscribed — preserve last known value.
        // SDK init failure (e.g. network down) is uncertainty, not a confirmed
        // non-subscription. Assuming false would incorrectly deactivate vessels.
        setInitializationFailed(true);
        setIsInitialized(true); // Mark as initialized to prevent retry loops
        setIsLoading(false);
      }
    };

    // Only initialize if user is authenticated
    if (isAuthenticated && user?.id) {
      initializeRevenueCat();
    } else {
      setIsLoading(false);
    }
  }, [isAuthenticated, user?.id, isInitialized, initializedForUserId]);

  // Internal function to check subscription status
  // Sync subscription state with the backend. Fire-and-forget; failures are non-critical.
  const syncWithBackend = async (customerId: string) => {
    if (!isAuthenticated || !BACKEND_URL) return;
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch(`${BACKEND_URL}/api/subscription/sync`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.synced === false) warn('[Subscription] Backend sync failed (non-critical):', data.error);
      }
    } catch (e) {
      logError('[Subscription] Failed to sync with backend (non-critical):', e);
    }
  };

  const checkSubscriptionStatusInternal = async () => {
    try {
      const info = await Purchases.getCustomerInfo();

      setCustomerInfo(info);

      // Check for the specific "pro" entitlement (matches RevenueCat dashboard config)
      const hasProEntitlement = info.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;

      // Fallback: also check for the specific product ID in active subscriptions
      const hasProMonthly = info.activeSubscriptions.includes(PRO_MONTHLY_PRODUCT_ID);

      const subscribed = hasProEntitlement || hasProMonthly;

      log('[Subscription] Subscription status determined:', subscribed);

      setRevenueCatSubscribed(subscribed);

      syncWithBackend(info.originalAppUserId);

      setIsLoading(false);
      // Mark status as confirmed — pause-tracking effect may now run safely.
      setIsStatusChecked(true);
    } catch (statusError: any) {
      logError('[Subscription] Failed to check subscription status:', statusError?.message);

      // SAFE DEFAULT: On any error (network, SDK, timeout) we do NOT know the
      // subscription state. The rule is: uncertainty must default to KEEPING
      // vessels active. We therefore do NOT update revenueCatSubscribed (it
      // keeps its last known value) and we do NOT set isStatusChecked to true,
      // which means the pause-tracking effect will remain blocked.
      // The paywall UI will still show because isLoading becomes false and
      // isSubscribed reflects the last known value (false on first launch).
      setIsLoading(false);
      // NOTE: isStatusChecked intentionally left as-is (false on first launch,
      // true if a previous successful check already ran). This prevents
      // pause-tracking from firing on a transient network error.
    }
  };

  // Public function to check subscription status
  const checkSubscriptionStatus = useCallback(async () => {
    if (!isInitialized) {
      warn('[Subscription] SDK not initialized, cannot check status');
      return;
    }
    await checkSubscriptionStatusInternal();
  }, [isInitialized, isAuthenticated]);

  // Public function to manually refresh offerings
  const refreshOfferings = useCallback(async () => {
    if (!isInitialized) {
      warn('[Subscription] SDK not initialized, cannot refresh offerings');
      throw new Error('Subscription system not initialized');
    }

    try {
      const offerings = await Purchases.getOfferings();

      if (offerings.current && offerings.current.availablePackages.length > 0) {
        log('[Subscription] Refreshed offerings:', offerings.current.availablePackages.length, 'packages');
        setAvailablePackages(offerings.current.availablePackages);
      } else {
        warn('[Subscription] No packages available after refresh');
        setAvailablePackages([]);
      }
    } catch (err: any) {
      logError('[Subscription] Failed to refresh offerings:', err?.message);
      throw err;
    }
  }, [isInitialized]);

  // Helper to get auth token — delegates to the unified token storage
  const getAuthToken = async (): Promise<string | null> => {
    const { getToken } = await import('@/utils/tokenStorage');
    return getToken();
  };

  // Purchase a package
  const purchasePackage = useCallback(async (pkg: PurchasesPackage) => {
    if (!isInitialized) {
      throw new Error('Subscription system not initialized');
    }

    try {
      log('[Subscription] Initiating purchase:', pkg.product.identifier);
      setError(null);

      const { customerInfo: info } = await Purchases.purchasePackage(pkg);

      setCustomerInfo(info);

      // Check if purchase was successful
      const hasActiveEntitlement = Object.keys(info.entitlements.active).length > 0;
      const hasProMonthly = info.activeSubscriptions.includes(PRO_MONTHLY_PRODUCT_ID);
      const subscribed = hasActiveEntitlement || hasProMonthly;

      log('[Subscription] Purchase completed, subscribed:', subscribed);

      setRevenueCatSubscribed(subscribed);

      syncWithBackend(info.originalAppUserId);

      return { customerInfo: info, success: subscribed };
    } catch (purchaseError: any) {
      logError('[Subscription] Purchase failed:', purchaseError?.message);

      // Handle user cancellation gracefully
      if (purchaseError.userCancelled) {
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
      log('[Subscription] Restoring purchases');
      setError(null);

      const info = await Purchases.restorePurchases();

      setCustomerInfo(info);

      const hasActiveEntitlement = Object.keys(info.entitlements.active).length > 0;
      const hasProMonthly = info.activeSubscriptions.includes(PRO_MONTHLY_PRODUCT_ID);
      const subscribed = hasActiveEntitlement || hasProMonthly;

      log('[Subscription] Restore completed, subscribed:', subscribed);

      setRevenueCatSubscribed(subscribed);

      syncWithBackend(info.originalAppUserId);

      return info;
    } catch (restoreError: any) {
      logError('[Subscription] Restore failed:', restoreError?.message);
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

      // CRITICAL: Do NOT pause tracking until the SDK has fully initialized.
      // During app startup, isLoading briefly becomes false before RevenueCat
      // has run checkSubscriptionStatusInternal, so isSubscribed is transiently
      // false even for paying users. Only act once isInitialized is true.
      if (!isInitialized) {
        return;
      }

      // DEFINITIVE GUARD: isStatusChecked is only true after
      // checkSubscriptionStatusInternal() has fully resolved (success or error).
      // This closes the race window where isLoading=false and isInitialized=true
      // can both be true before RevenueCat has confirmed subscription status
      // (e.g. when the unauthenticated branch set isLoading=false on a previous
      // app session and auth later resolves).
      if (!isStatusChecked) {
        return;
      }

      // SAFE DEFAULT: Only pause tracking when RevenueCat has DEFINITIVELY
      // confirmed the subscription is not active. Any uncertainty (init failure,
      // network error, SDK not ready) must default to keeping vessels active.
      // initializationFailed is explicitly excluded — SDK init failure (e.g.
      // network down at startup) is uncertainty, not a confirmed non-subscription.
      const shouldPause = !isSubscribed;

      if (shouldPause && BACKEND_URL) {
        // FIX 1: Idempotency guard — only call pause-tracking once per lapsed event.
        if (hasPausedTracking.current) {
          return;
        }

        try {
          log('[Subscription] User not subscribed, pausing vessel tracking');
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
              log('[Subscription] Tracking paused, vessels deactivated:', data.vesselsDeactivated);
              // Mark as done so we don't call again until subscription is re-confirmed active
              hasPausedTracking.current = true;
            }
          }
        } catch (pauseError: any) {
          logError('[Subscription] Failed to pause tracking (non-critical):', pauseError);
        }
      }
    };

    pauseTrackingIfNeeded();
  }, [isSubscribed, isAuthenticated, isLoading, isInitialized, isStatusChecked]);

  return (
    <SubscriptionContext.Provider
      value={{
        isSubscribed,
        isLoading,
        revenueCatFailed: initializationFailed,
        customerInfo,
        availablePackages,
        purchasePackage,
        restorePurchases,
        checkSubscriptionStatus,
        refreshOfferings,
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
