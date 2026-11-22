/**
 * Sign-up activation flow (2.5.0): where a new user lands after closing the
 * paywall. Their boat stays saved and on show, with its recent AIS activity,
 * and one clear way back to the paywall. No tabs and no tracking: there is no
 * free tier (the backend makes no AIS call for users without a trial).
 *
 * One screen for both platforms.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useColorScheme, ActivityIndicator, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { BoatActivityCard, useActivationBoat, useFreeTrial } from '@/components/ActivationBoat';
import { trackEvent } from '@/utils/appEvents';

export default function LockedHomeScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { isSubscribed, isLoading } = useSubscription();
  const isDark = useColorScheme() === 'dark';
  const s = createStyles(isDark);
  const { loading, boat, activity } = useActivationBoat(true);
  const period = useFreeTrial();
  const shown = useRef(false);

  // Started a trial elsewhere (restore, code, another device): straight to the app.
  useEffect(() => {
    if (!isLoading && isSubscribed) router.replace('/');
  }, [isLoading, isSubscribed]);

  useEffect(() => {
    if (loading || shown.current) return;
    shown.current = true;
    trackEvent('locked_home_shown', boat ? 'vessel' : 'no_vessel');
  }, [loading, boat]);

  const openPaywall = () => router.push('/paywall?source=locked_home' as any);

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'Your boat stays saved on your account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { signOut().finally(() => router.replace('/')); } },
    ]);

  const cta = boat
    ? (period ? `Start your free ${period} to track it` : `Subscribe to track ${boat.name}`)
    : (period ? `Start your free ${period}` : 'See plans');

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.header}>
          <Image source={require('@/assets/images/8331a0b9-33c9-4ff2-93d0-772c257bd0c9.png')} style={s.logo} resizeMode="contain" />
          <Text style={s.brand}>SeaTime Tracker</Text>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginVertical: 32 }} color={colors.primary} />
        ) : boat ? (
          <>
            <Text style={s.title}>Your boat is saved</Text>
            <BoatActivityCard boat={boat} activity={activity} isDark={isDark} />
            <View style={s.lockRow}>
              <Text style={s.lockTitle}>Tracking is off</Text>
              <Text style={s.body}>
                Start your trial and SeaTime Tracker logs {boat.name}'s passages from AIS and adds them to your sea time, ready for your certificate.
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text style={s.title}>Add your boat when you're ready</Text>
            <Text style={s.body}>
              SeaTime Tracker logs your passages from your boat's AIS. Add it now, or start your trial and add it later.
            </Text>
            <TouchableOpacity style={s.secondary} onPress={() => router.push('/onboarding-vessel' as any)} accessibilityRole="button">
              <Text style={s.secondaryText}>Add your boat</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={s.primary} onPress={openPaywall} accessibilityRole="button">
          <Text style={s.primaryText}>{cta}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={confirmSignOut} style={s.link} accessibilityRole="button">
          <Text style={s.linkText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(isDark: boolean) {
  const text = isDark ? colors.text : colors.textLight;
  const text2 = isDark ? colors.textSecondary : colors.textSecondaryLight;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? colors.background : colors.backgroundLight },
    content: { padding: 20, paddingBottom: 48 },
    header: { alignItems: 'center', marginTop: 16, marginBottom: 28 },
    logo: { width: 64, height: 64 },
    brand: { fontSize: 20, fontWeight: '700', color: text, marginTop: 8 },
    title: { fontSize: 24, fontWeight: '700', color: text, marginBottom: 14 },
    lockRow: { marginBottom: 24 },
    lockTitle: { fontSize: 16, fontWeight: '700', color: text, marginBottom: 4 },
    body: { fontSize: 15, lineHeight: 21, color: text2, marginBottom: 16 },
    primary: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', minHeight: 56, justifyContent: 'center' },
    primaryText: { color: colors.white, fontSize: 17, fontWeight: '700', textAlign: 'center', paddingHorizontal: 12 },
    secondary: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 16 },
    secondaryText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
    link: { alignItems: 'center', paddingVertical: 16, marginTop: 8 },
    linkText: { color: text2, fontSize: 15, fontWeight: '600' },
  });
}
