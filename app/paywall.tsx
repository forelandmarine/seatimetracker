
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
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const waitingForRedeemRef = useRef(false);

  // When app returns to foreground after redeem flow, refresh subscription status
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      const isNowActive = nextAppState === 'active';
      if (wasBackground && isNowActive && waitingForRedeemRef.current) {
        waitingForRedeemRef.current = false;
        console.log('[Paywall] App returned to foreground after redeem — refreshing subscription status');
        try {
          const info = await Purchases.getCustomerInfo();
          const hasActiveEntitlement = Object.keys(info.entitlements.active).length > 0;
          console.log('[Paywall] Post-redeem subscription check — active entitlements:', Object.keys(info.entitlements.active));
          if (hasActiveEntitlement) {
            console.log('[Paywall] Subscription active after redeem, navigating home');
            router.replace('/(tabs)/(home)');
          }
        } catch (err) {
          console.error('[Paywall] Failed to refresh subscription after redeem:', err);
        }
      }
      appStateRef.current = nextAppState;
    });
    return () => subscription.remove();
  }, []);

  // FIX 2: Removed checkSubscriptionStatus() call on mount.
  // Subscription status is managed by SubscriptionContext — calling it here
  // can flip isSubscribed → false mid-session and re-trigger vessel deactivation.
  useEffect(() => {
    console.log('[Paywall] Paywall screen mounted');
    console.log('[Paywall] Available packages:', availablePackages.length);
    console.log('[Paywall] Is loading:', isLoading);
    console.log('[Paywall] Is subscribed:', isSubscribed);
  }, []);

  // Redirect if already subscribed
  useEffect(() => {
    if (!isLoading && isSubscribed) {
      console.log('[Paywall] User is subscribed, redirecting to home');
      router.replace('/(tabs)/(home)');
    }
  }, [isSubscribed, isLoading]);

  const handlePurchase = async () => {
    if (availablePackages.length === 0) {
      console.error('[Paywall] Cannot purchase - no packages available');
      Alert.alert(
        'Subscription Unavailable',
        'Subscription packages are currently unavailable. Please try again later or contact support if the problem persists.',
        [{ text: 'OK', style: 'cancel' }]
      );
      return;
    }

    // Find the monthly subscription package
    const packageToPurchase = availablePackages.find(pkg => 
      pkg.product.identifier === 'com.subscription.monthly'
    );
    
    if (!packageToPurchase) {
      console.error('[Paywall] Product "com.subscription.monthly" not found');
      Alert.alert(
        'Subscription Unavailable',
        'The subscription product is not available. Please try again later or contact support.',
        [{ text: 'OK', style: 'cancel' }]
      );
      return;
    }
    
    console.log('[Paywall] Initiating purchase for:', packageToPurchase.product.identifier);
    setPurchasing(true);

    try {
      const result = await purchasePackage(packageToPurchase);
      
      if (result.success) {
        console.log('[Paywall] Purchase successful');
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
        console.warn('[Paywall] Purchase completed but subscription not active');
        Alert.alert(
          'Processing Purchase',
          'Your purchase is being processed. Please wait a moment and check back.',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      console.error('[Paywall] Purchase failed:', error);
      
      if (error.message === 'Purchase cancelled') {
        console.log('[Paywall] User cancelled purchase');
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
    console.log('[Paywall] User initiated restore');
    setRestoring(true);

    try {
      const info = await restorePurchases();
      
      const hasActiveEntitlement = Object.keys(info.entitlements.active).length > 0;
      
      if (hasActiveEntitlement) {
        console.log('[Paywall] Purchases restored successfully');
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
        console.log('[Paywall] No active purchases found');
        Alert.alert(
          'No Purchases Found',
          'No active subscriptions were found for this Apple ID. If you believe this is an error, please contact support.',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      console.error('[Paywall] Restore failed:', error);
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
    console.log('[Paywall] Opening Terms of Service:', termsUrl);
    Linking.openURL(termsUrl).catch(err => {
      console.error('[Paywall] Failed to open Terms URL:', err);
      Alert.alert('Error', 'Unable to open Terms of Service. Please visit apple.com/legal/internet-services/itunes/dev/stdeula/');
    });
  };

  const handlePrivacy = () => {
    const privacyUrl = 'https://forelandmarine.com/privacy-policy';
    console.log('[Paywall] Opening Privacy Policy:', privacyUrl);
    Linking.openURL(privacyUrl).catch(err => {
      console.error('[Paywall] Failed to open Privacy URL:', err);
      Alert.alert('Error', 'Unable to open Privacy Policy. Please visit forelandmarine.com/privacy-policy');
    });
  };

  const handleRedeemCode = async () => {
    console.log('[Paywall] User tapped Redeem Code');
    waitingForRedeemRef.current = true;
    try {
      // Use RevenueCat's native code redemption sheet (iOS 14+)
      await Purchases.presentCodeRedemptionSheet();
      console.log('[Paywall] Code redemption sheet presented');
    } catch (err) {
      console.warn('[Paywall] presentCodeRedemptionSheet failed, falling back to App Store URL:', err);
      // Fallback to App Store redeem URL
      Linking.openURL('https://apps.apple.com/redeem').catch(linkErr => {
        waitingForRedeemRef.current = false;
        console.error('[Paywall] Failed to open App Store redeem URL:', linkErr);
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
    console.log('[Paywall] User tapped X button, navigating to /auth');
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

  // Get the monthly package for display
  const monthlyPackage = availablePackages.find(pkg => 
    pkg.product.identifier === 'com.subscription.monthly'
  );

  // Extract price from App Store (StoreKit compliance)
  // priceString automatically includes the user's local currency from their App Store region
  // Examples: "$4.99" (US), "£4.99" (UK), "€4.99" (EU), "¥500" (Japan)
  const priceText = monthlyPackage?.product.priceString || 'Price unavailable';
  const productTitle = monthlyPackage?.product.title || 'SeaTime Tracker Pro';
  const productDescription = monthlyPackage?.product.description || 'Monthly subscription';
  
  // Log price information for debugging
  console.log('[Paywall] Price display:', {
    priceString: monthlyPackage?.product.priceString,
    currencyCode: monthlyPackage?.product.currencyCode,
    price: monthlyPackage?.product.price,
    productId: monthlyPackage?.product.identifier,
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

          {/* Pricing Card - StoreKit Compliant */}
          <View style={[styles.pricingCard, { backgroundColor: isDark ? colors.cardBackground : colors.card, borderColor: isDark ? colors.border : colors.borderLight }]}>
            <View style={styles.pricingBadge}>
              <Text style={styles.pricingBadgeText}>MONTHLY SUBSCRIPTION</Text>
            </View>
            
            {/* Display App Store price (StoreKit requirement) */}
            <Text style={[styles.priceAmount, { color: isDark ? colors.text : colors.textLight }]}>
              {priceText}
            </Text>
            <Text style={[styles.pricePeriod, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
              per month
            </Text>
            
            {/* Clear subscription terms (App Store requirement) */}
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
              <IconSymbol
                ios_icon_name="exclamationmark.triangle.fill"
                android_material_icon_name="warning"
                size={20}
                color={colors.warning}
              />
              <Text style={[styles.setupNoticeText, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
                Subscription is temporarily unavailable. Please try again later.
              </Text>
            </View>
          )}

          {/* Action Buttons - Now inside ScrollView for continuous flow */}
          <View style={styles.actionsContainer}>
            {/* Primary Subscribe Button */}
            <TouchableOpacity
              style={[
                styles.primaryButton, 
                { backgroundColor: colors.primary },
                (purchasing || restoring || availablePackages.length === 0) && styles.buttonDisabled
              ]}
              onPress={handlePurchase}
              disabled={purchasing || restoring || availablePackages.length === 0}
            >
              {purchasing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {availablePackages.length === 0 ? 'Subscription Unavailable' : 'Subscribe Now'}
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
    marginTop: 16,
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
    color: '#0077BE',
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
