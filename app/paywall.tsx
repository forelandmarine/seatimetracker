
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
  Image,
  AppState,
  AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import Purchases from 'react-native-purchases';
import Constants from 'expo-constants';

import { log, warn, error as logError } from '@/utils/log';

// Read product IDs and entitlement from app.json config — avoids hardcoding
// so they can be changed in one place without touching component code.
const PRO_ENTITLEMENT_ID = Constants.expoConfig?.extra?.revenueCatEntitlementId || 'pro';
const PRODUCT_IDS_CONFIG = {
  monthly: Constants.expoConfig?.extra?.monthlyProductId || 'com.subscription.monthly',
  annual: Constants.expoConfig?.extra?.annualProductId || 'com.subscription.annual',
};

/** Format introductory offer as user-friendly text, e.g. "Free 1-month trial" */
function formatIntroOffer(intro: { price: number; priceString: string; periodNumberOfUnits: number; periodUnit: string }): string {
  const isFree = intro.priceString === '$0.00' || intro.price === 0;
  const n = intro.periodNumberOfUnits;
  const unit = intro.periodUnit === 'DAY' ? 'day' : intro.periodUnit === 'WEEK' ? 'week' : 'month';
  if (isFree) {
    return `Free ${n}-${unit} trial`;
  }
  return `${intro.priceString} for ${n} ${unit}${n !== 1 ? 's' : ''}`;
}

