
import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useSubscription } from '@/contexts/SubscriptionContext';

export default function PaywallScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
  const {
    isSubscribed,
    isLoading,
    availablePackages,
    purchasePackage,
    restorePurchases,
    checkSubscriptionStatus,
    error: subscriptionError,
  } = useSubscription();

  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Check subscription status on mount
  useEffect(() => {
    console.log('[Paywall] Component mounted, checking subscription status');
    checkSubscriptionStatus();
  }, []);

  // Redirect if already subscribed
  useEffect(() => {
    if (!isLoading && isSubscribed) {
      console.log('[Paywall] User is subscribed, redirecting to home');
      router.replace('/(tabs)/(home)');
    }
  }, [isSubscribed, isLoading]);

  const handleClose = () => {
    console.log('[Paywall] User closed paywall');
    router.back();
  };

  const handlePurchase = async () => {
    if (availablePackages.length === 0) {
      Alert.alert(
        'Test Mode',
        'Subscription packages are not available in test mode. In production, users will be able to purchase subscriptions here.',
        [
          {
            text: 'Continue Anyway',
            onPress: () => router.replace('/(tabs)/(home)'),
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
      return;
    }

    // Get the first package (should be pro_monthly_15)
    const packageToPurchase = availablePackages[0];
    
    console.log('[Paywall] User initiated purchase:', packageToPurchase.identifier);
    setPurchasing(true);

    try {
      const result = await purchasePackage(packageToPurchase);
      
      if (result.success) {
        console.log('[Paywall] Purchase successful');
        Alert.alert(
          'Success!',
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
        Alert.alert('Notice', 'Purchase completed. Please wait a moment for activation.');
      }
    } catch (error: any) {
      console.error('[Paywall] Purchase failed:', error);
      
      if (error.message === 'Purchase cancelled') {
        // User cancelled, no need to show error
        console.log('[Paywall] User cancelled purchase');
      } else {
        Alert.alert('Purchase Failed', error.message || 'Unable to complete purchase. Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    console.log('[Paywall] User initiated restore purchases');
    setRestoring(true);

    try {
      const info = await restorePurchases();
      
      const hasActiveEntitlement = Object.keys(info.entitlements.active).length > 0;
      
      if (hasActiveEntitlement) {
        console.log('[Paywall] Purchases restored successfully');
        Alert.alert(
          'Restored!',
          'Your subscription has been restored.',
          [
            {
              text: 'Continue',
              onPress: () => router.replace('/(tabs)/(home)'),
            },
          ]
        );
      } else {
        console.log('[Paywall] No active purchases found');
        Alert.alert('No Purchases Found', 'No active subscriptions were found to restore.');
      }
    } catch (error: any) {
      console.error('[Paywall] Restore failed:', error);
      Alert.alert('Restore Failed', error.message || 'Unable to restore purchases. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundLight }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: isDark ? colors.text : colors.textLight }]}>
            Loading subscription options...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const monthlyPackage = availablePackages.find(pkg => 
    pkg.identifier.includes('monthly') || pkg.product.identifier === 'pro_monthly_15'
  );

  const priceText = monthlyPackage?.product.priceString || '$15.00';
  const periodText = 'per month';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundLight }]}>
      {/* Close Button */}
      <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
        <IconSymbol
          ios_icon_name="xmark"
          android_material_icon_name="close"
          size={20}
          color={isDark ? colors.textSecondary : colors.textSecondaryLight}
        />
      </TouchableOpacity>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <IconSymbol
            ios_icon_name="anchor.fill"
            android_material_icon_name="anchor"
            size={60}
            color={colors.primary}
          />
          <Text style={[styles.title, { color: isDark ? colors.text : colors.textLight }]}>
            Upgrade to Pro
          </Text>
          <Text style={[styles.subtitle, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
            Unlock unlimited vessel tracking and sea time recording
          </Text>
        </View>

        {/* Pricing Card */}
        <View style={[styles.pricingCard, { backgroundColor: isDark ? colors.cardBackground : colors.card, borderColor: isDark ? colors.border : colors.borderLight }]}>
          <View style={styles.pricingBadge}>
            <Text style={styles.pricingBadgeText}>PRO MONTHLY</Text>
          </View>
          <Text style={[styles.priceAmount, { color: isDark ? colors.text : colors.textLight }]}>
            {priceText}
          </Text>
          <Text style={[styles.pricePeriod, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
            {periodText}
          </Text>
          <Text style={[styles.pricingNote, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
            Cancel anytime • Sandbox test mode
          </Text>
        </View>

        {/* Features List */}
        <View style={styles.featuresContainer}>
          <Text style={[styles.featuresTitle, { color: isDark ? colors.text : colors.textLight }]}>
            What&apos;s Included
          </Text>
          {[
            { icon: 'check-circle', text: 'Unlimited Vessel Tracking' },
            { icon: 'check-circle', text: 'Automatic Sea Time Recording' },
            { icon: 'check-circle', text: 'MCA-Compliant Reports' },
            { icon: 'check-circle', text: 'Cloud Sync & Backup' },
            { icon: 'check-circle', text: 'Smart Notifications' },
            { icon: 'check-circle', text: 'Priority Support' },
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
            <Text style={styles.errorText}>{subscriptionError}</Text>
          </View>
        )}

        {/* Test Mode Notice */}
        <View style={styles.testModeNotice}>
          <IconSymbol
            ios_icon_name="info.circle.fill"
            android_material_icon_name="info"
            size={20}
            color={colors.primary}
          />
          <Text style={[styles.testModeText, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
            Sandbox test mode active. Use test payment methods.
          </Text>
        </View>
      </ScrollView>

      {/* Bottom Actions */}
      <View style={[styles.bottomActions, { backgroundColor: isDark ? colors.cardBackground : colors.card, borderTopColor: isDark ? colors.border : colors.borderLight }]}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={handlePurchase}
          disabled={purchasing || restoring || availablePackages.length === 0}
        >
          {purchasing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {availablePackages.length === 0 ? 'No Packages Available' : 'Subscribe Now'}
            </Text>
          )}
        </TouchableOpacity>

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

        {/* Skip button for test mode */}
        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => router.replace('/(tabs)/(home)')}
          disabled={purchasing || restoring}
        >
          <Text style={[styles.skipButtonText, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
            Skip for Now (Test Mode)
          </Text>
        </TouchableOpacity>

        <Text style={[styles.termsText, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
          By subscribing, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 80,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
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
  pricingNote: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  featuresContainer: {
    gap: 16,
    marginBottom: 24,
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
  testModeNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary + '15',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  testModeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  bottomActions: {
    padding: 24,
    paddingBottom: 32,
    borderTopWidth: 1,
    gap: 12,
  },
  primaryButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
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
  skipButton: {
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  skipButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  termsText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
});
