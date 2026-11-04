import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, Alert, useColorScheme } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { getUserProfile, updateVesselBoatmaster } from '@/utils/seaTimeApi';
import { error as logError } from '@/utils/log';

export interface BoatmasterVesselSettings {
  default_trade_area: 'inland' | null;
  is_passenger: boolean;
}

interface Props {
  vesselId: string;
  defaultTradeArea: string | null | undefined;
  isPassenger: boolean | null | undefined;
  /** Called with the saved values so the screen can refresh its totals. */
  onChange: (settings: BoatmasterVesselSettings) => void;
}

/**
 * Boatmasters' Licence settings for a vessel (MSN 1853):
 * - Inland waters by default: entries logged without a trade area (shifts,
 *   manual days, boats with no AIS) are taken as Inland, so they count toward
 *   Tier 1 Level 2. A trade area set on an entry always wins.
 * - Passenger vessel: deck service on it counts toward the passenger endorsement.
 * Shown only to MCA crew in the commercial sector.
 */
export function BoatmasterVesselCard({ vesselId, defaultTradeArea, isPassenger, onChange }: Props) {
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const [visible, setVisible] = useState(false);
  const [inland, setInland] = useState(defaultTradeArea === 'inland');
  const [passenger, setPassenger] = useState(isPassenger === true);
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
    setInland(defaultTradeArea === 'inland');
  }, [defaultTradeArea]);

  useEffect(() => {
    setPassenger(isPassenger === true);
  }, [isPassenger]);

  // Keep the card visible on a vessel already set, so it can be turned off.
  if (!visible && !inland && !passenger) return null;

  const save = async (next: BoatmasterVesselSettings) => {
    const before = { inland, passenger };
    setInland(next.default_trade_area === 'inland');
    setPassenger(next.is_passenger);
    setSaving(true);
    try {
      await updateVesselBoatmaster(vesselId, next);
      onChange(next);
    } catch (e: any) {
      logError('[BoatmasterVesselCard] Save failed:', e?.message || e);
      setInland(before.inland);
      setPassenger(before.passenger);
      Alert.alert('Not saved', 'Could not update this vessel. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const current: BoatmasterVesselSettings = { default_trade_area: inland ? 'inland' : null, is_passenger: passenger };

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Boatmasters&apos; Licence</Text>
      <View style={styles.row}>
        <View style={styles.textWrap}>
          <Text style={styles.title}>Inland waters by default</Text>
          <Text style={styles.body}>
            Turn on if this vessel works on rivers, canals or harbours. Days logged on it without a trade area,
            including days already logged, then count as Inland toward the Boatmasters&apos; Licence, even without
            AIS. A trade area set on an entry always wins.
          </Text>
        </View>
        <Switch
          value={inland}
          onValueChange={(v) => save({ ...current, default_trade_area: v ? 'inland' : null })}
          disabled={saving}
          trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
          thumbColor={inland ? colors.switchThumbOn : colors.switchThumbOff}
        />
      </View>
      <View style={[styles.row, styles.rowGap]}>
        <View style={styles.textWrap}>
          <Text style={styles.title}>Passenger vessel</Text>
          <Text style={styles.body}>
            Turn on if this vessel carries passengers. Your deck service on it then counts toward the passenger
            endorsement. Mark towing and pushing vessels with the Tug switch.
          </Text>
        </View>
        <Switch
          value={passenger}
          onValueChange={(v) => save({ ...current, is_passenger: v })}
          disabled={saving}
          trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
          thumbColor={passenger ? colors.switchThumbOn : colors.switchThumbOff}
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
      margin: 16,
      marginBottom: 0,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    heading: {
      fontSize: 13,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 10,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    rowGap: {
      marginTop: 14,
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
  });