export default function PaywallScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();
  
  const {
    isSubscribed,
    isLoading,
    availablePackages,
    purchasePackage,
    restorePurchases,
    refreshOfferings,
    error: subscriptionError,
  } = useSubscription();

  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  // Default to annual if available, otherwise monthly
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');

  // Auto-select the first available plan if the default isn't available
  useEffect(() => {
    if (availablePackages.length > 0) {
      const hasAnnual = availablePackages.some(
        (pkg) => pkg.product.identifier === PRODUCT_IDS.annual || pkg.packageType === 'ANNUAL'
      );
      const hasMonthly = availablePackages.some(
        (pkg) => pkg.product.identifier === PRODUCT_IDS.monthly || pkg.packageType === 'MONTHLY'
      );
      log('[Paywall] Packages resolved - hasAnnual:', hasAnnual, 'hasMonthly:', hasMonthly);
      if (selectedPlan === 'annual' && !hasAnnual && hasMonthly) {
        setSelectedPlan('monthly');
      } else if (selectedPlan === 'monthly' && !hasMonthly && hasAnnual) {
        setSelectedPlan('annual');
      }
    }
  }, [availablePackages]);
  const [offeringsLoading, setOfferingsLoading] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const waitingForRedeemRef = useRef(false);

  const PRODUCT_IDS = PRODUCT_IDS_CONFIG;

  // When app returns to foreground after redeem flow, refresh subscription status
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      const isNowActive = nextAppState === 'active';
      if (wasBackground && isNowActive && waitingForRedeemRef.current) {
        waitingForRedeemRef.current = false;
        log('[Paywall] App returned to foreground after redeem — refreshing subscription status');
        try {
          const info = await Purchases.getCustomerInfo();
          const hasActiveEntitlement = info.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined || Object.keys(info.entitlements.active).length > 0;
          log('[Paywall] Post-redeem subscription check — active entitlements:', Object.keys(info.entitlements.active));
          if (hasActiveEntitlement) {
            log('[Paywall] Subscription active after redeem, navigating home');
            router.replace('/(tabs)/(home)');
          }
        } catch (err) {
          logError('[Paywall] Failed to refresh subscription after redeem:', err);
        }
      }
      appStateRef.current = nextAppState;
    });
    return () => subscription.remove();
  }, []);

  // Refresh offerings on mount if they haven't loaded yet (race condition
  // after login — SubscriptionContext may not have fetched them before the
  // paywall renders).
  useEffect(() => {
    log('[Paywall] Paywall screen mounted');
    log('[Paywall] Available packages:', availablePackages.length);
    log('[Paywall] Is loading:', isLoading);
    log('[Paywall] Is subscribed:', isSubscribed);

    if (availablePackages.length === 0 && !isLoading) {
      log('[Paywall] No packages available on mount — refreshing offerings');
      setOfferingsLoading(true);
      refreshOfferings()
        .catch((err: any) => {
          logError('[Paywall] Failed to refresh offerings on mount:', err?.message);
        })
        .finally(() => setOfferingsLoading(false));
    }
  }, []);

  // Redirect if already subscribed
  useEffect(() => {
    if (!isLoading && isSubscribed) {
      log('[Paywall] User is subscribed, redirecting to home');
      router.replace('/(tabs)/(home)');
    }
  }, [isSubscribed, isLoading]);

  const handlePurchase = async () => {
    if (availablePackages.length === 0) {
      logError('[Paywall] Cannot purchase - no packages available');
      Alert.alert(
        'Subscription Unavailable',
        'Subscription packages are currently unavailable. Please try again later or contact support if the problem persists.',
        [{ text: 'OK', style: 'cancel' }]
      );
      return;
    }

    // Find the package for the selected plan — try exact product ID, then
    // RevenueCat package type, then fall back to first available.
    const targetProductId = PRODUCT_IDS[selectedPlan];
    const targetPackageType = selectedPlan === 'annual' ? 'ANNUAL' : 'MONTHLY';
    let packageToPurchase =
      availablePackages.find((pkg) => pkg.product.identifier === targetProductId) ||
      availablePackages.find((pkg) => pkg.packageType === targetPackageType) ||
      availablePackages[0];

    if (!packageToPurchase) {
      logError('[Paywall] No valid subscription product found');
      Alert.alert(
        'Subscription Unavailable',
        'The subscription product is not available. Please try again later or contact support.',
        [{ text: 'OK', style: 'cancel' }]
      );
      return;
    }

    log('[Paywall] Initiating purchase for:', packageToPurchase.product.identifier);
    setPurchasing(true);

    try {
      const result = await purchasePackage(packageToPurchase);
      
      if (result.success) {
        log('[Paywall] Purchase successful');
        Alert.alert(
          'Subscription Active',
          'Your subscription is now active. Enjoy unlimited vessel tracking!',
          [
            {
              text: 'Continue',
              onPress: () => router.replace('/(tabs)/(home)'),
            },
          ]
        );
      } else {
        warn('[Paywall] Purchase completed but subscription not active');
        Alert.alert(
          'Processing Purchase',
          'Your purchase is being processed. Please wait a moment and check back.',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      logError('[Paywall] Purchase failed:', error);
      
      if (error.message === 'Purchase cancelled') {
        log('[Paywall] User cancelled purchase');
      } else {
        Alert.alert(
          'Purchase Failed',
          'Unable to complete your purchase. Please try again or contact support if the problem persists.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    log('[Paywall] User initiated restore');
    setRestoring(true);

    try {
      const info = await restorePurchases();
      
      const hasActiveEntitlement = info.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined || Object.keys(info.entitlements.active).length > 0;
      
      if (hasActiveEntitlement) {
        log('[Paywall] Purchases restored successfully');
        Alert.alert(
          'Purchases Restored',
          'Your subscription has been restored successfully.',
          [
            {
              text: 'Continue',
              onPress: () => router.replace('/(tabs)/(home)'),
            },
          ]
        );
      } else {
        log('[Paywall] No active purchases found');
        Alert.alert(
          'No Purchases Found',
          'No active subscriptions were found for this Apple ID. If you believe this is an error, please contact support.',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      logError('[Paywall] Restore failed:', error);
      Alert.alert(
        'Restore Failed',
        'Unable to restore purchases. Please try again or contact support if the problem persists.',
        [{ text: 'OK' }]
      );
    } finally {
      setRestoring(false);
    }
  };

  const handleTerms = () => {
    const termsUrl = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
    log('[Paywall] Opening Terms of Service:', termsUrl);
    Linking.openURL(termsUrl).catch(err => {
      logError('[Paywall] Failed to open Terms URL:', err);
      Alert.alert('Error', 'Unable to open Terms of Service. Please visit apple.com/legal/internet-services/itunes/dev/stdeula/');
    });
  };

  const handlePrivacy = () => {
    const privacyUrl = 'https://forelandmarine.com/privacy-policy';
    log('[Paywall] Opening Privacy Policy:', privacyUrl);
    Linking.openURL(privacyUrl).catch(err => {
      logError('[Paywall] Failed to open Privacy URL:', err);
      Alert.alert('Error', 'Unable to open Privacy Policy. Please visit forelandmarine.com/privacy-policy');
    });
  };

  const handleRedeemCode = async () => {
    log('[Paywall] User tapped Redeem Code');
    waitingForRedeemRef.current = true;
    try {
      // Use RevenueCat's native code redemption sheet (iOS 14+)
      await Purchases.presentCodeRedemptionSheet();
      log('[Paywall] Code redemption sheet presented');
    } catch (err) {
      warn('[Paywall] presentCodeRedemptionSheet failed, falling back to App Store URL:', err);
      // Fallback to App Store redeem URL
      Linking.openURL('https://apps.apple.com/redeem').catch(linkErr => {
        waitingForRedeemRef.current = false;
        logError('[Paywall] Failed to open App Store redeem URL:', linkErr);
        Alert.alert(
          'Unable to Open App Store',
          'Please open the App Store manually, tap your profile, and select "Redeem Gift Card or Code".',
          [{ text: 'OK' }]
        );
      });
    }
  };

  const handleClose = () => {
    // Always go to /auth — authenticated users will be redirected through the
    // normal index → subscription → tabs flow. Going to /(tabs) while unsubscribed
    // would immediately redirect back to paywall, creating a soft-lock.
    log('[Paywall] User tapped X button, navigating to /auth');
    router.replace('/auth');
  };

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundLight }]}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: isDark ? colors.text : colors.textLight }]}>
              Loading subscription options...
            </Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Log all available packages for debugging product ID mismatches
  log('[Paywall] Available packages:', availablePackages.map(p => ({
    id: p.product.identifier,
    type: p.packageType,
    price: p.product.priceString,
    introPrice: p.product.introPrice?.priceString || null,
  })));

  // Find packages — try exact product ID match first, then fall back to
  // RevenueCat package type (ANNUAL / MONTHLY) so the paywall still works
  // even if product IDs don't exactly match the config.
  const annualPackage =
    availablePackages.find((pkg) => pkg.product.identifier === PRODUCT_IDS.annual) ||
    availablePackages.find((pkg) => pkg.packageType === 'ANNUAL');
  const monthlyPackage =
    availablePackages.find((pkg) => pkg.product.identifier === PRODUCT_IDS.monthly) ||
    availablePackages.find((pkg) => pkg.packageType === 'MONTHLY');

  log('[Paywall] Resolved packages:', {
    annual: annualPackage?.product.identifier || 'NOT FOUND',
    monthly: monthlyPackage?.product.identifier || 'NOT FOUND',
    lookingFor: PRODUCT_IDS,
  });

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['bottom']} style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundLight }]}>
        {/* X Button - Top Right */}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Close"
          accessibilityRole="button"
        >
          <IconSymbol
            ios_icon_name="xmark"
            android_material_icon_name="close"
            size={24}
            color={isDark ? colors.text : colors.textLight}
          />
        </TouchableOpacity>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Image
              source={require('@/assets/images/8331a0b9-33c9-4ff2-93d0-772c257bd0c9.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={[styles.title, { color: isDark ? colors.text : colors.textLight }]}>
              SeaTime Tracker
            </Text>
            <Text style={[styles.subtitle, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
              By Foreland Marine
            </Text>
          </View>

          {/* Plan selector — annual or monthly */}
          <View style={styles.planSelector}>
            {/* Annual plan card */}
            {annualPackage && (
              <TouchableOpacity
                style={[
                  styles.planCard,
                  {
                    backgroundColor: isDark ? colors.cardBackground : colors.card,
                    borderColor: selectedPlan === 'annual' ? colors.primary : (isDark ? colors.border : colors.borderLight),
                    borderWidth: selectedPlan === 'annual' ? 2 : 1,
                  },
                ]}
                onPress={() => setSelectedPlan('annual')}
              >
                <View style={styles.planBadge}>
                  <Text style={styles.planBadgeText}>BEST VALUE</Text>
                </View>
                <Text style={[styles.planTitle, { color: isDark ? colors.text : colors.textLight }]}>
                  Annual
                </Text>
                <Text style={[styles.planPrice, { color: isDark ? colors.text : colors.textLight }]}>
                  {annualPackage.product.priceString}
                </Text>
                <Text style={[styles.planPeriod, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
                  per year
                </Text>
                {annualPackage.product.introPrice ? (
                  <Text style={[styles.planSavings, { color: colors.success }]}>
                    {formatIntroOffer(annualPackage.product.introPrice)}
                  </Text>
                ) : (
                  <Text style={[styles.planSavings, { color: colors.success }]}>
                    Save ~17%
                  </Text>
                )}
                {selectedPlan === 'annual' && (
                  <View style={styles.planSelectedIndicator}>
                    <IconSymbol
                      ios_icon_name="checkmark.circle.fill"
                      android_material_icon_name="check-circle"
                      size={20}
                      color={colors.primary}
                    />
                  </View>
                )}
              </TouchableOpacity>
            )}

            {/* Monthly plan card */}
            {monthlyPackage && (
              <TouchableOpacity
                style={[
                  styles.planCard,
                  {
                    backgroundColor: isDark ? colors.cardBackground : colors.card,
                    borderColor: selectedPlan === 'monthly' ? colors.primary : (isDark ? colors.border : colors.borderLight),
                    borderWidth: selectedPlan === 'monthly' ? 2 : 1,
                  },
                ]}
                onPress={() => setSelectedPlan('monthly')}
              >
                <Text style={[styles.planTitle, { color: isDark ? colors.text : colors.textLight }]}>
                  Monthly
                </Text>
                <Text style={[styles.planPrice, { color: isDark ? colors.text : colors.textLight }]}>
                  {monthlyPackage.product.priceString}
                </Text>
                <Text style={[styles.planPeriod, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
                  per month
                </Text>
                {monthlyPackage.product.introPrice && (
                  <Text style={[styles.planSavings, { color: colors.success }]}>
                    {formatIntroOffer(monthlyPackage.product.introPrice)}
                  </Text>
                )}
                {selectedPlan === 'monthly' && (
                  <View style={styles.planSelectedIndicator}>
                    <IconSymbol
                      ios_icon_name="checkmark.circle.fill"
                      android_material_icon_name="check-circle"
                      size={20}
                      color={colors.primary}
                    />
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Subscription terms (App Store requirement) */}
          <View style={styles.subscriptionTerms}>
            <Text style={[styles.termsText, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
              • Subscription automatically renews unless cancelled
            </Text>
            <Text style={[styles.termsText, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
              • Cancel anytime in App Store settings
            </Text>
            <Text style={[styles.termsText, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
              • Payment charged to Apple ID at confirmation
            </Text>
          </View>

          {/* Features List */}
          <View style={styles.featuresContainer}>
            <Text style={[styles.featuresTitle, { color: isDark ? colors.text : colors.textLight }]}>
              Premium Features
            </Text>
            {[
              { icon: 'check-circle', text: 'Automatic Vessel Tracking' },
              { icon: 'check-circle', text: 'Easy Sea Time Recording' },
              { icon: 'check-circle', text: 'MCA-Compliant Reports' },
              { icon: 'check-circle', text: 'Cloud Sync & Backup' },
              { icon: 'check-circle', text: 'Smart Notifications' },
            ].map((feature, index) => (
              <View key={index} style={styles.featureRow}>
                <IconSymbol
                  ios_icon_name="checkmark.circle.fill"
                  android_material_icon_name={feature.icon}
                  size={24}
                  color={colors.success}
                />
                <Text style={[styles.featureText, { color: isDark ? colors.text : colors.textLight }]}>
                  {feature.text}
                </Text>
              </View>
            ))}
          </View>

          {/* Error Message */}
          {subscriptionError && (
            <View style={styles.errorContainer}>
              <IconSymbol
                ios_icon_name="exclamationmark.triangle.fill"
                android_material_icon_name="warning"
                size={20}
                color={colors.error}
              />
              <Text style={styles.errorText}>
                Unable to load subscription. Please check your connection and try again.
              </Text>
            </View>
          )}

          {/* Setup Notice - Only show if no packages available */}
          {availablePackages.length === 0 && (
            <View style={styles.setupNotice}>
              {offeringsLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <IconSymbol
                  ios_icon_name="exclamationmark.triangle.fill"
                  android_material_icon_name="warning"
                  size={20}
                  color={colors.warning}
                />
              )}
              <Text style={[styles.setupNoticeText, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
                {offeringsLoading
                  ? 'Loading subscription options...'
                  : 'Subscription is temporarily unavailable. Please try again.'}
              </Text>
              {!offeringsLoading && (
                <TouchableOpacity
                  onPress={() => {
                    setOfferingsLoading(true);
                    refreshOfferings()
                      .catch(() => {})
                      .finally(() => setOfferingsLoading(false));
                  }}
                  style={{ marginLeft: 8 }}
                >
                  <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Action Buttons - Now inside ScrollView for continuous flow */}
          <View style={styles.actionsContainer}>
            {/* Primary Subscribe Button */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: colors.primary },
                (purchasing || restoring || (!annualPackage && !monthlyPackage)) && styles.buttonDisabled
              ]}
              onPress={handlePurchase}
              disabled={purchasing || restoring || (!annualPackage && !monthlyPackage)}
            >
              {purchasing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {(!annualPackage && !monthlyPackage)
                    ? 'Subscription Unavailable'
                    : (() => {
                        const pkg = selectedPlan === 'annual' ? annualPackage : monthlyPackage;
                        const hasFreeTrial = pkg?.product.introPrice && (pkg.product.introPrice.priceString === '$0.00' || pkg.product.introPrice.price === 0);
                        return hasFreeTrial ? 'Start Free Trial' : 'Subscribe Now';
                      })()}
                </Text>
              )}
            </TouchableOpacity>

            {/* Restore Purchases Button (App Store requirement) */}
            <TouchableOpacity
              style={styles.restoreButton}
              onPress={handleRestore}
              disabled={purchasing || restoring}
            >
              {restoring ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={[styles.restoreButtonText, { color: colors.primary }]}>
                  Restore Purchases
                </Text>
              )}
            </TouchableOpacity>

            {/* Redeem Code Button (iOS only) */}
            {Platform.OS === 'ios' && (
              <View style={styles.redeemContainer}>
                <TouchableOpacity
                  style={styles.redeemButton}
                  onPress={handleRedeemCode}
                  disabled={purchasing || restoring}
                >
                  <Text style={styles.redeemButtonText}>
                    Redeem Code
                  </Text>
                </TouchableOpacity>
                <Text style={[styles.redeemHintText, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
                  You'll be taken to the App Store to enter your code
                </Text>
              </View>
            )}

            {/* Legal Links (App Store requirement) */}
            <View style={styles.legalLinks}>
              <TouchableOpacity onPress={handleTerms} style={styles.legalButton}>
                <Text style={[styles.legalLinkText, { color: colors.primary }]}>
                  Terms of Service
                </Text>
              </TouchableOpacity>
              <Text style={[styles.legalSeparator, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
                •
              </Text>
              <TouchableOpacity onPress={handlePrivacy} style={styles.legalButton}>
                <Text style={[styles.legalLinkText, { color: colors.primary }]}>
                  Privacy Policy
                </Text>
              </TouchableOpacity>
            </View>

            {/* Subscription Disclaimer (App Store requirement) */}
            <Text style={[styles.disclaimerText, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
              Subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period. You can manage and cancel your subscriptions by going to your account settings on the App Store after purchase.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 48,
    right: 24,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 100 : 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    width: 100,
    height: 100,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  pricingCard: {
    borderRadius: 16,
    padding: 32,
    marginBottom: 32,
    borderWidth: 2,
    alignItems: 'center',
    gap: 8,
  },
  planSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  planCard: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    position: 'relative',
    minHeight: 140,
    justifyContent: 'center',
  },
  planBadge: {
    position: 'absolute',
    top: -10,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  planBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },
  planTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 8,
  },
  planPrice: {
    fontSize: 24,
    fontWeight: '700',
  },
  planPeriod: {
    fontSize: 12,
    marginTop: 2,
  },
  planSavings: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  planSelectedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  pricingBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 8,
  },
  pricingBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  priceAmount: {
    fontSize: 48,
    fontWeight: 'bold',
  },
  pricePeriod: {
    fontSize: 18,
    fontWeight: '500',
  },
  subscriptionTerms: {
    marginTop: 8,
    marginBottom: 24,
    gap: 6,
    alignItems: 'flex-start',
    width: '100%',
  },
  termsText: {
    fontSize: 13,
    lineHeight: 18,
  },
  featuresContainer: {
    gap: 16,
    marginBottom: 32,
  },
  featuresTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 16,
    flex: 1,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.error + '15',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: colors.error,
    fontWeight: '500',
  },
  setupNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.warning + '15',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    marginBottom: 24,
  },
  setupNoticeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  actionsContainer: {
    gap: 12,
    marginTop: 8,
  },
  primaryButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  restoreButton: {
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  restoreButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  redeemContainer: {
    alignItems: 'center',
    gap: 4,
  },
  redeemButton: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  redeemButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  redeemHintText: {
    fontSize: 12,
    textAlign: 'center',
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  legalButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  legalLinkText: {
    fontSize: 14,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    fontSize: 14,
  },
  disclaimerText: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 16,
    paddingHorizontal: 8,
  },
});
