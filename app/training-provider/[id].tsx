import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useColorScheme, Linking, Platform, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import * as seaTimeApi from '@/utils/seaTimeApi';
import { listCertificates } from '@/utils/certificatesApi';
import { localDate, todayIso } from '@/utils/localDate';
import { courseLabel, evaluateChecklist } from '@/utils/courseChecklist';
import {
  useProviders,
  approvalLabel,
  SECTOR_LABELS,
  fetchCourseDates,
  type CourseDate,
} from '@/utils/trainingProviders';

const fmtRange = (a: string, b: string | null) => {
  const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
  const start = localDate(a).toLocaleDateString('en-GB', o);
  if (!b || b === a) return start;
  return `${localDate(a).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} to ${localDate(b).toLocaleDateString('en-GB', o)}`;
};

export default function TrainingProviderScreen() {
  const { id, course } = useLocalSearchParams<{ id: string; course?: string }>();
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const { providers, error: loadError, retry } = useProviders();
  const provider = useMemo(() => providers?.find((p) => p.id === String(id)) ?? null, [providers, id]);
  const focusCourse = course ? String(course) : null;

  const [dates, setDates] = useState<CourseDate[]>([]);
  const [gaps, setGaps] = useState<{ target: string; codes: string[] } | null>(null);
  const [showAllCourses, setShowAllCourses] = useState(false);

  useEffect(() => {
    if (!provider) return;
    fetchCourseDates([provider.id]).then((d) => {
      const today = todayIso();
      setDates(d.filter((x) => x.start_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date)));
    });
    // Which of the user's missing checklist courses this provider runs.
    (async () => {
      try {
        const [profile, certs] = await Promise.all([seaTimeApi.getUserProfile(), listCertificates().catch(() => [])]);
        const target = profile?.target_certification;
        if (!target) return;
        const res = evaluateChecklist(target, certs);
        if (!res) return;
        const missing = res.states.filter((s) => s.status === 'todo' || s.status === 'expired').map((s) => s.item.code);
        const codes = missing.filter((c) => provider.courses.includes(c));
        if (codes.length) setGaps({ target, codes });
      } catch {
        // optional panel
      }
    })();
  }, [provider]);

  const byCourse = useMemo(() => {
    const m = new Map<string, CourseDate[]>();
    dates.forEach((d) => m.set(d.course_code, [...(m.get(d.course_code) ?? []), d]));
    const keys = Array.from(m.keys()).sort((a, b) => (a === focusCourse ? -1 : b === focusCourse ? 1 : courseLabel(a).localeCompare(courseLabel(b))));
    return keys.map((k) => ({ code: k, dates: (m.get(k) ?? []).slice(0, 4) }));
  }, [dates, focusCourse]);

  if (!provider) {
    return (
      <View style={[styles.container, { padding: 24 }]}>
        {providers ? (
          <Text style={styles.sub}>This provider is no longer listed.</Text>
        ) : loadError ? (
          <>
            <Text style={styles.sub}>{loadError}</Text>
            <TouchableOpacity onPress={retry} style={{ marginTop: 12 }}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Try again</Text>
            </TouchableOpacity>
          </>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
      </View>
    );
  }

  const open = (url: string | null | undefined) => {
    if (url) Linking.openURL(url).catch(() => {});
  };
  const datesLink = (code: string | null) =>
    (code && provider.coursePages[code]) || provider.datesUrl || provider.website;
  const address = [provider.address, provider.city, provider.postcode].filter(Boolean).join(', ');
  const directions = () => {
    const q = provider.lat != null && provider.lng != null ? `${provider.lat},${provider.lng}` : encodeURIComponent(`${provider.name} ${address} ${provider.country}`);
    open(Platform.OS === 'ios' ? `http://maps.apple.com/?q=${encodeURIComponent(provider.name)}&ll=${q}` : `geo:0,0?q=${q}(${encodeURIComponent(provider.name)})`);
  };

  const courses = [...provider.courses].sort((a, b) => courseLabel(a).localeCompare(courseLabel(b)));
  const shownCourses = showAllCourses ? courses : courses.slice(0, 10);

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerStyle: { backgroundColor: isDark ? colors.background : colors.backgroundLight },
          headerTintColor: colors.primary,
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.head}>
          <Text style={styles.title}>{provider.name}</Text>
          <Text style={styles.sub}>{[address, provider.countryName].filter(Boolean).join(' · ')}</Text>
          <View style={styles.tags}>
            {provider.approvals.map((a) => (
              <View key={a} style={styles.tag}>
                <Text style={styles.tagText}>{approvalLabel(a)}</Text>
              </View>
            ))}
            {provider.sectors.map((s) => (
              <View key={s} style={[styles.tag, styles.tagMuted]}>
                <Text style={styles.tagMutedText}>{SECTOR_LABELS[s] ?? s}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          {byCourse.length > 0 ? (
            byCourse.map((g) => (
              <View key={g.code}>
                <Text style={styles.cardLabel}>Upcoming {courseLabel(g.code)} dates</Text>
                {g.dates.map((d, i) => (
                  <View key={`${d.start_date}-${i}`} style={styles.dateRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dateText}>{fmtRange(d.start_date, d.end_date)}</Text>
                      <Text style={styles.sub}>{[d.availability_text, d.price_text].filter(Boolean).join(' · ') || 'See provider for places'}</Text>
                    </View>
                    <TouchableOpacity style={styles.book} onPress={() => open(d.booking_url || datesLink(g.code))}>
                      <Text style={styles.bookText}>Book</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ))
          ) : (
            <>
              <Text style={styles.cardLabel}>Course dates</Text>
              <Text style={styles.body}>
                {provider.name} doesn't publish dates we can show here.
              </Text>
              {datesLink(focusCourse) ? (
                <TouchableOpacity style={[styles.book, { alignSelf: 'flex-start', marginTop: 10 }]} onPress={() => open(datesLink(focusCourse))}>
                  <Text style={styles.bookText}>See dates on their website</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </View>

        {gaps && (
          <View style={styles.gapBox}>
            <IconSymbol ios_icon_name="checklist" android_material_icon_name="checklist" size={18} color={isDark ? colors.white : colors.secondary} />
            <Text style={styles.gapText}>
              You still need {gaps.codes.map(courseLabel).join(', ')} for your target. {gaps.codes.length === 1 ? 'This provider runs it.' : `This provider runs ${gaps.codes.length === 2 ? 'both' : `all ${gaps.codes.length}`}.`}
            </Text>
          </View>
        )}

        {courses.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Courses</Text>
            {shownCourses.map((c) => (
              <TouchableOpacity key={c} style={styles.courseRow} disabled={!provider.coursePages[c]} onPress={() => open(provider.coursePages[c])}>
                <Text style={styles.body}>{courseLabel(c)}</Text>
                {provider.coursePages[c] ? (
                  <IconSymbol ios_icon_name="arrow.up.right" android_material_icon_name="open-in-new" size={14} color={colors.primary} />
                ) : null}
              </TouchableOpacity>
            ))}
            {courses.length > 10 && (
              <TouchableOpacity onPress={() => setShowAllCourses(!showAllCourses)}>
                <Text style={styles.more}>{showAllCourses ? 'Show fewer' : `Show all ${courses.length}`}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.buttons}>
          {provider.phone ? (
            <TouchableOpacity style={styles.button} onPress={() => open(`tel:${provider.phone!.replace(/[^+\d]/g, '')}`)}>
              <Text style={styles.buttonText}>Call</Text>
            </TouchableOpacity>
          ) : null}
          {provider.website ? (
            <TouchableOpacity style={styles.button} onPress={() => open(provider.website)}>
              <Text style={styles.buttonText}>Website</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.button} onPress={directions}>
            <Text style={styles.buttonText}>Directions</Text>
          </TouchableOpacity>
        </View>
        {provider.email ? (
          <TouchableOpacity onPress={() => open(`mailto:${provider.email}`)}>
            <Text style={[styles.more, { textAlign: 'center' }]}>{provider.email}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
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
    head: { paddingHorizontal: 16, paddingTop: 8 },
    title: { fontSize: 22, fontWeight: '700', color: text },
    sub: { fontSize: 13, color: muted, marginTop: 3 },
    body: { fontSize: 15, color: text, flex: 1 },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
    tag: { backgroundColor: isDark ? colors.secondary : '#E6F1FB', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    tagText: { fontSize: 12, color: isDark ? colors.white : colors.secondary, fontWeight: '600' },
    tagMuted: { backgroundColor: isDark ? colors.border : '#EEF2F5' },
    tagMutedText: { fontSize: 12, color: muted },
    card: { backgroundColor: card, borderColor: border, borderWidth: 1, borderRadius: 12, marginHorizontal: 16, marginTop: 14, padding: 14 },
    cardLabel: { fontSize: 13, fontWeight: '600', color: muted, marginBottom: 4 },
    dateRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: border, gap: 10 },
    dateText: { fontSize: 15, color: text, fontWeight: '600' },
    book: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    bookText: { color: colors.white, fontWeight: '600', fontSize: 14 },
    gapBox: { flexDirection: 'row', gap: 10, backgroundColor: isDark ? colors.secondary : '#E6F1FB', borderRadius: 12, marginHorizontal: 16, marginTop: 14, padding: 12 },
    gapText: { flex: 1, fontSize: 14, color: isDark ? colors.white : colors.secondary, lineHeight: 20 },
    courseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
    more: { fontSize: 14, color: colors.primary, fontWeight: '600', marginTop: 8 },
    buttons: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 16, marginBottom: 10 },
    button: { flex: 1, backgroundColor: card, borderColor: border, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
    buttonText: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  });
}
