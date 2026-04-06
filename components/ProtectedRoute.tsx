/**
 * Protected Route Component
 *
 * Gates access behind both authentication AND subscription.
 * Unauthenticated users are redirected to /auth.
 * Authenticated but unsubscribed users are redirected to /paywall.
 *
 * Usage:
 * ```tsx
 * <ProtectedRoute>
 *   <PremiumScreen />
 * </ProtectedRoute>
 * ```
 */

import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet, useColorScheme } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  loadingComponent?: React.ReactNode;
}

export function ProtectedRoute({
  children,
  loadingComponent,
}: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { isSubscribed, isLoading: subscriptionLoading, revenueCatFailed } = useSubscription();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const isLoading = authLoading || subscriptionLoading;

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      console.log('[ProtectedRoute] User not authenticated, redirecting to /auth');
      router.replace('/auth');
      return;
    }

    // If RevenueCat failed to load, fail open — do not redirect paying users to paywall
    if (revenueCatFailed) {
      console.log('[ProtectedRoute] RevenueCat failed to load, failing open (allowing access)');
      return;
    }

    if (!isSubscribed) {
      console.log('[ProtectedRoute] User not subscribed, redirecting to /paywall');
      router.replace('/paywall');
    }
  }, [user, isSubscribed, isLoading, revenueCatFailed, router]);

  if (isLoading) {
    return loadingComponent || (
      <View style={[styles.container, { backgroundColor: isDark ? '#000000' : '#FFFFFF' }]}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!user || (!isSubscribed && !revenueCatFailed)) {
    return null;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
});
