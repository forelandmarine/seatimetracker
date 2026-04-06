
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

// Environment detection
const isTestFlight = Constants.appOwnership === 'expo' || 
                     (Platform.OS === 'ios' && Constants.isDevice && !__DEV__);
const isDevelopment = __DEV__;
const isProduction = !isDevelopment && !isTestFlight;

if (__DEV__) {
  console.log('[Subscription] Environment:', { isDevelopment, isTestFlight, isProduction });
}

// RevenueCat API Keys - Read from app.json extra config
const REVENUECAT_API_KEY_IOS = Constants.expoConfig?.extra?.revenueCatIosApiKey || 'appl_JGAVizuUPjFzvacGxciCepqaqAJ';
const REVENUECAT_API_KEY_ANDROID = Constants.expoConfig?.extra?.revenueCatAndroidApiKey || 'appl_JGAVizuUPjFzvacGxciCepqaqAJ';

// Product identifier - UPDATED to match App Store Connect
const PRO_MONTHLY_PRODUCT_ID = 'com.subscription.monthly';

if (__DEV__) {
  console.log('[Subscription] Product:', PRO_MONTHLY_PRODUCT_ID, 'Platform:', Platform.OS);
}

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

  // CRITICAL: Check test subscription flag FIRST, then fall back to RevenueCat
  // If RevenueCat failed to initialize, fail open (treat as subscribed) so
  // paying users are never incorrectly blocked by a network/SDK failure.
  const isSubscribed = useMemo(() => {
    // Priority 1: Test subscription bypass (for testing)
    if (user?.testSubscriptionActive) {
      console.log('[Subscription] ✅ TEST SUBSCRIPTION ACTIVE - Bypassing paywall');
      console.log('[Subscription] User:', user.email);
      return true;
    }

    // Priority 2: If RevenueCat failed to initialize, fail open so paying users
    // are not incorrectly redirected to the paywall due to a network/SDK error.
    if (initializationFailed) {
      console.log('[Subscription] ⚠️ RevenueCat init failed — failing open (treating as subscribed)');
      return true;
    }

    // Priority 3: RevenueCat subscription status
    const subscribed = revenueCatSubscribed;
    console.log('[Subscription] RevenueCat subscription status:', subscribed);
    return subscribed;
  }, [user?.testSubscriptionActive, revenueCatSubscribed, initializationFailed]);

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
        console.log('[Subscription] Already initialized for this user, skipping');
        return;
      }

      if (userChanged && isInitialized) {
        console.log('[Subscription] User changed (', initializedForUserId, '→', user?.id, '), re-initialising RevenueCat');
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

      try {
        console.log('[Subscription] ========================================');
        console.log('[Subscription] 🚀 INITIALIZING REVENUECAT SDK');
        console.log('[Subscription] ========================================');
        console.log('[Subscription] Platform:', Platform.OS);
        console.log('[Subscription] Environment:', { isDevelopment, isTestFlight, isProduction });
        console.log('[Subscription] User authenticated:', isAuthenticated);
        console.log('[Subscription] User ID:', user?.id);
        console.log('[Subscription] ✅ UPDATED: Looking for product ID: com.subscription.monthly');

        // Configure SDK with appropriate logging level
        // Use WARN for TestFlight/Production to avoid blocking dialogs
        // Use DEBUG only in development
        const logLevel = isDevelopment ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN;
        Purchases.setLogLevel(logLevel);
        console.log('[Subscription] Log level set to:', logLevel === LOG_LEVEL.DEBUG ? 'DEBUG' : 'WARN');

        // Use the appropriate API key for the platform
        const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;
        
        console.log('[Subscription] ========================================');
        console.log('[Subscription] 🔑 API KEY CONFIGURATION');
        console.log('[Subscription] ========================================');
        console.log('[Subscription] Using API key from app.json:', apiKey);
        console.log('[Subscription] StoreKit 2 disabled for stability (usesStoreKit2IfAvailable: false)');
        console.log('[Subscription] App User ID:', user?.id || 'Anonymous');
        
        // Configure RevenueCat
        // usesStoreKit2IfAvailable: true enables StoreKit 2 on iOS 15+, which is
        // required for Purchases.presentCodeRedemptionSheet() to work correctly.
        await Purchases.configure({
          apiKey,
          appUserID: user?.id || undefined,
          usesStoreKit2IfAvailable: true,
          observerMode: false, // We want RevenueCat to handle purchases
        });

        console.log('[Subscription] ✅ RevenueCat SDK configured successfully');
        console.log('[Subscription] ✅ Production mode active');
        console.log('[Subscription] ✅ API Key:', apiKey);
        setIsInitialized(true);
        setInitializationFailed(false);
        // Record which user this initialisation belongs to so we can detect
        // account switches and re-initialise for the new user.
        setInitializedForUserId(user?.id ?? null);

        // Fetch available packages
        try {
          console.log('[Subscription] ========================================');
          console.log('[Subscription] 📦 FETCHING OFFERINGS');
          console.log('[Subscription] ========================================');
          const offerings = await Purchases.getOfferings();
          
          console.log('[Subscription] Offerings response received');
          console.log('[Subscription] Current offering:', offerings.current?.identifier || 'NONE');
          console.log('[Subscription] All offerings:', Object.keys(offerings.all));
          console.log('[Subscription] Number of offerings:', Object.keys(offerings.all).length);
          
          if (offerings.current) {
            console.log('[Subscription] ========================================');
            console.log('[Subscription] 📋 CURRENT OFFERING DETAILS');
            console.log('[Subscription] ========================================');
            console.log('[Subscription] Offering ID:', offerings.current.identifier);
            console.log('[Subscription] Server description:', offerings.current.serverDescription);
            console.log('[Subscription] Number of packages:', offerings.current.availablePackages.length);
            
            if (offerings.current.availablePackages.length > 0) {
              console.log('[Subscription] ✅ Found', offerings.current.availablePackages.length, 'packages');
              console.log('[Subscription] ========================================');
              console.log('[Subscription] 🔍 PACKAGE DETAILS');
              console.log('[Subscription] ========================================');
              
              offerings.current.availablePackages.forEach((pkg, index) => {
                console.log(`[Subscription] --- Package ${index + 1} ---`);
                console.log(`[Subscription] Package Identifier: ${pkg.identifier}`);
                console.log(`[Subscription] Product ID: ${pkg.product.identifier}`);
                console.log(`[Subscription] Product Title: ${pkg.product.title}`);
                console.log(`[Subscription] Product Description: ${pkg.product.description}`);
                console.log(`[Subscription] Price: ${pkg.product.priceString}`);
                console.log(`[Subscription] Currency Code: ${pkg.product.currencyCode}`);
                console.log(`[Subscription] Subscription Period: ${pkg.product.subscriptionPeriod || 'N/A'}`);
                
                // Check if this is the correct product
                if (pkg.product.identifier === PRO_MONTHLY_PRODUCT_ID) {
                  console.log('[Subscription] ✅✅✅ FOUND CORRECT PRODUCT: com.subscription.monthly ✅✅✅');
                } else {
                  console.log(`[Subscription] ⚠️ Product ID mismatch: Expected "com.subscription.monthly", got "${pkg.product.identifier}"`);
                }
              });
              
              setAvailablePackages(offerings.current.availablePackages);
            } else {
              console.log('[Subscription] ========================================');
              console.log('[Subscription] ⚠️ NO PACKAGES IN CURRENT OFFERING');
              console.log('[Subscription] ========================================');
              console.warn('[Subscription] ⚠️ Current offering has 0 packages');
              console.warn('[Subscription] ⚠️ Offering ID:', offerings.current.identifier);
              console.warn('[Subscription] ⚠️ Server description:', offerings.current.serverDescription);
              console.warn('[Subscription] ⚠️ TROUBLESHOOTING STEPS:');
              console.warn('[Subscription] ⚠️ 1. Check RevenueCat dashboard - is there a "current" offering?');
              console.warn('[Subscription] ⚠️ 2. Verify product "com.subscription.monthly" exists in App Store Connect');
              console.warn('[Subscription] ⚠️ 3. Ensure product is added to RevenueCat offering');
              console.warn('[Subscription] ⚠️ 4. Verify offering is marked as "current" in RevenueCat');
              console.warn('[Subscription] ⚠️ 5. Check API key is correct:', apiKey);
              setAvailablePackages([]);
            }
          } else {
            console.log('[Subscription] ========================================');
            console.log('[Subscription] ❌ NO CURRENT OFFERING');
            console.log('[Subscription] ========================================');
            console.error('[Subscription] ❌ No current offering found');
            console.error('[Subscription] ❌ All offerings:', Object.keys(offerings.all));
            console.error('[Subscription] ❌ CRITICAL: You must set an offering as "current" in RevenueCat dashboard');
            console.error('[Subscription] ❌ Steps to fix:');
            console.error('[Subscription] ❌ 1. Go to RevenueCat dashboard → Offerings');
            console.error('[Subscription] ❌ 2. Select an offering');
            console.error('[Subscription] ❌ 3. Click "Set as Current"');
            setAvailablePackages([]);
          }
        } catch (offeringsError: any) {
          console.log('[Subscription] ========================================');
          console.log('[Subscription] ❌ OFFERINGS FETCH ERROR');
          console.log('[Subscription] ========================================');
          console.error('[Subscription] ❌ Failed to fetch offerings');
          console.error('[Subscription] Error type:', offeringsError?.constructor?.name);
          console.error('[Subscription] Error message:', offeringsError?.message);
          console.error('[Subscription] Error code:', offeringsError?.code);
          console.error('[Subscription] Error userInfo:', offeringsError?.userInfo);
          console.error('[Subscription] Full error object:', JSON.stringify(offeringsError, null, 2));
          
          // Check for common errors
          if (offeringsError?.message?.includes('API key')) {
            console.error('[Subscription] ❌ API KEY ERROR - Verify key in RevenueCat dashboard');
          }
          if (offeringsError?.message?.includes('network')) {
            console.error('[Subscription] ❌ NETWORK ERROR - Check internet connection');
          }
          if (offeringsError?.message?.includes('configuration')) {
            console.error('[Subscription] ❌ CONFIGURATION ERROR - Check RevenueCat setup');
          }
          
          // Don't set error - allow app to continue
          console.warn('[Subscription] Continuing without offerings');
          setAvailablePackages([]);
        }

        // Check initial subscription status
        await checkSubscriptionStatusInternal();

      } catch (initError: any) {
        console.log('[Subscription] ========================================');
        console.log('[Subscription] ❌ SDK INITIALIZATION ERROR');
        console.log('[Subscription] ========================================');
        console.error('[Subscription] Failed to initialize RevenueCat:', initError);
        console.error('[Subscription] Error type:', initError?.constructor?.name);
        console.error('[Subscription] Error message:', initError?.message);
        console.error('[Subscription] Error code:', initError?.code);
        console.error('[Subscription] Full error:', JSON.stringify(initError, null, 2));
        
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
      console.log('[Subscription] User not authenticated, skipping initialization');
      setIsLoading(false);
    }
  }, [isAuthenticated, user?.id, isInitialized, initializedForUserId]);

  // Internal function to check subscription status
  const checkSubscriptionStatusInternal = async () => {
    try {
      console.log('[Subscription] ========================================');
      console.log('[Subscription] 🔍 CHECKING SUBSCRIPTION STATUS');
      console.log('[Subscription] ========================================');
      
      const info = await Purchases.getCustomerInfo();
      console.log('[Subscription] ✅ Customer info received');
      console.log('[Subscription] Customer ID:', info.originalAppUserId);
      console.log('[Subscription] Original Application Version:', info.originalApplicationVersion);
      console.log('[Subscription] Request Date:', info.requestDate);
      console.log('[Subscription] First Seen:', info.firstSeen);
      
      console.log('[Subscription] ========================================');
      console.log('[Subscription] 🎫 ENTITLEMENTS');
      console.log('[Subscription] ========================================');
      console.log('[Subscription] Active entitlements:', Object.keys(info.entitlements.active));
      console.log('[Subscription] All entitlements:', Object.keys(info.entitlements.all));
      
      // Log each entitlement in detail
      Object.entries(info.entitlements.all).forEach(([key, entitlement]) => {
        console.log(`[Subscription] Entitlement "${key}":`, {
          identifier: entitlement.identifier,
          isActive: entitlement.isActive,
          willRenew: entitlement.willRenew,
          periodType: entitlement.periodType,
          latestPurchaseDate: entitlement.latestPurchaseDate,
          expirationDate: entitlement.expirationDate,
          productIdentifier: entitlement.productIdentifier,
        });
      });
      
      console.log('[Subscription] ========================================');
      console.log('[Subscription] 📱 SUBSCRIPTIONS');
      console.log('[Subscription] ========================================');
      console.log('[Subscription] Active subscriptions:', info.activeSubscriptions);
      console.log('[Subscription] All purchased product identifiers:', info.allPurchasedProductIdentifiers);
      console.log('[Subscription] Non-subscription transactions:', info.nonSubscriptionTransactions.length);
      
      setCustomerInfo(info);

      // Check if user has any active entitlements
      const hasActiveEntitlement = Object.keys(info.entitlements.active).length > 0;
      
      // Also check for the specific product ID (UPDATED)
      const hasProMonthly = info.activeSubscriptions.includes(PRO_MONTHLY_PRODUCT_ID);
      
      const subscribed = hasActiveEntitlement || hasProMonthly;
      
      console.log('[Subscription] ========================================');
      console.log('[Subscription] 📊 SUBSCRIPTION STATUS SUMMARY');
      console.log('[Subscription] ========================================');
      console.log('[Subscription] Has active entitlement:', hasActiveEntitlement);
      console.log('[Subscription] Has com.subscription.monthly:', hasProMonthly);
      console.log('[Subscription] RevenueCat subscription status:', subscribed);
      
      if (!subscribed) {
        console.log('[Subscription] ⚠️ User is NOT subscribed via RevenueCat');
        console.log('[Subscription] ⚠️ Expected product: com.subscription.monthly');
        console.log('[Subscription] ⚠️ Active subscriptions:', info.activeSubscriptions);
        console.log('[Subscription] ⚠️ If user purchased but not showing, check:');
        console.log('[Subscription] ⚠️ 1. Product ID in App Store Connect matches "com.subscription.monthly"');
        console.log('[Subscription] ⚠️ 2. Product is linked to an entitlement in RevenueCat');
        console.log('[Subscription] ⚠️ 3. Purchase was successful (check App Store receipt)');
      }
      
      setRevenueCatSubscribed(subscribed);

      // Sync with backend if user is authenticated
      if (isAuthenticated && BACKEND_URL) {
        try {
          console.log('[Subscription] Syncing status with backend...');
          const token = await getAuthToken();
          
          if (token) {
            const syncResponse = await fetch(`${BACKEND_URL}/api/subscription/sync`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                customerId: info.originalAppUserId,
              }),
            });

            if (syncResponse.ok) {
              const syncData = await syncResponse.json();
              console.log('[Subscription] Backend sync completed:', syncData);
              
              // If sync failed (RevenueCat unavailable), log but don't fail
              if (syncData.synced === false) {
                console.warn('[Subscription] RevenueCat sync failed (non-critical):', syncData.error);
              }
            } else {
              console.warn('[Subscription] Backend sync returned error status:', syncResponse.status);
            }
          }
        } catch (syncError: any) {
          console.error('[Subscription] Failed to sync with backend (non-critical):', syncError);
        }
      }

      setIsLoading(false);
      // Mark status as confirmed — pause-tracking effect may now run safely.
      setIsStatusChecked(true);
    } catch (statusError: any) {
      console.log('[Subscription] ========================================');
      console.log('[Subscription] ❌ STATUS CHECK ERROR');
      console.log('[Subscription] ========================================');
      console.error('[Subscription] ❌ Failed to check subscription status');
      console.error('[Subscription] Error type:', statusError?.constructor?.name);
      console.error('[Subscription] Error message:', statusError?.message);
      console.error('[Subscription] Error code:', statusError?.code);
      console.error('[Subscription] Full error:', JSON.stringify(statusError, null, 2));

      // SAFE DEFAULT: On any error (network, SDK, timeout) we do NOT know the
      // subscription state. The rule is: uncertainty must default to KEEPING
      // vessels active. We therefore do NOT update revenueCatSubscribed (it
      // keeps its last known value) and we do NOT set isStatusChecked to true,
      // which means the pause-tracking effect will remain blocked.
      // The paywall UI will still show because isLoading becomes false and
      // isSubscribed reflects the last known value (false on first launch).
      console.warn('[Subscription] ⚠️ Subscription status unknown due to error — vessels will NOT be deactivated');
      console.warn('[Subscription] ⚠️ Last known revenueCatSubscribed value is preserved');
      setIsLoading(false);
      // NOTE: isStatusChecked intentionally left as-is (false on first launch,
      // true if a previous successful check already ran). This prevents
      // pause-tracking from firing on a transient network error.
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

  // Public function to manually refresh offerings
  const refreshOfferings = useCallback(async () => {
    if (!isInitialized) {
      console.warn('[Subscription] SDK not initialized, cannot refresh offerings');
      throw new Error('Subscription system not initialized');
    }

    try {
      console.log('[Subscription] 🔄 Manually refreshing offerings...');
      const offerings = await Purchases.getOfferings();
      
      console.log('[Subscription] Offerings response:', {
        current: offerings.current?.identifier,
        all: Object.keys(offerings.all),
      });
      
      if (offerings.current && offerings.current.availablePackages.length > 0) {
        console.log('[Subscription] ✅ Found', offerings.current.availablePackages.length, 'packages');
        offerings.current.availablePackages.forEach((pkg, index) => {
          console.log(`[Subscription] Package ${index + 1}:`, {
            identifier: pkg.identifier,
            productId: pkg.product.identifier,
            price: pkg.product.priceString,
            title: pkg.product.title,
          });
          
          // Check if this is the correct product
          if (pkg.product.identifier === PRO_MONTHLY_PRODUCT_ID) {
            console.log('[Subscription] ✅ FOUND CORRECT PRODUCT: com.subscription.monthly');
          }
        });
        setAvailablePackages(offerings.current.availablePackages);
      } else {
        console.warn('[Subscription] ⚠️ No packages available after refresh');
        console.warn('[Subscription] ⚠️ Offerings structure:', JSON.stringify({
          currentOffering: offerings.current?.identifier || 'none',
          allOfferings: Object.keys(offerings.all),
          currentPackages: offerings.current?.availablePackages.length || 0,
        }));
        setAvailablePackages([]);
      }
    } catch (error: any) {
      console.error('[Subscription] ❌ Failed to refresh offerings');
      console.error('[Subscription] Error:', error);
      throw error;
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
      console.log('[Subscription] ========================================');
      console.log('[Subscription] 💳 INITIATING PURCHASE');
      console.log('[Subscription] ========================================');
      console.log('[Subscription] Package identifier:', pkg.identifier);
      console.log('[Subscription] Product ID:', pkg.product.identifier);
      console.log('[Subscription] Product title:', pkg.product.title);
      console.log('[Subscription] Price:', pkg.product.priceString);
      setError(null);
      
      const { customerInfo: info } = await Purchases.purchasePackage(pkg);
      
      console.log('[Subscription] ========================================');
      console.log('[Subscription] ✅ PURCHASE SUCCESSFUL');
      console.log('[Subscription] ========================================');
      console.log('[Subscription] Active entitlements:', Object.keys(info.entitlements.active));
      console.log('[Subscription] Active subscriptions:', info.activeSubscriptions);
      
      setCustomerInfo(info);
      
      // Check if purchase was successful
      const hasActiveEntitlement = Object.keys(info.entitlements.active).length > 0;
      const hasProMonthly = info.activeSubscriptions.includes(PRO_MONTHLY_PRODUCT_ID);
      const subscribed = hasActiveEntitlement || hasProMonthly;
      
      console.log('[Subscription] Purchase result - subscribed:', subscribed);
      
      setRevenueCatSubscribed(subscribed);

      // Sync with backend
      if (isAuthenticated && BACKEND_URL) {
        try {
          const token = await getAuthToken();
          
          if (token) {
            const syncResponse = await fetch(`${BACKEND_URL}/api/subscription/sync`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                customerId: info.originalAppUserId,
              }),
            });

            if (syncResponse.ok) {
              const syncData = await syncResponse.json();
              console.log('[Subscription] Purchase synced with backend:', syncData);
              
              if (syncData.synced === false) {
                console.warn('[Subscription] RevenueCat sync failed (non-critical):', syncData.error);
              }
            }
          }
        } catch (syncError: any) {
          console.error('[Subscription] Failed to sync purchase with backend (non-critical):', syncError);
        }
      }

      return { customerInfo: info, success: subscribed };
    } catch (purchaseError: any) {
      console.log('[Subscription] ========================================');
      console.log('[Subscription] ❌ PURCHASE FAILED');
      console.log('[Subscription] ========================================');
      console.error('[Subscription] Purchase error:', purchaseError);
      console.error('[Subscription] Error type:', purchaseError?.constructor?.name);
      console.error('[Subscription] Error message:', purchaseError?.message);
      console.error('[Subscription] Error code:', purchaseError?.code);
      console.error('[Subscription] User cancelled:', purchaseError?.userCancelled);
      
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
      console.log('[Subscription] ========================================');
      console.log('[Subscription] 🔄 RESTORING PURCHASES');
      console.log('[Subscription] ========================================');
      setError(null);
      
      const info = await Purchases.restorePurchases();
      
      console.log('[Subscription] ========================================');
      console.log('[Subscription] ✅ PURCHASES RESTORED');
      console.log('[Subscription] ========================================');
      console.log('[Subscription] Active entitlements:', Object.keys(info.entitlements.active));
      console.log('[Subscription] Active subscriptions:', info.activeSubscriptions);
      
      setCustomerInfo(info);
      
      const hasActiveEntitlement = Object.keys(info.entitlements.active).length > 0;
      const hasProMonthly = info.activeSubscriptions.includes(PRO_MONTHLY_PRODUCT_ID);
      const subscribed = hasActiveEntitlement || hasProMonthly;
      
      console.log('[Subscription] Restore result - subscribed:', subscribed);
      
      setRevenueCatSubscribed(subscribed);

      // Sync with backend
      if (isAuthenticated && BACKEND_URL) {
        try {
          const token = await getAuthToken();
          
          if (token) {
            const syncResponse = await fetch(`${BACKEND_URL}/api/subscription/sync`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                customerId: info.originalAppUserId,
              }),
            });

            if (syncResponse.ok) {
              const syncData = await syncResponse.json();
              console.log('[Subscription] Restore synced with backend:', syncData);
              
              if (syncData.synced === false) {
                console.warn('[Subscription] RevenueCat sync failed (non-critical):', syncData.error);
              }
            }
          }
        } catch (syncError: any) {
          console.error('[Subscription] Failed to sync restore with backend (non-critical):', syncError);
        }
      }

      return info;
    } catch (restoreError: any) {
      console.log('[Subscription] ========================================');
      console.log('[Subscription] ❌ RESTORE FAILED');
      console.log('[Subscription] ========================================');
      console.error('[Subscription] Restore error:', restoreError);
      console.error('[Subscription] Error type:', restoreError?.constructor?.name);
      console.error('[Subscription] Error message:', restoreError?.message);
      console.error('[Subscription] Error code:', restoreError?.code);
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
        console.log('[Subscription] SDK not yet initialized, skipping pause-tracking check');
        return;
      }

      // DEFINITIVE GUARD: isStatusChecked is only true after
      // checkSubscriptionStatusInternal() has fully resolved (success or error).
      // This closes the race window where isLoading=false and isInitialized=true
      // can both be true before RevenueCat has confirmed subscription status
      // (e.g. when the unauthenticated branch set isLoading=false on a previous
      // app session and auth later resolves).
      if (!isStatusChecked) {
        console.log('[Subscription] Status not yet confirmed by RevenueCat, skipping pause-tracking check');
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
          console.log('[Subscription] pause-tracking already called for this lapsed event, skipping');
          return;
        }

        try {
          console.log('[Subscription] RevenueCat confirmed user is not subscribed, pausing vessel tracking...');
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
              // Mark as done so we don't call again until subscription is re-confirmed active
              hasPausedTracking.current = true;
            }
          }
        } catch (pauseError: any) {
          console.error('[Subscription] Failed to pause tracking (non-critical):', pauseError);
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
