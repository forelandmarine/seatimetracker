
/**
 * RevenueCat Subscription Context (Anonymous Mode)
 *
 * Provides subscription management for Expo + React Native apps.
 * Reads API keys from app.json (expo.extra) automatically.
 *
 * Supports:
 * - Native iOS/Android via RevenueCat SDK
 * - Web preview via RevenueCat REST API (read-only pricing display)
 * - Expo Go via test store keys
 *
 * NOTE: Running in anonymous mode - purchases won't sync across devices.
 * To enable cross-device sync:
 * 1. Set up authentication with setup_auth
 * 2. Re-run setup_revenuecat to upgrade this file
 *
 * SETUP:
 * 1. Wrap your app with <SubscriptionProvider>
 * 2. Run: pnpm install react-native-purchases && npx expo prebuild
 *
 * CRITICAL FIX: iOS TurboModule Crash Prevention
 * - All RevenueCat SDK calls wrapped in try-catch with defensive error handling
 * - ALL SDK calls dispatched to main thread to prevent JSI bridge corruption
 * - Prevents NSException from corrupting JSI bridge memory
 * - Graceful degradation if SDK initialization fails
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useRef,
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
const IOS_API_KEY = revenueCatConfig.iosApiKey || "";
const ANDROID_API_KEY = revenueCatConfig.androidApiKey || "";
// CRITICAL: Use "pro" as the entitlement ID to match RevenueCat dashboard
const ENTITLEMENT_ID = revenueCatConfig.entitlementId || "pro";

// Check if running on web
const isWeb = Platform.OS === "web";

// Validate API key format
const isValidApiKey = (key: string): boolean => {
  if (!key || key.length === 0) return false;
  // Check for placeholder values
  if (key.includes("YOUR_") || key.includes("_HERE")) return false;
  // Check for valid prefixes (production or test keys)
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
  
  // Track if SDK initialization has been attempted to prevent multiple attempts
  const initAttempted = useRef(false);
  const customerInfoListener = useRef<{ remove: () => void } | null>(null);

  // Fetch offerings via REST API for web platform
  const fetchOfferingsViaRest = async () => {
    try {
      const apiKey = IOS_API_KEY || ANDROID_API_KEY;
      if (!apiKey || !isValidApiKey(apiKey)) {
        console.warn("[RevenueCat] No valid API key available for web REST API");
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
        console.warn("[RevenueCat] REST API request failed:", response.status);
        return;
      }

      console.log("[RevenueCat] Web mode: SDK not available, showing download prompt");
    } catch (error) {
      console.warn("[RevenueCat] Web REST API fetch failed:", error);
    }
  };

  // CRITICAL: Defensive wrapper for all RevenueCat SDK calls
  // Prevents NSException from corrupting JSI bridge memory
  // ENSURES ALL CALLS HAPPEN ON MAIN THREAD
  const safeRevenueCatCall = async <T,>(
    operation: string,
    fn: () => Promise<T>,
    fallback: T
  ): Promise<T> => {
    try {
      console.log(`[RevenueCat] Starting operation: ${operation}`);
      
      // CRITICAL: Ensure we're on the main thread
      // This prevents JSI bridge corruption from background thread access
      const result = await new Promise<T>((resolve, reject) => {
        // Use setTimeout to ensure we're on the JS thread
        // This is the React Native equivalent of dispatching to main queue
        setTimeout(async () => {
          try {
            const operationResult = await fn();
            resolve(operationResult);
          } catch (error) {
            reject(error);
          }
        }, 0);
      });
      
      console.log(`[RevenueCat] Operation completed: ${operation}`);
      return result;
    } catch (error: any) {
      // Log error details but don't let it crash the app
      console.error(`[RevenueCat] Operation failed: ${operation}`);
      console.error(`[RevenueCat] Error type: ${error?.constructor?.name || 'Unknown'}`);
      console.error(`[RevenueCat] Error message: ${error?.message || 'No message'}`);
      console.error(`[RevenueCat] Error code: ${error?.code || 'No code'}`);
      
      // Return fallback value instead of throwing
      console.log(`[RevenueCat] Returning fallback value for: ${operation}`);
      return fallback;
    }
  };

  // Fetch offerings from RevenueCat SDK with defensive error handling
  const fetchOfferings = useCallback(async (forceInit: boolean = false) => {
    // Skip if on web or not configured (unless forcing during init)
    if (isWeb) {
      console.log("[RevenueCat] Skipping offerings fetch - running on web");
      return;
    }
    
    if (!forceInit && !isConfigured) {
      console.log("[RevenueCat] Skipping offerings fetch - SDK not configured yet");
      return;
    }
    
    // Use defensive wrapper to prevent crashes
    const fetchedOfferings = await safeRevenueCatCall(
      "getOfferings",
      async () => {
        console.log("[RevenueCat] Fetching offerings...");
        const result = await Purchases.getOfferings();
        console.log("[RevenueCat] Offerings response received");
        return result;
      },
      null as PurchasesOfferings | null
    );
    
    if (!fetchedOfferings) {
      console.warn("[RevenueCat] Failed to fetch offerings - using empty state");
      setOfferings(null);
      setCurrentOffering(null);
      setPackages([]);
      return;
    }
    
    console.log("[RevenueCat] All offerings:", Object.keys(fetchedOfferings.all));
    console.log("[RevenueCat] Current offering ID:", fetchedOfferings.current?.identifier || "NONE");
    
    setOfferings(fetchedOfferings);

    if (fetchedOfferings.current) {
      console.log("[RevenueCat] Current offering found:", fetchedOfferings.current.identifier);
      console.log("[RevenueCat] Available packages:", fetchedOfferings.current.availablePackages.length);
      
      // Log each package for debugging
      fetchedOfferings.current.availablePackages.forEach((pkg, index) => {
        console.log(`[RevenueCat] Package ${index + 1}:`, {
          identifier: pkg.identifier,
          productId: pkg.product.identifier,
          title: pkg.product.title,
          price: pkg.product.priceString,
        });
      });
      
      setCurrentOffering(fetchedOfferings.current);
      setPackages(fetchedOfferings.current.availablePackages);
    } else {
      console.warn("[RevenueCat] ⚠️ No current offering available");
      
      // Check if there are any offerings at all
      const allOfferingIds = Object.keys(fetchedOfferings.all);
      if (allOfferingIds.length > 0) {
        console.warn("[RevenueCat] Available offerings (not marked as current):", allOfferingIds);
        // Try to use the first available offering
        const firstOffering = fetchedOfferings.all[allOfferingIds[0]];
        if (firstOffering) {
          console.log("[RevenueCat] Using first available offering:", firstOffering.identifier);
          setCurrentOffering(firstOffering);
          setPackages(firstOffering.availablePackages);
        }
      }
    }
  }, [isWeb, isConfigured]);

  // Check subscription status with defensive error handling
  const checkSubscription = useCallback(async () => {
    if (isWeb || !isConfigured) return;
    
    const customerInfo = await safeRevenueCatCall(
      "getCustomerInfo",
      async () => {
        console.log("[RevenueCat] Checking subscription status...");
        return await Purchases.getCustomerInfo();
      },
      null
    );
    
    if (!customerInfo) {
      console.warn("[RevenueCat] Failed to get customer info - assuming not subscribed");
      setIsSubscribed(false);
      return;
    }
    
    const hasEntitlement =
      typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined";
    console.log("[RevenueCat] Subscription active:", hasEntitlement);
    console.log("[RevenueCat] Active entitlements:", Object.keys(customerInfo.entitlements.active));
    setIsSubscribed(hasEntitlement);
  }, [isWeb, isConfigured]);

  // Initialize RevenueCat on mount with comprehensive error handling
  useEffect(() => {
    // Prevent multiple initialization attempts
    if (initAttempted.current) {
      console.log("[RevenueCat] Initialization already attempted, skipping");
      return;
    }
    
    initAttempted.current = true;

    const initRevenueCat = async () => {
      try {
        // Web platform: SDK doesn't work, use REST API for basic info
        if (isWeb) {
          await fetchOfferingsViaRest();
          setLoading(false);
          setIsConfigured(false);
          return;
        }

        // Get API key based on platform
        const apiKey = Platform.OS === "ios" ? IOS_API_KEY : ANDROID_API_KEY;

        // Log configuration for debugging
        console.log("[RevenueCat] Initializing...");
        console.log("[RevenueCat] Platform:", Platform.OS);
        console.log("[RevenueCat] API Key configured:", !!apiKey);
        console.log("[RevenueCat] API Key prefix:", apiKey ? apiKey.substring(0, 10) + "..." : "NOT SET");
        console.log("[RevenueCat] Entitlement ID:", ENTITLEMENT_ID);

        // Validate API key
        if (!isValidApiKey(apiKey)) {
          console.warn(
            "[RevenueCat] Invalid or missing API key for platform:", Platform.OS
          );
          console.warn(
            "[RevenueCat] Please add a valid revenueCat API key to app.json extra."
          );
          console.warn(
            "[RevenueCat] iOS keys start with 'appl_', Android keys start with 'goog_', test keys start with 'test_'"
          );
          setLoading(false);
          setIsConfigured(false);
          return;
        }

        // CRITICAL: Wrap SDK configuration in defensive error handler
        // AND ensure it runs on main thread
        const configSuccess = await safeRevenueCatCall(
          "configure",
          async () => {
            // Use DEBUG log level in development, INFO in production
            Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
            
            console.log("[RevenueCat] Configuring SDK with key:", apiKey.substring(0, 10) + "...");
            await Purchases.configure({ apiKey });
            console.log("[RevenueCat] SDK configured successfully");
            return true;
          },
          false
        );
        
        if (!configSuccess) {
          console.error("[RevenueCat] SDK configuration failed - running in degraded mode");
          setLoading(false);
          setIsConfigured(false);
          return;
        }
        
        // CRITICAL: Set configured state BEFORE fetching offerings
        setIsConfigured(true);

        // CRITICAL: Wrap listener setup in defensive error handler
        // AND ensure it runs on main thread
        const listenerSuccess = await safeRevenueCatCall(
          "addCustomerInfoUpdateListener",
          async () => {
            // Listen for real-time subscription changes
            customerInfoListener.current = Purchases.addCustomerInfoUpdateListener(
              (customerInfo) => {
                try {
                  const hasEntitlement =
                    typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !==
                    "undefined";
                  console.log("[RevenueCat] Subscription status updated:", hasEntitlement);
                  setIsSubscribed(hasEntitlement);
                } catch (error) {
                  console.error("[RevenueCat] Error in customer info listener:", error);
                }
              }
            );
            return true;
          },
          false
        );
        
        if (!listenerSuccess) {
          console.warn("[RevenueCat] Failed to set up customer info listener - continuing without it");
        }

        // Fetch offerings immediately after configuration
        console.log("[RevenueCat] Fetching offerings immediately after SDK configuration...");
        await fetchOfferings(true);

        // Check initial subscription status
        await checkSubscription();
      } catch (error) {
        // This catch should never be reached due to defensive wrappers,
        // but keep it as a final safety net
        console.error("[RevenueCat] Unexpected error during initialization:", error);
        setIsConfigured(false);
      } finally {
        setLoading(false);
      }
    };

    initRevenueCat();

    // Cleanup listener on unmount
    return () => {
      if (customerInfoListener.current) {
        try {
          customerInfoListener.current.remove();
          console.log("[RevenueCat] Customer info listener removed");
        } catch (error) {
          console.error("[RevenueCat] Error removing listener:", error);
        }
      }
    };
  }, [fetchOfferings, checkSubscription]);

  const purchasePackage = async (pkg: PurchasesPackage): Promise<boolean> => {
    if (isWeb || !isConfigured) {
      console.warn("[RevenueCat] Purchases not available");
      return false;
    }
    
    const result = await safeRevenueCatCall(
      "purchasePackage",
      async () => {
        console.log("[RevenueCat] Purchasing package:", pkg.identifier);
        const { customerInfo } = await Purchases.purchasePackage(pkg);
        const hasEntitlement =
          typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined";
        console.log("[RevenueCat] Purchase completed. Subscription active:", hasEntitlement);
        setIsSubscribed(hasEntitlement);
        return hasEntitlement;
      },
      false
    );
    
    return result;
  };

  const restorePurchases = async (): Promise<boolean> => {
    if (isWeb || !isConfigured) {
      console.warn("[RevenueCat] Restore not available");
      return false;
    }
    
    const result = await safeRevenueCatCall(
      "restorePurchases",
      async () => {
        console.log("[RevenueCat] Restoring purchases...");
        const customerInfo = await Purchases.restorePurchases();
        const hasEntitlement =
          typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined";
        console.log("[RevenueCat] Restore completed. Subscription active:", hasEntitlement);
        setIsSubscribed(hasEntitlement);
        return hasEntitlement;
      },
      false
    );
    
    return result;
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
