
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { REVENUECAT_CONFIG } from '@/config/revenuecat';
import Purchases from 'react-native-purchases';

function createStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    section: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 12,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? colors.border : colors.borderLight,
    },
    lastRow: {
      borderBottomWidth: 0,
    },
    label: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      flex: 1,
    },
    value: {
      fontSize: 14,
      fontWeight: '500',
      color: isDark ? colors.text : colors.textLight,
      flex: 1,
      textAlign: 'right',
    },
    statusGood: {
      color: colors.success,
    },
    statusBad: {
      color: colors.error,
    },
    statusWarning: {
      color: colors.warning,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginBottom: 12,
    },
    buttonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    secondaryButton: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    secondaryButtonText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    codeBlock: {
      backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5',
      borderRadius: 8,
      padding: 12,
      marginTop: 8,
    },
    codeText: {
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      fontSize: 12,
      color: isDark ? '#00ff00' : '#006600',
    },
    warningBox: {
      backgroundColor: colors.warning + '20',
      borderRadius: 8,
      padding: 12,
      marginTop: 8,
      borderLeftWidth: 4,
      borderLeftColor: colors.warning,
    },
    warningText: {
      fontSize: 14,
      color: isDark ? colors.text : colors.textLight,
      lineHeight: 20,
    },
  });
}

export default function RevenueCatDiagnosticScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const router = useRouter();

  const {
    isSubscribed,
    offerings,
    currentOffering,
    packages,
    loading,
    isWeb,
    isConfigured,
    checkSubscription,
  } = useSubscription();

  const [refreshing, setRefreshing] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<any>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const diagnostics = REVENUECAT_CONFIG.getDiagnostics();

  useEffect(() => {
    console.log('RevenueCat Diagnostic screen loaded');
    fetchCustomerInfo();
  }, []);

  const fetchCustomerInfo = async () => {
    if (isWeb || !isConfigured) {
      console.log('Skipping customer info fetch - Web or not configured');
      return;
    }
    
    try {
      console.log('Fetching customer info...');
      const info = await Purchases.getCustomerInfo();
      console.log('Customer info fetched:', info);
      setCustomerInfo(info);
      setFetchError(null);
    } catch (error: any) {
      console.error('[Diagnostic] Failed to fetch customer info:', error);
      setFetchError(error.message || 'Unknown error');
    }
  };

  const handleRefresh = async () => {
    console.log('User tapped Refresh Data button');
    setRefreshing(true);
    try {
      await checkSubscription();
      await fetchCustomerInfo();
      console.log('Refresh completed successfully');
    } catch (error: any) {
      console.error('[Diagnostic] Refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleViewPaywall = () => {
    console.log('User tapped View Paywall button');
    router.push('/paywall');
  };

  const handleViewOfferings = async () => {
    console.log('User tapped Log Full Offerings Data button');
    if (isWeb || !isConfigured) {
      console.warn('Cannot fetch offerings - Web or not configured');
      return;
    }
    
    try {
      const fetchedOfferings = await Purchases.getOfferings();
      console.log('[Diagnostic] Offerings:', JSON.stringify(fetchedOfferings, null, 2));
      alert('Check console logs for full offerings data');
    } catch (error: any) {
      console.error('[Diagnostic] Failed to fetch offerings:', error);
      alert(`Error: ${error.message}`);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'RevenueCat Diagnostic',
          headerStyle: {
            backgroundColor: isDark ? colors.background : colors.backgroundLight,
          },
          headerTintColor: isDark ? colors.text : colors.textLight,
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Platform Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Platform Information</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Platform</Text>
            <Text style={styles.value}>{Platform.OS}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Is Web</Text>
            <Text style={[styles.value, isWeb ? styles.statusWarning : styles.statusGood]}>
              {isWeb ? 'Yes (SDK not available)' : 'No'}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Development Mode</Text>
            <Text style={styles.value}>{__DEV__ ? 'Yes' : 'No'}</Text>
          </View>
          <View style={[styles.row, styles.lastRow]}>
            <Text style={styles.label}>SDK Configured</Text>
            <Text style={[styles.value, isConfigured ? styles.statusGood : styles.statusBad]}>
              {isConfigured ? 'Yes' : 'No'}
            </Text>
          </View>
        </View>

        {/* API Keys */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>API Keys</Text>
          <View style={styles.row}>
            <Text style={styles.label}>iOS Key Configured</Text>
            <Text style={[styles.value, diagnostics.iosKey.configured ? styles.statusGood : styles.statusBad]}>
              {diagnostics.iosKey.configured ? 'Yes' : 'No'}
            </Text>
          </View>
          {diagnostics.iosKey.configured && (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>iOS Key Prefix</Text>
                <Text style={styles.value}>{diagnostics.iosKey.prefix}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>iOS Production Key</Text>
                <Text style={[styles.value, diagnostics.iosKey.isProductionKey ? styles.statusGood : styles.statusWarning]}>
                  {diagnostics.iosKey.isProductionKey ? 'Yes (appl_*)' : 'No (test_*)'}
                </Text>
              </View>
            </>
          )}
          <View style={styles.row}>
            <Text style={styles.label}>Android Key Configured</Text>
            <Text style={[styles.value, diagnostics.androidKey.configured ? styles.statusGood : styles.statusBad]}>
              {diagnostics.androidKey.configured ? 'Yes' : 'No'}
            </Text>
          </View>
          {diagnostics.androidKey.configured && (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>Android Key Prefix</Text>
                <Text style={styles.value}>{diagnostics.androidKey.prefix}</Text>
              </View>
              <View style={[styles.row, styles.lastRow]}>
                <Text style={styles.label}>Android Production Key</Text>
                <Text style={[styles.value, diagnostics.androidKey.isProductionKey ? styles.statusGood : styles.statusWarning]}>
                  {diagnostics.androidKey.isProductionKey ? 'Yes (goog_*)' : 'No (test_*)'}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Subscription Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription Status</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Is Subscribed</Text>
            <Text style={[styles.value, isSubscribed ? styles.statusGood : styles.statusWarning]}>
              {isSubscribed ? 'Yes' : 'No'}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Loading</Text>
            <Text style={styles.value}>{loading ? 'Yes' : 'No'}</Text>
          </View>
          <View style={[styles.row, styles.lastRow]}>
            <Text style={styles.label}>Entitlement ID</Text>
            <Text style={styles.value}>pro</Text>
          </View>
          {customerInfo && (
            <>
              <View style={styles.codeBlock}>
                <Text style={styles.codeText}>
                  Active Entitlements: {Object.keys(customerInfo.entitlements.active).join(', ') || 'None'}
                </Text>
              </View>
            </>
          )}
          {fetchError && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>Error: {fetchError}</Text>
            </View>
          )}
        </View>

        {/* Offerings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Offerings & Packages</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Offerings Loaded</Text>
            <Text style={[styles.value, offerings ? styles.statusGood : styles.statusBad]}>
              {offerings ? 'Yes' : 'No'}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Current Offering</Text>
            <Text style={[styles.value, currentOffering ? styles.statusGood : styles.statusBad]}>
              {currentOffering ? currentOffering.identifier : 'None'}
            </Text>
          </View>
          <View style={[styles.row, styles.lastRow]}>
            <Text style={styles.label}>Available Packages</Text>
            <Text style={[styles.value, packages.length > 0 ? styles.statusGood : styles.statusBad]}>
              {packages.length}
            </Text>
          </View>
          
          {packages.length > 0 && (
            <View style={styles.codeBlock}>
              {packages.map((pkg, index) => (
                <Text key={index} style={styles.codeText}>
                  {index + 1}. {pkg.product.title} - {pkg.product.priceString}
                </Text>
              ))}
            </View>
          )}
          
          {packages.length === 0 && !loading && isConfigured && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>
                ⚠️ No packages found. Check RevenueCat dashboard:
                {'\n'}• Ensure an offering is marked as &quot;Current&quot;
                {'\n'}• Verify products are attached to the offering
                {'\n'}• Confirm products exist in App Store Connect
                {'\n'}• Check that entitlement ID matches (&quot;pro&quot;)
              </Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <TouchableOpacity
          style={styles.button}
          onPress={handleRefresh}
          disabled={refreshing || isWeb || !isConfigured}
        >
          {refreshing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Refresh Data</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleViewOfferings}
          disabled={isWeb || !isConfigured}
        >
          <Text style={styles.secondaryButtonText}>Log Full Offerings Data</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleViewPaywall}
        >
          <Text style={styles.secondaryButtonText}>View Paywall</Text>
        </TouchableOpacity>

        {/* Configuration Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Configuration Summary</Text>
          <View style={styles.codeBlock}>
            <Text style={styles.codeText}>
              {JSON.stringify(
                {
                  platform: Platform.OS,
                  isWeb,
                  isConfigured,
                  isSubscribed,
                  hasOfferings: !!offerings,
                  hasCurrentOffering: !!currentOffering,
                  packageCount: packages.length,
                  entitlementId: 'pro',
                  iosKeyPrefix: diagnostics.iosKey.prefix,
                  androidKeyPrefix: diagnostics.androidKey.prefix,
                },
                null,
                2
              )}
            </Text>
          </View>
        </View>
      </ScrollView>
    </>
  );
}
