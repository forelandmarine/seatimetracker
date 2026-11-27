/**
 * Days abroad: a Schengen area calendar.
 *
 * Crew tap days on the calendar to log time in the Schengen area (no country
 * needed). The screen shows days used and left in the rolling 180-day window,
 * and an example: arrive on a date, latest day to leave. Logged by hand only.
 * The 90/180 count is worked out here from the user's stays. Stays logged in
 * 2.5.0 against a Schengen country still count. New days are saved as stays
 * with the placeholder code XS ("Schengen area"), not counted for tax.
 * Guidance text lives in the Terms of Service. One file for iOS and Android.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  useColorScheme,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors } from '@/styles/commonStyles';
import { todayIso } from '@/utils/localDate';
import { error as logError } from '@/utils/log';
import { addStay, deleteStay, getStays, updateStay, type PresenceStay } from '@/utils/presenceApi';
import { createDaysAbroadStyles } from '@/components/daysAbroad/styles';

const TERMS_URL = 'https://www.forelandmarine.com/tools/seatime-tracker/terms';
const LIMIT = 90;
const WINDOW = 180;
/** Placeholder country code for "somewhere in the Schengen area". */
const SCHENGEN_CODE = 'XS';
/** Members plus the microstates the backend counts. */
const SCHENGEN = new Set([
  'AT', 'BE', 'BG', 'HR', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IT',
  'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'NO', 'CH', 'LI', 'MC', 'SM', 'VA', 'AD', SCHENGEN_CODE,
]);

