import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, Alert, useColorScheme } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { getUserProfile, updateVesselHighSpeed } from '@/utils/seaTimeApi';
import { error as logError } from '@/utils/log';

interface Props {
  vesselId: string;
  /** null until the user answers, so the card can ask. */
  isHighSpeed: boolean | null | undefined;
  /** Called with the saved value so the screen can refresh its totals. */
  onChange: (isHighSpeed: boolean) => void;
}

/**
 * Lets the user mark a vessel as a high-speed craft used in planing mode. What
 * the rules tie to it:
 * - Workboat Code Ed. 3 Table A5.1 Note F: the master of a vessel used for High
 *   Speed and Planing Mode Operations (25.4) "must have a minimum of an RYA/MCA
 *   Advanced Powerboat Certificate", done in a high-speed vessel. The
 *   Certificates screen then shows it as needed.
 * - MSN 1853 Annex 5 Table C: deck service on a fast craft counts toward the
 *   Boatmasters' Licence fast craft endorsement.
 * AIS cannot say a vessel planes, so it stays unset until the user answers; while
 * unset the card asks. Shown only to MCA crew in the commercial sector.
 */
export function HighSpeedToggle({ vesselId, isHighSpeed, onChange }: Props) {
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState(isHighSpeed === true);
  const [answered, setAnswered] = useState(isHighSpeed != null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getUserProfile()
      .then((p) => {
        const authority = p?.maritime_authority ?? 'mca';
        setVisible(authority === 'mca' && p?.vessel_sector === 'commercial');
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setValue(isHighSpeed === true);
    setAnswered(isHighSpeed != null);
  }, [isHighSpeed]);

  // Keep the switch visible on a vessel already marked, so it can be turned off.
  if (!visible && !value) return null;

  const save = async (next: boolean) => {
    const before = { value, answered };
    setValue(next);
    setAnswered(true);
    setSaving(true);
    try {
      await updateVesselHighSpeed(vesselId, next);
      onChange(next);
    } catch (e: any) {
      logError('[HighSpeedToggle] Save failed:', e?.message || e);
      setValue(before.value);
      setAnswered(before.answered);
      Alert.alert('Not saved', 'Could not update this vessel. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.card, !answered && styles.cardAsk]}>
      <View style={styles.row}>
        <View style={styles.textWrap}>
          <Text style={styles.title}>{answered ? 'High-speed craft' : 'Is this a high-speed craft?'}</Text>
          <Text style={styles.body}>
            Turn on if this vessel works at high speed in planing mode, such as a fast CTV, RIB or pilot boat. The
            master then needs at least the RYA/MCA Advanced Powerboat Certificate, taken in a high-speed vessel
            (Workboat Code Ed. 3, Table A5.1 Note F), and your deck service on it counts toward the Boatmasters&apos;
            Licence fast craft endorsement (MSN 1853).
          </Text>
        </View>
        <Switch
          value={value}
          onValueChange={save}
          disabled={saving}
          trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
          thumbColor={value ? colors.switchThumbOn : colors.switchThumbOff}
        />
      </View>
      {value && (
        <Text style={styles.note}>
          If the vessel is certified under the High Speed Craft Code, masters and officers with an operational role
          also need a type rating certificate for it (MSN 1868 8.4). Add it on the Certificates screen.
        </Text>
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
    cardAsk: {
      borderColor: colors.primary,
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
    note: {
      fontSize: 13,
      lineHeight: 18,
      marginTop: 12,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
  });
