
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
  Alert,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useRevenueCat } from '@/contexts/RevenueCatContext';
import { PurchasesPackage } from 'react-native-purchases';

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : '#f5f5f5',
    },
    scrollContent: {
      padding: 20,
    },
    header: {
      alignItems: 'center',
      marginBottom: 30,
      marginTop: 20,
    },
    icon: {
      marginBottom: 16,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: isDark ? colors.text : '#000',
      textAlign: 'center',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : '#666',
      textAlign: 'center',
    },
    featuresSection: {
      marginBottom: 30,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: isDark ? colors.text : '#000',
      marginBottom: 16,
    },
    featureItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
      backgroundColor: isDark ? colors.card : '#fff',
      padding: 16,
      borderRadius: 12,
    },
    featureIcon: {
      marginRight: 12,
    },
    featureText: {
      flex: 1,
      fontSize: 16,
      color: isDark ? colors.text : '#000',
    },
    packagesSection: {
      marginBottom: 30,
    },
    packageCard: {
      backgroundColor: isDark ? colors.card : '#fff',
      borderRadius: 12,
      padding: 20,
      marginBottom: 12,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    selectedPackage: {
      borderColor: colors.primary,
    },
    packageHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    packageTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: isDark ? colors.text : '#000',
    },
    packagePrice: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.primary,
    },
    packageDescription: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : '#666',
      marginBottom: 8,
    },
    packagePeriod: {
      fontSize: 12,
      color: isDark ? colors.textSecondary : '#999',
    },
    subscribeButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginBottom: 12,
    },
    subscribeButtonDisabled: {
      opacity: 0.5,
    },
    subscribeButtonText: {
      color: '#fff',
      fontSize: 18,
      fontWeight: '600',
    },
    restoreButton: {
      padding: 16,
      alignItems: 'center',
      marginBottom: 12,
    },
    restoreButtonText: {
      color: colors.primary,
      fontSize: 16,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: isDark ? colors.textSecondary : '#666',
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    errorText: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : '#666',
      textAlign: 'center',
      marginBottom: 20,
    },
    retryButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 16,
      paddingHorizontal: 32,
    },
    retryButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    footer: {
      padding: 20,
      alignItems: 'center',
    },
    footerText: {
      fontSize: 12,
      color: isDark ? colors.textSecondary : '#999',
      textAlign: 'center',
      marginBottom: 8,
    },
  });

const FEATURES = [
  {
    icon: 'check-circle',
    text: 'Unlimited vessel tracking',
  },
  {
    icon: 'notifications',
    text: 'Real-time AIS data updates',
  },
  {
    icon: 'description',
    text: 'MCA-compliant sea time reports',
  },
  {
    icon: 'cloud',
    text: 'Cloud backup and sync',
  },
  {
    icon: 'support',
    text: 'Priority customer support',
  },
];

