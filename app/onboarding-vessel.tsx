/**
 * Sign-up activation flow (2.5.0), step 1 of 3: find your boat. Then the
 * authority and pathway, then the paywall (app/index.tsx does the routing).
 *
 * Uses the 2.5.0 vessel lookup (free search of our own index, web fallback).
 * The picked match is checked with POST /api/vessels/lookup/preview: one AIS
 * history call that confirms the MMSI and counts recent days underway, in place
 * of the vessel_info confirm. The vessel is saved switched off: there is no free
 * tier, so tracking (and any further AIS call) starts with the trial.
 *
 * One screen for both platforms (no .ios.tsx variant needed: plain React Native).
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, useColorScheme, ActivityIndicator,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import VesselLookup from '@/components/VesselLookup';
import { colors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import * as seaTimeApi from '@/utils/seaTimeApi';
import { updateActivation } from '@/utils/activation';
import { trackEvent } from '@/utils/appEvents';
import { log, error as logError } from '@/utils/log';

type Sector = 'yachting' | 'commercial';

export default function OnboardingVesselScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const s = createStyles(isDark);

  const [checkingExisting, setCheckingExisting] = useState(true);
  const [name, setName] = useState('');
  const [length, setLength] = useState('');
  const [sector, setSector] = useState<Sector>('yachting');
  const [showMmsi, setShowMmsi] = useState(false);
  const [mmsi, setMmsi] = useState('');
  const [busy, setBusy] = useState<null | 'checking' | 'saving'>(null);
  const mmsiRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  // A boat already saved (new phone, or the app was closed mid-flow): move on.
  useEffect(() => {
    let live = true;
    if (!user?.id) return;
    (async () => {
      try {
        const vessels: any[] = (await seaTimeApi.getVessels()) || [];
        if (!live) return;
        if (vessels.length > 0) {
          const v = vessels.find((x) => x?.is_active) || vessels[0];
          await updateActivation(user.id, { vessel: 'done', vesselId: v?.id });
          router.replace('/');
          return;
        }
        const profile: any = await seaTimeApi.getUserProfile().catch(() => null);
        if (live && profile?.vessel_sector === 'commercial') setSector('commercial');
      } catch (e) {
        logError('[OnboardingVessel] Could not check for a saved boat:', e);
      }
      if (live) {
        setCheckingExisting(false);
        trackEvent('onboarding_vessel_shown');
      }
    })();
    return () => { live = false; };
  }, [user?.id]);

  const save = async (c: seaTimeApi.VesselCandidate, via: 'lookup' | 'mmsi', result?: { activity?: seaTimeApi.RecentActivity | null }) => {
    if (!user?.id || busy === 'saving') return;
    setBusy('saving');
    try {
      try {
        await seaTimeApi.updateUserProfile({ vessel_sector: sector });
      } catch (e) {
        logError('[OnboardingVessel] Could not save sector (vessel still saved):', e);
      }
      const vesselName = name.trim() || c.name;
      let vesselId: string | undefined;
      try {
        const created = await seaTimeApi.createVessel(
          seaTimeApi.normalizeMmsi(c.mmsi),
          vesselName,
          false, // switched on when the trial starts (utils/activation.ts)
          c.flag || undefined,
          undefined,
          c.app_type || undefined,
          c.length_metres ?? (length ? parseFloat(length) : undefined),
          undefined,
          c.call_sign || undefined,
          undefined,
          undefined,
          c.imo || undefined,
        );
        vesselId = created?.id;
      } catch (e: any) {
        // Already saved on this account (a retry after a dropped connection): use that one.
        if (!/already have a vessel/i.test(String(e?.message))) throw e;
        const vessels: any[] = (await seaTimeApi.getVessels()) || [];
        vesselId = vessels.find((v) => v?.mmsi === seaTimeApi.normalizeMmsi(c.mmsi))?.id;
      }
      await updateActivation(user.id, { vessel: 'done', vesselId });
      trackEvent('vessel_added', via === 'lookup' ? 'lookup' : 'manual');
      trackEvent('onboarding_vessel_confirmed', `${via}${result?.activity ? ':stat' : ''}`);
      log('[OnboardingVessel] Boat saved:', vesselName);
      router.replace('/');
    } catch (e: any) {
      logError('[OnboardingVessel] Could not save the boat:', e);
      Alert.alert("Couldn't save your boat", e?.message || 'Check your connection and try again.');
      setBusy(null);
    }
  };

  const onEnterMmsi = () => {
    setShowMmsi(true);
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
      mmsiRef.current?.focus();
    }, 150);
  };

  const checkMmsi = async () => {
    const problem = seaTimeApi.mmsiValidationError(mmsi);
    if (problem) { Alert.alert('Check the MMSI', problem); return; }
    if (!name.trim()) { Alert.alert('Vessel name needed', "Enter the vessel's name at the top as well."); return; }
    const digits = seaTimeApi.normalizeMmsi(mmsi);
    setBusy('checking');
    let r: seaTimeApi.VesselPreviewResult;
    try {
      r = await seaTimeApi.previewVesselLookup({ mmsi: digits, imo: null, alt_mmsis: [], name: name.trim() });
    } catch {
      r = { status: 'unavailable', vessel: null, note: null, activity: null, source: 'none' };
    }
    trackEvent('onboarding_vessel_checked', `${r.status}:${r.source}`);
    setBusy(null);
    const candidate: seaTimeApi.VesselCandidate = {
      mmsi: r.vessel?.mmsi || digits,
      name: name.trim(),
      imo: r.vessel?.imo ?? null,
      flag: r.vessel?.flag ?? null,
      flag_iso: r.vessel?.flag_iso ?? null,
      type: r.vessel?.type ?? null,
      app_type: null,
      length_metres: length ? parseFloat(length) || null : null,
      year_built: null,
    };
    if (r.status === 'not_found') {
      Alert.alert(
        `MMSI ${digits} isn't on AIS`,
        "Check the number on the VHF or AIS unit or the ship's radio licence. You can save it anyway and fix it later.",
        [
          { text: 'Check the number', style: 'cancel' },
          { text: 'Save anyway', onPress: () => save(candidate, 'mmsi', r) },
        ],
      );
      return;
    }
    save(candidate, 'mmsi', r);
  };

  const skip = async () => {
    if (!user?.id) return;
    trackEvent('onboarding_vessel_skipped');
    await updateActivation(user.id, { vessel: 'skipped' });
    router.replace('/');
  };

  if (checkingExisting) {
    return (
      <View style={[s.container, s.center]}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.step}>Step 1 of 3</Text>
          <Text style={s.title}>Find your boat</Text>
          <Text style={s.body}>
            SeaTime Tracker logs your sea time from your boat's AIS, so we start with the boat. Search by name, or enter its MMSI.
          </Text>

          <Text style={s.label}>I work on</Text>
          <View style={s.segment} accessibilityRole="radiogroup">
            {([['yachting', 'Yachts'], ['commercial', 'Commercial vessels']] as const).map(([value, label]) => (
              <TouchableOpacity
                key={value}
                style={[s.segmentItem, sector === value && s.segmentOn]}
                onPress={() => setSector(value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: sector === value }}
              >
                <Text style={[s.segmentText, sector === value && s.segmentTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <VesselLookup
            name={name}
            onNameChange={setName}
            length={length}
            onLengthChange={setLength}
            confirm={async (c) => {
              const r = await seaTimeApi.previewVesselLookup(c);
              trackEvent('onboarding_vessel_checked', `${r.status}:${r.source}`);
              return r;
            }}
            onConfirm={(c, result) => save(c, 'lookup', result)}
            onEnterMmsi={onEnterMmsi}
          />

          {showMmsi && (
            <View style={s.mmsiBlock}>
              <Text style={s.label}>MMSI</Text>
              <TextInput
                ref={mmsiRef}
                style={s.input}
                placeholder="9 digits, e.g. 235012345"
                placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                value={mmsi}
                onChangeText={setMmsi}
                keyboardType="number-pad"
                maxLength={12}
                returnKeyType="done"
                onSubmitEditing={checkMmsi}
              />
              <TouchableOpacity style={[s.primary, !!busy && s.disabled]} onPress={checkMmsi} disabled={!!busy} accessibilityRole="button">
                {busy === 'checking' ? <ActivityIndicator color={colors.white} /> : <Text style={s.primaryText}>Check and save</Text>}
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity onPress={skip} style={s.skip} disabled={!!busy} accessibilityRole="button">
            <Text style={s.skipText}>I don't have my boat details now</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {busy === 'saving' && (
        <View style={s.overlay}>
          <ActivityIndicator size="large" color={colors.white} />
          <Text style={s.overlayText}>Saving your boat</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function createStyles(isDark: boolean) {
  const text = isDark ? colors.text : colors.textLight;
  const text2 = isDark ? colors.textSecondary : colors.textSecondaryLight;
  const border = isDark ? colors.border : colors.borderLight;
  const field = isDark ? colors.cardBackground : colors.card;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? colors.background : colors.backgroundLight },
    center: { alignItems: 'center', justifyContent: 'center' },
    content: { padding: 20, paddingBottom: 48 },
    step: { fontSize: 13, fontWeight: '700', color: colors.primary, letterSpacing: 0.5, marginTop: 8 },
    title: { fontSize: 28, fontWeight: '700', color: text, marginTop: 6 },
    body: { fontSize: 16, lineHeight: 22, color: text2, marginTop: 8, marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '600', color: text, marginBottom: 8 },
    segment: { flexDirection: 'row', borderWidth: 1, borderColor: border, borderRadius: 8, overflow: 'hidden', marginBottom: 20 },
    segmentItem: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: field },
    segmentOn: { backgroundColor: colors.primary },
    segmentText: { fontSize: 15, fontWeight: '600', color: text2 },
    segmentTextOn: { color: colors.white },
    mmsiBlock: { marginTop: 8 },
    input: {
      backgroundColor: field, borderRadius: 8, padding: 14, fontSize: 16, color: text, borderWidth: 1, borderColor: border, marginBottom: 12,
    },
    primary: { backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: 'center', minHeight: 50, justifyContent: 'center' },
    primaryText: { color: colors.white, fontSize: 16, fontWeight: '700' },
    disabled: { opacity: 0.6 },
    skip: { alignItems: 'center', paddingVertical: 16, marginTop: 12 },
    skipText: { color: text2, fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
    overlay: {
      ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', gap: 12,
    },
    overlayText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  });
}
