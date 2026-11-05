import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, Alert, TouchableOpacity, useColorScheme } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '@/styles/commonStyles';
import { getUserProfile, getVesselSoleWatch, updateVesselSoleWatchkeeper, type SoleWatchVessel } from '@/utils/seaTimeApi';
import { formatDayShort, todayIso } from '@/utils/localDate';
import { SoleWatchDialog } from '@/components/SoleWatchDialog';
import { error as logError } from '@/utils/log';

interface Props {
  vesselId: string;
  vesselName: string;
  isSoleWatchkeeper: boolean | null | undefined;
  /** Called with the saved value so the screen can refresh its totals. */
  onChange: (isSoleWatchkeeper: boolean) => void;
}

// Authorities whose progress bars carry a separate watchkeeping figure.
const WATCHKEEPING_AUTHORITIES = new Set(['mca', 'mnz', 'samsa']);

/**
 * Lets the user say they are the only watchkeeper in their department on a
 * vessel, a sole engineer for example. Sea days inside the dates they give
 * also count as watchkeeping days. Turning it on asks how far back to count,
 * turning it off asks when they stopped, and both show the effect first.
 * The dates can be edited in Settings > Sea Service > Sole watchkeeping.
 * Hidden for authorities with no watchkeeping figure (USCG, AMSA).
 */
export function SoleWatchToggle({ vesselId, vesselName, isSoleWatchkeeper, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const [authority, setAuthority] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const [value, setValue] = useState(isSoleWatchkeeper === true);
  const [data, setData] = useState<SoleWatchVessel | null>(null);
  // Periods could not be loaded (older backend): fall back to the plain switch
  const [legacy, setLegacy] = useState(false);
  const [dialog, setDialog] = useState<'on' | 'off' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getUserProfile()
      .then((p) => {
        setAuthority(p?.maritime_authority ?? 'mca');
        setDepartment(p?.department ?? null);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    getVesselSoleWatch(vesselId)
      .then((d) => {
        setData(d);
        setValue(d.is_sole_watchkeeper);
        setLegacy(false);
      })
      .catch((e: any) => {
        logError('[SoleWatchToggle] Load failed:', e?.message || e);
        setLegacy(true);
      });
  }, [vesselId]);

  // Reload on focus, so edits made in Settings show when the user comes back
  useFocusEffect(load);

  useEffect(() => {
    setValue(isSoleWatchkeeper === true);
  }, [isSoleWatchkeeper]);

  if (!authority || !WATCHKEEPING_AUTHORITIES.has(authority)) return null;

  const role: 'engineer' | 'bridge' = department?.toLowerCase() === 'engineering' ? 'engineer' : 'bridge';

  const saveLegacy = async (next: boolean) => {
    setValue(next);
    setSaving(true);
    try {
      await updateVesselSoleWatchkeeper(vesselId, next);
      onChange(next);
    } catch (e: any) {
      logError('[SoleWatchToggle] Save failed:', e?.message || e);
      setValue(!next);
      Alert.alert(t('soleWatch.notSavedTitle'), t('soleWatch.notSaved'));
    } finally {
      setSaving(false);
    }
  };

  const onToggle = (next: boolean) => {
    if (legacy) {
      saveLegacy(next);
      return;
    }
    setDialog(next ? 'on' : 'off');
  };

  const onSaved = (d: SoleWatchVessel) => {
    setDialog(null);
    setData(d);
    setValue(d.is_sole_watchkeeper);
    onChange(d.is_sole_watchkeeper);
  };

  // The period that covers today, for "On since 3 Mar 2025"
  const today = data?.today ?? todayIso();
  const current = data?.periods.find(
    (p) => (p.start_date == null || p.start_date <= today) && (p.end_date == null || p.end_date >= today)
  );
  let status: string | null = null;
  if (value && current) {
    const since = current.start_date ?? data?.first_entry_date ?? null;
    status = since ? t('soleWatch.onSince', { date: formatDayShort(since, i18n.language) }) : t('soleWatch.onAll');
  } else if (!value && data && data.periods.length > 0) {
    status = t('soleWatch.offWithPeriods', { count: data.periods.length });
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.textWrap}>
          <Text style={styles.title}>{t('soleWatch.title')}</Text>
          <Text style={styles.body}>{role === 'engineer' ? t('soleWatch.bodyEngineer') : t('soleWatch.bodyBridge')}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={onToggle}
          disabled={saving}
          trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
          thumbColor={value ? colors.switchThumbOn : colors.switchThumbOff}
        />
      </View>
      {!legacy && (status || data) && (
        <View style={styles.statusRow}>
          {status && <Text style={styles.status}>{status}</Text>}
          <TouchableOpacity onPress={() => router.push('/sole-watchkeeping' as any)} hitSlop={8}>
            <Text style={styles.link}>{t('soleWatch.editDates')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {value && (
        <Text style={styles.note}>
          {role === 'engineer' ? t('soleWatch.testimonialNoteEngineer') : t('soleWatch.testimonialNoteBridge')}
        </Text>
      )}

      {!legacy && dialog && (
        <SoleWatchDialog
          visible
          mode={dialog}
          vesselId={vesselId}
          vesselName={vesselName}
          role={role}
          onCancel={() => setDialog(null)}
          onSaved={onSaved}
        />
      )}
    </View>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 16,
      padding: 16,
      margin: 16,
      marginBottom: 0,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    textWrap: {
      flex: 1,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 4,
    },
    body: {
      fontSize: 13,
      lineHeight: 18,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 12,
    },
    status: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
    },
    link: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
    note: {
      fontSize: 13,
      lineHeight: 18,
      marginTop: 12,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
  });
