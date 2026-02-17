
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
  Platform,
  Linking,
  Modal,
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
  
  // Custom modal state for success messages
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [successTitle, setSuccessTitle] = useState("");

  // Custom modal state for error messages
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorTitle, setErrorTitle] = useState("");

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
      console.log('[Paywall] Starting purchase flow');
      setPurchasing(true);
      const success = await purchasePackage(selectedPackage);
      if (success) {
        console.log('[Paywall] Purchase successful, navigating to main app');
        setSuccessTitle("Welcome Aboard! ⚓");
        setSuccessMessage("Thank you for upgrading to SeaTime Tracker Pro.");
        setShowSuccessModal(true);
      }
    } catch (error: any) {
      console.error('[Paywall] Purchase failed:', error);
      setErrorTitle("Purchase Failed");
      setErrorMessage(error.message || "Please try again.");
      setShowErrorModal(true);
    } finally {
      setPurchasing(false);
    }
  };

  // Handle restore
  const handleRestore = async () => {
    try {
      console.log('[Paywall] Starting restore flow');
      setRestoring(true);
      const restored = await restorePurchases();
      if (restored) {
        console.log('[Paywall] Restore successful, navigating to main app');
        setSuccessTitle("Subscription Restored! ⚓");
        setSuccessMessage("Your SeaTime Tracker Pro subscription has been restored.");
        setShowSuccessModal(true);
      } else {
        console.log('[Paywall] No purchases found to restore');
        setErrorTitle("No Purchases Found");
        setErrorMessage("We couldn't find any previous purchases for this account.");
        setShowErrorModal(true);
      }
    } catch (error: any) {
      console.error('[Paywall] Restore failed:', error);
      setErrorTitle("Restore Failed");
      setErrorMessage(error.message || "Please try again.");
      setShowErrorModal(true);
    } finally {
      setRestoring(false);
    }
  };

  // Safe navigation handler - handles all edge cases
  const handleClose = () => {
    console.log('[Paywall] User dismissed paywall - navigating to main app');
    try {
      // Try to navigate to tabs - this is the safest approach
      // Using replace ensures we don't add to the navigation stack
      router.replace('/(tabs)');
    } catch (error) {
      console.error('[Paywall] Navigation error:', error);
      // Fallback: try to go back if replace fails
      try {
        if (router.canGoBack()) {
          router.back();
        } else {
          // Last resort: push to tabs
          router.push('/(tabs)');
        }
      } catch (fallbackError) {
        console.error('[Paywall] Fallback navigation also failed:', fallbackError);
      }
    }
  };

  const handleSuccessModalClose = () => {
    console.log('[Paywall] Success modal closed, navigating to main app');
    setShowSuccessModal(false);
    // Use the same safe navigation handler
    handleClose();
  };

  const handleErrorModalClose = () => {
    console.log('[Paywall] Error modal closed');
    setShowErrorModal(false);
  };

  const handleAdminMenu = () => {
    console.log('[Paywall] User tapped Admin button - navigating to admin menu');
    try {
      router.push('/admin-menu');
    } catch (error) {
      console.error('[Paywall] Failed to navigate to admin menu:', error);
    }
  };

  // Handle legal links
  const handleTermsPress = () => {
    const termsUrl = "https://www.forelandmarine.com/terms";
    Linking.openURL(termsUrl).catch(() => {
      setErrorTitle("Error");
      setErrorMessage("Could not open Terms of Service");
      setShowErrorModal(true);
    });
  };

  const handlePrivacyPress = () => {
    const privacyUrl = "https://www.forelandmarine.com/privacy";
    Linking.openURL(privacyUrl).catch(() => {
      setErrorTitle("Error");
      setErrorMessage("Could not open Privacy Policy");
      setShowErrorModal(true);
    });
  };

  // Handle app store links for web
  const handleDownloadApp = () => {
    const iosUrl = "https://apps.apple.com/app/seatime-tracker";
    const androidUrl = "https://play.google.com/store/apps/details?id=com.forelandmarine.seatimetracker";

    // For web, we can use a simple approach
    if (Platform.OS === 'ios') {
      Linking.openURL(iosUrl);
    } else {
      Linking.openURL(androidUrl);
    }
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
          <Text style={styles.errorTitle}>RevenueCat Not Configured</Text>
          <Text style={styles.errorSubtitle}>
            The RevenueCat SDK is not properly configured. This usually means the API key is missing or invalid.
          </Text>
          <View style={styles.troubleshootingContainer}>
            <Text style={styles.troubleshootingTitle}>Quick Fix:</Text>
            <Text style={styles.troubleshootingStep}>
              1. Check that app.json has a valid API key
            </Text>
            <Text style={styles.troubleshootingStep}>
              2. iOS keys start with &quot;appl_&quot;
            </Text>
            <Text style={styles.troubleshootingStep}>
              3. Use admin menu to activate a test subscription
            </Text>
          </View>
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

        {/* No packages available - Enhanced error message */}
        {!isWeb && packages.length === 0 && !loading && isConfigured && (
          <View style={styles.noPackagesContainer}>
            <IconSymbol
              ios_icon_name="exclamationmark.triangle"
              android_material_icon_name="warning"
              size={64}
              color={colors.warning}
            />
            <Text style={styles.errorTitle}>
              No subscription options available
            </Text>
            <Text style={styles.errorSubtitle}>
              RevenueCat is configured but no subscription packages were found. This usually means the offering needs to be set up in the RevenueCat dashboard.
            </Text>
            
            {/* Troubleshooting steps */}
            <View style={styles.troubleshootingContainer}>
              <Text style={styles.troubleshootingTitle}>Possible causes:</Text>
              <Text style={styles.troubleshootingStep}>
                1. No offering is marked as &quot;Current&quot; in RevenueCat dashboard
              </Text>
              <Text style={styles.troubleshootingStep}>
                2. The offering has no products attached
              </Text>
              <Text style={styles.troubleshootingStep}>
                3. Products are not configured in App Store Connect
              </Text>
              <Text style={styles.troubleshootingStep}>
                4. The entitlement ID doesn&apos;t match (currently using: &quot;pro&quot;)
              </Text>
            </View>
            
            {/* Quick actions */}
            <View style={styles.troubleshootingContainer}>
              <Text style={styles.troubleshootingTitle}>What you can do:</Text>
              <Text style={styles.troubleshootingStep}>
                • Check your internet connection
              </Text>
              <Text style={styles.troubleshootingStep}>
                • Try the &quot;Restore Purchases&quot; button below
              </Text>
              <Text style={styles.troubleshootingStep}>
                • Use the admin menu (wrench icon) to activate a test subscription
              </Text>
              <Text style={styles.troubleshootingStep}>
                • Check the console logs for detailed error messages
              </Text>
            </View>
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
            {/* Native: Subscribe Button - only show if packages available */}
            {packages.length > 0 && (
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
            )}

            {/* Restore Button - Always show, more prominent when no packages */}
            <TouchableOpacity
              style={packages.length === 0 ? styles.primaryButton : styles.secondaryButton}
              onPress={handleRestore}
              disabled={restoring}
            >
              {restoring ? (
                <ActivityIndicator size="small" color={packages.length === 0 ? "#fff" : colors.primary} />
              ) : (
                <Text style={packages.length === 0 ? styles.primaryButtonText : styles.secondaryButtonText}>
                  Restore Purchases
                </Text>
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
            {packages.length > 0 && (
              <Text style={styles.legalText}>
                Payment will be charged to your{" "}
                {Platform.OS === "ios" ? "Apple ID" : "Google Play"} account at confirmation of purchase.
                Subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period.
                Your account will be charged for renewal within 24 hours prior to the end of the current period.
                You can manage and cancel your subscriptions by going to your account settings on the App Store after purchase.
              </Text>
            )}

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

      {/* Success Modal - Custom modal for cross-platform compatibility */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={handleSuccessModalClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <IconSymbol
              ios_icon_name="checkmark.circle.fill"
              android_material_icon_name="check-circle"
              size={64}
              color={colors.success}
            />
            <Text style={styles.modalTitle}>{successTitle}</Text>
            <Text style={styles.modalMessage}>{successMessage}</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={handleSuccessModalClose}
            >
              <Text style={styles.modalButtonText}>Start Tracking</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Error Modal - Custom modal for cross-platform compatibility */}
      <Modal
        visible={showErrorModal}
        transparent
        animationType="fade"
        onRequestClose={handleErrorModalClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <IconSymbol
              ios_icon_name="exclamationmark.triangle"
              android_material_icon_name="error"
              size={64}
              color={colors.error}
            />
            <Text style={styles.modalTitle}>{errorTitle}</Text>
            <Text style={styles.modalMessage}>{errorMessage}</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={handleErrorModalClose}
            >
              <Text style={styles.modalButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  errorTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.text,
    textAlign: "center",
    marginTop: 16,
  },
  errorSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginTop: 8,
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
    padding: 24,
    alignItems: "center",
    gap: 16,
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  troubleshootingContainer: {
    width: "100%",
    marginTop: 16,
    padding: 16,
    backgroundColor: colors.background,
    borderRadius: 8,
    gap: 8,
  },
  troubleshootingTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  troubleshootingStep: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
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
  // Custom Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    gap: 16,
    maxWidth: 400,
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: colors.text,
    textAlign: "center",
  },
  modalMessage: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
  modalButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 8,
    minWidth: 120,
  },
  modalButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
});
