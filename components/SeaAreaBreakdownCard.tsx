import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '@/styles/commonStyles';
import { getSeaAreaBreakdown, type SeaAreaBreakdown } from '@/utils/seaTimeApi';
import { error as logError } from '@/utils/log';

interface Props {
  vesselId?: string;
  /** Changes when the screen reloads its entries, so the card refreshes too. */
  refreshKey?: unknown;
}

/**
 * Confirmed days on commercial work by sea area: MSN 1837 Cat A to D, at sea,
 * tidal and non-tidal. Guidance only; it does not change any progress bar.
 * Hidden for yachting users.
 */
export function SeaAreaBreakdownCard({ vesselId, refreshKey }: Props) {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const [data, setData] = useState<{ commercial: boolean; breakdown: SeaAreaBreakdown } | null>(null);

  useEffect(() => {
    let alive = true;
    getSeaAreaBreakdown(vesselId)
      .then((d) => alive && setData(d))
      .catch((e) => logError('[SeaAreaBreakdownCard] Load failed:', e?.message || e));
    return () => {
      alive = false;
    };
  }, [vesselId, refreshKey]);

  if (!data?.commercial || !data.breakdown) return null;
  const b = data.breakdown;
  const rows: [string, number][] = [
    [t('seaAreas.cat', { cat: 'A' }), b.A],
    [t('seaAreas.cat', { cat: 'B' }), b.B],
    [t('seaAreas.cat', { cat: 'C' }), b.C],
    [t('seaAreas.cat', { cat: 'D' }), b.D],
    [t('seaAreas.sea'), b.sea],
    [t('seaAreas.notClassified'), b.not_classified],
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('seaAreas.breakdownTitle')}</Text>
      {b.total === 0 ? (
        <Text style={styles.body}>{t('seaAreas.breakdownEmpty')}</Text>
      ) : (
        <>
          {rows.map(([label, n]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{n}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>{t('seaAreas.tidal')}</Text>
            <Text style={styles.value}>{b.tidal}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t('seaAreas.nonTidal')}</Text>
            <Text style={styles.value}>{b.non_tidal}</Text>
          </View>
        </>
      )}
      <Text style={styles.note}>{t('seaAreas.guidance')}</Text>
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
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    label: {
      fontSize: 14,
      color: isDark ? colors.text : colors.textLight,
    },
    value: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
    },
    divider: {
      height: 1,
      marginVertical: 6,
      backgroundColor: isDark ? colors.border : colors.borderLight,
    },
    body: {
      fontSize: 13,
      lineHeight: 18,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    note: {
      fontSize: 12,
      lineHeight: 17,
      marginTop: 10,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
  });
