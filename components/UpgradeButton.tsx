/**
 * UpgradeButton Component
 *
 * A reusable button to show subscription upgrade options.
 * Automatically hides when user is already subscribed.
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
 */

import React from "react";
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useSubscription } from "@/contexts/SubscriptionContext";

interface UpgradeButtonProps {
  /** Button style variant */
  variant?: "default" | "banner" | "compact";
  /** Custom button text */
  text?: string;
  /** Custom banner subtitle */
  subtitle?: string;
}

export function UpgradeButton({
  variant = "default",
  text = "Upgrade to Pro",
  subtitle = "Unlock all premium features",
}: UpgradeButtonProps) {
  const router = useRouter();
  const { isSubscribed, loading } = useSubscription();

  // Don't show if loading or already subscribed
  if (loading || isSubscribed) {
    return null;
  }

  const handlePress = () => {
    router.push("/paywall");
  };

  if (variant === "banner") {
    return (
      <TouchableOpacity style={styles.banner} onPress={handlePress}>
        <View style={styles.bannerContent}>
          <Text style={styles.bannerTitle}>{text}</Text>
          <Text style={styles.bannerSubtitle}>{subtitle}</Text>
        </View>
        <Text style={styles.bannerArrow}>→</Text>
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
  // Default button style
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

  // Banner style - full width with arrow
  banner: {
    backgroundColor: "#E8F4FD",
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#B8D4E8",
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  bannerSubtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  bannerArrow: {
    fontSize: 20,
    color: "#007AFF",
    marginLeft: 12,
  },

  // Compact style - small inline button
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
});

export default UpgradeButton;
