import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useColorScheme } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { getHighSpeedNeeds, type HighSpeedNeed } from '@/utils/seaTimeApi';
import { error as logError } from '@/utils/log';

interface Props {
  /** Changes when the certificate list reloads, so the card refreshes too. */
  refreshKey?: unknown;
  /** Adds the certificate (as the checklist tick does), by course code. */
  onAdd: (code: string) => void;
  /** The course code being saved, to show a spinner. */
  savingCode: string | null;
}

/**
 * Workboat Code Ed. 3, Table A5.1 Note F: "Where the vessel is used in accordance
 * with ... 25.4 (High Speed and Planing Mode Operations), the Master must have a
 * minimum of an RYA/MCA Advanced Powerboat Certificate". Shown on the
 * Certificates screen when a vessel is marked as a high-speed craft and no valid
 * Advanced Powerboat certificate is on file.
 */
export function HighSpeedCertificateCard({ refreshKey, onAdd, savingCode }: Props) {
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const [need, setNeed] = useState<HighSpeedNeed | null>(null);

  useEffect(() => {
    let alive = true;
    getHighSpeedNeeds()
      .then((n) => alive && setNeed(n))
      .catch((e) => logError('[HighSpeedCertificateCard] Load failed:', e?.message || e));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  if (!need || need.held) return null;
  const names = need.vessels.map((v) => v.name).join(', ');
  const saving = savingCode === 'powerboat_advanced';

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Needed for high-speed craft</Text>
      <Text style={styles.title}>RYA/MCA Advanced Powerboat Certificate</Text>
      <Text style={styles.body}>
        {need.served_as_master ? 'You have served as master on ' : 'To serve as master on '}
        {names}, the Workboat Code needs at least this certificate, taken in a high-speed vessel (Ed. 3, Table A5.1
        Note F). The MCA can accept a qualification of equal standing (Note 1).
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={() => onAdd('powerboat_advanced')}
        disabled={saving}
        accessibilityRole="button"
      >
        {saving ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.buttonText}>I hold it</Text>}
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 16,
      padding: 16,
      marginHorizontal: 16,
      marginTop: 16,
      borderWidth: 1,
      borderColor: colors.warning,
    },
    heading: {
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
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
    button: {
      marginTop: 12,
      alignSelf: 'flex-start',
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    buttonText: {
      color: colors.white,
      fontWeight: '600',
      fontSize: 14,
    },
  });
