import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { Certificate, listCertificates } from '@/utils/certificatesApi';
import { useCourseTicks } from '@/hooks/useCourseTicks';
import * as seaTimeApi from '@/utils/seaTimeApi';
import {
  getRequirementsByAuthority,
  getDefaultTargetId,
  type MaritimeAuthority,
} from '@/constants/mcaRequirements';
import {
  evaluateChecklist,
  certificateTypeFor,
  courseLabel,
  type ItemState,
} from '@/utils/courseChecklist';
import { COURSE_CATALOG } from '@/constants/courseCatalog';
import { OFFERED_COURSES } from '@/constants/offeredCourses';
import { error as logError } from '@/utils/log';
import { localDate, daysUntil } from '@/utils/localDate';

const AUTHORITIES = ['mca', 'uscg', 'amsa', 'mnz', 'samsa'];

const fmtDate = (iso: string) =>
  localDate(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const daysFrom = (iso: string) => daysUntil(iso);

function statusLine(s: ItemState, t: TFunction): string | null {
  if (s.missingDetails && (s.status === 'done' || s.status === 'done_no_date')) return t('certChecker.tickedAddDetails');
  switch (s.status) {
    case 'expired':
      return `Expired ${fmtDate(s.validUntil!)}${s.item.validity === '5y_update' ? ' · refresher needed' : ''}`;
    case 'soon': {
      const d = daysFrom(s.validUntil!);
      return d === 0 ? 'Expires today' : `Expires in ${d} ${d === 1 ? 'day' : 'days'}`;
    }
    case 'done':
      return s.validUntil ? `Valid to ${fmtDate(s.validUntil)}` : s.item.validity === 'none' ? 'No expiry' : null;
    case 'done_no_date':
      return 'Add the issue or expiry date to track it';
    case 'todo':
      if (s.item.validity === '3y') return 'Pass valid 3 years';
      if (s.item.validity === '1y') return 'Pass valid 1 year';
      if (s.item.type === 'manual') return t('certChecker.tickWhenComplete');
      return s.item.note ?? null;
  }
}

/** Short name for the row; the full wording from the notice is one tap away. */
function rowTitle(s: ItemState): string {
  return COURSE_CATALOG[s.item.code] ? courseLabel(s.item.code) : s.item.label;
}

function showDetail(s: ItemState) {
  const parts = [s.item.label, s.item.note].filter(Boolean);
  Alert.alert(rowTitle(s), parts.join('\n\n'));
}

export default function OralChecklistScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [authority, setAuthority] = useState<MaritimeAuthority>('mca');

  const load = useCallback(async () => {
    try {
      const [profile, list] = await Promise.all([
        seaTimeApi.getUserProfile(),
        listCertificates().catch(() => [] as Certificate[]),
      ]);
      const auth = (AUTHORITIES.includes(profile?.maritime_authority) ? profile.maritime_authority : 'mca') as MaritimeAuthority;
      const dept = String(profile?.department ?? 'deck').toLowerCase() === 'engineering' ? 'engineering' : 'deck';
      setAuthority(auth);
      setTargetId(profile?.target_certification ?? getDefaultTargetId(auth, dept) ?? null);
      setCerts(list);
    } catch (err) {
      logError('[OralChecklist] load failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const { savingCode, tick, untick } = useCourseTicks(load);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const target = useMemo(() => {
    if (!targetId) return null;
    return (
      getRequirementsByAuthority(authority, 'deck').find((r) => r.id === targetId) ??
      getRequirementsByAuthority(authority, 'engineering').find((r) => r.id === targetId) ??
      null
    );
  }, [authority, targetId]);

  const result = useMemo(() => (targetId ? evaluateChecklist(targetId, certs) : null), [targetId, certs]);
  // Only offer "Find a course" where a listed provider runs it.
  const offered = useMemo(() => new Set(OFFERED_COURSES), []);

  const groups = useMemo(() => {
    const states = result?.states ?? [];
    return {
      attention: states.filter((s) => s.status === 'expired' || s.status === 'soon'),
      todo: states.filter((s) => s.status === 'todo'),
      done: states.filter((s) => s.status === 'done' || s.status === 'done_no_date'),
    };
  }, [result]);

  const onAction = (s: ItemState) => {
    if (s.certificate && (s.missingDetails || s.status === 'expired' || s.status === 'soon' || s.status === 'done_no_date')) {
      router.push({ pathname: '/certificate-edit', params: { id: s.certificate.id } });
    } else {
      router.push({ pathname: '/certificate-edit', params: { type: certificateTypeFor(s.item.code) } });
    }
  };

  // Manual items need no action button: the tickbox is all they need.
  const actionLabel = (s: ItemState): string | null => {
    if (s.status === 'expired' || s.status === 'soon') return 'Update';
    if (s.missingDetails) return t('certChecker.addDetails');
    if (s.status === 'done_no_date') return 'Update';
    if (s.status === 'todo') return s.item.type === 'manual' ? null : 'Add';
    return null;
  };

  // To-do and held courses get a tickbox; expired or expiring ones keep the warning mark.
  const onToggle = (s: ItemState) => {
    if (s.status === 'todo') tick(s.item.code);
    else if (s.certificate) untick(s.item.code, rowTitle(s), s.certificate);
  };

  const renderRow = (s: ItemState, last: boolean) => {
    const label = actionLabel(s);
    const line = statusLine(s, t);
    const iconBg =
      s.status === 'expired' ? colors.error : s.status === 'soon' ? colors.warning : s.status === 'todo' ? 'transparent' : colors.successDark;
    const lineColor =
      s.status === 'expired' ? colors.error : s.status === 'soon' || s.missingDetails ? '#B26A00' : undefined;
    const warn = s.status === 'expired' || s.status === 'soon';
    return (
      <View key={s.item.code} style={[styles.row, last && { borderBottomWidth: 0 }]}>
        {warn ? (
          <View style={[styles.icon, { backgroundColor: iconBg }]}>
            <Text style={styles.iconText}>!</Text>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => onToggle(s)}
            disabled={savingCode === s.item.code}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: s.status !== 'todo' }}
            accessibilityLabel={rowTitle(s)}
            style={[styles.icon, styles.tickbox, { backgroundColor: iconBg }, s.status === 'todo' && styles.iconTodo]}
          >
            {s.status !== 'todo' ? (
              <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={13} color={colors.white} />
            ) : null}
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <TouchableOpacity onPress={() => showDetail(s)} accessibilityHint="Shows the full requirement">
            <Text style={styles.rowTitle}>{rowTitle(s)}</Text>
            {line ? (
              <Text style={[styles.rowSub, lineColor ? { color: lineColor } : null]} numberOfLines={2}>
                {line}
              </Text>
            ) : null}
          </TouchableOpacity>
          {s.status === 'todo' && s.item.type !== 'manual' && offered.has(s.item.code) && (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/training-providers', params: { course: s.item.code } } as any)}
            >
              <Text style={styles.findLink}>Find a course</Text>
            </TouchableOpacity>
          )}
        </View>
        {savingCode === s.item.code ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : label ? (
          <TouchableOpacity onPress={() => onAction(s)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.action}>{label}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const section = (title: string, rows: ItemState[]) =>
    rows.length === 0 ? null : (
      <View key={title}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.group}>{rows.map((s, i) => renderRow(s, i === rows.length - 1))}</View>
      </View>
    );

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Before your oral',
          headerStyle: { backgroundColor: isDark ? colors.background : colors.backgroundLight },
          headerTitleStyle: { color: isDark ? colors.text : colors.textLight },
          headerTintColor: colors.primary,
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: 60 }} size="large" color={colors.primary} />
        ) : !result ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{target ? target.title : 'No target certificate yet'}</Text>
            <Text style={styles.emptyText}>
              {target
                ? "We don't have a checked course list for this certificate yet. Pick another target, or use the requirements notes for now."
                : 'Pick the certificate you are working towards and this list shows the courses you need before the oral.'}
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/mca-requirements')}>
              <Text style={styles.primaryButtonText}>Choose target</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.headerBlock}>
              <Text style={styles.target}>{target?.title ?? targetId}</Text>
              <Text style={styles.sub}>
                {[authority.toUpperCase(), target?.regulation].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <View style={styles.summary}>
              <View style={styles.summaryTop}>
                <Text style={styles.big}>
                  {result.toGo === 0 ? 'Ready for your oral' : `${result.toGo} to go`}
                </Text>
                <Text style={styles.sub}>
                  {result.done} of {result.total} done
                </Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${result.total ? Math.round((result.done / result.total) * 100) : 0}%` }]} />
              </View>
              <Text style={styles.sub}>
                {[
                  groups.todo.length ? `${groups.todo.length} still to take` : null,
                  groups.attention.filter((s) => s.status === 'expired').length
                    ? `${groups.attention.filter((s) => s.status === 'expired').length} expired`
                    : null,
                  groups.attention.filter((s) => s.status === 'soon').length
                    ? `${groups.attention.filter((s) => s.status === 'soon').length} expiring soon`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Everything on the list is in date'}
              </Text>
            </View>

            {section('Needs attention', groups.attention)}
            {section('Still to take', groups.todo)}
            {section('Done', groups.done)}
            {section('Recommended', result.recommended)}

            {result.examNote ? <Text style={styles.examNote}>{result.examNote}</Text> : null}

            {result.seaService.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Sea service</Text>
                <TouchableOpacity style={[styles.group, styles.row, { borderBottomWidth: 0 }]} onPress={() => router.push('/mca-requirements')}>
                  <IconSymbol ios_icon_name="ferry" android_material_icon_name="directions-boat" size={20} color={colors.primary} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.rowTitle}>{result.seaService.map((i) => i.label).join(' · ')}</Text>
                    <Text style={styles.rowSub}>Counted from your logbook. See your progress on Requirements.</Text>
                  </View>
                  <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={18} color={isDark ? colors.textSecondary : colors.textSecondaryLight} />
                </TouchableOpacity>
              </>
            )}

            <Text style={styles.footnote}>
              {t('certChecker.checklistFootnote', { sources: result.sources.join(', ') })}
            </Text>
          </>
        )}
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
    headerBlock: { paddingHorizontal: 16, paddingTop: 16 },
    target: { fontSize: 20, fontWeight: '700', color: text },
    sub: { fontSize: 13, color: muted, marginTop: 2 },
    summary: { backgroundColor: card, borderColor: border, borderWidth: 1, borderRadius: 14, margin: 16, padding: 14 },
    summaryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    big: { fontSize: 26, fontWeight: '700', color: text },
    track: { height: 8, borderRadius: 4, backgroundColor: isDark ? colors.border : '#E6F1FB', marginVertical: 8, overflow: 'hidden' },
    fill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
    sectionTitle: { fontSize: 13, fontWeight: '600', color: muted, marginTop: 12, marginBottom: 6, marginHorizontal: 20 },
    group: { backgroundColor: card, borderColor: border, borderWidth: 1, borderRadius: 12, marginHorizontal: 16, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: border, gap: 10 },
    icon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    iconTodo: { borderWidth: 2, borderColor: muted },
    tickbox: { borderRadius: 6 },
    iconText: { color: colors.white, fontWeight: '700', fontSize: 13 },
    rowTitle: { fontSize: 15, color: text },
    rowSub: { fontSize: 12, color: muted, marginTop: 2 },
    findLink: { fontSize: 12, color: colors.primary, marginTop: 3, fontWeight: '600' },
    action: { fontSize: 14, fontWeight: '600', color: colors.primary },
    examNote: { fontSize: 13, color: muted, marginHorizontal: 20, marginTop: 14, lineHeight: 19 },
    footnote: { fontSize: 12, color: muted, margin: 20, lineHeight: 17 },
    empty: { padding: 24, alignItems: 'center' },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: text, textAlign: 'center', marginTop: 30 },
    emptyText: { fontSize: 15, color: muted, textAlign: 'center', marginTop: 8, lineHeight: 21 },
    primaryButton: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, marginTop: 18 },
    primaryButtonText: { color: colors.white, fontWeight: '600', fontSize: 16 },
  });
}
