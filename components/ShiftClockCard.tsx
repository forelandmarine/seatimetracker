import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Platform,
  useColorScheme,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import {
  getUserProfile,
  getActiveShift,
  startShift,
  stopShift,
  getVesselAISLocation,
  apiErrorCode,
  MAX_SHIFT_HOURS,
  type ActiveShift,
} from '@/utils/seaTimeApi';
import { sendLocalNotification, scheduleShiftReminder, cancelShiftReminder } from '@/utils/notifications';
import { useOnBoard } from '@/hooks/useOnBoard';
import { useGlobalRefresh } from '@/hooks/useGlobalRefresh';
import { formatHoursMinutes } from '@/utils/entryNotes';
import { log, error as logError } from '@/utils/log';

// Proximity thresholds (nautical miles). ~0.08nm ≈ 150m aboard; ~0.25nm ≈ 460m clear of the vessel.
const ONBOARD_NM = 0.08;
const DISEMBARK_NM = 0.25;
const CHECK_INTERVAL_MS = 90_000; // re-check proximity while the app is foregrounded
const REMINDER_COOLDOWN_MS = 30 * 60_000; // do not repeat the same reminder within 30 min
const HOUR_MS = 3_600_000;
// Longest wait for a GPS fix on clock in/out. Inside a steel hull a fix can take minutes,
// and the position is optional, so fall back to the last known one rather than block.
const POSITION_TIMEOUT_MS = 8_000;

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

/**
 * The moment a picked time of day falls on within a shift: the first time after
 * the start with that hour and minute. A shift is at most MAX_SHIFT_HOURS (< 24h),
 * so a time of day alone is never ambiguous, and Android needs no date step.
 */
export function shiftEndFromTimeOfDay(start: Date, picked: Date): Date {
  const end = new Date(start);
  end.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
  return end;
}

