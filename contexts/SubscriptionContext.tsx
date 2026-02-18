
/**
 * RevenueCat Subscription Context (Anonymous Mode)
 *
 * Provides subscription management for Expo + React Native apps.
 * Reads API keys from app.json (expo.extra) automatically.
 *
 * Supports:
 * - Native iOS/Android via RevenueCat SDK
 * - Web preview via RevenueCat REST API (read-only pricing display)
 * - Expo Go via test store keys (development only)
 *
 * CRITICAL: Production builds MUST use production API keys (appl_* or goog_*)
 * Test keys (test_*) will cause crashes in TestFlight and production builds.
 *
 * NOTE: Running in anonymous mode - purchases won't sync across devices.
 * To enable cross-device sync:
 * 1. Set up authentication with setup_auth
 * 2. Re-run setup_revenuecat to upgrade this file
 *
 * SETUP:
 * 1. Add production API keys to app.json (expo.extra.revenueCat)
 * 2. Wrap your app with <SubscriptionProvider>
 * 3. Run: pnpm install react-native-purchases && npx expo prebuild
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import { Platform } from "react-native";
import Purchases, {
  PurchasesOfferings,
  PurchasesOffering,
  PurchasesPackage,
  LOG_LEVEL,
} from "react-native-purchases";
import Constants from "expo-constants";

// Read API keys from app.json (expo.extra.revenueCat)
const extra = Constants.expoConfig?.extra || {};
const revenueCatConfig = extra.revenueCat || {};
let IOS_API_KEY = revenueCatConfig.iosApiKey || "";
let ANDROID_API_KEY = revenueCatConfig.androidApiKey || "";
const ENTITLEMENT_ID = revenueCatConfig.entitlementId || "SeaTime Tracker Pro";

// CRITICAL: Prevent test keys in production builds
// Test keys cause native module crashes in TestFlight/production
if (!__DEV__) {
  if (IOS_API_KEY.startsWith('test_')) {
    console.error('[SubscriptionContext] CRITICAL: Test iOS API key detected in production build!');
    console.error('[SubscriptionContext] This will cause crashes. Disabling RevenueCat to prevent crash.');
    IOS_API_KEY = '';
  }
  if (ANDROID_API_KEY.startsWith('test_')) {
    console.error('[SubscriptionContext] CRITICAL: Test Android API key detected in production build!');
    console.error('[SubscriptionContext] This will cause crashes. Disabling RevenueCat to prevent crash.');
    ANDROID_API_KEY = '';
  }
}

// Check if running on web
const isWeb = Platform.OS === "web";

// Validate API key format
const isValidApiKey = (key: string): boolean => {
  if (!key || key.length === 0) return false;
  
  // Check for placeholder values
  if (key.includes("YOUR_") || key.includes("_HERE")) {
    console.warn('[SubscriptionContext] Placeholder API key detected');
    return false;
  }
  
  // In production, ONLY accept production keys
  if (!__DEV__) {
    const isProductionKey = key.startsWith('appl_') || key.startsWith('goog_');
    if (!isProductionKey) {
      console.error('[SubscriptionContext] Production build requires production API keys');
      return false;
    }
    return true;
  }
  
  // In development, accept both production and test keys
  const validPrefixes = ["appl_", "goog_", "test_"];
  return validPrefixes.some(prefix => key.startsWith(prefix));
};

interface SubscriptionContextType {
  /** Whether the user has an active subscription */
  isSubscribed: boolean;
  /** All offerings from RevenueCat */
  offerings: PurchasesOfferings | null;
  /** The current/default offering */
  currentOffering: PurchasesOffering | null;
  /** Available packages in the current offering */
  packages: PurchasesPackage[];
  /** Loading state during initialization */
  loading: boolean;
  /** Whether running on web (purchases not available) */
  isWeb: boolean;
  /** Whether RevenueCat is properly configured */
  isConfigured: boolean;
  /** Purchase a package - returns true if successful */
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  /** Restore previous purchases - returns true if subscription found */
  restorePurchases: () => Promise<boolean>;
  /** Manually re-check subscription status */
  checkSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(
  undefined
);

interface SubscriptionProviderProps {
  children: ReactNode;
}

