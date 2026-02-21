import { Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';

const REVENUECAT_IOS_API_KEY = 'appl_JGAVizuUPjFzvacGxciCepqaqAJ';
const ENTITLEMENT_ID = 'pro';

let configuredForUserId: string | null = null;
let initialized = false;

export function isRevenueCatSupportedPlatform() {
  return Platform.OS === 'ios';
}

export async function initializeRevenueCat(appUserId?: string) {
  if (!isRevenueCatSupportedPlatform()) {
    return;
  }

  if (!initialized) {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);

    await Purchases.configure({
      apiKey: REVENUECAT_IOS_API_KEY,
      appUserID: appUserId,
    });

    initialized = true;
    configuredForUserId = appUserId ?? null;
    return;
  }

  if (appUserId && configuredForUserId !== appUserId) {
    await Purchases.logIn(appUserId);
    configuredForUserId = appUserId;
  }
}

export async function fetchCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!isRevenueCatSupportedPlatform()) {
    return null;
  }

  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

export function getMonthlyPackage(offering: PurchasesOffering | null): PurchasesPackage | null {
  if (!offering) {
    return null;
  }

  return offering.monthly ?? offering.availablePackages[0] ?? null;
}

export async function purchaseMonthlySubscription(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const purchaseResult = await Purchases.purchasePackage(pkg);
  return purchaseResult.customerInfo;
}

export async function restoreSubscriptionPurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

export async function getCustomerInfo(): Promise<CustomerInfo> {
  return Purchases.getCustomerInfo();
}

export function hasActiveSubscription(customerInfo: CustomerInfo): boolean {
  if (customerInfo.entitlements.active[ENTITLEMENT_ID]) {
    return true;
  }

  return Object.keys(customerInfo.entitlements.active).length > 0;
}

export async function openNativeManageSubscriptions() {
  if (!isRevenueCatSupportedPlatform()) {
    return;
  }

  await Purchases.showManageSubscriptions();
}