// Date helpers on YYYY-MM-DD strings, done in UTC so there are no DST jumps.
const toNum = (d: string) => Math.round(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000);
const fromNum = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
const addDays = (d: string, k: number) => fromNum(toNum(d) + k);
const pretty = (d: string) =>
  new Date(toNum(d) * 86_400_000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const isSchengenStay = (s: PresenceStay) => s.kind === 'ashore' && SCHENGEN.has(s.country_code.toUpperCase());

/** Days used in the 180-day window ending on `day`, given a set of day numbers. */
const usedOn = (days: Set<number>, day: number) => {
  let n = 0;
  for (let d = day - WINDOW + 1; d <= day; d++) if (days.has(d)) n++;
  return n;
};

/** Last day you can stay if you arrive on `arrive` and stay every day after it. */
const latestDeparture = (days: Set<number>, arrive: number): number | null => {
  const sim = new Set(days);
  let last: number | null = null;
  for (let d = arrive; d < arrive + LIMIT + WINDOW; d++) {
    sim.add(d);
    if (usedOn(sim, d) > LIMIT) break;
    last = d;
  }
  return last;
};

export default function DaysAbroadScreen() {
  const isDark = useColorScheme() === 'dark';
  const styles = createDaysAbroadStyles(isDark);
  const today = todayIso();
  const [stays, setStays] = useState<PresenceStay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [arrive, setArrive] = useState(today);
  const [showPicker, setShowPicker] = useState(false);

  const load = useCallback(async () => {
    try {
      setStays(await getStays());
      setFailed(false);
    } catch (e: any) {
      logError('[DaysAbroad] Load failed:', e?.message || e);
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const schengenStays = useMemo(() => stays.filter(isSchengenStay), [stays]);

  /** Every logged Schengen day, as day numbers. Open stays run to today. */
  const days = useMemo(() => {
    const set = new Set<number>();
    for (const s of schengenStays) {
      const end = toNum(s.end_date ?? today);
      for (let d = toNum(s.start_date); d <= end; d++) set.add(d);
    }
    return set;
  }, [schengenStays, today]);

  const todayNum = toNum(today);
  const used = usedOn(days, todayNum);
  const left = Math.max(0, LIMIT - used);
  const departBy = latestDeparture(days, toNum(arrive));

  const markedDates = useMemo(() => {
    const m: Record<string, any> = {};
    days.forEach((n) => {
      m[fromNum(n)] = { selected: true, selectedColor: colors.primary };
    });
    if (rangeStart) m[rangeStart] = { selected: true, selectedColor: colors.warning };
    return m;
  }, [days, rangeStart]);

  const run = async (work: () => Promise<unknown>) => {
    setSaving(true);
    try {
      await work();
      await load();
    } catch (e: any) {
      logError('[DaysAbroad] Save failed:', e?.message || e);
      Alert.alert('Not saved', 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  /** Take one day out of whichever stay covers it, splitting the stay if needed. */
  const removeDay = (day: string) => {
    const n = toNum(day);
    const hits = schengenStays.filter((s) => toNum(s.start_date) <= n && n <= toNum(s.end_date ?? today));
    run(async () => {
      for (const s of hits) {
        const start = s.start_date;
        const end = s.end_date ?? today;
        if (start === day && end === day) await deleteStay(s.id);
        else if (start === day) await updateStay(s.id, { start_date: addDays(day, 1), end_date: s.end_date });
        else if (end === day) await updateStay(s.id, { start_date: start, end_date: addDays(day, -1) });
        else {
          await updateStay(s.id, { start_date: start, end_date: addDays(day, -1) });
          await addStay({ country_code: s.country_code, start_date: addDays(day, 1), end_date: s.end_date, kind: 'ashore', counts_tax: s.counts_tax });
        }
      }
    });
  };

  const addRange = (a: string, b: string) => {
    const [start, end] = a <= b ? [a, b] : [b, a];
    // The backend refuses overlapping stays, so only save the runs of days no stay covers yet.
    const taken = new Set<number>();
    for (const s of stays) {
      const e = toNum(s.end_date ?? today);
      for (let d = toNum(s.start_date); d <= e; d++) taken.add(d);
    }
    const runs: Array<[string, string]> = [];
    let skipped = 0;
    for (let d = toNum(start); d <= toNum(end); d++) {
      if (taken.has(d)) { if (!days.has(d)) skipped++; continue; }
      const last = runs[runs.length - 1];
      if (last && toNum(last[1]) === d - 1) last[1] = fromNum(d);
      else runs.push([fromNum(d), fromNum(d)]);
    }
    run(async () => {
      for (const [s, e] of runs) {
        await addStay({ country_code: SCHENGEN_CODE, start_date: s, end_date: e, kind: 'ashore', counts_tax: false, note: 'Schengen area' });
      }
      if (skipped) Alert.alert('Some days skipped', `${skipped} day(s) already have another stay logged (outside the area or on board).`);
    });
  };

  const onDayPress = ({ dateString }: { dateString: string }) => {
    if (saving) return;
    if (rangeStart) {
      const start = rangeStart;
      setRangeStart(null);
      addRange(start, dateString);
      return;
    }
    if (days.has(toNum(dateString))) {
      Alert.alert(pretty(dateString), 'Remove this day from your Schengen days?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeDay(dateString) },
      ]);
      return;
    }
    setRangeStart(dateString);
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const text = isDark ? colors.text : colors.textLight;
  const sub = isDark ? colors.textSecondary : colors.textSecondaryLight;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        {failed ? <Text style={styles.empty}>Could not load your days. Pull down to try again.</Text> : null}

        <View style={[styles.card, { flexDirection: 'row', marginTop: 0 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.small}>Days used</Text>
            <Text style={styles.big}>{used}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.small}>Days left</Text>
            <Text style={[styles.big, { color: left <= 10 ? colors.warning : text }]}>{left}</Text>
          </View>
        </View>
        <Text style={styles.small}>Schengen area, 90 days in any 180. Counted up to today.</Text>

        <View style={styles.card}>
          <Calendar
            markedDates={markedDates}
            onDayPress={onDayPress}
            theme={{
              backgroundColor: 'transparent',
              calendarBackground: 'transparent',
              textSectionTitleColor: sub,
              selectedDayBackgroundColor: colors.primary,
              selectedDayTextColor: '#FFFFFF',
              todayTextColor: colors.primary,
              dayTextColor: text,
              textDisabledColor: sub,
              arrowColor: colors.primary,
              monthTextColor: text,
              textMonthFontWeight: 'bold',
              textDayFontSize: 16,
              textMonthFontSize: 18,
            }}
          />
          <Text style={[styles.small, { marginTop: 8 }]}>
            {saving
              ? 'Saving...'
              : rangeStart
                ? `From ${pretty(rangeStart)}. Tap the last day (or the same day again).`
                : 'Tap a day, then the last day, to log time in the Schengen area. Tap a logged day to remove it.'}
          </Text>
          {rangeStart ? (
            <TouchableOpacity onPress={() => setRangeStart(null)} style={{ marginTop: 8 }}>
              <Text style={styles.link}>Cancel</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Planning a trip</Text>
          <Text style={styles.body}>If you arrive on</Text>
          <TouchableOpacity onPress={() => setShowPicker((v) => !v)}>
            <Text style={[styles.link, { fontSize: 18, marginTop: 4 }]}>{pretty(arrive)}</Text>
          </TouchableOpacity>
          {showPicker ? (
            <DateTimePicker
              value={new Date(toNum(arrive) * 86_400_000)}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(_e, d) => {
                if (Platform.OS !== 'ios') setShowPicker(false);
                if (d) setArrive(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
              }}
            />
          ) : null}
          <Text style={[styles.body, { marginTop: 8 }]}>you must leave by</Text>
          <Text style={[styles.big, { fontSize: 22 }]}>{departBy == null ? 'No days available' : pretty(fromNum(departBy))}</Text>
          {departBy != null ? (
            <Text style={styles.small}>{departBy - toNum(arrive) + 1} days in the area, counting arrival and departure days.</Text>
          ) : null}
        </View>

        <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)} style={{ marginTop: 16, marginBottom: 24 }}>
          <Text style={styles.small}>
            A guide only. <Text style={styles.link}>See Terms</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
