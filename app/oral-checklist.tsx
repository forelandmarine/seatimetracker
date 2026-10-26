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
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { Certificate, listCertificates, createCertificate } from '@/utils/certificatesApi';
import * as seaTimeApi from '@/utils/seaTimeApi';
import {
  getRequirementsByAuthority,
  getDefaultTargetId,
  type MaritimeAuthority,
} from '@/constants/mcaRequirements';
import {
  evaluateChecklist,
  certificateTypeFor,
  type ItemState,
} from '@/utils/courseChecklist';
import { error as logError } from '@/utils/log';

const AUTHORITIES = ['mca', 'uscg', 'amsa', 'mnz', 'samsa'];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function daysFrom(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function statusLine(s: ItemState): string | null {
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
      if (s.item.type === 'manual') return 'Mark done when complete';
      return s.item.note ?? null;
  }
}

export default function OralChecklistScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [authority, setAuthority] = useState<MaritimeAuthority>('mca');
  const [savingCode, setSavingCode] = useState<string | null>(null);

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

  const groups = useMemo(() => {
    const states = result?.states ?? [];
    return {
      attention: states.filter((s) => s.status === 'expired' || s.status === 'soon'),
      todo: states.filter((s) => s.status === 'todo'),
      done: states.filter((s) => s.status === 'done' || s.status === 'done_no_date'),
    };
  }, [result]);

  const markDone = async (s: ItemState) => {
    setSavingCode(s.item.code);
    try {
      await createCertificate({ certificate_type: certificateTypeFor(s.item.code), notes: 'Marked done on the oral checklist' });
      await load();
    } catch (err: any) {
      Alert.alert("Couldn't save", err?.message ?? 'Try again.');
    } finally {
      setSavingCode(null);
    }
  };

  const onAction = (s: ItemState) => {
    if (s.certificate && (s.status === 'expired' || s.status === 'soon' || s.status === 'done_no_date')) {
      router.push({ pathname: '/certificate-edit', params: { id: s.certificate.id } });
    } else if (s.item.type === 'manual') {
      markDone(s);
    } else {
      router.push({ pathname: '/certificate-edit', params: { type: certificateTypeFor(s.item.code) } });
    }
  };

  const actionLabel = (s: ItemState): string | null => {
    if (s.status === 'expired' || s.status === 'soon' || s.status === 'done_no_date') return 'Update';
    if (s.status === 'todo') return s.item.type === 'manual' ? 'Mark done' : 'Add';
    return null;
  };

  const renderRow = (s: ItemState, last: boolean) => {
    const label = actionLabel(s);
    const line = statusLine(s);
    const iconBg =
      s.status === 'expired' ? colors.error : s.status === 'soon' ? colors.warning : s.status === 'todo' ? 'transparent' : colors.successDark;
    const lineColor = s.status === 'expired' ? colors.error : s.status === 'soon' ? '#B26A00' : undefined;
    return (
      <View key={s.item.code} style={[styles.row, last && { borderBottomWidth: 0 }]}>
        <View style={[styles.icon, { backgroundColor: iconBg }, s.status === 'todo' && styles.iconTodo]}>
          {s.status === 'expired' || s.status === 'soon' ? (
            <Text style={styles.iconText}>!</Text>
          ) : s.status !== 'todo' ? (
            <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={13} color={colors.white} />
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{s.item.label}</Text>
          {line ? <Text style={[styles.rowSub, lineColor ? { color: lineColor } : null]}>{line}</Text> : null}
          {s.status === 'todo' && s.item.type !== 'manual' && (
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/training-providers', params: { course: s.item.code } })}
            >
              <Text style={styles.findLink}>Find a course</Text>
            </TouchableOpacity>
          )}
        </View>
        {label &&
          (savingCode === s.item.code ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <TouchableOpacity onPress={() => onAction(s)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.action}>{label}</Text>
            </TouchableOpacity>
          ))}
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
              Ticks come from the certificates you have added. Course list taken from {result.sources.join(', ')}. Always check the
              current notice before booking your oral.
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
