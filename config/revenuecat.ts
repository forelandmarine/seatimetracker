
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * RevenueCat Configuration
 * 
 * This file contains all RevenueCat-related configuration including:
 * - API keys for iOS and Android
 * - Entitlement identifiers
 * - Product identifiers
 * - Configuration validation
 */

// Get API keys from app.json extra.revenueCat config
const getRevenueCatConfig = () => {
  const extra = Constants.expoConfig?.extra;
  const revenueCatConfig = extra?.revenueCat || {};
  
  const iosApiKey = revenueCatConfig.iosApiKey || '';
  const androidApiKey = revenueCatConfig.androidApiKey || '';
  
  console.log('[RevenueCat Config] Loading configuration');
  console.log('[RevenueCat Config] iOS API Key configured:', !!iosApiKey);
  console.log('[RevenueCat Config] Android API Key configured:', !!androidApiKey);
  console.log('[RevenueCat Config] iOS Key prefix:', iosApiKey ? iosApiKey.substring(0, 10) + '...' : 'NOT SET');
  console.log('[RevenueCat Config] Android Key prefix:', androidApiKey ? androidApiKey.substring(0, 10) + '...' : 'NOT SET');
  
  return {
    iosApiKey,
    androidApiKey,
  };
};

const config = getRevenueCatConfig();

export const REVENUECAT_CONFIG = {
  // API Keys
  iosApiKey: config.iosApiKey,
  androidApiKey: config.androidApiKey,
  
  // Entitlement identifier (what the user gets access to)
  entitlementID: 'SeaTime Tracker Pro',
  
  // Product identifiers (must match App Store Connect / Google Play Console)
  productIDs: {
    MONTHLY: 'seatime_monthly',
    ANNUAL: 'seatime_annual',
  },
  
  // Helper to get the correct API key for current platform
  getApiKey: (): string => {
    const key = Platform.select({
      ios: config.iosApiKey,
      android: config.androidApiKey,
      default: config.iosApiKey, // Fallback for web/other platforms
    });
    
    if (!key) {
      console.error('[RevenueCat Config] No API key configured for platform:', Platform.OS);
    }
    
    return key || '';
  },
  
  // Validate API key format (accepts both production and test keys)
  isValidApiKey: (key: string): boolean => {
    if (!key || key.length === 0) return false;
    // Check for placeholder values
    if (key.includes('YOUR_') || key.includes('_HERE')) return false;
    // Check for valid prefixes (production or test)
    const validPrefixes = ['appl_', 'goog_', 'test_'];
    return validPrefixes.some(prefix => key.startsWith(prefix));
  },
  
  // Validate configuration
  isValid: (): boolean => {
    const hasIosKey = !!config.iosApiKey && config.iosApiKey.length > 0;
    const hasAndroidKey = !!config.androidApiKey && config.androidApiKey.length > 0;
    
    // For iOS, we need iOS key. For Android, we need Android key.
    if (Platform.OS === 'ios') {
      return hasIosKey && REVENUECAT_CONFIG.isValidApiKey(config.iosApiKey);
    } else if (Platform.OS === 'android') {
      return hasAndroidKey && REVENUECAT_CONFIG.isValidApiKey(config.androidApiKey);
    }
    
    // For other platforms (web), consider valid if at least one key exists
    return hasIosKey || hasAndroidKey;
  },
  
  // Get diagnostic information
  getDiagnostics: () => {
    const iosKey = config.iosApiKey;
    const androidKey = config.androidApiKey;
    
    return {
      platform: Platform.OS,
      iosKey: {
        configured: !!iosKey,
        validFormat: iosKey ? iosKey.startsWith('appl_') || iosKey.startsWith('test_') : false,
        isPlaceholder: iosKey === 'YOUR_IOS_API_KEY_HERE',
        isTestKey: iosKey ? iosKey.startsWith('test_') : false,
        isProductionKey: iosKey ? iosKey.startsWith('appl_') : false,
        prefix: iosKey ? iosKey.substring(0, 10) : 'NOT SET',
        length: iosKey ? iosKey.length : 0,
      },
      androidKey: {
        configured: !!androidKey,
        validFormat: androidKey ? androidKey.startsWith('goog_') || androidKey.startsWith('test_') : false,
        isPlaceholder: androidKey === 'YOUR_ANDROID_API_KEY_HERE',
        isTestKey: androidKey ? androidKey.startsWith('test_') : false,
        isProductionKey: androidKey ? androidKey.startsWith('goog_') : false,
        prefix: androidKey ? androidKey.substring(0, 10) : 'NOT SET',
        length: androidKey ? androidKey.length : 0,
      },
    };
  },
};

// Log configuration status on import
console.log('[RevenueCat Config] Configuration loaded');
console.log('[RevenueCat Config] Valid:', REVENUECAT_CONFIG.isValid());
console.log('[RevenueCat Config] Entitlement ID:', REVENUECAT_CONFIG.entitlementID);
console.log('[RevenueCat Config] Product IDs:', REVENUECAT_CONFIG.productIDs);
