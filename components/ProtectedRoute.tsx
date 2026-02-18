/**
 * Protected Route Component Template
 *
 * A wrapper component that ensures a user is authenticated before
 * allowing access to a screen. Redirects to login if not authenticated.
 *
 * Usage:
 * ```tsx
 * <ProtectedRoute>
 *   <ProfileScreen />
 * </ProtectedRoute>
 * ```
 *
 * Or wrap route in _layout.tsx:
 * ```tsx
 * <Stack.Screen name="profile" options={{ title: "Profile" }}>
 *   {() => (
 *     <ProtectedRoute>
 *       <ProfileScreen />
 *     </ProtectedRoute>
 *   )}
 * </Stack.Screen>
 * ```
 */

import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/contexts/AuthContext"; // TODO: Update import path

interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string; // Default is "/auth"
  loadingComponent?: React.ReactNode;
}

export function ProtectedRoute({
  children,
  redirectTo = "/auth",
  loadingComponent,
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      // User is not authenticated, redirect to login
      router.replace(redirectTo as any);
    }
  }, [user, loading, router, redirectTo]);

  // Show loading state while checking authentication
  if (loading) {
    return loadingComponent || (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  // User not authenticated, will redirect (show nothing)
  if (!user) {
    return null;
  }

  // User is authenticated, render children
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
