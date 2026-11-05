/**
 * Sole watchkeeping (Settings > Sea Service).
 *
 * Every vessel with the dates the user was its only watchkeeper in their
 * department. Sea days inside those dates also count as watchkeeping days
 * (MCA, MNZ, SAMSA). Periods can be added, have their dates edited, or be
 * deleted. Periods on one vessel cannot overlap; the backend checks that.
 * One file for iOS and Android.
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  Switch,
  useColorScheme,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { DatePickerSheet } from '@/components/DatePickerSheet';
import {
  addSoleWatchPeriod,
  deleteSoleWatchPeriod,
  getAllSoleWatchPeriods,
  updateSoleWatchPeriod,
  type SoleWatchPeriod,
  type SoleWatchVessel,
} from '@/utils/seaTimeApi';
import { formatDayShort, localDate, todayIso } from '@/utils/localDate';
import { error as logError } from '@/utils/log';

interface Editing {
  vessel: SoleWatchVessel;
  period: SoleWatchPeriod | null; // null = adding
}

export default function SoleWatchkeepingScreen() {
  const { t, i18n } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const [vessels, setVessels] = useState<SoleWatchVessel[]>([]);
  const [applies, setApplies] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await getAllSoleWatchPeriods();
      setVessels(res.vessels);
      setApplies(res.applies);
      setFailed(false);
    } catch (e: any) {
      logError('[SoleWatchkeeping] Load failed:', e?.message || e);
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const replaceVessel = (v: SoleWatchVessel) => {
    setVessels((list) => list.map((x) => (x.vessel_id === v.vessel_id ? { ...x, ...v } : x)));
  };

  const fmt = (day: string) => formatDayShort(day, i18n.language);
  const range = (p: SoleWatchPeriod) =>
    t('soleWatch.screen.periodRange', {
      start: p.start_date ? fmt(p.start_date) : t('soleWatch.screen.fromFirstEntry'),
      end: p.end_date ? fmt(p.end_date) : t('soleWatch.screen.now'),
    });

  const confirmDelete = (vessel: SoleWatchVessel, period: SoleWatchPeriod) => {
    if (!period.id) return;
    Alert.alert(
      t('soleWatch.screen.deleteTitle'),
      t('soleWatch.screen.deleteBody', { count: period.days, range: range(period) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              replaceVessel(await deleteSoleWatchPeriod(vessel.vessel_id, period.id as string));
            } catch (e: any) {
              logError('[SoleWatchkeeping] Delete failed:', e?.message || e);
              Alert.alert(t('soleWatch.notSavedTitle'), t('soleWatch.notSaved'));
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('soleWatch.screen.title'), headerBackTitle: t('common.back') }} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <Text style={styles.intro}>{t('soleWatch.screen.intro')}</Text>
        {!applies && <Text style={styles.warning}>{t('soleWatch.screen.notApplies')}</Text>}

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
        ) : failed ? (
          <Text style={styles.empty}>{t('soleWatch.screen.loadFailed')}</Text>
        ) : vessels.length === 0 ? (
          <Text style={styles.empty}>{t('soleWatch.screen.noVessels')}</Text>
        ) : (
          vessels.map((v) => (
            <View key={v.vessel_id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.vesselName}>{v.vessel_name}</Text>
                {v.total_days > 0 && <Text style={styles.total}>{t('soleWatch.screen.days', { count: v.total_days })}</Text>}
              </View>

              {v.periods.length === 0 ? (
                <Text style={styles.none}>{t('soleWatch.screen.noPeriods')}</Text>
              ) : (
                v.periods.map((p) => (
                  <View key={p.id ?? `${p.start_date}-${p.end_date}`} style={styles.period}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.periodRange}>{range(p)}</Text>
                      <Text style={styles.periodDays}>{t('soleWatch.screen.days', { count: p.days })}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setEditing({ vessel: v, period: p })} hitSlop={8} style={styles.action}>
                      <Text style={styles.link}>{t('soleWatch.editDates')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => confirmDelete(v, p)}
                      hitSlop={8}
                      style={styles.action}
                      accessibilityLabel={t('common.delete')}
                    >
                      <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={18} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ))
              )}

              <TouchableOpacity style={styles.addButton} onPress={() => setEditing({ vessel: v, period: null })}>
                <IconSymbol ios_icon_name="plus.circle" android_material_icon_name="add-circle-outline" size={18} color={colors.primary} />
                <Text style={styles.addText}>{t('soleWatch.screen.addPeriod')}</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {editing && (
        <PeriodEditor
          editing={editing}
          onCancel={() => setEditing(null)}
          onSaved={(v) => {
            replaceVessel(v);
            setEditing(null);
          }}
        />
      )}
    </View>
  );
}

/** Add a period, or change the dates of one. */
function PeriodEditor({ editing, onCancel, onSaved }: { editing: Editing; onCancel: () => void; onSaved: (v: SoleWatchVessel) => void }) {
  const { t, i18n } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const { vessel, period } = editing;
  const [start, setStart] = useState<string | null>(period ? period.start_date : todayIso());
  const [end, setEnd] = useState<string | null>(period ? period.end_date : null);
  const [picking, setPicking] = useState<'start' | 'end' | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const fmt = (day: string) => formatDayShort(day, i18n.language);

  const save = async () => {
    if (start && end && start > end) {
      setProblem(t('soleWatch.screen.badDates'));
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      const body = { start_date: start, end_date: end };
      const v = period?.id
        ? await updateSoleWatchPeriod(vessel.vessel_id, period.id, body)
        : await addSoleWatchPeriod(vessel.vessel_id, body);
      onSaved(v);
    } catch (e: any) {
      logError('[SoleWatchkeeping] Save failed:', e?.message || e);
      if (e?.status === 409) setProblem(t('soleWatch.screen.overlap'));
      else if (e?.status === 400) setProblem(t('soleWatch.screen.badDates'));
      else setProblem(t('soleWatch.notSaved'));
    } finally {
      setSaving(false);
    }
  };

  const dateRow = (which: 'start' | 'end') => {
    const value = which === 'start' ? start : end;
    const openLabel = which === 'start' ? t('soleWatch.screen.startFromFirst') : t('soleWatch.screen.ongoing');
    const setValue = which === 'start' ? setStart : setEnd;
    return (
      <View style={styles.editorBlock}>
        <Text style={styles.editorLabel}>{which === 'start' ? t('soleWatch.screen.start') : t('soleWatch.screen.end')}</Text>
        <View style={styles.editorRow}>
          <Text style={styles.editorRowText}>{openLabel}</Text>
          <Switch
            value={value == null}
            onValueChange={(open) => setValue(open ? null : todayIso())}
            trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
            thumbColor={value == null ? colors.switchThumbOn : colors.switchThumbOff}
          />
        </View>
        {value != null && (
          <TouchableOpacity style={styles.dateButton} onPress={() => setPicking(which)}>
            <IconSymbol ios_icon_name="calendar" android_material_icon_name="calendar-today" size={16} color={colors.primary} />
            <Text style={styles.dateButtonText}>{fmt(value)}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.editor}>
          <Text style={styles.editorTitle}>{period ? t('soleWatch.editDates') : t('soleWatch.screen.addPeriod')}</Text>
          <Text style={styles.editorVessel}>{vessel.vessel_name}</Text>
          {dateRow('start')}
          {dateRow('end')}
          {problem && <Text style={styles.problem}>{problem}</Text>}
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.button} onPress={onCancel} disabled={saving}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveText}>{t('common.save')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <DatePickerSheet
        visible={picking != null}
        value={localDate((picking === 'start' ? start : end) ?? todayIso())}
        title={picking === 'start' ? t('soleWatch.screen.start') : t('soleWatch.screen.end')}
        onCancel={() => setPicking(null)}
        onConfirm={(d) => {
          if (picking === 'start') setStart(todayIso(d));
          else setEnd(todayIso(d));
          setPicking(null);
        }}
      />
    </Modal>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    scrollContent: {
      padding: 16,
    },
    intro: {
      fontSize: 14,
      lineHeight: 20,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 12,
    },
    warning: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.warning,
      marginBottom: 12,
    },
    empty: {
      fontSize: 14,
      textAlign: 'center',
      marginTop: 24,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 16,
      padding: 16,
      marginTop: 12,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    vesselName: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
    },
    total: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
    none: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 4,
    },
    period: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? colors.border : colors.borderLight,
    },
    periodRange: {
      fontSize: 14,
      color: isDark ? colors.text : colors.textLight,
    },
    periodDays: {
      fontSize: 12,
      marginTop: 2,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    action: {
      marginLeft: 16,
    },
    link: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 10,
    },
    addText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    overlay: {
      flex: 1,
      justifyContent: 'center',
      padding: 20,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    editor: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 16,
      padding: 20,
    },
    editorTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
    },
    editorVessel: {
      fontSize: 14,
      marginTop: 2,
      marginBottom: 8,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    editorBlock: {
      marginTop: 12,
    },
    editorLabel: {
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 6,
    },
    editorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    editorRowText: {
      fontSize: 15,
      color: isDark ? colors.text : colors.textLight,
    },
    dateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    dateButtonText: {
      fontSize: 15,
      color: isDark ? colors.text : colors.textLight,
    },
    problem: {
      fontSize: 13,
      color: colors.error,
      marginTop: 12,
    },
    buttons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
      marginTop: 20,
    },
    button: {
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: 10,
      minWidth: 90,
      alignItems: 'center',
    },
    saveButton: {
      backgroundColor: colors.primary,
    },
    cancelText: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    saveText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.white,
    },
  });
