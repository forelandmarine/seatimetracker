import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { getUserProfile } from '@/utils/seaTimeApi';
import { scheduleNoVesselReminder, cancelNoVesselReminder } from '@/utils/notifications';
import { log } from '@/utils/log';

const FIRST_SEEN_KEY = 'no_vessel_first_seen_at';
const AUTO_OPENED_KEY = 'first_vessel_prompt_shown';
const REMINDER_SCHEDULED_KEY = 'no_vessel_reminder_scheduled';
const REMINDER_DELAY_MS = 24 * 3_600_000;

/**
 * Makes adding a vessel the first thing a new user does: opens the Add Vessel
 * form once on the first home visit with no vessels, and schedules a single
 * reminder 24 hours later if there is still no vessel. Cancels the reminder
 * as soon as a vessel exists.
 */
export function useFirstVesselPrompt(
  vesselCount: number,
  loaded: boolean,
  openAddVessel: () => void
) {
  const ran = useRef(false);

  useEffect(() => {
    if (!loaded) return;
    if (vesselCount > 0) {
      cancelNoVesselReminder();
      return;
    }
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        if ((await AsyncStorage.getItem(AUTO_OPENED_KEY)) !== 'true') {
          await AsyncStorage.setItem(AUTO_OPENED_KEY, 'true');
          log('[VesselSetup] First visit with no vessel, opening Add Vessel');
          openAddVessel();
        }

        let firstSeen = Number(await AsyncStorage.getItem(FIRST_SEEN_KEY));
        if (!firstSeen) {
          firstSeen = Date.now();
          await AsyncStorage.setItem(FIRST_SEEN_KEY, String(firstSeen));
        }
        if ((await AsyncStorage.getItem(REMINDER_SCHEDULED_KEY)) !== 'true') {
          await AsyncStorage.setItem(REMINDER_SCHEDULED_KEY, 'true');
          await scheduleNoVesselReminder(new Date(firstSeen + REMINDER_DELAY_MS));
        }
      } catch {
        // Storage unavailable: skip the prompt rather than nag every visit.
      }
    })();
  }, [vesselCount, loaded, openAddVessel]);
}

interface Props {
  onAddVessel: () => void;
}

/** First-run card shown on Home while the user has no vessel. */
export function VesselSetupCard({ onAddVessel }: Props) {
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const [authority, setAuthority] = useState<string | null>(null);

  useEffect(() => {
    getUserProfile()
      .then((p) => setAuthority(p?.maritime_authority ?? null))
      .catch(() => {});
  }, []);

  return (
    <View style={styles.card}>
      <Text style={styles.step}>STEP 1</Text>
      <Text style={styles.title}>Add your vessel</Text>
      <Text style={styles.body}>
        SeaTime Tracker logs your sea time from your vessel&apos;s AIS signal. Enter its 9-digit
        MMSI and passages are recorded automatically.
      </Text>

      <View style={styles.note}>
        <IconSymbol
          ios_icon_name="antenna.radiowaves.left.and.right"
          android_material_icon_name="settings-input-antenna"
          size={18}
          color={isDark ? colors.text : colors.secondary}
        />
        <View style={styles.noteTextWrap}>
          <Text style={styles.noteTitle}>Your vessel must transmit AIS</Text>
          <Text style={styles.noteBody}>
            {authority === 'uscg'
              ? 'Many smaller US vessels have a VHF radio with an MMSI but no AIS transmitter, so automatic tracking will not find them. '
              : 'Automatic tracking only works for vessels with an AIS transmitter. '}
            No AIS? Add the vessel using the MMSI from its radio licence, then log passages by hand
            or with your phone&apos;s GPS from the vessel screen.
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.button} onPress={onAddVessel}>
        <Text style={styles.buttonText}>Add your vessel</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 16,
      padding: 20,
      marginHorizontal: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    step: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1.2,
      color: colors.primary,
      marginBottom: 4,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    body: {
      fontSize: 15,
      lineHeight: 21,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 16,
    },
    note: {
      flexDirection: 'row',
      gap: 10,
      padding: 12,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(0, 119, 190, 0.18)' : 'rgba(0, 119, 190, 0.08)',
      marginBottom: 16,
    },
    noteTextWrap: {
      flex: 1,
    },
    noteTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 4,
    },
    noteBody: {
      fontSize: 13,
      lineHeight: 18,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
  });
