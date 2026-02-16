/**
 * Paywall Screen
 *
 * Shows subscription options and handles purchases.
 * On web, displays features and prompts user to download the app.
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
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { PurchasesPackage } from "react-native-purchases";

import { useSubscription } from "@/contexts/SubscriptionContext";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Premium features for the paywall
const FEATURES = [
  {
    icon: "⚓",
    title: "Unlimited Vessels",
    description: "Track as many vessels as you need",
  },
  {
    icon: "📊",
    title: "Advanced Reports",
    description: "Generate MCA-compliant PDF and CSV reports",
  },
  {
    icon: "🌊",
    title: "Real-time AIS Tracking",
    description: "Automatic sea time detection via AIS data",
  },
  {
    icon: "☁️",
    title: "Cloud Sync",
    description: "Access your logbook across all devices",
  },
];

// Customize: Your app's colors
const colors = {
  primary: "#007AFF",
  success: "#34C759",
  warning: "#FF9500",
};

export default function PaywallScreen() {
  const router = useRouter();

  // Get subscription state and methods from context
  const {
    packages,
    loading,
    isSubscribed,
    isWeb,
    purchasePackage,
    restorePurchases,
  } = useSubscription();

  const [selectedPackage, setSelectedPackage] =
    useState<PurchasesPackage | null>(packages[0] || null);
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
        Alert.alert("Welcome!", "Thank you for your purchase.", [
          { text: "OK", onPress: () => router.back() },
        ]);
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
        Alert.alert("Restored!", "Your subscription has been restored.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } else {
        Alert.alert(
          "No Purchases Found",
          "We couldn't find any previous purchases."
        );
      }
    } catch (error: any) {
      Alert.alert("Restore Failed", error.message || "Please try again.");
    } finally {
      setRestoring(false);
    }
  };

  const handleClose = () => {
    router.back();
  };

  // Handle app store links for web
  const handleDownloadApp = () => {
    // TODO: Replace with your actual app store URLs
    const iosUrl = "https://apps.apple.com/app/your-app-id";
    const androidUrl = "https://play.google.com/store/apps/details?id=your.app.id";

    // On web, we can't detect which device the user has, so show both options
    Alert.alert(
      "Download the App",
      "To subscribe, please download our app from your device's app store.",
      [
        { text: "App Store (iOS)", onPress: () => Linking.openURL(iosUrl) },
        { text: "Google Play", onPress: () => Linking.openURL(androidUrl) },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  // Already subscribed - show celebration confirmation
  if (isSubscribed) {
    return (
      <View style={styles.subscribedContainer}>
        <LinearGradient
          colors={["#667EEA", "#764BA2", "#f093fb"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.subscribedGradient}
        >
          {/* Decorative floating orbs */}
          <View style={[styles.floatingOrb, styles.orb1]} />
          <View style={[styles.floatingOrb, styles.orb2]} />
          <View style={[styles.floatingOrb, styles.orb3]} />

          <SafeAreaView style={styles.subscribedSafeArea}>
            {/* Close button */}
            <TouchableOpacity style={styles.subscribedCloseButton} onPress={handleClose}>
              <Text style={styles.subscribedCloseText}>✕</Text>
            </TouchableOpacity>

            <View style={styles.subscribedContent}>
              {/* Celebration icon with glow */}
              <View style={styles.celebrationIconContainer}>
                <View style={styles.celebrationGlow} />
                <Text style={styles.celebrationIcon}>🎉</Text>
              </View>

              {/* PRO MEMBER badge */}
              <View style={styles.proMemberBadge}>
                <Text style={styles.proMemberText}>PRO MEMBER</Text>
              </View>

              {/* Title */}
              <Text style={styles.subscribedTitle}>You're All Set!</Text>
              <Text style={styles.subscribedSubtitle}>
                Welcome to the premium experience
              </Text>

              {/* Features card */}
              <View style={styles.featuresCard}>
                <Text style={styles.featuresCardTitle}>Unlocked Features</Text>
                {FEATURES.slice(0, 3).map((feature, index) => (
                  <View key={index} style={styles.featureCheckRow}>
                    <View style={styles.checkCircle}>
                      <Text style={styles.checkMark}>✓</Text>
                    </View>
                    <Text style={styles.featureCheckText}>{feature.title}</Text>
                  </View>
                ))}
              </View>

              {/* Start Exploring button */}
              <TouchableOpacity style={styles.exploreButton} onPress={handleClose}>
                <View style={styles.exploreButtonInner}>
                  <Text style={styles.exploreButtonText}>Start Exploring</Text>
                </View>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </View>
    );
  }

  // Feature icon background colors (rotating by index)
  const featureIconColors = [
    "rgba(255, 215, 0, 0.25)",   // Gold
    "rgba(76, 217, 100, 0.25)",  // Green
    "rgba(255, 149, 0, 0.25)",   // Orange
    "rgba(90, 200, 250, 0.25)",  // Blue
  ];

  // Loading state
  if (loading) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={["#667EEA", "#764BA2", "#f093fb"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBackground}
        >
          {/* Decorative floating orbs */}
          <View style={[styles.floatingOrb, styles.orb1]} />
          <View style={[styles.floatingOrb, styles.orb2]} />
          <View style={[styles.floatingOrb, styles.orb3]} />

          <SafeAreaView style={styles.safeArea}>
            <View style={styles.centeredContainer}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          </SafeAreaView>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#667EEA", "#764BA2", "#f093fb"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBackground}
      >
        {/* Decorative floating orbs */}
        <View style={[styles.floatingOrb, styles.orb1]} />
        <View style={[styles.floatingOrb, styles.orb2]} />
        <View style={[styles.floatingOrb, styles.orb3]} />

        <SafeAreaView style={styles.safeArea}>
          {/* Close Button */}
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              {/* Premium badge */}
              <View style={styles.premiumBadge}>
                <Text style={styles.premiumBadgeText}>PREMIUM</Text>
              </View>
              <Text style={styles.title}>Upgrade to Premium</Text>
              <Text style={styles.subtitle}>
                Unlock all features and get the most out of the app
              </Text>
            </View>

            {/* Features List - Glass Card */}
            <View style={styles.featuresCard}>
              <Text style={styles.featuresCardTitle}>What You'll Get</Text>
              {FEATURES.map((feature, index) => (
                <View key={index} style={styles.featureRow}>
                  <View style={[styles.featureIcon, { backgroundColor: featureIconColors[index % featureIconColors.length] }]}>
                    <Text style={styles.featureIconText}>{feature.icon}</Text>
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
                <Text style={styles.webMessageTitle}>Preview Mode</Text>
                <Text style={styles.webMessageText}>
                  This is a preview of your paywall. Actual prices will be loaded
                  from RevenueCat when running on iOS or Android.
                </Text>
              </View>
            )}

            {/* Package Selection */}
            {packages.length > 0 && (
              <View style={styles.packagesContainer}>
                {packages.map((pkg) => {
                  const isSelected = selectedPackage?.identifier === pkg.identifier;
                  return (
                    <TouchableOpacity
                      key={pkg.identifier}
                      style={[
                        styles.packageCard,
                        isSelected && styles.packageCardSelected,
                      ]}
                      onPress={() => setSelectedPackage(pkg)}
                    >
                      {isSelected && <View style={styles.selectedIndicator} />}
                      <View style={styles.packageHeader}>
                        <Text style={styles.packageTitle}>{pkg.product.title}</Text>
                        {isSelected && (
                          <View style={styles.checkmarkCircle}>
                            <Text style={styles.checkmark}>✓</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.packagePrice}>
                        {pkg.product.priceString}
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
            {!isWeb && packages.length === 0 && !loading && (
              <View style={styles.noPackagesContainer}>
                <Text style={styles.noPackagesText}>
                  No subscription options available at this time.
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Bottom Actions */}
          <View style={styles.bottomActions}>
            {/* Web: Show disabled subscribe button with mock price */}
            {isWeb ? (
              <>
                <TouchableOpacity
                  style={[styles.primaryButton, styles.buttonDisabled]}
                  disabled={true}
                >
                  <Text style={styles.primaryButtonText}>
                    {selectedPackage
                      ? `Subscribe for ${selectedPackage.product.priceString}`
                      : "Select a plan"}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.legalText}>
                  Preview mode - purchases available in the mobile app
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
                    <ActivityIndicator color="#764BA2" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {selectedPackage
                        ? `Subscribe for ${selectedPackage.product.priceString}`
                        : "Select a plan"}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Restore Button */}
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={handleRestore}
                  disabled={restoring}
                >
                  {restoring ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.secondaryButtonText}>Restore Purchases</Text>
                  )}
                </TouchableOpacity>

                {/* Legal Text - Required by App Store */}
                <Text style={styles.legalText}>
                  Payment will be charged to your{" "}
                  {Platform.OS === "ios" ? "Apple ID" : "Google Play"} account.
                  Subscription automatically renews unless canceled at least 24 hours
                  before the end of the current period.
                </Text>
              </>
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradientBackground: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.85)",
    marginTop: 16,
  },
  closeButton: {
    position: "absolute",
    top: 16,
    right: 20,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 18,
    color: "#fff",
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  premiumBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  premiumBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 1.5,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.85)",
    textAlign: "center",
    marginTop: 8,
  },
  featuresCard: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  featuresCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.7)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
    textAlign: "center",
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 12,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  featureIconText: {
    fontSize: 20,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  featureDescription: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.75)",
    marginTop: 2,
  },
  packagesContainer: {
    gap: 12,
  },
  packageCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    overflow: "hidden",
  },
  packageCardSelected: {
    borderColor: "#fff",
    borderWidth: 2,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  selectedIndicator: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "#fff",
  },
  packageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  packageTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
  },
  checkmarkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  checkmark: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "bold",
  },
  packagePrice: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginTop: 8,
  },
  packageDescription: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.75)",
    marginTop: 4,
  },
  noPackagesContainer: {
    padding: 24,
    alignItems: "center",
  },
  noPackagesText: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.85)",
    textAlign: "center",
  },
  webMessageContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  webMessageTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#fff",
    marginBottom: 8,
    textAlign: "center",
  },
  webMessageText: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.85)",
    textAlign: "center",
    lineHeight: 20,
  },
  bottomActions: {
    padding: 24,
    paddingBottom: 32,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: "#fff",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryButtonText: {
    color: "#764BA2",
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
    color: "rgba(255, 255, 255, 0.9)",
  },
  legalText: {
    fontSize: 11,
    color: "rgba(255, 255, 255, 0.6)",
    textAlign: "center",
    lineHeight: 16,
  },

  // Subscribed celebration styles
  subscribedContainer: {
    flex: 1,
  },
  subscribedGradient: {
    flex: 1,
  },
  subscribedSafeArea: {
    flex: 1,
  },
  floatingOrb: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  orb1: {
    width: 200,
    height: 200,
    top: -50,
    right: -50,
  },
  orb2: {
    width: 150,
    height: 150,
    bottom: 100,
    left: -40,
  },
  orb3: {
    width: 100,
    height: 100,
    top: SCREEN_HEIGHT * 0.3,
    right: 20,
  },
  subscribedCloseButton: {
    position: "absolute",
    top: 16,
    right: 20,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  subscribedCloseText: {
    fontSize: 18,
    color: "#fff",
    fontWeight: "600",
  },
  subscribedContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  celebrationIconContainer: {
    position: "relative",
    marginBottom: 20,
  },
  celebrationGlow: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    top: -20,
    left: -20,
  },
  celebrationIcon: {
    fontSize: 80,
  },
  proMemberBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  proMemberText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 1.5,
  },
  subscribedTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  subscribedSubtitle: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.85)",
    textAlign: "center",
    marginBottom: 32,
  },
  featuresCard: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 20,
    padding: 20,
    width: "100%",
    marginBottom: 32,
  },
  featuresCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255, 255, 255, 0.7)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
    textAlign: "center",
  },
  featureCheckRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  checkMark: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "bold",
  },
  featureCheckText: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "500",
  },
  exploreButton: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
  },
  exploreButtonInner: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingVertical: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 16,
  },
  exploreButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
});
