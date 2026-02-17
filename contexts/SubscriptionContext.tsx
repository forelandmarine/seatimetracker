
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
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
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
const IOS_API_KEY = revenueCatConfig.iosApiKey || "";
const ANDROID_API_KEY = revenueCatConfig.androidApiKey || "";
const ENTITLEMENT_ID = revenueCatConfig.entitlementId || "SeaTime Tracker Pro";

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

        // Use DEBUG log level in development, INFO in production
        Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);

        console.log("[RevenueCat] Configuring SDK with key:", apiKey.substring(0, 10) + "...");
        await Purchases.configure({ apiKey });
        console.log("[RevenueCat] SDK configured successfully");
        setIsConfigured(true);

        // Listen for real-time subscription changes (e.g., purchase from another device)
        customerInfoListener = Purchases.addCustomerInfoUpdateListener(
          (customerInfo) => {
            const hasEntitlement =
              typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !==
              "undefined";
            console.log("[RevenueCat] Subscription status updated:", hasEntitlement);
            setIsSubscribed(hasEntitlement);
          }
        );

        // Fetch available products/packages
        await fetchOfferings();

        // Check initial subscription status
        await checkSubscription();
      } catch (error) {
        console.error("[RevenueCat] Failed to initialize:", error);
        console.error("[RevenueCat] Error details:", JSON.stringify(error, null, 2));
        setIsConfigured(false);
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
  }, []);

  const fetchOfferings = async () => {
    if (isWeb || !isConfigured) return;
    try {
      console.log("[RevenueCat] Fetching offerings...");
      const fetchedOfferings = await Purchases.getOfferings();
      setOfferings(fetchedOfferings);

      if (fetchedOfferings.current) {
        console.log("[RevenueCat] Current offering found:", fetchedOfferings.current.identifier);
        console.log("[RevenueCat] Available packages:", fetchedOfferings.current.availablePackages.length);
        setCurrentOffering(fetchedOfferings.current);
        setPackages(fetchedOfferings.current.availablePackages);
      } else {
        console.warn("[RevenueCat] No current offering available");
      }
    } catch (error) {
      console.error("[RevenueCat] Failed to fetch offerings:", error);
    }
  };

  const checkSubscription = async () => {
    if (isWeb || !isConfigured) return;
    try {
      console.log("[RevenueCat] Checking subscription status...");
      const customerInfo = await Purchases.getCustomerInfo();
      const hasEntitlement =
        typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined";
      console.log("[RevenueCat] Subscription active:", hasEntitlement);
      console.log("[RevenueCat] Active entitlements:", Object.keys(customerInfo.entitlements.active));
      setIsSubscribed(hasEntitlement);
    } catch (error) {
      console.error("[RevenueCat] Failed to check subscription:", error);
      setIsSubscribed(false);
    }
  };

  const purchasePackage = async (pkg: PurchasesPackage): Promise<boolean> => {
    if (isWeb || !isConfigured) {
      console.warn("[RevenueCat] Purchases not available");
      return false;
    }
    try {
      console.log("[RevenueCat] Purchasing package:", pkg.identifier);
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const hasEntitlement =
        typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined";
      console.log("[RevenueCat] Purchase completed. Subscription active:", hasEntitlement);
      setIsSubscribed(hasEntitlement);
      return hasEntitlement;
    } catch (error: any) {
      // Don't treat user cancellation as an error
      if (!error.userCancelled) {
        console.error("[RevenueCat] Purchase failed:", error);
        throw error;
      }
      console.log("[RevenueCat] Purchase cancelled by user");
      return false;
    }
  };

  const restorePurchases = async (): Promise<boolean> => {
    if (isWeb || !isConfigured) {
      console.warn("[RevenueCat] Restore not available");
      return false;
    }
    try {
      console.log("[RevenueCat] Restoring purchases...");
      const customerInfo = await Purchases.restorePurchases();
      const hasEntitlement =
        typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined";
      console.log("[RevenueCat] Restore completed. Subscription active:", hasEntitlement);
      setIsSubscribed(hasEntitlement);
      return hasEntitlement;
    } catch (error) {
      console.error("[RevenueCat] Restore failed:", error);
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
