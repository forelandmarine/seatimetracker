import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, Alert, useColorScheme } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { getUserProfile, updateVesselTwoWatch } from '@/utils/seaTimeApi';
import { error as logError } from '@/utils/log';

interface Props {
  vesselId: string;
  isTwoWatch: boolean | null | undefined;
  /** Called with the saved value so the screen can refresh its totals. */
  onChange: (isTwoWatch: boolean) => void;
}

/**
 * USCG only: lets the user say a vessel is authorised to run a two-watch
 * system (46 U.S.C. 8104, 46 CFR 15.705). On such a vessel a 12-hour working
 * day counts as 1.5 days (46 CFR 10.107). The app cannot see a vessel's
 * authorisation, so it is off until the user turns it on. Hidden for every
 * other authority, which has no such rule.
 */
export function TwoWatchToggle({ vesselId, isTwoWatch, onChange }: Props) {
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const [authority, setAuthority] = useState<string | null>(null);
  const [value, setValue] = useState(isTwoWatch === true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getUserProfile()
      .then((p) => setAuthority(p?.maritime_authority ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setValue(isTwoWatch === true);
  }, [isTwoWatch]);

  if (authority !== 'uscg') return null;

  const save = async (next: boolean) => {
    setValue(next);
    setSaving(true);
    try {
      await updateVesselTwoWatch(vesselId, next);
      onChange(next);
    } catch (e: any) {
      logError('[TwoWatchToggle] Save failed:', e?.message || e);
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
      'Two-watch vessel?',
      'Only turn this on if the vessel is allowed to run two watches, for example a towing vessel, an OSV or a barge on voyages under 600 miles, or a vessel whose Certificate of Inspection allows it. The National Maritime Center checks this when you apply.',
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
          <Text style={styles.title}>Two-watch vessel</Text>
          <Text style={styles.body}>
            On a vessel allowed to run two watches, a working day of 12 hours or more counts as 1.5 days of
            USCG sea service (46 CFR 10.107).
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
          Keep evidence that the vessel holds two-watch authorisation, such as its Certificate of Inspection. Your
          sea service letter should show the hours worked each day.
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
