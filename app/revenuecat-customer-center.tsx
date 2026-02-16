
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
  Linking,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useRevenueCat } from '@/contexts/RevenueCatContext';

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : '#f5f5f5',
    },
    scrollContent: {
      padding: 20,
    },
    section: {
      backgroundColor: isDark ? colors.card : '#fff',
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: isDark ? colors.text : '#000',
      marginBottom: 12,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    infoLabel: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : '#666',
    },
    infoValue: {
      fontSize: 14,
      fontWeight: '500',
      color: isDark ? colors.text : '#000',
    },
    statusBadge: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    statusBadgeActive: {
      backgroundColor: '#4CAF50',
    },
    statusBadgeInactive: {
      backgroundColor: '#999',
    },
    statusBadgeText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? colors.card : '#fff',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    actionButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    actionButtonIcon: {
      marginRight: 12,
    },
    actionButtonText: {
      fontSize: 16,
      color: isDark ? colors.text : '#000',
      flex: 1,
    },
    actionButtonChevron: {
      marginLeft: 8,
    },
    dangerButton: {
      backgroundColor: isDark ? '#3d1f1f' : '#ffebee',
    },
    dangerButtonText: {
      color: '#f44336',
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
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    emptyText: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : '#666',
      textAlign: 'center',
      marginTop: 16,
    },
  });

export default function RevenueCatCustomerCenterScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const router = useRouter();

  const {
    customerInfo,
    isPro,
    isLoading,
    isInitialized,
    restorePurchases,
    getExpirationDate,
  } = useRevenueCat();

  const [isRestoring, setIsRestoring] = useState(false);

  const handleRestore = async () => {
    console.log('[Customer Center] User tapped Restore Purchases');
    setIsRestoring(true);

    try {
      const result = await restorePurchases();

      if (!result.success && result.error) {
        console.error('[Customer Center] Restore failed:', result.error);
        Alert.alert('Restore Failed', result.error);
      }
    } catch (error: any) {
      console.error('[Customer Center] Restore error:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleManageSubscription = () => {
    console.log('[Customer Center] User tapped Manage Subscription');

    const url = Platform.select({
      ios: 'https://apps.apple.com/account/subscriptions',
      android: 'https://play.google.com/store/account/subscriptions',
      default: 'https://www.revenuecat.com',
    });

    Linking.openURL(url).catch((err) => {
      console.error('[Customer Center] Failed to open subscription management:', err);
      Alert.alert('Error', 'Unable to open subscription management. Please try again.');
    });
  };

  const handleContactSupport = () => {
    console.log('[Customer Center] User tapped Contact Support');

    Alert.alert(
      'Contact Support',
      'How would you like to contact us?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Email',
          onPress: () => {
            Linking.openURL('mailto:support@seatimetracker.com').catch((err) => {
              console.error('[Customer Center] Failed to open email:', err);
            });
          },
        },
      ]
    );
  };

  // Loading state
  if (isLoading || !isInitialized) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Subscription',
            headerShown: true,
            headerBackTitle: 'Back',
          }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading subscription info...</Text>
        </View>
      </>
    );
  }

  // No customer info
  if (!customerInfo) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Subscription',
            headerShown: true,
            headerBackTitle: 'Back',
          }}
        />
        <View style={styles.emptyContainer}>
          <IconSymbol
            ios_icon_name="person.crop.circle"
            android_material_icon_name="person"
            size={64}
            color={isDark ? colors.textSecondary : '#666'}
          />
          <Text style={styles.emptyText}>
            No subscription information available. Please try again later.
          </Text>
        </View>
      </>
    );
  }

  const expirationDate = getExpirationDate();
  const expirationDateString = expirationDate
    ? expirationDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'N/A';

  const activeEntitlements = Object.keys(customerInfo.entitlements.active);
  const hasActiveEntitlements = activeEntitlements.length > 0;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Subscription',
          headerShown: true,
          headerBackTitle: 'Back',
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Subscription Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription Status</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status</Text>
            <View style={[styles.statusBadge, isPro ? styles.statusBadgeActive : styles.statusBadgeInactive]}>
              <Text style={styles.statusBadgeText}>{isPro ? 'Active' : 'Inactive'}</Text>
            </View>
          </View>

          {isPro && (
            <>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Expires</Text>
                <Text style={styles.infoValue}>{expirationDateString}</Text>
              </View>

              {activeEntitlements.length > 0 && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Plan</Text>
                  <Text style={styles.infoValue}>{activeEntitlements[0]}</Text>
                </View>
              )}
            </>
          )}

          {!isPro && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Plan</Text>
              <Text style={styles.infoValue}>Free</Text>
            </View>
          )}
        </View>

        {/* Actions */}
        {isPro && (
          <TouchableOpacity style={styles.actionButton} onPress={handleManageSubscription}>
            <View style={styles.actionButtonContent}>
              <IconSymbol
                ios_icon_name="gear"
                android_material_icon_name="settings"
                size={24}
                color={isDark ? colors.text : '#000'}
                style={styles.actionButtonIcon}
              />
              <Text style={styles.actionButtonText}>Manage Subscription</Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="arrow-forward"
              size={20}
              color={isDark ? colors.textSecondary : '#999'}
              style={styles.actionButtonChevron}
            />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleRestore}
          disabled={isRestoring}
        >
          <View style={styles.actionButtonContent}>
            <IconSymbol
              ios_icon_name="arrow.clockwise"
              android_material_icon_name="refresh"
              size={24}
              color={isDark ? colors.text : '#000'}
              style={styles.actionButtonIcon}
            />
            <Text style={styles.actionButtonText}>
              {isRestoring ? 'Restoring...' : 'Restore Purchases'}
            </Text>
          </View>
          {isRestoring && <ActivityIndicator color={colors.primary} />}
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleContactSupport}>
          <View style={styles.actionButtonContent}>
            <IconSymbol
              ios_icon_name="envelope"
              android_material_icon_name="email"
              size={24}
              color={isDark ? colors.text : '#000'}
              style={styles.actionButtonIcon}
            />
            <Text style={styles.actionButtonText}>Contact Support</Text>
          </View>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="arrow-forward"
            size={20}
            color={isDark ? colors.textSecondary : '#999'}
            style={styles.actionButtonChevron}
          />
        </TouchableOpacity>

        {!isPro && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              console.log('[Customer Center] User tapped Subscribe');
              router.push('/revenuecat-paywall');
            }}
          >
            <View style={styles.actionButtonContent}>
              <IconSymbol
                ios_icon_name="star.fill"
                android_material_icon_name="star"
                size={24}
                color={colors.primary}
                style={styles.actionButtonIcon}
              />
              <Text style={[styles.actionButtonText, { color: colors.primary }]}>
                Subscribe to Pro
              </Text>
            </View>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="arrow-forward"
              size={20}
              color={colors.primary}
              style={styles.actionButtonChevron}
            />
          </TouchableOpacity>
        )}
      </ScrollView>
    </>
  );
}