export default function RevenueCatPaywallScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const router = useRouter();

  const {
    offerings,
    isLoading,
    isInitialized,
    purchasePackage,
    restorePurchases,
    refreshCustomerInfo,
  } = useRevenueCat();

  const [selectedPackage, setSelectedPackage] = useState<PurchasesPackage | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Select first package by default when offerings load
  React.useEffect(() => {
    if (offerings?.availablePackages && offerings.availablePackages.length > 0 && !selectedPackage) {
      const firstPackage = offerings.availablePackages[0];
      console.log('[Paywall] Auto-selecting first package:', firstPackage.identifier);
      setSelectedPackage(firstPackage);
    }
  }, [offerings, selectedPackage]);

  const handlePurchase = async () => {
    if (!selectedPackage) {
      Alert.alert('Error', 'Please select a subscription package');
      return;
    }

    console.log('[Paywall] User tapped Subscribe button');
    console.log('[Paywall] Selected package:', selectedPackage.identifier);

    setIsPurchasing(true);

    try {
      const result = await purchasePackage(selectedPackage);

      if (result.success) {
        console.log('[Paywall] Purchase successful');
        Alert.alert(
          'Success!',
          'Your subscription is now active. Thank you for subscribing!',
          [
            {
              text: 'OK',
              onPress: () => {
                console.log('[Paywall] Navigating back after successful purchase');
                router.back();
              },
            },
          ]
        );
      } else if (result.error && result.error !== 'User cancelled') {
        console.error('[Paywall] Purchase failed:', result.error);
        Alert.alert('Purchase Failed', result.error);
      }
    } catch (error: any) {
      console.error('[Paywall] Purchase error:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    console.log('[Paywall] User tapped Restore Purchases button');
    setIsRestoring(true);

    try {
      const result = await restorePurchases();

      if (!result.success && result.error) {
        console.error('[Paywall] Restore failed:', result.error);
        Alert.alert('Restore Failed', result.error);
      }
    } catch (error: any) {
      console.error('[Paywall] Restore error:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRetry = () => {
    console.log('[Paywall] User tapped Retry button');
    refreshCustomerInfo();
  };

  // Loading state
  if (isLoading || !isInitialized) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Subscribe',
            headerShown: true,
            headerBackTitle: 'Back',
          }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading subscription options...</Text>
        </View>
      </>
    );
  }

  // Error state - no offerings available
  if (!offerings || !offerings.availablePackages || offerings.availablePackages.length === 0) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Subscribe',
            headerShown: true,
            headerBackTitle: 'Back',
          }}
        />
        <View style={styles.errorContainer}>
          <IconSymbol
            ios_icon_name="exclamationmark.triangle"
            android_material_icon_name="warning"
            size={64}
            color={isDark ? colors.textSecondary : '#666'}
          />
          <Text style={styles.errorText}>
            Unable to load subscription options. Please check your internet connection and try again.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  const priceString = selectedPackage?.product.priceString || '';
  const periodString = selectedPackage?.product.subscriptionPeriod || 'month';

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Subscribe to Pro',
          headerShown: true,
          headerBackTitle: 'Back',
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <IconSymbol
            ios_icon_name="star.fill"
            android_material_icon_name="star"
            size={64}
            color={colors.primary}
            style={styles.icon}
          />
          <Text style={styles.title}>SeaTime Tracker Pro</Text>
          <Text style={styles.subtitle}>
            Unlock all features and track your sea time without limits
          </Text>
        </View>

        {/* Features */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>What you get:</Text>
          {FEATURES.map((feature, index) => (
            <View key={index} style={styles.featureItem}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name={feature.icon}
                size={24}
                color={colors.primary}
                style={styles.featureIcon}
              />
              <Text style={styles.featureText}>{feature.text}</Text>
            </View>
          ))}
        </View>

        {/* Packages */}
        <View style={styles.packagesSection}>
          <Text style={styles.sectionTitle}>Choose your plan:</Text>
          {offerings.availablePackages.map((pkg) => {
            const isSelected = selectedPackage?.identifier === pkg.identifier;
            const packagePriceString = pkg.product.priceString;
            const packagePeriodString = pkg.product.subscriptionPeriod || 'month';

            return (
              <TouchableOpacity
                key={pkg.identifier}
                style={[styles.packageCard, isSelected && styles.selectedPackage]}
                onPress={() => {
                  console.log('[Paywall] User selected package:', pkg.identifier);
                  setSelectedPackage(pkg);
                }}
              >
                <View style={styles.packageHeader}>
                  <Text style={styles.packageTitle}>{pkg.product.title}</Text>
                  <Text style={styles.packagePrice}>{packagePriceString}</Text>
                </View>
                <Text style={styles.packageDescription}>{pkg.product.description}</Text>
                <Text style={styles.packagePeriod}>Billed {packagePeriodString}ly</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Subscribe Button */}
        <TouchableOpacity
          style={[styles.subscribeButton, (isPurchasing || !selectedPackage) && styles.subscribeButtonDisabled]}
          onPress={handlePurchase}
          disabled={isPurchasing || !selectedPackage}
        >
          {isPurchasing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.subscribeButtonText}>
              Subscribe for {priceString}/{periodString}
            </Text>
          )}
        </TouchableOpacity>

        {/* Restore Button */}
        <TouchableOpacity
          style={styles.restoreButton}
          onPress={handleRestore}
          disabled={isRestoring}
        >
          {isRestoring ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.restoreButtonText}>Restore Purchases</Text>
          )}
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period.
          </Text>
          <Text style={styles.footerText}>
            Payment will be charged to your Apple ID or Google Play account at confirmation of purchase.
          </Text>
        </View>
      </ScrollView>
    </>
  );
}
