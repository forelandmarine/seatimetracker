import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  FlatList,
  Modal,
  ScrollView,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import ProviderMap from '@/components/ProviderMap';
import * as seaTimeApi from '@/utils/seaTimeApi';
import { courseLabel } from '@/utils/courseChecklist';
import {
  searchProviders,
  offeredCourses,
  offeredApprovals,
  approvalLabel,
  formatDistance,
  usesMiles,
  fetchCourseDates,
  PROVIDERS,
  type CourseDate,
  type ProviderHit,
} from '@/utils/trainingProviders';

const RADII_KM = [40, 80, 160, 400, null]; // about 25, 50, 100, 250 miles, then any distance
const DATE_WINDOWS = [
  { label: 'Any date', days: null },
  { label: 'Next month', days: 31 },
  { label: 'Next 3 months', days: 92 },
];
const SECTORS = [
  { key: 'yacht', label: 'Yacht' },
  { key: 'commercial', label: 'Commercial' },
  { key: 'offshore_wind', label: 'Offshore wind' },
];

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function TrainingProvidersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ course?: string }>();
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  const miles = usesMiles(locale);

  const [query, setQuery] = useState('');
  const [course, setCourse] = useState<string | null>(typeof params.course === 'string' ? params.course : null);
  const [sector, setSector] = useState<string | null>(null);
  const [approval, setApproval] = useState<string | null>(null);
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusIdx, setRadiusIdx] = useState(1);
  const [locating, setLocating] = useState(false);
  const [windowIdx, setWindowIdx] = useState(0);
  const [showMap, setShowMap] = useState(false);
  const [picker, setPicker] = useState<'course' | 'approval' | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [dates, setDates] = useState<CourseDate[]>([]);

  // Start on the user's own authority where providers carry that approval.
  useEffect(() => {
    seaTimeApi
      .getUserProfile()
      .then((p) => {
        const auth = p?.maritime_authority;
        if (auth && offeredApprovals().includes(auth)) setApproval(auth);
      })
      .catch(() => {});
  }, []);

  const radiusKm = RADII_KM[radiusIdx];
  const hits = useMemo(
    () => searchProviders({ query, course, sector, approval, origin, radiusKm: origin ? radiusKm : null }),
    [query, course, sector, approval, origin, radiusKm],
  );

  // Dates for the providers on screen, when a course is chosen.
  useEffect(() => {
    let cancelled = false;
    if (!course) {
      setDates([]);
      return;
    }
    fetchCourseDates(hits.slice(0, 50).map((h) => h.provider.id), course).then((d) => {
      if (!cancelled) setDates(d);
    });
    return () => {
      cancelled = true;
    };
  }, [course, hits]);

  const nextDate = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const map = new Map<string, CourseDate>();
    for (const d of dates) {
      if (d.start_date < today) continue;
      const cur = map.get(d.provider_id);
      if (!cur || d.start_date < cur.start_date) map.set(d.provider_id, d);
    }
    return map;
  }, [dates]);

  const windowDays = DATE_WINDOWS[windowIdx].days;
  const { withDates, withoutDates } = useMemo(() => {
    if (!course || windowDays == null) return { withDates: hits, withoutDates: [] as ProviderHit[] };
    const limit = new Date(Date.now() + windowDays * 86_400_000).toISOString().slice(0, 10);
    const yes: ProviderHit[] = [];
    const no: ProviderHit[] = [];
    hits.forEach((h) => {
      const d = nextDate.get(h.provider.id);
      if (d && d.start_date <= limit) yes.push(h);
      else no.push(h);
    });
    return { withDates: yes, withoutDates: no };
  }, [hits, nextDate, course, windowDays]);

  const toggleNearMe = async () => {
    if (origin) {
      // Cycle the radius; after "any distance" switch location off.
      if (radiusIdx < RADII_KM.length - 1) setRadiusIdx(radiusIdx + 1);
      else {
        setOrigin(null);
        setRadiusIdx(1);
      }
      return;
    }
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location is off', 'Allow location for SeaTime Tracker in Settings to sort providers by distance, or search by town or country instead.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Settings', onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      Alert.alert("Couldn't find your location", 'Search by town or country instead.');
    } finally {
      setLocating(false);
    }
  };

  const nearLabel = origin
    ? `Near me · ${radiusKm == null ? 'any distance' : formatDistance(radiusKm, miles).replace(/\.0 /, ' ')}`
    : 'Near me';

  const chip = (label: string, on: boolean, onPress: () => void, key?: string) => (
    <TouchableOpacity key={key ?? label} style={[styles.chip, on && styles.chipOn]} onPress={onPress}>
      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderHit = ({ item }: { item: ProviderHit }) => {
    const p = item.provider;
    const d = nextDate.get(p.id);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push({ pathname: '/training-provider/[id]', params: { id: p.id, course: course ?? '' } } as any)}
      >
        <View style={styles.cardTop}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {p.name}
          </Text>
          {item.distanceKm != null && <Text style={styles.distance}>{formatDistance(item.distanceKm, miles)}</Text>}
        </View>
        <Text style={styles.cardSub} numberOfLines={1}>
          {[p.city, p.region, p.country].filter(Boolean).join(', ')}
          {p.approvals.length ? ` · ${p.approvals.slice(0, 3).map(approvalLabel).join(', ')}` : ''}
        </Text>
        {course ? (
          d ? (
            <Text style={styles.next}>
              Next {courseLabel(course)}: {fmtDay(d.start_date)}
              {d.availability_text ? ` · ${d.availability_text}` : ''}
            </Text>
          ) : (
            <Text style={styles.seeDates}>See dates on their website</Text>
          )
        ) : (
          <Text style={styles.cardSub} numberOfLines={1}>
            {p.courses.length} {p.courses.length === 1 ? 'course' : 'courses'}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const pickerItems =
    picker === 'course'
      ? offeredCourses().map((c) => ({ key: c, label: courseLabel(c) }))
      : picker === 'approval'
        ? offeredApprovals().map((a) => ({ key: a, label: approvalLabel(a) }))
        : [];
  const filteredPicker = pickerItems.filter((i) => i.label.toLowerCase().includes(pickerQuery.trim().toLowerCase()));

  const header = (
    <View>
      <View style={styles.searchBox}>
        <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={18} color={isDark ? colors.textSecondary : colors.textSecondaryLight} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Provider, town or country"
          placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {locating ? (
          <View style={[styles.chip, styles.chipOn]}>
            <ActivityIndicator size="small" color={colors.white} />
          </View>
        ) : (
          chip(nearLabel, !!origin, toggleNearMe, 'near')
        )}
        {chip(course ? courseLabel(course) : 'Any course', !!course, () => setPicker('course'), 'course')}
        {course ? chip(DATE_WINDOWS[windowIdx].label, windowIdx > 0, () => setWindowIdx((windowIdx + 1) % DATE_WINDOWS.length), 'dates') : null}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {SECTORS.map((s) => chip(s.label, sector === s.key, () => setSector(sector === s.key ? null : s.key), s.key))}
        {chip(approval ? `Approved by ${approvalLabel(approval)}` : 'Any approval', !!approval, () => setPicker('approval'), 'approval')}
      </ScrollView>
      <View style={styles.resultsBar}>
        <Text style={styles.count}>
          {hits.length} {hits.length === 1 ? 'provider' : 'providers'}
          {origin ? ' · nearest first' : ''}
        </Text>
        <TouchableOpacity onPress={() => setShowMap(!showMap)}>
          <Text style={styles.link}>{showMap ? 'Show list' : 'Show on map'}</Text>
        </TouchableOpacity>
      </View>
      {showMap && <ProviderMap hits={hits} origin={origin} onOpen={(id) => router.push({ pathname: '/training-provider/[id]', params: { id, course: course ?? '' } } as any)} />}
    </View>
  );

  const data = showMap ? [] : withDates;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Find a course',
          headerStyle: { backgroundColor: isDark ? colors.background : colors.backgroundLight },
          headerTitleStyle: { color: isDark ? colors.text : colors.textLight },
          headerTintColor: colors.primary,
        }}
      />
      <FlatList
        style={styles.container}
        data={data}
        keyExtractor={(h) => h.provider.id}
        renderItem={renderHit}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40 }}
        initialNumToRender={15}
        ListFooterComponent={
          showMap ? null : (
            <>
              {withoutDates.length > 0 && (
                <>
                  <Text style={styles.section}>Dates not published in the next {windowDays === 31 ? 'month' : '3 months'}</Text>
                  {withoutDates.map((h) => <View key={h.provider.id}>{renderHit({ item: h })}</View>)}
                </>
              )}
              <Text style={styles.footnote}>
                {PROVIDERS.length.toLocaleString()} providers listed from MCA, USCG, AMSA, Maritime NZ, SAMSA, RYA, IYT, GWO and OPITO
                registers and providers' own sites. Check approval and dates with the provider before booking.
              </Text>
            </>
          )
        }
        ListEmptyComponent={
          showMap ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No providers match</Text>
              <Text style={styles.emptyText}>Try a wider distance, another course, or clear a filter.</Text>
            </View>
          )
        }
      />

      <Modal visible={picker !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicker(null)}>
        <View style={[styles.container, { paddingTop: 12 }]}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{picker === 'course' ? 'Choose a course' : 'Approved by'}</Text>
            <TouchableOpacity onPress={() => { setPicker(null); setPickerQuery(''); }}>
              <Text style={styles.link}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.searchBox}>
            <TextInput
              style={styles.searchInput}
              value={pickerQuery}
              onChangeText={setPickerQuery}
              placeholder="Search"
              placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
            />
          </View>
          <FlatList
            data={[{ key: '__any', label: picker === 'course' ? 'Any course' : 'Any approval' }, ...filteredPicker]}
            keyExtractor={(i) => i.key}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const current = picker === 'course' ? course : approval;
              const selected = item.key === '__any' ? current === null : current === item.key;
              return (
                <TouchableOpacity
                  style={styles.pickerRow}
                  onPress={() => {
                    const v = item.key === '__any' ? null : item.key;
                    if (picker === 'course') setCourse(v);
                    else setApproval(v);
                    setPicker(null);
                    setPickerQuery('');
                  }}
                >
                  <Text style={styles.pickerText}>{item.label}</Text>
                  {selected && <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={18} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </>
  );
}

