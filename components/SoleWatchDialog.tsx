import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, useColorScheme } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '@/styles/commonStyles';
import { DatePickerSheet } from '@/components/DatePickerSheet';
import {
  applySoleWatchChange,
  previewSoleWatchChanges,
  type SoleWatchChange,
  type SoleWatchPreviewResult,
  type SoleWatchVessel,
} from '@/utils/seaTimeApi';
import { formatDayShort, localDate, todayIso } from '@/utils/localDate';
import { error as logError } from '@/utils/log';

type Key = 'all' | 'date' | 'today' | 'never';

interface Props {
  visible: boolean;
  /** 'on' asks how far back to count; 'off' asks when the user stopped. */
  mode: 'on' | 'off';
  vesselId: string;
  vesselName: string;
  role: 'engineer' | 'bridge';
  onCancel: () => void;
  onSaved: (data: SoleWatchVessel) => void;
}

function changeFor(mode: 'on' | 'off', key: Key, date: string | null): SoleWatchChange {
  if (mode === 'on') return { action: 'on', from: key === 'date' ? 'date' : key === 'today' ? 'today' : 'all', date };
  return { action: 'off', at: key === 'date' ? 'date' : key === 'never' ? 'never' : 'today', date };
}

/**
 * Asks how a sole watchkeeper switch change should treat earlier service, and
 * shows how many watchkeeping days each choice adds or removes before saving.
 */
export function SoleWatchDialog({ visible, mode, vesselId, vesselName, role, onCancel, onSaved }: Props) {
  const { t, i18n } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const keys: Key[] = mode === 'on' ? ['all', 'date', 'today'] : ['today', 'date', 'never'];

  const [previews, setPreviews] = useState<Partial<Record<Key, SoleWatchPreviewResult | null>>>({});
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<Key | null>(null);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fresh previews each time the dialog opens
  useEffect(() => {
    if (!visible) return;
    setPreviews({});
    setSelected(null);
    setPickedDate(null);
    setFailed(false);
    const fixed = keys.filter((k) => k !== 'date');
    setLoading(true);
    previewSoleWatchChanges(vesselId, fixed.map((k) => changeFor(mode, k, null)))
      .then((res) => {
        const next: Partial<Record<Key, SoleWatchPreviewResult>> = {};
        fixed.forEach((k, i) => { next[k] = res.results[i]; });
        setPreviews(next);
      })
      .catch((e: any) => {
        logError('[SoleWatchDialog] Preview failed:', e?.message || e);
        setFailed(true);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode, vesselId]);

  const pickDate = (date: Date) => {
    setShowPicker(false);
    const day = todayIso(date);
    setPickedDate(day);
    setSelected('date');
    setPreviews((p) => ({ ...p, date: null }));
    previewSoleWatchChanges(vesselId, [changeFor(mode, 'date', day)])
      .then((res) => setPreviews((p) => ({ ...p, date: res.results[0] })))
      .catch((e: any) => {
        logError('[SoleWatchDialog] Preview failed:', e?.message || e);
        setFailed(true);
      });
  };

  const effect = (key: Key): string => {
    if (key === 'date' && !pickedDate) return t('soleWatch.chooseDate');
    const r = previews[key];
    if (!r) return failed ? t('soleWatch.previewFailed') : t('soleWatch.calculating');
    if (mode === 'on') {
      if (r.added === 0) return t('soleWatch.addsNone');
      return r.from_date
        ? t('soleWatch.adds', { count: r.added, date: formatDayShort(r.from_date, i18n.language) })
        : t('soleWatch.addsNoDate', { count: r.added });
    }
    return r.removed === 0 ? t('soleWatch.removesNone') : t('soleWatch.removes', { count: r.removed });
  };

  const label = (key: Key): string => {
    if (mode === 'on') {
      if (key === 'all') return t('soleWatch.optionAll');
      if (key === 'today') return t('soleWatch.optionFromToday');
      return pickedDate ? t('soleWatch.optionFromDateValue', { date: formatDayShort(pickedDate, i18n.language) }) : t('soleWatch.optionFromDate');
    }
    if (key === 'today') return t('soleWatch.optionToday');
    if (key === 'never') return t('soleWatch.optionNever');
    return pickedDate ? t('soleWatch.optionPickDateValue', { date: formatDayShort(pickedDate, i18n.language) }) : t('soleWatch.optionPickDate');
  };

  const choose = (key: Key) => {
    if (key === 'date') {
      setShowPicker(true);
      return;
    }
    setSelected(key);
  };

  const save = async () => {
    if (!selected || (selected === 'date' && !pickedDate)) return;
    setSaving(true);
    try {
      const data = await applySoleWatchChange(vesselId, changeFor(mode, selected, pickedDate));
      onSaved(data);
    } catch (e: any) {
      logError('[SoleWatchDialog] Save failed:', e?.message || e);
      Alert.alert(t('soleWatch.notSavedTitle'), t('soleWatch.notSaved'));
    } finally {
      setSaving(false);
    }
  };

  const title = mode === 'on' ? t('soleWatch.onTitle', { vessel: vesselName }) : t('soleWatch.offTitle');
  const intro = mode === 'on'
    ? (role === 'engineer' ? t('soleWatch.onIntroEngineer') : t('soleWatch.onIntroBridge'))
    : t('soleWatch.offIntro');
  const canSave = !!selected && (selected !== 'date' || !!pickedDate) && !saving;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.intro}>{intro}</Text>

          {keys.map((key) => {
            const active = selected === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.option, active && styles.optionActive]}
                onPress={() => choose(key)}
                activeOpacity={0.7}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <View style={[styles.radio, active && styles.radioActive]}>{active && <View style={styles.radioDot} />}</View>
                <View style={styles.optionText}>
                  <Text style={styles.optionLabel}>{label(key)}</Text>
                  <Text style={styles.optionEffect}>{effect(key)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {loading && <ActivityIndicator style={{ marginTop: 8 }} color={colors.primary} />}

          <View style={styles.buttons}>
            <TouchableOpacity style={styles.button} onPress={onCancel} disabled={saving}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.saveButton, !canSave && styles.saveDisabled]} onPress={save} disabled={!canSave}>
              {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveText}>{t('common.save')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <DatePickerSheet
        visible={showPicker}
        value={pickedDate ? localDate(pickedDate) : new Date()}
        maximumDate={new Date()}
        title={t('soleWatch.chooseDate')}
        onCancel={() => setShowPicker(false)}
        onConfirm={pickDate}
      />
    </Modal>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      padding: 20,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 16,
      padding: 20,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    intro: {
      fontSize: 14,
      lineHeight: 20,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 12,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      marginTop: 8,
    },
    optionActive: {
      borderColor: colors.primary,
    },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: isDark ? colors.textSecondary : colors.textSecondaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioActive: {
      borderColor: colors.primary,
    },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.primary,
    },
    optionText: {
      flex: 1,
    },
    optionLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
    },
    optionEffect: {
      fontSize: 13,
      marginTop: 2,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
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
    saveDisabled: {
      opacity: 0.5,
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
