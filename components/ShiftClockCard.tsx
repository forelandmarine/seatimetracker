import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, AppState, useColorScheme } from 'react-native';
import * as Location from 'expo-location';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import {
  getUserProfile,
  getActiveShift,
  startShift,
  stopShift,
  getVesselAISLocation,
  type ActiveShift,
} from '@/utils/seaTimeApi';
import { sendLocalNotification } from '@/utils/notifications';
import { log, error as logError } from '@/utils/log';

// Proximity thresholds (nautical miles). ~0.08nm ≈ 150m aboard; ~0.25nm ≈ 460m clear of the vessel.
const ONBOARD_NM = 0.08;
const DISEMBARK_NM = 0.25;
const CHECK_INTERVAL_MS = 90_000; // re-check proximity while the app is foregrounded
const REMINDER_COOLDOWN_MS = 30 * 60_000; // do not repeat the same reminder within 30 min

interface Props {
  vesselId?: string | null;
  vesselName?: string | null;
}

function haversineNm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 3440.065;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

export function ShiftClockCard({ vesselId, vesselName }: Props) {
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);

  const [enabled, setEnabled] = useState(false); // commercial sector?
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [shift, setShift] = useState<ActiveShift | null>(null);
  const [, setTick] = useState(0); // re-render the elapsed timer

  const lastReminder = useRef<{ onboard: number; disembark: number }>({ onboard: 0, disembark: 0 });

  // Gate on sector + load any open shift.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const profile = await getUserProfile();
        if (!active) return;
        if (profile?.vessel_sector !== 'commercial') {
          setEnabled(false);
          return;
        }
        setEnabled(true);
        const s = await getActiveShift();
        if (active) setShift(s);
      } catch (e) {
        logError('[ShiftClock] init failed:', e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Tick the elapsed-time label once a minute while on shift.
  useEffect(() => {
    if (!shift) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [shift]);

  // Best-effort device position; returns null if permission not granted (never prompts here).
  const currentPosition = useCallback(async (prompt: boolean): Promise<{ lat: number; lon: number } | null> => {
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted' && prompt) {
        status = (await Location.requestForegroundPermissionsAsync()).status;
      }
      if (status !== 'granted') return null;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { lat: pos.coords.latitude, lon: pos.coords.longitude };
    } catch (e) {
      logError('[ShiftClock] location failed:', e);
      return null;
    }
  }, []);

  const handleClockIn = async () => {
    if (!vesselId || busy) return;
    setBusy(true);
    try {
      const pos = await currentPosition(true); // ok to prompt on an explicit tap
      const s = await startShift(vesselId, pos?.lat ?? null, pos?.lon ?? null);
      setShift(s);
      log('[ShiftClock] clocked in', s.id);
    } catch (e: any) {
      Alert.alert('Could not clock in', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleClockOut = async () => {
    if (busy) return;
    Alert.alert('End shift?', 'This logs your on-duty hours for this shift.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clock out',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const pos = await currentPosition(true);
            const res = await stopShift(pos?.lat ?? null, pos?.lon ?? null);
            setShift(null);
            lastReminder.current = { onboard: 0, disembark: 0 };
            Alert.alert('Shift logged', `${res.durationHours} hours recorded as sea time.`);
          } catch (e: any) {
            Alert.alert('Could not clock out', e?.message || 'Please try again.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  // Location-driven reminders: prompt to clock in when aboard, clock out when clear of the vessel.
  const checkProximity = useCallback(async () => {
    if (!enabled || !vesselId || busy) return;
    const dev = await currentPosition(false); // never prompt in the background check
    if (!dev) return;
    let vpos: { latitude: number | null; longitude: number | null } | null = null;
    try {
      vpos = await getVesselAISLocation(vesselId);
    } catch {
      return;
    }
    if (!vpos || vpos.latitude == null || vpos.longitude == null) return;
    const dist = haversineNm(dev.lat, dev.lon, vpos.latitude, vpos.longitude);
    const now = Date.now();
    const name = vesselName || 'your vessel';

    if (!shift && dist <= ONBOARD_NM && now - lastReminder.current.onboard > REMINDER_COOLDOWN_MS) {
      lastReminder.current.onboard = now;
      await sendLocalNotification('Clock in?', `You appear to be aboard ${name}. Start your shift to log your hours.`, {
        type: 'shift_clock_in',
        url: '/(tabs)',
      });
    } else if (shift && dist >= DISEMBARK_NM && now - lastReminder.current.disembark > REMINDER_COOLDOWN_MS) {
      lastReminder.current.disembark = now;
      await sendLocalNotification('Clock out?', `You have left ${name}. End your shift to finish logging your hours.`, {
        type: 'shift_clock_out',
        url: '/(tabs)',
      });
    }
  }, [enabled, vesselId, vesselName, shift, busy, currentPosition]);

  // Run the proximity check on mount, on a timer, and whenever the app returns to the foreground.
  useEffect(() => {
    if (!enabled) return;
    checkProximity();
    const timer = setInterval(checkProximity, CHECK_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkProximity();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [enabled, checkProximity]);

  if (loading || !enabled || !vesselId) return null;

  const startedAt = shift ? new Date(shift.start_time) : null;
  const elapsedLabel = startedAt
    ? (() => {
        const mins = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 60_000));
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
      })()
    : '';

  return (
    <View style={[styles.card, shift && styles.cardActive]}>
      <View style={styles.header}>
        <IconSymbol
          ios_icon_name={shift ? 'clock.badge.checkmark' : 'clock'}
          android_material_icon_name={shift ? 'timer' : 'schedule'}
          size={22}
          color={shift ? colors.success : colors.primary}
        />
        <Text style={styles.title}>{shift ? 'On shift' : 'Shift clock'}</Text>
        {shift && <View style={styles.liveDot} />}
      </View>

      {shift ? (
        <>
          <Text style={styles.detail}>
            Clocked in at {startedAt!.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {elapsedLabel} on duty
          </Text>
          <TouchableOpacity style={[styles.button, styles.buttonStop, busy && styles.buttonBusy]} onPress={handleClockOut} disabled={busy}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Clock out (disembark)</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.detail}>Start tracking when you board and stop when you disembark, to log your own shift hours.</Text>
          <TouchableOpacity style={[styles.button, busy && styles.buttonBusy]} onPress={handleClockIn} disabled={busy}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Clock in</Text>}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 16,
      padding: 18,
      marginHorizontal: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    cardActive: {
      borderColor: colors.success,
      borderWidth: 2,
    },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
    title: { fontSize: 17, fontWeight: '700', color: isDark ? colors.text : colors.textLight },
    liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success, marginLeft: 2 },
    detail: { fontSize: 14, color: isDark ? colors.textSecondary : colors.textSecondaryLight, marginBottom: 14, lineHeight: 20 },
    button: { backgroundColor: colors.primary, borderRadius: 12, padding: 15, alignItems: 'center' },
    buttonStop: { backgroundColor: colors.error },
    buttonBusy: { opacity: 0.6 },
    buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  });

export default ShiftClockCard;
