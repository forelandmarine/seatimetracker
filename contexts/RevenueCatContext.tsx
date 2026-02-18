
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Platform, Alert } from 'react-native';
import Purchases, { 
  CustomerInfo, 
  PurchasesOffering, 
  PurchasesPackage,
  LOG_LEVEL,
} from 'react-native-purchases';
import { REVENUECAT_CONFIG } from '@/config/revenuecat';
import { useAuth } from './AuthContext';

console.log('[RevenueCat] Context module loaded');

interface RevenueCatContextType {
  // Subscription state
  isPro: boolean;
  hasActiveSubscription: boolean;
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOffering | null;
  
  // Loading states
  isLoading: boolean;
  isInitialized: boolean;
  
  // Actions
  purchasePackage: (pkg: PurchasesPackage) => Promise<{ success: boolean; error?: string }>;
  restorePurchases: () => Promise<{ success: boolean; error?: string }>;
  refreshCustomerInfo: () => Promise<void>;
  
  // Helpers
  isSubscriptionRequired: boolean;
  getExpirationDate: () => Date | null;
}

const RevenueCatContext = createContext<RevenueCatContextType | undefined>(undefined);

export function RevenueCatProvider({ children }: { children: ReactNode }) {
  console.log('[RevenueCat] Provider mounting');
  
  const { user, isAuthenticated } = useAuth();
  
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);

  // Initialize RevenueCat SDK
  useEffect(() => {
    console.log('[RevenueCat] Initialization effect triggered');
    console.log('[RevenueCat] Platform:', Platform.OS);
    console.log('[RevenueCat] Config valid:', REVENUECAT_CONFIG.isValid());
    
    // Skip initialization on web
    if (Platform.OS === 'web') {
      console.log('[RevenueCat] Skipping initialization on web platform');
      setIsLoading(false);
      setIsInitialized(false);
      return;
    }
    
    // Validate configuration
    if (!REVENUECAT_CONFIG.isValid()) {
      console.error('[RevenueCat] Invalid configuration - missing API keys');
      console.error('[RevenueCat] Diagnostics:', REVENUECAT_CONFIG.getDiagnostics());
      setIsLoading(false);
      setIsInitialized(false);
      return;
    }
    
    const initializeRevenueCat = async () => {
      try {
        console.log('[RevenueCat] Starting SDK initialization');
        
        const apiKey = REVENUECAT_CONFIG.getApiKey();
        console.log('[RevenueCat] Using API key prefix:', apiKey.substring(0, 10) + '...');
        
        // Configure SDK
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);
        
        // Configure with API key
        await Purchases.configure({ apiKey });
        
        console.log('[RevenueCat] SDK configured successfully');
        
        // Set user ID if authenticated
        if (isAuthenticated && user?.id) {
          console.log('[RevenueCat] Logging in user:', user.id);
          await Purchases.logIn(user.id);
          console.log('[RevenueCat] User logged in successfully');
        }
        
        // Fetch initial customer info
        console.log('[RevenueCat] Fetching initial customer info');
        const info = await Purchases.getCustomerInfo();
        console.log('[RevenueCat] Customer info received');
        console.log('[RevenueCat] Active entitlements:', Object.keys(info.entitlements.active));
        setCustomerInfo(info);
        updateSubscriptionStatus(info);
        
        // Fetch offerings
        console.log('[RevenueCat] Fetching offerings');
        const fetchedOfferings = await Purchases.getOfferings();
        console.log('[RevenueCat] Offerings received');
        console.log('[RevenueCat] Current offering:', fetchedOfferings.current?.identifier);
        setOfferings(fetchedOfferings.current);
        
        // Set up customer info update listener
        Purchases.addCustomerInfoUpdateListener((info) => {
          console.log('[RevenueCat] Customer info updated via listener');
          console.log('[RevenueCat] Active entitlements:', Object.keys(info.entitlements.active));
          setCustomerInfo(info);
          updateSubscriptionStatus(info);
        });
        
        setIsInitialized(true);
        console.log('[RevenueCat] Initialization complete');
      } catch (error: any) {
        console.error('[RevenueCat] Initialization error:', error);
        console.error('[RevenueCat] Error details:', {
          message: error.message,
          code: error.code,
          underlyingErrorMessage: error.underlyingErrorMessage,
        });
        setIsInitialized(false);
      } finally {
        setIsLoading(false);
      }
    };
    
    initializeRevenueCat();
  }, [isAuthenticated, user?.id]);

  // Update subscription status based on customer info
  const updateSubscriptionStatus = useCallback((info: CustomerInfo) => {
    console.log('[RevenueCat] Updating subscription status');
    
    // Check if user has the pro entitlement
    const proEntitlement = info.entitlements.active[REVENUECAT_CONFIG.entitlementID];
    const hasPro = !!proEntitlement;
    
    console.log('[RevenueCat] Pro entitlement active:', hasPro);
    if (hasPro && proEntitlement) {
      console.log('[RevenueCat] Entitlement expires:', proEntitlement.expirationDate);
      console.log('[RevenueCat] Product identifier:', proEntitlement.productIdentifier);
    }
    
    setIsPro(hasPro);
    setHasActiveSubscription(hasPro);
  }, []);

  // Purchase a package
  const purchasePackage = useCallback(async (pkg: PurchasesPackage): Promise<{ success: boolean; error?: string }> => {
    console.log('[RevenueCat] Starting purchase for package:', pkg.identifier);
    console.log('[RevenueCat] Product:', pkg.product.identifier);
    
    try {
      const { customerInfo: info } = await Purchases.purchasePackage(pkg);
      console.log('[RevenueCat] Purchase successful');
      console.log('[RevenueCat] Active entitlements:', Object.keys(info.entitlements.active));
      
      setCustomerInfo(info);
      updateSubscriptionStatus(info);
      
      return { success: true };
    } catch (error: any) {
      console.error('[RevenueCat] Purchase error:', error);
      console.error('[RevenueCat] Error details:', {
        message: error.message,
        code: error.code,
        userCancelled: error.userCancelled,
      });
      
      // Don't show alert if user cancelled
      if (error.userCancelled) {
        console.log('[RevenueCat] User cancelled purchase');
        return { success: false, error: 'User cancelled' };
      }
      
      return { 
        success: false, 
        error: error.message || 'Purchase failed. Please try again.' 
      };
    }
  }, [updateSubscriptionStatus]);

  // Restore purchases
  const restorePurchases = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    console.log('[RevenueCat] Restoring purchases');
    
    try {
      const info = await Purchases.restorePurchases();
      console.log('[RevenueCat] Purchases restored');
      console.log('[RevenueCat] Active entitlements:', Object.keys(info.entitlements.active));
      
      setCustomerInfo(info);
      updateSubscriptionStatus(info);
      
      const hasPro = !!info.entitlements.active[REVENUECAT_CONFIG.entitlementID];
      
      if (hasPro) {
        Alert.alert(
          'Purchases Restored',
          'Your subscription has been restored successfully.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'No Purchases Found',
          'We couldn\'t find any active subscriptions to restore.',
          [{ text: 'OK' }]
        );
      }
      
      return { success: true };
    } catch (error: any) {
      console.error('[RevenueCat] Restore error:', error);
      console.error('[RevenueCat] Error details:', {
        message: error.message,
        code: error.code,
      });
      
      return { 
        success: false, 
        error: error.message || 'Failed to restore purchases. Please try again.' 
      };
    }
  }, [updateSubscriptionStatus]);

  // Refresh customer info
  const refreshCustomerInfo = useCallback(async () => {
    console.log('[RevenueCat] Refreshing customer info');
    
    if (!isInitialized) {
      console.log('[RevenueCat] SDK not initialized, skipping refresh');
      return;
    }
    
    try {
      const info = await Purchases.getCustomerInfo();
      console.log('[RevenueCat] Customer info refreshed');
      console.log('[RevenueCat] Active entitlements:', Object.keys(info.entitlements.active));
      
      setCustomerInfo(info);
      updateSubscriptionStatus(info);
    } catch (error: any) {
      console.error('[RevenueCat] Refresh error:', error);
    }
  }, [isInitialized, updateSubscriptionStatus]);

  // Get expiration date
  const getExpirationDate = useCallback((): Date | null => {
    if (!customerInfo) {
      return null;
    }
    
    const proEntitlement = customerInfo.entitlements.active[REVENUECAT_CONFIG.entitlementID];
    if (!proEntitlement || !proEntitlement.expirationDate) {
      return null;
    }
    
    return new Date(proEntitlement.expirationDate);
  }, [customerInfo]);

  const value: RevenueCatContextType = {
    isPro,
    hasActiveSubscription,
    customerInfo,
    offerings,
    isLoading,
    isInitialized,
    purchasePackage,
    restorePurchases,
    refreshCustomerInfo,
    isSubscriptionRequired: !isPro,
    getExpirationDate,
  };

  console.log('[RevenueCat] Provider rendering with state:', {
    isInitialized,
    isLoading,
    isPro,
    hasActiveSubscription,
    hasOfferings: !!offerings,
  });

  return (
    <RevenueCatContext.Provider value={value}>
      {children}
    </RevenueCatContext.Provider>
  );
}

export function useRevenueCat() {
  const context = useContext(RevenueCatContext);
  if (context === undefined) {
    throw new Error('useRevenueCat must be used within RevenueCatProvider');
  }
  return context;
}
