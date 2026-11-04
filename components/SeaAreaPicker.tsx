import React from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, useColorScheme } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '@/styles/commonStyles';
import type { SeaArea } from '@/utils/seaTimeApi';

export interface SeaAreaValue {
  area_category: SeaArea | null;
  is_tidal: boolean | null;
  dual_capacity: boolean;
}

interface Props {
  value: SeaAreaValue;
  onChange: (next: SeaAreaValue) => void;
}

const AREAS: (SeaArea | null)[] = [null, 'A', 'B', 'C', 'D', 'sea'];
const TIDES: (boolean | null)[] = [null, true, false];

/**
 * For workboat users on a manual or edited entry: set or correct the sea area
 * (guidance only), and mark dual deck and engine capacity, which counts at 50%
 * toward Master (Workboat) (MGN 496 4.5).
 */
export function SeaAreaPicker({ value, onChange }: Props) {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);

  const areaLabel = (a: SeaArea | null) =>
    a === null ? t('seaAreas.notSet') : a === 'sea' ? t('seaAreas.sea') : t('seaAreas.cat', { cat: a });
  const tideLabel = (v: boolean | null) =>
    v === null ? t('seaAreas.notSet') : v ? t('seaAreas.tidal') : t('seaAreas.nonTidal');

  const option = (key: string, label: string, selected: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={key}
      style={[styles.option, selected && styles.optionSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('seaAreas.pickerTitle')}</Text>
      <Text style={styles.body}>{t('seaAreas.pickerHelp')}</Text>
      <View style={styles.segment}>
        {AREAS.map((a) =>
          option(String(a), areaLabel(a), value.area_category === a, () => onChange({ ...value, area_category: a })),
        )}
      </View>
      <Text style={styles.label}>{t('seaAreas.tidalTitle')}</Text>
      <View style={styles.segment}>
        {TIDES.map((v) => option(String(v), tideLabel(v), value.is_tidal === v, () => onChange({ ...value, is_tidal: v })))}
      </View>
      <Text style={styles.note}>{t('seaAreas.guidance')}</Text>

      <View style={styles.divider} />
      <View style={styles.row}>
        <View style={styles.textWrap}>
          <Text style={styles.title}>{t('seaAreas.dualTitle')}</Text>
          <Text style={styles.body}>{t('seaAreas.dualHelp')}</Text>
        </View>
        <Switch
          value={value.dual_capacity}
          onValueChange={(next) => onChange({ ...value, dual_capacity: next })}
          trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
          thumbColor={value.dual_capacity ? colors.switchThumbOn : colors.switchThumbOff}
        />
      </View>
    </View>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 16,
      padding: 16,
      marginVertical: 12,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
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
    label: {
      fontSize: 13,
      fontWeight: '600',
      marginTop: 12,
      color: isDark ? colors.text : colors.textLight,
    },
    segment: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    option: {
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    optionSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    optionText: {
      fontSize: 13,
      color: isDark ? colors.text : colors.textLight,
    },
    optionTextSelected: {
      color: colors.white,
      fontWeight: '600',
    },
    note: {
      fontSize: 12,
      lineHeight: 17,
      marginTop: 10,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    divider: {
      height: 1,
      marginVertical: 12,
      backgroundColor: isDark ? colors.border : colors.borderLight,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    textWrap: {
      flex: 1,
    },
  });
