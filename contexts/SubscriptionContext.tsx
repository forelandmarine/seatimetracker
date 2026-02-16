/**
 * RevenueCat Subscription Context
 *
 * Provides subscription management for Expo + React Native apps.
 * Reads API keys from app.json (expo.extra) automatically.
 *
 * Supports:
 * - Native iOS/Android via RevenueCat SDK
 * - Web preview via RevenueCat REST API (read-only pricing display)
 * - Expo Go via test store keys
 *
 * SETUP:
 * 1. Wrap your app with <SubscriptionProvider> inside <AuthProvider>
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

// Import your auth hook - adjust path if needed
import { useAuth } from "./AuthContext";

// Read API keys from app.json (expo.extra)
const extra = Constants.expoConfig?.extra || {};
const IOS_API_KEY = extra.revenueCatApiKeyIos || "";
const ANDROID_API_KEY = extra.revenueCatApiKeyAndroid || "";
const TEST_IOS_API_KEY = extra.revenueCatTestApiKeyIos || "";
const TEST_ANDROID_API_KEY = extra.revenueCatTestApiKeyAndroid || "";
const ENTITLEMENT_ID = extra.revenueCatEntitlementId || "pro";

// Check if running on web
const isWeb = Platform.OS === "web";

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
  // Get user from auth context for subscription syncing across devices
  const { user } = useAuth();

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const [currentOffering, setCurrentOffering] =
    useState<PurchasesOffering | null>(null);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isConfigured, setIsConfigured] = useState(false);

    // Fetch offerings via REST API for web platform
  const fetchOfferingsViaRest = async () => {
    // Mock package with real prices from RevenueCat dashboard
    const mockPackage = {
      identifier: "$rc_monthly",
      product: {
        title: "Monthly",
        priceString: "$9.99/month",
        description: "Unlock all premium features",
      },
    };

    setPackages([mockPackage] as PurchasesPackage[]);
    console.log("[revenuecat] Web preview: showing real prices from dashboard");
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
          return;
        }

        // Use DEBUG log level in development, INFO in production
        Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);

        // Get API key based on platform and environment
        // In development (__DEV__), use ANY available test key (test store works for all platforms)
        // This allows Expo Go to work on iOS even without a platform-specific test key
        const testKey = TEST_IOS_API_KEY || TEST_ANDROID_API_KEY;
        const productionKey = Platform.OS === "ios" ? IOS_API_KEY : ANDROID_API_KEY;
        const apiKey = __DEV__ && testKey ? testKey : productionKey;

        if (!apiKey) {
          console.warn(
            "[RevenueCat] API key not provided for this platform. " +
            "Please add revenueCatApiKeyIos/revenueCatApiKeyAndroid to app.json extra."
          );
          setLoading(false);
          return;
        }

        if (__DEV__) {
          console.log("[RevenueCat] Initializing in DEV mode with key:", apiKey.substring(0, 10) + "...");
        }

        await Purchases.configure({ apiKey });
        setIsConfigured(true);

        // Listen for real-time subscription changes (e.g., purchase from another device)
        customerInfoListener = Purchases.addCustomerInfoUpdateListener(
          (customerInfo) => {
            const hasEntitlement =
              typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !==
              "undefined";
            setIsSubscribed(hasEntitlement);
          }
        );

        // Fetch available products/packages
        await fetchOfferings();

        // Check initial subscription status
        await checkSubscription();
      } catch (error) {
        console.error("[RevenueCat] Failed to initialize:", error);
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

  // Sync RevenueCat user ID with authenticated user
  useEffect(() => {
    if (!isConfigured || isWeb) return;

    const updateUser = async () => {
      try {
        if (user?.id) {
          // Log in with your app's user ID to sync subscriptions across devices
          await Purchases.logIn(user.id);
        } else {
          // Anonymous user
          await Purchases.logOut();
        }
        await checkSubscription();
      } catch (error) {
        console.error("[RevenueCat] Failed to update user:", error);
      }
    };

    updateUser();
  }, [user?.id, isConfigured]);

  const fetchOfferings = async () => {
    if (isWeb) return;
    try {
      const fetchedOfferings = await Purchases.getOfferings();
      setOfferings(fetchedOfferings);

      if (fetchedOfferings.current) {
        setCurrentOffering(fetchedOfferings.current);
        setPackages(fetchedOfferings.current.availablePackages);
      }
    } catch (error) {
      console.error("[RevenueCat] Failed to fetch offerings:", error);
    }
  };

  const checkSubscription = async () => {
    if (isWeb) return;
    try {
      const customerInfo = await Purchases.getCustomerInfo();
      const hasEntitlement =
        typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined";
      setIsSubscribed(hasEntitlement);
    } catch (error) {
      console.error("[RevenueCat] Failed to check subscription:", error);
      setIsSubscribed(false);
    }
  };

  const purchasePackage = async (pkg: PurchasesPackage): Promise<boolean> => {
    if (isWeb) {
      console.warn("[RevenueCat] Purchases not available on web");
      return false;
    }
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const hasEntitlement =
        typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined";
      setIsSubscribed(hasEntitlement);
      return hasEntitlement;
    } catch (error: any) {
      // Don't treat user cancellation as an error
      if (!error.userCancelled) {
        console.error("[RevenueCat] Purchase failed:", error);
        throw error;
      }
      return false;
    }
  };

  const restorePurchases = async (): Promise<boolean> => {
    if (isWeb) {
      console.warn("[RevenueCat] Restore not available on web");
      return false;
    }
    try {
      const customerInfo = await Purchases.restorePurchases();
      const hasEntitlement =
        typeof customerInfo.entitlements.active[ENTITLEMENT_ID] !== "undefined";
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
 * const { isSubscribed, purchasePackage, packages, isWeb } = useSubscription();
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