const fmtDayTime = (d: Date) =>
  d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function ShiftClockCard({ vesselId, vesselName }: Props) {
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const { on_board } = useOnBoard();
  const { triggerRefresh } = useGlobalRefresh();

  const [commercial, setCommercial] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [shift, setShift] = useState<ActiveShift | null>(null);
  const [, setTick] = useState(0); // re-render the elapsed timer
  const [endSheet, setEndSheet] = useState(false);
  const [pickedEnd, setPickedEnd] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const lastReminder = useRef<{ onboard: number; disembark: number }>({ onboard: 0, disembark: 0 });

  // Sector + any open shift. Re-read on return to the foreground, so a sector
  // change or a clock-out on another device shows up.
  const refresh = useCallback(async () => {
    try {
      const profile = await getUserProfile();
      const isCommercial = profile?.vessel_sector === 'commercial';
      setCommercial(isCommercial);
      // An open shift is always shown, whatever the sector, so it can be closed.
      const s = await getActiveShift();
      setShift(s);
      if (s) scheduleShiftReminder(new Date(s.start_time), vesselName);
    } catch (e) {
      logError('[ShiftClock] refresh failed:', e);
    } finally {
      setLoading(false);
    }
  }, [vesselName]);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // Tick the elapsed-time label once a minute while on shift.
  useEffect(() => {
    if (!shift) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [shift]);

  // The vessel the shift is on, which may no longer be the active vessel.
  const shiftVesselId = shift?.vessel_id ?? vesselId ?? null;
  const shiftVesselName = !shift || shift.vessel_id === vesselId ? vesselName || 'your vessel' : 'your vessel';
  const enabled = commercial || !!shift;

  // Best-effort device position; returns null if permission not granted (never prompts here).
  const currentPosition = useCallback(async (prompt: boolean): Promise<{ lat: number; lon: number } | null> => {
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted' && prompt) {
        status = (await Location.requestForegroundPermissionsAsync()).status;
      }
      if (status !== 'granted') return null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), POSITION_TIMEOUT_MS);
      });
      const fresh = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
        timedOut,
      ]);
      clearTimeout(timer);
      const pos = fresh ?? (await Location.getLastKnownPositionAsync());
      return pos ? { lat: pos.coords.latitude, lon: pos.coords.longitude } : null;
    } catch (e) {
      logError('[ShiftClock] location failed:', e);
      return null;
    }
  }, []);

  const handleClockIn = async () => {
    if (!vesselId || busy) return;
    if (!on_board) {
      Alert.alert('You are off board', 'Switch back on board first, then clock in.');
      return;
    }
    setBusy(true);
    try {
      const pos = await currentPosition(true); // ok to prompt on an explicit tap
      const s = await startShift(vesselId, pos?.lat ?? null, pos?.lon ?? null);
      setShift(s);
      scheduleShiftReminder(new Date(s.start_time), vesselName);
      log('[ShiftClock] clocked in', s.id);
    } catch (e: any) {
      if (apiErrorCode(e) === 'off_board') {
        Alert.alert('You are off board', 'Switch back on board first, then clock in.');
      } else {
        Alert.alert('Could not clock in', e?.message || 'Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const finishShift = async (endTime: Date | null) => {
    setBusy(true);
    try {
      // A position taken now only describes where the shift ended if it ends now.
      const pos = endTime ? null : await currentPosition(true);
      const res = await stopShift(pos?.lat ?? null, pos?.lon ?? null, endTime);
      setShift(null);
      setEndSheet(false);
      cancelShiftReminder();
      lastReminder.current = { onboard: 0, disembark: 0 };
      triggerRefresh(); // the sea-days total and logbook now include this shift
      Alert.alert('Shift logged', `${formatHoursMinutes(res.durationHours)} recorded as sea time.`);
    } catch (e: any) {
      if (apiErrorCode(e) === 'needs_end_time') {
        openEndSheet();
      } else {
        Alert.alert('Could not clock out', e?.message || 'Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  // The picker opens on the clock-in time plus 12 hours, or now if sooner.
  const defaultEnd = () =>
    shift ? new Date(Math.min(Date.now(), new Date(shift.start_time).getTime() + 12 * HOUR_MS)) : new Date();

  const openEndSheet = () => {
    // The iOS spinner shows a time straight away, so treat that as the pick;
    // on Android nothing is picked until the dialog is confirmed.
    setPickedEnd(Platform.OS === 'ios' ? defaultEnd() : null);
    setShowPicker(Platform.OS === 'ios');
    setEndSheet(true);
  };

  const handleClockOut = () => {
    if (busy || !shift) return;
    const startedAt = new Date(shift.start_time);
    if (Date.now() - startedAt.getTime() > MAX_SHIFT_HOURS * HOUR_MS) {
      // Too long to be one shift: the clock-out was forgotten, so ask when it ended.
      openEndSheet();
      return;
    }
    Alert.alert('End shift?', 'This logs your on-duty hours for this shift.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Ended earlier', onPress: openEndSheet },
      { text: 'Clock out now', style: 'destructive', onPress: () => finishShift(null) },
    ]);
  };

  const saveEndTime = () => {
    if (!shift || !pickedEnd) return;
    const startedAt = new Date(shift.start_time);
    const end = shiftEndFromTimeOfDay(startedAt, pickedEnd);
    if (end.getTime() > Date.now()) {
      Alert.alert('Choose an earlier time', `The shift can't end in the future. It ends on ${fmtDayTime(end)}.`);
      return;
    }
    if (end.getTime() - startedAt.getTime() > MAX_SHIFT_HOURS * HOUR_MS) {
      Alert.alert('Choose an earlier time', `A shift can be at most ${MAX_SHIFT_HOURS} hours long.`);
      return;
    }
    finishShift(end);
  };

  // Location-driven reminders: prompt to clock in when aboard, clock out when clear of the vessel.
  const checkProximity = useCallback(async () => {
    if (!enabled || !shiftVesselId || busy) return;
    const dev = await currentPosition(false); // never prompt in the background check
    if (!dev) return;
    let vpos: { latitude: number | null; longitude: number | null } | null = null;
    try {
      vpos = await getVesselAISLocation(shiftVesselId);
    } catch {
      return;
    }
    if (!vpos || vpos.latitude == null || vpos.longitude == null) return;
    const dist = haversineNm(dev.lat, dev.lon, vpos.latitude, vpos.longitude);
    const now = Date.now();

    if (!shift && on_board && dist <= ONBOARD_NM && now - lastReminder.current.onboard > REMINDER_COOLDOWN_MS) {
      lastReminder.current.onboard = now;
      await sendLocalNotification('Clock in?', `You appear to be aboard ${shiftVesselName}. Start your shift to log your hours.`, {
        type: 'shift_clock_in',
        url: '/(tabs)',
      });
    } else if (shift && dist >= DISEMBARK_NM && now - lastReminder.current.disembark > REMINDER_COOLDOWN_MS) {
      lastReminder.current.disembark = now;
      await sendLocalNotification('Clock out?', `You have left ${shiftVesselName}. End your shift to finish logging your hours.`, {
        type: 'shift_clock_out',
        url: '/(tabs)',
      });
    }
  }, [enabled, shiftVesselId, shiftVesselName, shift, busy, on_board, currentPosition]);

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

  // Hidden with no vessel to clock in on, but never while a shift is open: it must
  // stay reachable to clock out even if the vessel was deactivated or changed.
  if (loading || !enabled || (!vesselId && !shift)) return null;

  const startedAt = shift ? new Date(shift.start_time) : null;
  const elapsedMins = startedAt ? Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 60_000)) : 0;
  const elapsedLabel = (() => {
    const h = Math.floor(elapsedMins / 60);
    const m = elapsedMins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  })();
  const overCap = elapsedMins > MAX_SHIFT_HOURS * 60;
  const resolvedEnd = startedAt && pickedEnd ? shiftEndFromTimeOfDay(startedAt, pickedEnd) : null;

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
            {vesselId && shift.vessel_id !== vesselId ? ' (on another vessel)' : ''}
          </Text>
          {(overCap || !on_board) && (
            <Text style={styles.warning}>
              {overCap
                ? `Open for over ${MAX_SHIFT_HOURS} hours. Clock out and choose when the shift ended.`
                : 'You switched off board. Clock out to finish this shift.'}
            </Text>
          )}
          <TouchableOpacity style={[styles.button, styles.buttonStop, busy && styles.buttonBusy]} onPress={handleClockOut} disabled={busy}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Clock out (disembark)</Text>}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.detail}>
            Start tracking when you board and stop when you disembark, to log your own shift hours. While you use the
            shift clock, AIS passages are not logged to you.
          </Text>
          <TouchableOpacity style={[styles.button, busy && styles.buttonBusy]} onPress={handleClockIn} disabled={busy}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Clock in</Text>}
          </TouchableOpacity>
        </>
      )}

      <Modal visible={endSheet} transparent animationType="slide" onRequestClose={() => setEndSheet(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setEndSheet(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>When did your shift end?</Text>
            <Text style={styles.sheetBody}>
              {startedAt ? `You clocked in ${fmtDayTime(startedAt)}. ` : ''}A shift can be up to {MAX_SHIFT_HOURS} hours.
            </Text>
            <TouchableOpacity style={styles.dateField} onPress={() => setShowPicker((v) => !v)}>
              <Text style={[styles.dateText, !resolvedEnd && styles.datePlaceholder]}>
                {resolvedEnd ? fmtDayTime(resolvedEnd) : 'Choose a time'}
              </Text>
              <IconSymbol ios_icon_name="clock" android_material_icon_name="schedule" size={18} color={isDark ? colors.textSecondary : colors.textSecondaryLight} />
            </TouchableOpacity>
            {showPicker && startedAt && (
              <DateTimePicker
                value={pickedEnd || defaultEnd()}
                mode="time"
                is24Hour
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                themeVariant={isDark ? 'dark' : 'light'}
                onChange={(event, date) => {
                  if (Platform.OS !== 'ios') setShowPicker(false);
                  if (event.type === 'set' && date) setPickedEnd(date);
                }}
              />
            )}
            <TouchableOpacity
              style={[styles.button, styles.sheetButton, (busy || !pickedEnd) && styles.buttonBusy]}
              onPress={saveEndTime}
              disabled={busy || !pickedEnd}
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Clock out</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setEndSheet(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
    warning: { fontSize: 14, color: colors.error, marginTop: -6, marginBottom: 14, lineHeight: 20 },
    button: { backgroundColor: colors.primary, borderRadius: 12, padding: 15, alignItems: 'center' },
    buttonStop: { backgroundColor: colors.error },
    buttonBusy: { opacity: 0.6 },
    buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 36,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 16,
      backgroundColor: isDark ? colors.border : colors.borderLight,
    },
    sheetTitle: { fontSize: 19, fontWeight: '700', color: isDark ? colors.text : colors.textLight, marginBottom: 6 },
    sheetBody: { fontSize: 14, lineHeight: 20, color: isDark ? colors.textSecondary : colors.textSecondaryLight, marginBottom: 18 },
    dateField: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    dateText: { fontSize: 15, color: isDark ? colors.text : colors.textLight },
    datePlaceholder: { color: isDark ? colors.textSecondary : colors.textSecondaryLight },
    sheetButton: { marginTop: 20 },
    cancelBtn: { padding: 14, alignItems: 'center' },
    cancelBtnText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  });

export default ShiftClockCard;
