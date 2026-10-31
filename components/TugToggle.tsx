import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, Alert, TouchableOpacity, useColorScheme } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { getUserProfile, updateVesselTug } from '@/utils/seaTimeApi';
import { error as logError } from '@/utils/log';

export type TugCapacity = 'rating' | 'officer' | 'cadet';

interface Props {
  vesselId: string;
  isTug: boolean | null | undefined;
  tugCapacity: TugCapacity | string | null | undefined;
  /** Called with the saved values so the screen can refresh its totals. */
  onChange: (isTug: boolean, tugCapacity: TugCapacity | null) => void;
}

const CAPACITIES: { value: TugCapacity; label: string }[] = [
  { value: 'rating', label: 'Rating' },
  { value: 'officer', label: 'Officer' },
  { value: 'cadet', label: 'Cadet' },
];

const asCapacity = (v: unknown): TugCapacity | null =>
  v === 'rating' || v === 'officer' || v === 'cadet' ? v : null;

/**
 * Lets the user mark a vessel as a tug. Deck service on it then counts as tug
 * service toward the MGN 495 tug ratings and tug officer CoCs. AIS cannot
 * reliably say a vessel is a tug, so it is off until the user turns it on.
 * Shown only to MCA deck crew working in the commercial sector.
 */
export function TugToggle({ vesselId, isTug, tugCapacity, onChange }: Props) {
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState(isTug === true);
  const [capacity, setCapacity] = useState<TugCapacity | null>(asCapacity(tugCapacity));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getUserProfile()
      .then((p) => {
        const authority = p?.maritime_authority ?? 'mca';
        const engineering = p?.department?.toLowerCase() === 'engineering';
        setVisible(authority === 'mca' && p?.vessel_sector === 'commercial' && !engineering);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setValue(isTug === true);
  }, [isTug]);

  useEffect(() => {
    setCapacity(asCapacity(tugCapacity));
  }, [tugCapacity]);

  // Keep the switch visible on a vessel already marked, so it can be turned off.
  if (!visible && !value) return null;

  const save = async (next: boolean, nextCapacity: TugCapacity | null = capacity) => {
    const before = { value, capacity };
    setValue(next);
    setCapacity(nextCapacity);
    setSaving(true);
    try {
      await updateVesselTug(vesselId, next, nextCapacity);
      onChange(next, nextCapacity);
    } catch (e: any) {
      logError('[TugToggle] Save failed:', e?.message || e);
      setValue(before.value);
      setCapacity(before.capacity);
      Alert.alert('Not saved', 'Could not update this vessel. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.textWrap}>
          <Text style={styles.title}>Tug</Text>
          <Text style={styles.body}>
            Turn on if this vessel is a tug. Your deck service on it, including days already logged, then counts as
            tug service toward the tug ratings and tug officer certificates (MGN 495).
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
        <>
          <Text style={styles.label}>Your usual capacity on this tug</Text>
          <View style={styles.segment}>
            {CAPACITIES.map((c) => {
              const selected = capacity === c.value;
              return (
                <TouchableOpacity
                  key={c.value}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => save(true, selected ? null : c.value)}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.note}>
            Used for days logged without a rank, such as AIS passages. A rank set on an entry always wins, so set it
            on the days you served differently. Log bridge watches as watchkeeping service, or add the watch hours,
            so they count toward the master certificates.
          </Text>
        </>
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
    label: {
      fontSize: 13,
      fontWeight: '600',
      marginTop: 14,
      marginBottom: 8,
      color: isDark ? colors.text : colors.textLight,
    },
    segment: {
      flexDirection: 'row',
      gap: 8,
    },
    option: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 10,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    optionSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    optionText: {
      fontSize: 14,
      color: isDark ? colors.text : colors.textLight,
    },
    optionTextSelected: {
      color: '#FFFFFF',
      fontWeight: '600',
    },
    note: {
      fontSize: 13,
      lineHeight: 18,
      marginTop: 12,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
  });
