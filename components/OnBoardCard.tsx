import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Modal,
  Alert,
  AppState,
  Platform,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { setOnBoard, claimOffBoardPassages, getVesselAISLocation } from '@/utils/seaTimeApi';
import { scheduleReturnReminder, cancelReturnReminder } from '@/utils/notifications';
import { useOnBoard, setOnBoardState } from '@/hooks/useOnBoard';
import { log, error as logError } from '@/utils/log';

// Phone within ~185 m of the vessel's last AIS fix counts as "looks like you're aboard".
const ABOARD_NM = 0.1;
// Ignore AIS fixes older than this: the vessel may have moved since.
const MAX_FIX_AGE_MS = 12 * 3_600_000;
// After "Not now", don't ask again for this long.
const PROMPT_SNOOZE_MS = 12 * 3_600_000;
const SNOOZE_KEY = 'onboard_prompt_snoozed_until';

const AMBER_BG = '#FFF6E0';
const AMBER_BG_DARK = '#3A2E12';
const AMBER_TEXT = '#8A6200';
const AMBER_TEXT_DARK = '#FFD27A';

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

const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const fromISODate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const shortDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function OnBoardCard({ vesselId, vesselName }: Props) {
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const { on_board, off_board_since, expected_return_date, off_board_passages, loaded, refresh } = useOnBoard();

  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<null | 'off' | 'edit'>(null);
  const [returnDate, setReturnDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [looksAboard, setLooksAboard] = useState(false);

  const name = vesselName || 'your vessel';

  // Keep in step with the server whenever the app comes back to the foreground.
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // While off board: if the phone is next to the vessel, offer to switch back on board.
  const checkProximity = useCallback(async () => {
    if (Platform.OS === 'web' || on_board || !vesselId) {
      setLooksAboard(false);
      return;
    }
    try {
      const snoozed = Number((await AsyncStorage.getItem(SNOOZE_KEY)) || 0);
      if (Date.now() < snoozed) return;

      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return; // never prompts for permission here
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });

      const v = await getVesselAISLocation(vesselId);
      if (v?.latitude == null || v?.longitude == null) return;
      const fixTime = v.timestamp ? new Date(v.timestamp).getTime() : NaN;
      if (!Number.isFinite(fixTime) || Date.now() - fixTime > MAX_FIX_AGE_MS) return;

      const dist = haversineNm(pos.coords.latitude, pos.coords.longitude, v.latitude, v.longitude);
      setLooksAboard(dist <= ABOARD_NM);
    } catch (e) {
      logError('[OnBoard] proximity check failed:', e);
    }
  }, [on_board, vesselId]);

  useEffect(() => {
    checkProximity();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') checkProximity();
    });
    return () => sub.remove();
  }, [checkProximity]);

  const openOffSheet = () => {
    setReturnDate(null);
    setShowPicker(false);
    setSheet('off');
  };

  const openEditSheet = () => {
    setReturnDate(expected_return_date ? fromISODate(expected_return_date) : null);
    setShowPicker(false);
    setSheet('edit');
  };

  const goOffBoard = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const iso = returnDate ? toISODate(returnDate) : null;
      const res = await setOnBoard(false, iso);
      setOnBoardState({
        on_board: res.on_board,
        off_board_since: res.off_board_since,
        expected_return_date: res.expected_return_date,
      });
      if (iso) await scheduleReturnReminder(iso, vesselName);
      else await cancelReturnReminder();
      setSheet(null);
      log('[OnBoard] switched off board, return:', iso);

      // Ask for location now, while the reason is clear, so the "you look aboard" check can run later.
      if (sheet === 'off' && Platform.OS !== 'web') {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'undetermined') await Location.requestForegroundPermissionsAsync();
      }
    } catch (e: any) {
      Alert.alert('Could not update', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const goOnBoard = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await setOnBoard(true);
      setOnBoardState({
        on_board: res.on_board,
        off_board_since: null,
        expected_return_date: null,
        off_board_passages: 0,
      });
      setLooksAboard(false);
      await cancelReturnReminder();
      log('[OnBoard] switched on board, passages while away:', res.passages.length);

      if (res.passages.length > 0) {
        const n = res.passages.length;
        const first = shortDate(new Date(res.passages[0].start_time));
        const last = shortDate(new Date(res.passages[n - 1].start_time));
        const range = first === last ? `on ${first}` : `between ${first} and ${last}`;
        Alert.alert(
          `${name} made ${n} ${n === 1 ? 'passage' : 'passages'} while you were away`,
          `Logged ${range}. Add ${n === 1 ? 'it' : 'them'} to Review if you were aboard. You can reject any you weren't.`,
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Add to Review',
              onPress: async () => {
                try {
                  const { claimed } = await claimOffBoardPassages(res.passages.map((p) => p.id));
                  Alert.alert('Added to Review', `${claimed} ${claimed === 1 ? 'passage is' : 'passages are'} ready to confirm.`);
                } catch (e: any) {
                  Alert.alert('Could not add passages', e?.message || 'Please try again.');
                }
              },
            },
          ],
        );
      }
    } catch (e: any) {
      Alert.alert('Could not update', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const snoozePrompt = async () => {
    setLooksAboard(false);
    try {
      await AsyncStorage.setItem(SNOOZE_KEY, String(Date.now() + PROMPT_SNOOZE_MS));
    } catch {}
  };

  const onToggle = (value: boolean) => (value ? goOnBoard() : openOffSheet());

  if (!loaded || (!vesselId && on_board)) return null;

  const since = off_board_since ? shortDate(new Date(off_board_since)) : null;
  const back = expected_return_date ? shortDate(fromISODate(expected_return_date)) : null;
  const amberText = isDark ? AMBER_TEXT_DARK : AMBER_TEXT;
  const muted = isDark ? colors.textSecondary : colors.textSecondaryLight;

  return (
    <>
      {on_board ? (
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: colors.primary + '18' }]}>
              <IconSymbol ios_icon_name="ferry" android_material_icon_name="anchor" size={20} color={colors.primary} />
            </View>
            <View style={styles.textCol}>
              <Text style={styles.title}>On board</Text>
              <Text style={styles.detail}>Logging sea time from AIS</Text>
            </View>
            {busy ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Switch
                value
                onValueChange={onToggle}
                trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
                thumbColor={colors.switchThumbOn}
                accessibilityLabel="On board"
              />
            )}
          </View>
        </View>
      ) : (
        <View style={[styles.card, styles.cardOff]}>
          <View style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: colors.warning + '30' }]}>
              <IconSymbol ios_icon_name="house" android_material_icon_name="home" size={20} color={amberText} />
            </View>
            <View style={styles.textCol}>
              <Text style={styles.title}>Off board</Text>
              <Text style={[styles.detail, { color: amberText }]}>
                Tracking paused{since ? ` since ${since}` : ''}
              </Text>
            </View>
            {busy ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Switch
                value={false}
                onValueChange={onToggle}
                trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
                thumbColor={colors.switchThumbOff}
                accessibilityLabel="On board"
              />
            )}
          </View>

          {looksAboard && (
            <View style={styles.prompt}>
              <Text style={styles.promptText}>Looks like you're on {name}. Switch to on board?</Text>
              <View style={styles.promptButtons}>
                <TouchableOpacity onPress={snoozePrompt} style={styles.promptGhost}>
                  <Text style={styles.promptGhostText}>Not now</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={goOnBoard} style={styles.promptPrimary}>
                  <Text style={styles.promptPrimaryText}>Switch on board</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!!off_board_passages && off_board_passages > 0 && !looksAboard && (
            <Text style={[styles.passages, { color: amberText }]}>
              {name} has made {off_board_passages} {off_board_passages === 1 ? 'passage' : 'passages'} since you left.
              Switch on board to review {off_board_passages === 1 ? 'it' : 'them'}.
            </Text>
          )}

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: amberText }]}>
              {back ? `Back on board ${back}` : 'No return date set'}
            </Text>
            {Platform.OS !== 'web' && (
              <TouchableOpacity onPress={openEditSheet} hitSlop={8}>
                <Text style={styles.link}>{back ? 'Edit' : 'Add date'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setSheet(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{sheet === 'edit' ? 'Change return date' : 'Going off board?'}</Text>
            {sheet === 'off' && (
              <Text style={styles.sheetBody}>
                {name}'s AIS passages won't be logged to you while you're away. Your sea time so far is safe.
              </Text>
            )}

            {Platform.OS !== 'web' && (
              <>
                <Text style={styles.fieldLabel}>Expected back on board (optional)</Text>
                <TouchableOpacity style={styles.dateField} onPress={() => setShowPicker((v) => !v)}>
                  <Text style={[styles.dateText, !returnDate && styles.datePlaceholder]}>
                    {returnDate
                      ? returnDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                      : 'Choose a date'}
                  </Text>
                  {returnDate ? (
                    <TouchableOpacity onPress={() => setReturnDate(null)} hitSlop={8}>
                      <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={18} color={muted} />
                    </TouchableOpacity>
                  ) : (
                    <IconSymbol ios_icon_name="calendar" android_material_icon_name="event" size={18} color={muted} />
                  )}
                </TouchableOpacity>
                {showPicker && (
                  <DateTimePicker
                    value={returnDate || new Date(Date.now() + 14 * 86_400_000)}
                    mode="date"
                    minimumDate={new Date()}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    themeVariant={isDark ? 'dark' : 'light'}
                    onChange={(event, date) => {
                      if (Platform.OS !== 'ios') setShowPicker(false);
                      if (event.type === 'set' && date) setReturnDate(date);
                    }}
                  />
                )}
                <Text style={styles.hint}>We'll remind you to switch back on that morning.</Text>
              </>
            )}

            <TouchableOpacity style={[styles.primaryBtn, busy && { opacity: 0.6 }]} onPress={goOffBoard} disabled={busy}>
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>{sheet === 'edit' ? 'Save' : 'Go off board'}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setSheet(null)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
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
    cardOff: {
      backgroundColor: isDark ? AMBER_BG_DARK : AMBER_BG,
      borderColor: colors.warning + '66',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    textCol: { flex: 1 },
    title: { fontSize: 16, fontWeight: '700', color: isDark ? colors.text : colors.textLight },
    detail: { fontSize: 13, color: isDark ? colors.textSecondary : colors.textSecondaryLight, marginTop: 1 },
    prompt: {
      marginTop: 12,
      padding: 12,
      borderRadius: 12,
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderWidth: 1,
      borderColor: colors.primary + '55',
    },
    promptText: { fontSize: 14, fontWeight: '600', color: isDark ? colors.text : colors.textLight, marginBottom: 10 },
    promptButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    promptGhost: { paddingVertical: 8, paddingHorizontal: 12 },
    promptGhostText: { fontSize: 14, fontWeight: '600', color: colors.primary },
    promptPrimary: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.primary },
    promptPrimaryText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
    passages: { fontSize: 13, marginTop: 10, lineHeight: 18 },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.warning + '44',
    },
    footerText: { fontSize: 13 },
    link: { fontSize: 13, fontWeight: '600', color: colors.primary },
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
    fieldLabel: { fontSize: 13, color: isDark ? colors.textSecondary : colors.textSecondaryLight, marginBottom: 6 },
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
    hint: { fontSize: 12, color: isDark ? colors.textSecondary : colors.textSecondaryLight, marginTop: 6, marginBottom: 20 },
    primaryBtn: { backgroundColor: colors.primary, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 4 },
    primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
    cancelBtn: { padding: 14, alignItems: 'center' },
    cancelBtnText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  });

export default OnBoardCard;