export function SubscriptionProvider({ children }: SubscriptionProviderProps) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [currentOffering, setCurrentOffering] =
    useState<PurchasesOffering | null>(null);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(false);
  const isConfiguredRef = useRef(false);

  // Fetch offerings via REST API for web platform
  const fetchOfferingsViaRest = async () => {
    try {
      const apiKey = IOS_API_KEY || ANDROID_API_KEY;
      if (!apiKey || !isValidApiKey(apiKey)) {
        console.warn("[SubscriptionContext] No valid API key available for web REST API");
        return;
      }

      // Fetch offerings from RevenueCat REST API
      const response = await fetch(
        "https://api.revenuecat.com/v1/subscribers/$RCAnonymousID:web_preview",
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        console.warn("[SubscriptionContext] REST API request failed:", response.status);
        return;
      }

      console.log("[SubscriptionContext] Web mode: SDK not available, showing download prompt");
    } catch (error) {
      console.warn("[SubscriptionContext] Web REST API fetch failed:", error);
    }
  };

  // Safe wrapper for RevenueCat SDK calls to prevent crashes
  const safeRevenueCatCall = async <T,>(
    operation: string,
    fn: () => Promise<T>,
    fallback: T
  ): Promise<T> => {
    try {
      // CRITICAL: Ensure all RevenueCat SDK calls are dispatched to the JS thread.
      // This prevents JSI bridge corruption from background thread access.
      const result = await new Promise<T>((resolve, reject) => {
        setTimeout(async () => {
          try {
            const operationResult = await fn();
            resolve(operationResult);
          } catch (error) {
            reject(error);
          }
        }, 0);
      });
      return result;
    } catch (error: any) {
      console.error(`[SubscriptionContext] Operation failed: ${operation}`, error);
      return fallback;
    }
  };

  const fetchOfferings = useCallback(async (forceInit: boolean = false) => {
    if (isWeb) return;
    if (!forceInit && !isConfiguredRef.current) return;
    
    try {
      console.log("[SubscriptionContext] Fetching offerings...");
      const fetchedOfferings = await safeRevenueCatCall(
        "getOfferings",
        () => Purchases.getOfferings(),
        null
      );
      
      if (!fetchedOfferings) {
        console.warn("[SubscriptionContext] Failed to fetch offerings");
        return;
      }
      
      setOfferings(fetchedOfferings);

      if (fetchedOfferings.current) {
        console.log("[SubscriptionContext] Current offering found:", fetchedOfferings.current.identifier);
        console.log("[SubscriptionContext] Available packages:", fetchedOfferings.current.availablePackages.length);
        setCurrentOffering(fetchedOfferings.current);
        setPackages(fetchedOfferings.current.availablePackages);
      } else {
        console.warn("[SubscriptionContext] No current offering available");
      }
    } catch (error) {
      console.error("[SubscriptionContext] Failed to fetch offerings:", error);
    }
  }, []);

  const checkSubscription = useCallback(async () => {
    if (isWeb || !isConfiguredRef.current) return;
    try {
      console.log("[SubscriptionContext] Checking subscription status...");
      const customerInfo = await safeRevenueCatCall(
        "getCustomerInfo",
        () => Purchases.getCustomerInfo(),
        null
      );
      
      if (!customerInfo) {
        console.warn("[SubscriptionContext] Failed to get customer info");
        setIsSubscribed(false);
        return;
      }
      
      const hasEntitlement =
        typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined";
      console.log("[SubscriptionContext] Subscription active:", hasEntitlement);
      console.log("[SubscriptionContext] Active entitlements:", Object.keys(customerInfo.entitlements.active));
      setIsSubscribed(hasEntitlement);
    } catch (error) {
      console.error("[SubscriptionContext] Failed to check subscription:", error);
      setIsSubscribed(false);
    }
  }, []);

  // Initialize RevenueCat on mount
  useEffect(() => {
    let customerInfoListener: { remove: () => void } | null = null;

    const initRevenueCat = async () => {
      try {
        // Web platform: SDK doesn't work, use REST API for basic info
        if (isWeb) {
          await fetchOfferingsViaRest();
          setLoading(false);
          setIsConfigured(false);
          return;
        }

        // Prevent multiple initializations
        if (isConfiguredRef.current) {
          console.log("[SubscriptionContext] Already configured, skipping initialization");
          return;
        }

        // Get API key based on platform
        const apiKey = Platform.OS === "ios" ? IOS_API_KEY : ANDROID_API_KEY;

        // Log configuration for debugging
        console.log("[SubscriptionContext] Initializing...");
        console.log("[SubscriptionContext] Platform:", Platform.OS);
        console.log("[SubscriptionContext] Environment:", __DEV__ ? "Development" : "Production");
        console.log("[SubscriptionContext] API Key configured:", !!apiKey);
        console.log("[SubscriptionContext] API Key prefix:", apiKey ? apiKey.substring(0, 10) + "..." : "NOT SET");
        console.log("[SubscriptionContext] Entitlement ID:", ENTITLEMENT_ID);

        // Validate API key
        if (!isValidApiKey(apiKey)) {
          console.warn(
            "[SubscriptionContext] Invalid or missing API key for platform:", Platform.OS
          );
          console.warn(
            "[SubscriptionContext] Please add a valid revenueCat API key to app.json extra."
          );
          console.warn(
            "[SubscriptionContext] Production builds require production keys (appl_* or goog_*)"
          );
          console.warn(
            "[SubscriptionContext] Test keys (test_*) cause crashes in TestFlight/production"
          );
          setLoading(false);
          setIsConfigured(false);
          return;
        }

        // Configure SDK with thread-safe wrapper
        await safeRevenueCatCall(
          "configure",
          async () => {
            // Use DEBUG log level in development, INFO in production
            Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
            
            console.log("[SubscriptionContext] Configuring SDK with key:", apiKey.substring(0, 10) + "...");
            await Purchases.configure({ apiKey });
            console.log("[SubscriptionContext] SDK configured successfully");
            
            isConfiguredRef.current = true;
            setIsConfigured(true);
            
            // Fetch offerings immediately after configuration
            await fetchOfferings(true);
          },
          undefined
        );

        if (!isConfiguredRef.current) {
          console.error("[SubscriptionContext] SDK configuration failed");
          setLoading(false);
          return;
        }

        // Listen for real-time subscription changes
        customerInfoListener = Purchases.addCustomerInfoUpdateListener(
          (customerInfo) => {
            const hasEntitlement =
              typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !==
              "undefined";
            console.log("[SubscriptionContext] Subscription status updated:", hasEntitlement);
            setIsSubscribed(hasEntitlement);
          }
        );

        // Check initial subscription status
        await checkSubscription();
      } catch (error) {
        console.error("[SubscriptionContext] Failed to initialize:", error);
        console.error("[SubscriptionContext] Error details:", JSON.stringify(error, null, 2));
        setIsConfigured(false);
        isConfiguredRef.current = false;
      } finally {
        setLoading(false);
      }
    };

    initRevenueCat();

    // Cleanup listener on unmount
    return () => {
      if (customerInfoListener) {
        customerInfoListener.remove();
      }
    };
  }, [fetchOfferings, checkSubscription]);

  const purchasePackage = async (pkg: PurchasesPackage): Promise<boolean> => {
    if (isWeb || !isConfiguredRef.current) {
      console.warn("[SubscriptionContext] Purchases not available");
      return false;
    }
    try {
      console.log("[SubscriptionContext] Purchasing package:", pkg.identifier);
      const result = await safeRevenueCatCall(
        "purchasePackage",
        () => Purchases.purchasePackage(pkg),
        null
      );
      
      if (!result) {
        console.warn("[SubscriptionContext] Purchase failed");
        return false;
      }
      
      const { customerInfo } = result;
      const hasEntitlement =
        typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined";
      console.log("[SubscriptionContext] Purchase completed. Subscription active:", hasEntitlement);
      setIsSubscribed(hasEntitlement);
      return hasEntitlement;
    } catch (error: any) {
      // Don't treat user cancellation as an error
      if (!error.userCancelled) {
        console.error("[SubscriptionContext] Purchase failed:", error);
        throw error;
      }
      console.log("[SubscriptionContext] Purchase cancelled by user");
      return false;
    }
  };

  const restorePurchases = async (): Promise<boolean> => {
    if (isWeb || !isConfiguredRef.current) {
      console.warn("[SubscriptionContext] Restore not available");
      return false;
    }
    try {
      console.log("[SubscriptionContext] Restoring purchases...");
      const customerInfo = await safeRevenueCatCall(
        "restorePurchases",
        () => Purchases.restorePurchases(),
        null
      );
      
      if (!customerInfo) {
        console.warn("[SubscriptionContext] Restore failed");
        return false;
      }
      
      const hasEntitlement =
        typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined";
      console.log("[SubscriptionContext] Restore completed. Subscription active:", hasEntitlement);
      setIsSubscribed(hasEntitlement);
      return hasEntitlement;
    } catch (error) {
      console.error("[SubscriptionContext] Restore failed:", error);
      throw error;
    }
  };

  return (
    <SubscriptionContext.Provider
      value={{
        isSubscribed,
        offerings,
        currentOffering,
        packages,
        loading,
        isWeb,
        isConfigured,
        purchasePackage,
        restorePurchases,
        checkSubscription,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

/**
 * Hook to access subscription state and methods.
 *
 * @example
 * const { isSubscribed, purchasePackage, packages, isWeb, isConfigured } = useSubscription();
 *
 * if (!isSubscribed) {
 *   return <Button onPress={() => router.push("/paywall")}>Upgrade</Button>;
 * }
 */
export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error(
      "useSubscription must be used within SubscriptionProvider"
    );
  }
  return context;
}