function createStyles(isDark: boolean) {
  const text = isDark ? colors.text : colors.textLight;
  const muted = isDark ? colors.textSecondary : colors.textSecondaryLight;
  const card = isDark ? colors.cardBackground : colors.card;
  const border = isDark ? colors.border : colors.borderLight;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? colors.background : colors.backgroundLight },
    searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: card, borderColor: border, borderWidth: 1, borderRadius: 10, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12 },
    searchInput: { flex: 1, paddingVertical: 11, fontSize: 16, color: text },
    chipRow: { gap: 8, paddingHorizontal: 16, paddingTop: 10 },
    chip: { borderWidth: 1, borderColor: border, backgroundColor: card, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 7, maxWidth: 260, minHeight: 34, justifyContent: 'center' },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 14, color: text },
    chipTextOn: { color: colors.white, fontWeight: '600' },
    resultsBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 18, marginTop: 14, marginBottom: 4 },
    count: { fontSize: 13, color: muted },
    link: { fontSize: 15, color: colors.primary, fontWeight: '600' },
    card: { backgroundColor: card, borderColor: border, borderWidth: 1, borderRadius: 12, marginHorizontal: 16, marginTop: 8, padding: 12 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
    cardTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: text },
    distance: { fontSize: 13, color: muted },
    cardSub: { fontSize: 13, color: muted, marginTop: 3 },
    next: { fontSize: 13, color: colors.successDark, marginTop: 6, fontWeight: '600' },
    seeDates: { fontSize: 13, color: colors.primary, marginTop: 6 },
    section: { fontSize: 13, fontWeight: '600', color: muted, marginHorizontal: 20, marginTop: 18 },
    footnote: { fontSize: 12, color: muted, margin: 20, lineHeight: 17 },
    empty: { alignItems: 'center', padding: 30 },
    emptyTitle: { fontSize: 17, fontWeight: '600', color: text },
    emptyText: { fontSize: 14, color: muted, marginTop: 6, textAlign: 'center' },
    pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8 },
    pickerTitle: { fontSize: 18, fontWeight: '700', color: text },
    pickerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: border },
    pickerText: { fontSize: 16, color: text, flex: 1 },
  });
}
