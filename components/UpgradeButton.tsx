/**
 * UpgradeButton Component
 *
 * A reusable button to show subscription upgrade options.
 * Shows a subscribed indicator when user is already subscribed.
 *
 * Usage:
 *   import { UpgradeButton } from "@/components/UpgradeButton";
 *
 *   // Simple button
 *   <UpgradeButton />
 *
 *   // Banner style
 *   <UpgradeButton variant="banner" />
 *
 *   // Compact for tight spaces
 *   <UpgradeButton variant="compact" />
 *
 *   // Custom subscribed text
 *   <UpgradeButton
 *     variant="banner"
 *     subscribedText="Premium Member"
 *     subscribedSubtitle="Enjoying all features"
 *   />
 */

import React from "react";
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSubscription } from "@/contexts/SubscriptionContext";

interface UpgradeButtonProps {
  /** Button style variant */
  variant?: "default" | "banner" | "compact";
  /** Custom button text (when not subscribed) */
  text?: string;
  /** Custom banner subtitle (when not subscribed) */
  subtitle?: string;
  /** Custom text when subscribed */
  subscribedText?: string;
  /** Custom subtitle when subscribed (for banner variant) */
  subscribedSubtitle?: string;
}

export function UpgradeButton({
  variant = "default",
  text = "Upgrade to Pro",
  subtitle = "Unlock all premium features",
  subscribedText = "Premium Active",
  subscribedSubtitle = "You have access to all features",
}: UpgradeButtonProps) {
  const router = useRouter();
  const { isSubscribed, loading } = useSubscription();

  // Don't show while loading
  if (loading) {
    return null;
  }

  const handlePress = () => {
    router.push("/paywall");
  };

  // Show subscribed state
  if (isSubscribed) {
    if (variant === "banner") {
      return (
        <TouchableOpacity style={styles.subscribedBannerContainer} onPress={handlePress}>
          <LinearGradient
            colors={["#11998E", "#38EF7D"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.subscribedBanner}
          >
            {/* Subtle shine overlay */}
            <View style={styles.shineOverlay} />
            <View style={styles.subscribedIconContainer}>
              <Text style={styles.subscribedIcon}>👑</Text>
            </View>
            <View style={styles.bannerContent}>
              <View style={styles.subscribedTitleRow}>
                <Text style={styles.subscribedBannerTitle}>{subscribedText}</Text>
                <View style={styles.proBadge}>
                  <Text style={styles.proBadgeText}>PRO</Text>
                </View>
              </View>
              <Text style={styles.subscribedBannerSubtitle}>{subscribedSubtitle}</Text>
            </View>
            <View style={styles.arrowContainer}>
              <Text style={styles.subscribedBannerArrow}>→</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      );
    }

    if (variant === "compact") {
      return (
        <TouchableOpacity style={styles.subscribedCompact} onPress={handlePress}>
          <Text style={styles.subscribedCompactText}>✓ {subscribedText}</Text>
        </TouchableOpacity>
      );
    }

    // Default subscribed button
    return (
      <TouchableOpacity style={styles.subscribedButton} onPress={handlePress}>
        <Text style={styles.subscribedButtonText}>✓ {subscribedText}</Text>
      </TouchableOpacity>
    );
  }

  // Not subscribed - show upgrade options
  if (variant === "banner") {
    return (
      <TouchableOpacity style={styles.bannerContainer} onPress={handlePress}>
        <LinearGradient
          colors={["#667EEA", "#764BA2"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.banner}
        >
          <View style={styles.sparkleContainer}>
            <Text style={styles.sparkleIcon}>✨</Text>
          </View>
          <View style={styles.bannerContent}>
            <Text style={styles.bannerTitle}>{text}</Text>
            <Text style={styles.bannerSubtitle}>{subtitle}</Text>
          </View>
          <View style={styles.arrowContainer}>
            <Text style={styles.bannerArrow}>→</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  if (variant === "compact") {
    return (
      <TouchableOpacity style={styles.compact} onPress={handlePress}>
        <Text style={styles.compactText}>⭐ {text}</Text>
      </TouchableOpacity>
    );
  }

  // Default button
  return (
    <TouchableOpacity style={styles.button} onPress={handlePress}>
      <Text style={styles.buttonText}>{text}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Default button style (not subscribed)
  button: {
    backgroundColor: "#007AFF",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  // Banner container for shadow (not subscribed)
  bannerContainer: {
    borderRadius: 16,
    shadowColor: "#667EEA",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  // Banner style - gradient with sparkle icon (not subscribed)
  banner: {
    padding: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  sparkleContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  sparkleIcon: {
    fontSize: 22,
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
  bannerSubtitle: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.85)",
    marginTop: 2,
  },
  arrowContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  bannerArrow: {
    fontSize: 18,
    color: "#fff",
    fontWeight: "600",
  },

  // Compact style - small inline button (not subscribed)
  compact: {
    backgroundColor: "#FFF9E6",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FFD700",
  },
  compactText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#996600",
  },

  // Subscribed button style (default)
  subscribedButton: {
    backgroundColor: "#34C759",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
  },
  subscribedButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },

  // Subscribed banner container for shadow
  subscribedBannerContainer: {
    borderRadius: 16,
    shadowColor: "#11998E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  // Subscribed banner style - gradient with crown icon
  subscribedBanner: {
    padding: 16,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  shineOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  subscribedIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  subscribedIcon: {
    fontSize: 22,
  },
  subscribedTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  subscribedBannerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
  },
  proBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  proBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.5,
  },
  subscribedBannerSubtitle: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.85)",
    marginTop: 2,
  },
  subscribedBannerArrow: {
    fontSize: 18,
    color: "#fff",
    fontWeight: "600",
  },

  // Subscribed compact style - small green badge
  subscribedCompact: {
    backgroundColor: "#E8F8E8",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#B8E8B8",
  },
  subscribedCompactText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1B5E20",
  },
});

export default UpgradeButton;
