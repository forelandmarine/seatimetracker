
import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { colors } from '@/styles/commonStyles';
import React, { useEffect, useState } from 'react';
import { isOnboardingComplete } from './onboarding';

export default function Index() {
  // CRITICAL: Call useAuth and useSubscription at the top level - NEVER conditionally
  const authContext = useAuth();
  const { isSubscribed, isLoading: subscriptionLoading, revenueCatFailed } = useSubscription();
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    isOnboardingComplete().then(setOnboardingDone);
  }, []);

  useEffect(() => {
    try {
      if (authContext && !authContext.loading) {
        setInitialCheckDone(true);
      }
    } catch (error: any) {
      console.error('[Index] Error in auth check effect:', error);
      setInitialCheckDone(true);
    }
  }, [authContext]);

  if (!authContext) {
    console.error('[Index] CRITICAL: Auth context is undefined');
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Authentication Error</Text>
        <Text style={styles.loadingText}>Please restart the app</Text>
      </View>
    );
  }

  const { user, loading: authLoading } = authContext;

  // Show loading while checking auth
  if (authLoading || !initialCheckDone) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Checking your account...</Text>
      </View>
    );
  }

  const isAuthenticated = Boolean(user);
  const hasDepartment = Boolean(user?.hasDepartment || (user as any)?.department);

  console.log('[Index] Auth state - authenticated:', isAuthenticated, 'subscribed:', isSubscribed, 'hasDepartment:', hasDepartment);

  // Subscription loading — wait before deciding
  if (subscriptionLoading) {
    console.log('[Index] Subscription check in progress...');
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Verifying subscription...</Text>
      </View>
    );
  }

  // Authenticated users: check subscription gate then department
  if (isAuthenticated) {
    // Authenticated but NOT subscribed → paywall
    // If RevenueCat failed to load, fail open so paying users are not blocked
    if (!isSubscribed && !revenueCatFailed) {
      console.log('[Index] Authenticated but not subscribed, redirecting to /paywall');
      return <Redirect href="/paywall" />;
    }

    // Subscribed but no department → pathway selection
    if (!hasDepartment) {
      console.log('[Index] Subscribed but no department, redirecting to /select-pathway');
      return <Redirect href="/select-pathway" />;
    }

    // Fully set up → main app
    console.log('[Index] User fully set up, redirecting to /(tabs)');
    return <Redirect href="/(tabs)" />;
  }

  // Not authenticated → onboarding (first time) or auth
  if (onboardingDone === false) {
    console.log('[Index] Not authenticated, first time, redirecting to /onboarding');
    return <Redirect href="/onboarding" />;
  }
  console.log('[Index] Not authenticated, redirecting to /auth');
  return <Redirect href="/auth" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.error,
    marginBottom: 8,
  },
});
