import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, Alert, useColorScheme } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { getUserProfile, updateVesselSoleWatchkeeper } from '@/utils/seaTimeApi';
import { error as logError } from '@/utils/log';

interface Props {
  vesselId: string;
  isSoleWatchkeeper: boolean | null | undefined;
  /** Called with the saved value so the screen can refresh its totals. */
  onChange: (isSoleWatchkeeper: boolean) => void;
}

// Authorities whose progress bars carry a separate watchkeeping figure.
const WATCHKEEPING_AUTHORITIES = new Set(['mca', 'mnz', 'samsa']);

/**
 * Lets the user say they are the only watchkeeper in their department on a
 * vessel, a sole engineer for example. Every day at sea they are the
 * watchkeeper, so each sea service day on it also counts as a watchkeeping
 * day. The app cannot see the crew list, so it is off until the user turns it
 * on. Hidden for authorities with no watchkeeping figure (USCG, AMSA).
 */
export function SoleWatchToggle({ vesselId, isSoleWatchkeeper, onChange }: Props) {
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const [authority, setAuthority] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const [value, setValue] = useState(isSoleWatchkeeper === true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getUserProfile()
      .then((p) => {
        setAuthority(p?.maritime_authority ?? 'mca');
        setDepartment(p?.department ?? null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setValue(isSoleWatchkeeper === true);
  }, [isSoleWatchkeeper]);

  if (!authority || !WATCHKEEPING_AUTHORITIES.has(authority)) return null;

  const role = department?.toLowerCase() === 'engineering' ? 'engineer' : 'watchkeeper on the bridge';

  const save = async (next: boolean) => {
    setValue(next);
    setSaving(true);
    try {
      await updateVesselSoleWatchkeeper(vesselId, next);
      onChange(next);
    } catch (e: any) {
      logError('[SoleWatchToggle] Save failed:', e?.message || e);
      setValue(!next);
      Alert.alert('Not saved', 'Could not update this vessel. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmOn = (next: boolean) => {
    if (!next) {
      save(false);
      return;
    }
    Alert.alert(
      'Sole watchkeeper?',
      `Only turn this on if you are the only ${role} on board, so you keep the watch every day at sea. Every sea service day on this vessel will also count as a watchkeeping day, including days already logged.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Turn on', onPress: () => save(true) },
      ]
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.textWrap}>
          <Text style={styles.title}>Sole watchkeeper</Text>
          <Text style={styles.body}>
            If you are the only {role} on this vessel, every day at sea is also a day of watchkeeping.
          </Text>
        </View>
        <Switch
          value={value}
          onValueChange={confirmOn}
          disabled={saving}
          trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
          thumbColor={value ? colors.switchThumbOn : colors.switchThumbOff}
        />
      </View>
      {value && (
        <Text style={styles.note}>
          Ask the master to state on your testimonial or sea service letter that you were the sole {role} and kept
          the watch each day at sea.
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
