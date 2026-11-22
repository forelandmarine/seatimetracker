
import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { colors } from '@/styles/commonStyles';
import React, { useEffect, useState } from 'react';
import { isOnboardingComplete } from './onboarding';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { log, error as logError } from '@/utils/log';
import { getActivation, type ActivationRecord } from '@/utils/activation';

export default function Index() {
  // CRITICAL: Call useAuth and useSubscription at the top level - NEVER conditionally
  const authContext = useAuth();
  const { isSubscribed, isLoading: subscriptionLoading, revenueCatFailed, paywallDismissed, everSubscribed, paywallSkipped } = useSubscription();
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    isOnboardingComplete().then(setOnboardingDone);
  }, []);

  // Sign-up activation progress for this user (boat, then pathway, then paywall).
  const userId = authContext?.user?.id;
  const [activation, setActivation] = useState<{ userId: string; record: ActivationRecord } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    getActivation(userId).then((record) => { if (live) setActivation({ userId, record }); });
    return () => { live = false; };
  }, [userId]);

  // Remember that this device has had a signed-in user, so after a sign-out the
  // account screen opens on Sign in rather than Create account.
  useEffect(() => {
    if (authContext?.user) AsyncStorage.setItem('seatime_signed_in_before', 'true').catch(() => {});
  }, [authContext?.user]);

  useEffect(() => {
    try {
      if (authContext && !authContext.loading) {
        setInitialCheckDone(true);
      }
    } catch (error: any) {
      logError('[Index] Error in auth check effect:', error);
      setInitialCheckDone(true);
    }
  }, [authContext]);

  if (!authContext) {
    logError('[Index] CRITICAL: Auth context is undefined');
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Authentication Error</Text>
        <Text style={styles.loadingText}>Please restart the app</Text>
      </View>
    );
  }

  const { user, loading: authLoading } = authContext;

  // Show loading only for the first auth and onboarding check. authLoading also
  // turns on during a sign-in attempt; showing the spinner then unmounts the auth
  // screen, so a failed sign-in came back to a cleared form without its offers.
  if (!initialCheckDone || onboardingDone === null) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Checking your account...</Text>
      </View>
    );
  }

  const isAuthenticated = Boolean(user);
  const hasDepartment = Boolean(user?.hasDepartment || (user as any)?.department);

  log('[Index] Auth state - authenticated:', isAuthenticated, 'subscribed:', isSubscribed, 'hasDepartment:', hasDepartment, 'onboardingDone:', onboardingDone);

  // Step 1: Onboarding — show walkthrough before anything else for first-time users
  if (onboardingDone === false) {
    log('[Index] First time user, redirecting to /onboarding');
    return <Redirect href="/onboarding" />;
  }

  // Step 2: Auth — not signed in → auth screen
  if (!isAuthenticated) {
    log('[Index] Not authenticated, redirecting to /auth');
    return <Redirect href="/auth" />;
  }

  // Step 3: Subscription — wait for check to complete
  if (subscriptionLoading) {
    log('[Index] Subscription check in progress...');
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Verifying subscription...</Text>
      </View>
    );
  }

  // Step 4: Not subscribed.
  if (!isSubscribed && !paywallDismissed) {
    // Lapsed (had a trial or subscription) or RevenueCat unavailable: the paywall, as before.
    if (everSubscribed) {
      log('[Index] Authenticated but not subscribed, redirecting to /paywall');
      return <Redirect href="/paywall?source=lapsed" />;
    }

    // Never subscribed: boat first, then authority and pathway, then the paywall
    // (2.5.0 activation flow). Closing the paywall leads to the locked Home.
    if (!activation || activation.userId !== user?.id) {
      return (
        <View style={styles.container}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }
    if (!activation.record.vessel) {
      log('[Index] New user, redirecting to /onboarding-vessel');
      return <Redirect href={"/onboarding-vessel" as any} />;
    }
    if (!hasDepartment) {
      log('[Index] New user with boat step done, redirecting to /select-pathway');
      return <Redirect href="/select-pathway" />;
    }
    if (!paywallSkipped) {
      const source = activation.record.paywallSeen ? 'launch' : 'onboarding';
      log('[Index] New user set up, redirecting to /paywall, source:', source);
      return <Redirect href={`/paywall?source=${source}` as any} />;
    }
    log('[Index] New user closed the paywall, redirecting to /locked-home');
    return <Redirect href={"/locked-home" as any} />;
  }

  // Step 5: Pathway — must select department
  if (!hasDepartment) {
    log('[Index] Subscribed but no department, redirecting to /select-pathway');
    return <Redirect href="/select-pathway" />;
  }

  // Step 6: Main app
  log('[Index] User fully set up, redirecting to /(tabs)');
  return <Redirect href="/(tabs)" />;
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
