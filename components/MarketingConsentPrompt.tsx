import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { getMarketingConsent, setMarketingConsent } from '@/utils/seaTimeApi';
import { error as logError } from '@/utils/log';

interface Props {
  /** Hold the prompt back (e.g. while the first-run Add Vessel form is open). */
  enabled: boolean;
  /** Called once it is known there is nothing to ask, or the user has answered. */
  onSettled?: () => void;
}

/**
 * One-time in-app question for users who have never been asked about
 * marketing email (consent date is null). Both answers are recorded, so it
 * is not shown again. Hidden if the server does not support consent yet.
 */
export function MarketingConsentPrompt({ enabled, onSettled }: Props) {
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const [neverAsked, setNeverAsked] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getMarketingConsent()
      .then((c) => {
        if (cancelled) return;
        if (c && 'consented_at' in c && c.consented_at === null) setNeverAsked(true);
        else onSettled?.();
      })
      .catch(() => {
        if (!cancelled) onSettled?.();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const answer = async (optIn: boolean) => {
    setSaving(true);
    try {
      await setMarketingConsent(optIn, 'prompt');
    } catch (e) {
      logError('[MarketingConsentPrompt] Failed to save answer:', e);
    } finally {
      setSaving(false);
      setNeverAsked(false);
      onSettled?.();
    }
  };

  return (
    <Modal visible={enabled && neverAsked} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Tips and offers by email?</Text>
          <Text style={styles.body}>
            Now and then we send short emails about new features, sea-time tips and offers. Would
            you like them? You can change this any time in Settings.
          </Text>
          <TouchableOpacity
            style={[styles.button, styles.primary]}
            onPress={() => answer(true)}
            disabled={saving}
          >
            <Text style={styles.primaryText}>Yes, send me emails</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.secondary]}
            onPress={() => answer(false)}
            disabled={saving}
          >
            <Text style={styles.secondaryText}>No thanks</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      padding: 24,
    },
    sheet: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 16,
      padding: 24,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    body: {
      fontSize: 15,
      lineHeight: 21,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 20,
    },
    button: {
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primary: {
      backgroundColor: colors.primary,
      marginBottom: 10,
    },
    primaryText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    secondary: {
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    secondaryText: {
      color: isDark ? colors.text : colors.textLight,
      fontSize: 16,
      fontWeight: '600',
    },
  });
