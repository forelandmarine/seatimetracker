import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchCurrentOffering,
  getCustomerInfo,
  getMonthlyPackage,
  hasActiveSubscription,
  initializeRevenueCat,
  isRevenueCatSupportedPlatform,
  openNativeManageSubscriptions,
  purchaseMonthlySubscription,
  restoreSubscriptionPurchases,
} from '@/utils/revenueCat';

export default function PaywallScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { user } = useAuth();
  const isDark = colorScheme === 'dark';

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [priceLabel, setPriceLabel] = useState<string | null>(null);

  const platformSupported = useMemo(() => isRevenueCatSupportedPlatform(), []);

  const loadPaywall = useCallback(async () => {
    if (!platformSupported) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      await initializeRevenueCat(user?.id);

      const offering = await fetchCurrentOffering();
      const monthlyPackage = getMonthlyPackage(offering);
      setPriceLabel(monthlyPackage?.product.priceString ?? null);
    } catch (error) {
      console.error('[Paywall] Failed to load RevenueCat offering', error);
      Alert.alert('Unable to load subscription', 'Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, [platformSupported, user?.id]);

  useEffect(() => {
    loadPaywall();
  }, [loadPaywall]);

  const handleClose = () => {
    router.back();
  };

  const handleSubscribe = async () => {
    if (!platformSupported) {
      Alert.alert('iOS only', 'Subscriptions are currently available on iOS.');
      return;
    }

    try {
      setProcessing(true);
      await initializeRevenueCat(user?.id);

      const offering = await fetchCurrentOffering();
      const monthlyPackage = getMonthlyPackage(offering);

      if (!monthlyPackage) {
        Alert.alert('Unavailable', 'No monthly subscription is currently available.');
        return;
      }

      const customerInfo = await purchaseMonthlySubscription(monthlyPackage);

      if (hasActiveSubscription(customerInfo)) {
        Alert.alert('Subscription active', 'Your monthly subscription is now active.');
        router.back();
        return;
      }

      Alert.alert('Purchase complete', 'Purchase succeeded but entitlement is still syncing.');
    } catch (error: any) {
      if (error?.userCancelled) {
        return;
      }

      console.error('[Paywall] Subscription purchase failed', error);
      Alert.alert('Purchase failed', 'We could not complete your purchase. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleRestore = async () => {
    if (!platformSupported) {
      Alert.alert('iOS only', 'Restore purchases is currently available on iOS.');
      return;
    }

    try {
      setProcessing(true);
      await initializeRevenueCat(user?.id);

      const customerInfo = await restoreSubscriptionPurchases();

      if (hasActiveSubscription(customerInfo)) {
        Alert.alert('Restored', 'Your active subscription has been restored.');
        router.back();
        return;
      }

      Alert.alert('No active subscription', 'We did not find an active subscription to restore.');
    } catch (error) {
      console.error('[Paywall] Restore failed', error);
      Alert.alert('Restore failed', 'We could not restore purchases right now.');
    } finally {
      setProcessing(false);
    }
  };

  const handleManage = async () => {
    try {
      setProcessing(true);
      await openNativeManageSubscriptions();
    } catch (error) {
      console.error('[Paywall] Failed to open manage subscriptions', error);
      Alert.alert('Unavailable', 'Could not open subscription management.');
    } finally {
      setProcessing(false);
    }
  };

  const handleRefreshStatus = async () => {
    if (!platformSupported) {
      return;
    }

    try {
      setProcessing(true);
      const customerInfo = await getCustomerInfo();

      if (hasActiveSubscription(customerInfo)) {
        Alert.alert('Subscription active', 'You already have an active subscription.');
        router.back();
      } else {
        Alert.alert('Not active', 'No active subscription was found on this account.');
      }
    } catch (error) {
      console.error('[Paywall] Failed to refresh subscription status', error);
      Alert.alert('Unable to refresh', 'Please try again in a moment.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundLight }]}>
      <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
        <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={20} color={isDark ? colors.textSecondary : colors.textSecondaryLight} />
      </TouchableOpacity>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <IconSymbol ios_icon_name="crown.fill" android_material_icon_name="workspace-premium" size={60} color={colors.primary} />
          <Text style={[styles.title, { color: isDark ? colors.text : colors.textLight }]}>SeaTime Pro Monthly</Text>
          <Text style={[styles.subtitle, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>Native in-app subscription powered by RevenueCat + StoreKit.</Text>
        </View>

        <View style={[styles.card, { backgroundColor: isDark ? colors.cardBackground : colors.card, borderColor: isDark ? colors.border : colors.borderLight }]}>
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Text style={[styles.price, { color: isDark ? colors.text : colors.textLight }]}>{priceLabel ? `${priceLabel} / month` : 'Monthly plan available in App Store Connect'}</Text>
              <Text style={[styles.helperText, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>Subscriptions are purchased directly in the app with Apple StoreKit to comply with guideline 3.1.1.</Text>
            </>
          )}
        </View>

        <View style={styles.featuresContainer}>
          {[
            'Unlimited vessel tracking',
            'Advanced MCA reporting tools',
            'Cross-device sync and backups',
            'Priority product updates',
          ].map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={22} color={colors.success} />
              <Text style={[styles.featureText, { color: isDark ? colors.text : colors.textLight }]}>{feature}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.bottomActions, { backgroundColor: isDark ? colors.cardBackground : colors.card, borderTopColor: isDark ? colors.border : colors.borderLight }]}>
        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: processing ? 0.7 : 1 }]} onPress={handleSubscribe} disabled={processing || loading}>
          <Text style={styles.primaryButtonText}>{processing ? 'Processing...' : 'Start Monthly Subscription'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleRestore} disabled={processing}>
          <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Restore Purchases</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleManage} disabled={processing || !platformSupported}>
          <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Manage Subscription</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleRefreshStatus} disabled={processing || !platformSupported}>
          <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Refresh Status</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  scrollView: { flex: 1 },
  scrollContent: { padding: 24, paddingTop: 80 },
  header: { alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginTop: 16 },
  subtitle: { fontSize: 15, textAlign: 'center', marginTop: 8 },
  card: {
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    minHeight: 120,
    justifyContent: 'center',
    gap: 10,
  },
  price: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  helperText: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  featuresContainer: { gap: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureText: { fontSize: 16, flex: 1 },
  bottomActions: { padding: 24, paddingBottom: 32, borderTopWidth: 1, gap: 10 },
  primaryButton: { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  secondaryButton: { paddingVertical: 8, alignItems: 'center' },
  secondaryButtonText: { fontSize: 15, fontWeight: '600' },
});
