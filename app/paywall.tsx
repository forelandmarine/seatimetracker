
/**
 * SeaTime Tracker Paywall Screen
 * iOS App Store Guideline 3.1.1 Compliant
 *
 * Compliance features:
 * - Always dismissible (close button + "Maybe Later")
 * - Clear pricing before purchase
 * - Restore purchases easily accessible
 * - Terms and privacy links
 * - No external payment methods
 * - Subscription terms clearly stated
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { PurchasesPackage } from "react-native-purchases";
import { IconSymbol } from "@/components/IconSymbol";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { colors } from "@/styles/commonStyles";

// SeaTime Tracker Premium Features
const FEATURES = [
  {
    icon: "directions-boat",
    title: "Unlimited Vessel Tracking",
    description: "Track as many vessels as you need with real-time AIS data",
  },
  {
    icon: "schedule",
    title: "Automatic Sea Time Recording",
    description: "Automatically detect and log your days at sea",
  },
  {
    icon: "description",
    title: "MCA-Compliant Reports",
    description: "Generate professional PDF and CSV reports",
  },
  {
    icon: "cloud-sync",
    title: "Cloud Sync & Backup",
    description: "Your data is securely backed up across devices",
  },
  {
    icon: "notifications",
    title: "Smart Notifications",
    description: "Get notified when vessel movement is detected",
  },
  {
    icon: "verified",
    title: "MCA Compliance Checks",
    description: "Automatic validation against MCA requirements",
  },
];

export default function PaywallScreen() {
  const router = useRouter();
  const {
    packages,
    loading,
    isSubscribed,
    isWeb,
    isConfigured,
    purchasePackage,
    restorePurchases,
  } = useSubscription();

  const [selectedPackage, setSelectedPackage] = useState<PurchasesPackage | null>(packages[0] || null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Update selected package when packages load
  React.useEffect(() => {
    if (packages.length > 0 && !selectedPackage) {
      setSelectedPackage(packages[0]);
    }
  }, [packages, selectedPackage]);

  // Handle purchase
  const handlePurchase = async () => {
    if (!selectedPackage) return;

    try {
      setPurchasing(true);
      const success = await purchasePackage(selectedPackage);
      if (success) {
        Alert.alert(
          "Welcome Aboard! ⚓",
          "Thank you for upgrading to SeaTime Tracker Pro.",
          [{ text: "Start Tracking", onPress: () => router.back() }]
        );
      }
    } catch (error: any) {
      Alert.alert("Purchase Failed", error.message || "Please try again.");
    } finally {
      setPurchasing(false);
    }
  };

  // Handle restore
  const handleRestore = async () => {
    try {
      setRestoring(true);
      const restored = await restorePurchases();
      if (restored) {
        Alert.alert(
          "Subscription Restored! ⚓",
          "Your SeaTime Tracker Pro subscription has been restored.",
          [{ text: "Continue", onPress: () => router.back() }]
        );
      } else {
        Alert.alert(
          "No Purchases Found",
          "We couldn't find any previous purchases for this account."
        );
      }
    } catch (error: any) {
      Alert.alert("Restore Failed", error.message || "Please try again.");
    } finally {
      setRestoring(false);
    }
  };

  const handleClose = () => {
    console.log('[Paywall] User closed paywall - returning to previous screen');
    router.back();
  };

  const handleAdminMenu = () => {
    console.log('[Paywall] User tapped Admin button - navigating to admin menu');
    router.push('/admin-menu');
  };

  // Handle legal links
  const handleTermsPress = () => {
    const termsUrl = "https://www.forelandmarine.com/terms";
    Linking.openURL(termsUrl).catch(() => {
      Alert.alert("Error", "Could not open Terms of Service");
    });
  };

  const handlePrivacyPress = () => {
    const privacyUrl = "https://www.forelandmarine.com/privacy";
    Linking.openURL(privacyUrl).catch(() => {
      Alert.alert("Error", "Could not open Privacy Policy");
    });
  };

  // Handle app store links for web
  const handleDownloadApp = () => {
    const iosUrl = "https://apps.apple.com/app/seatime-tracker";
    const androidUrl = "https://play.google.com/store/apps/details?id=com.forelandmarine.seatimetracker";

    Alert.alert(
      "Download SeaTime Tracker",
      "To subscribe, please download our app from your device's app store.",
      [
        { text: "App Store (iOS)", onPress: () => Linking.openURL(iosUrl) },
        { text: "Google Play", onPress: () => Linking.openURL(androidUrl) },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  // Already subscribed
  if (isSubscribed) {
    return (
      <SafeAreaView style={styles.container}>
        {/* Admin Button - Top Left */}
        <TouchableOpacity style={styles.adminButton} onPress={handleAdminMenu}>
          <IconSymbol
            ios_icon_name="wrench.fill"
            android_material_icon_name="settings"
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>

        {/* Close Button - Always visible */}
        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
          <IconSymbol
            ios_icon_name="xmark"
            android_material_icon_name="close"
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>

        <View style={styles.centeredContainer}>
          <IconSymbol
            ios_icon_name="checkmark.seal.fill"
            android_material_icon_name="verified"
            size={80}
            color={colors.success}
          />
          <Text style={styles.subscribedTitle}>You&apos;re a Pro Member! ⚓</Text>
          <Text style={styles.subscribedSubtitle}>
            You have full access to all SeaTime Tracker Pro features.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handleClose}>
            <Text style={styles.primaryButtonText}>Continue Tracking</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        {/* Admin Button - Top Left */}
        <TouchableOpacity style={styles.adminButton} onPress={handleAdminMenu}>
          <IconSymbol
            ios_icon_name="wrench.fill"
            android_material_icon_name="settings"
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>

        {/* Close Button - Always visible */}
        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
          <IconSymbol
            ios_icon_name="xmark"
            android_material_icon_name="close"
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>

        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading subscription options...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Not configured - show helpful message
  if (!isWeb && !isConfigured) {
    return (
      <SafeAreaView style={styles.container}>
        {/* Admin Button - Top Left */}
        <TouchableOpacity style={styles.adminButton} onPress={handleAdminMenu}>
          <IconSymbol
            ios_icon_name="wrench.fill"
            android_material_icon_name="settings"
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>

        {/* Close Button - Always visible */}
        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
          <IconSymbol
            ios_icon_name="xmark"
            android_material_icon_name="close"
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>

        <View style={styles.centeredContainer}>
          <IconSymbol
            ios_icon_name="exclamationmark.triangle"
            android_material_icon_name="warning"
            size={80}
            color={colors.warning}
          />
          <Text style={styles.subscribedTitle}>Subscriptions Not Available</Text>
          <Text style={styles.subscribedSubtitle}>
            RevenueCat is not properly configured. Please contact support or use the admin menu to activate a test subscription.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handleAdminMenu}>
            <Text style={styles.primaryButtonText}>Open Admin Menu</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tertiaryButton} onPress={handleClose}>
            <Text style={styles.tertiaryButtonText}>Maybe Later</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Admin Button - Top Left */}
      <TouchableOpacity style={styles.adminButton} onPress={handleAdminMenu}>
        <IconSymbol
          ios_icon_name="wrench.fill"
          android_material_icon_name="settings"
          size={20}
          color={colors.textSecondary}
        />
      </TouchableOpacity>

      {/* Close Button - Always visible and prominent */}
      <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
        <IconSymbol
          ios_icon_name="xmark"
          android_material_icon_name="close"
          size={20}
          color={colors.textSecondary}
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
          <Text style={styles.title}>SeaTime Tracker Pro</Text>
          <Text style={styles.subtitle}>
            Professional sea time tracking for maritime professionals
          </Text>
        </View>

        {/* Features List */}
        <View style={styles.featuresContainer}>
          {FEATURES.map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <IconSymbol
                  ios_icon_name="checkmark.circle.fill"
                  android_material_icon_name={feature.icon}
                  size={24}
                  color={colors.primary}
                />
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>
                  {feature.description}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Web platform message */}
        {isWeb && (
          <View style={styles.webMessageContainer}>
            <IconSymbol
              ios_icon_name="iphone"
              android_material_icon_name="phone-iphone"
              size={40}
              color={colors.primary}
            />
            <Text style={styles.webMessageTitle}>Download the App</Text>
            <Text style={styles.webMessageText}>
              In-app purchases are only available in our mobile app.
              Download SeaTime Tracker to subscribe and start tracking your sea time.
            </Text>
          </View>
        )}

        {/* Package Selection - only show on native */}
        {!isWeb && packages.length > 0 && (
          <View style={styles.packagesContainer}>
            <Text style={styles.packagesTitle}>Choose Your Plan</Text>
            {packages.map((pkg) => {
              const isSelected = selectedPackage?.identifier === pkg.identifier;
              const priceString = pkg.product.priceString;
              const productTitle = pkg.product.title;
              const hasIntroPrice = pkg.product.introPrice !== null;
              
              return (
                <TouchableOpacity
                  key={pkg.identifier}
                  style={[
                    styles.packageCard,
                    isSelected && styles.packageCardSelected,
                  ]}
                  onPress={() => setSelectedPackage(pkg)}
                >
                  <View style={styles.packageHeader}>
                    <View style={styles.packageTitleContainer}>
                      <Text style={styles.packageTitle}>{productTitle}</Text>
                      {hasIntroPrice && (
                        <View style={styles.trialBadge}>
                          <Text style={styles.trialBadgeText}>FREE TRIAL</Text>
                        </View>
                      )}
                    </View>
                    {isSelected && (
                      <IconSymbol
                        ios_icon_name="checkmark.circle.fill"
                        android_material_icon_name="check-circle"
                        size={24}
                        color={colors.primary}
                      />
                    )}
                  </View>
                  <Text style={styles.packagePrice}>
                    {priceString}
                  </Text>
                  {pkg.product.description && (
                    <Text style={styles.packageDescription}>
                      {pkg.product.description}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* No packages available - only show on native */}
        {!isWeb && packages.length === 0 && !loading && isConfigured && (
          <View style={styles.noPackagesContainer}>
            <IconSymbol
              ios_icon_name="exclamationmark.triangle"
              android_material_icon_name="warning"
              size={48}
              color={colors.warning}
            />
            <Text style={styles.noPackagesText}>
              No subscription options available at this time.
            </Text>
            <Text style={styles.noPackagesSubtext}>
              Please check your internet connection and try again, or use the admin menu to activate a test subscription.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom Actions */}
      <View style={styles.bottomActions}>
        {/* Web: Show download button */}
        {isWeb ? (
          <>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleDownloadApp}
            >
              <Text style={styles.primaryButtonText}>Download App to Subscribe</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleClose}
            >
              <Text style={styles.secondaryButtonText}>Maybe Later</Text>
            </TouchableOpacity>
            <Text style={styles.legalText}>
              Subscriptions are managed through the App Store or Google Play.
            </Text>
          </>
        ) : (
          <>
            {/* Native: Subscribe Button */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (!selectedPackage || purchasing) && styles.buttonDisabled,
              ]}
              onPress={handlePurchase}
              disabled={!selectedPackage || purchasing}
            >
              {purchasing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  {selectedPackage && (
                    <Text style={styles.primaryButtonText}>
                      Subscribe for {selectedPackage.product.priceString}
                    </Text>
                  )}
                  {!selectedPackage && (
                    <Text style={styles.primaryButtonText}>
                      Select a plan
                    </Text>
                  )}
                </>
              )}
            </TouchableOpacity>

            {/* Restore Button - Prominent for App Store compliance */}
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleRestore}
              disabled={restoring}
            >
              {restoring ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.secondaryButtonText}>Restore Purchases</Text>
              )}
            </TouchableOpacity>

            {/* Maybe Later Button - Required for App Store compliance */}
            <TouchableOpacity
              style={styles.tertiaryButton}
              onPress={handleClose}
            >
              <Text style={styles.tertiaryButtonText}>Maybe Later</Text>
            </TouchableOpacity>

            {/* Subscription Terms - Required for App Store compliance */}
            <Text style={styles.legalText}>
              Payment will be charged to your{" "}
              {Platform.OS === "ios" ? "Apple ID" : "Google Play"} account at confirmation of purchase.
              Subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period.
              Your account will be charged for renewal within 24 hours prior to the end of the current period.
              You can manage and cancel your subscriptions by going to your account settings on the App Store after purchase.
            </Text>

            {/* Legal Links - Required for App Store compliance */}
            <View style={styles.legalLinks}>
              <TouchableOpacity onPress={handleTermsPress}>
                <Text style={styles.legalLinkText}>Terms of Service</Text>
              </TouchableOpacity>
              <Text style={styles.legalLinkSeparator}>•</Text>
              <TouchableOpacity onPress={handlePrivacyPress}>
                <Text style={styles.legalLinkText}>Privacy Policy</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 16,
  },
  subscribedTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.text,
    textAlign: "center",
    marginTop: 16,
  },
  subscribedSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: "center",
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 16,
  },
  adminButton: {
    position: "absolute",
    top: 60,
    left: 20,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cardBackground,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeButton: {
    position: "absolute",
    top: 60,
    right: 20,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cardBackground,
    justifyContent: "center",
    alignItems: "center",
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
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.text,
    textAlign: "center",
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },
  featuresContainer: {
    gap: 20,
    marginBottom: 32,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.cardBackground,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  featureDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },
  packagesContainer: {
    gap: 12,
    marginBottom: 16,
  },
  packagesTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
  },
  packageCard: {
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.cardBackground,
  },
  packageCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.cardBackground,
  },
  packageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  packageTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  packageTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  trialBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  trialBadgeText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#fff",
  },
  packagePrice: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.primary,
    marginBottom: 4,
  },
  packageDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  noPackagesContainer: {
    padding: 32,
    alignItems: "center",
    gap: 12,
  },
  noPackagesText: {
    fontSize: 16,
    color: colors.text,
    textAlign: "center",
    fontWeight: "600",
  },
  noPackagesSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
  },
  webMessageContainer: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: 12,
  },
  webMessageTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
    textAlign: "center",
  },
  webMessageText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  bottomActions: {
    padding: 24,
    paddingBottom: 32,
    gap: 12,
    backgroundColor: colors.cardBackground,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: "600",
  },
  tertiaryButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  tertiaryButtonText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: "500",
  },
  legalText: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 16,
    marginTop: 8,
  },
  legalLinks: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  legalLinkText: {
    fontSize: 12,
    color: colors.primary,
    textDecorationLine: "underline",
  },
  legalLinkSeparator: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});
