
/**
 * SeaTime Tracker Paywall Screen (Placeholder)
 * 
 * RevenueCat integration has been removed.
 * This is a placeholder screen for subscription information.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';

export default function PaywallScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const handleClose = () => {
    console.log('[Paywall] User closed paywall - returning to previous screen');
    router.back();
  };

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
            Subscription Information
          </Text>
          <Text style={[styles.subtitle, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
            RevenueCat integration has been removed
          </Text>
        </View>

        {/* Message */}
        <View style={[styles.messageContainer, { backgroundColor: isDark ? colors.cardBackground : colors.card, borderColor: isDark ? colors.border : colors.borderLight }]}>
          <IconSymbol
            ios_icon_name="info.circle.fill"
            android_material_icon_name="info"
            size={48}
            color={colors.primary}
          />
          <Text style={[styles.messageTitle, { color: isDark ? colors.text : colors.textLight }]}>
            Subscription System Disabled
          </Text>
          <Text style={[styles.messageText, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
            The subscription and payment system has been removed from this app.
            All features are now available without subscription checks.
          </Text>
        </View>

        {/* Features List */}
        <View style={styles.featuresContainer}>
          <Text style={[styles.featuresTitle, { color: isDark ? colors.text : colors.textLight }]}>
            Available Features
          </Text>
          {[
            'Unlimited Vessel Tracking',
            'Automatic Sea Time Recording',
            'MCA-Compliant Reports',
            'Cloud Sync & Backup',
            'Smart Notifications',
            'MCA Compliance Checks',
          ].map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check-circle"
                size={24}
                color={colors.success}
              />
              <Text style={[styles.featureText, { color: isDark ? colors.text : colors.textLight }]}>
                {feature}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Bottom Actions */}
      <View style={[styles.bottomActions, { backgroundColor: isDark ? colors.cardBackground : colors.card, borderTopColor: isDark ? colors.border : colors.borderLight }]}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={handleClose}
        >
          <Text style={styles.primaryButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 8,
  },
  messageContainer: {
    borderRadius: 12,
    padding: 24,
    marginBottom: 32,
    borderWidth: 1,
    alignItems: 'center',
    gap: 12,
  },
  messageTitle: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  messageText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  featuresContainer: {
    gap: 16,
  },
  featuresTitle: {
    fontSize: 18,
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
  bottomActions: {
    padding: 24,
    paddingBottom: 32,
    borderTopWidth: 1,
  },
  primaryButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
