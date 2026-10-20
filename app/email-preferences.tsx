import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
  useColorScheme,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import * as seaTimeApi from '@/utils/seaTimeApi';
import { error as logError } from '@/utils/log';

/** Settings > Email preferences: the user's marketing email opt-in. */
export default function EmailPreferencesScreen() {
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [optedIn, setOptedIn] = useState(false);

  useEffect(() => {
    seaTimeApi
      .getMarketingConsent()
      .then((c) => setOptedIn(!!c.marketing_consent))
      .catch((e) => logError('[EmailPreferences] Failed to load consent:', e))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (value: boolean) => {
    const previous = optedIn;
    setOptedIn(value);
    setSaving(true);
    try {
      await seaTimeApi.setMarketingConsent(value, 'settings');
    } catch (e) {
      logError('[EmailPreferences] Failed to save consent:', e);
      setOptedIn(previous);
      Alert.alert('Not saved', 'Your email preference could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>Tips and offers</Text>
            <Text style={styles.description}>
              Occasional emails about new features, sea-time tips and offers.
            </Text>
          </View>
          <Switch
            value={optedIn}
            onValueChange={handleToggle}
            disabled={saving}
            trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
            thumbColor={optedIn ? colors.switchThumbOn : colors.switchThumbOff}
          />
        </View>
      </View>
      <Text style={styles.footnote}>
        Account and service emails, such as password resets and receipts, are always sent. Every
        tips and offers email also has an unsubscribe link.
      </Text>
    </ScrollView>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    center: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    content: {
      padding: 20,
    },
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      gap: 12,
    },
    rowText: {
      flex: 1,
    },
    label: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
    },
    description: {
      fontSize: 14,
      marginTop: 4,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    footnote: {
      fontSize: 13,
      lineHeight: 18,
      marginTop: 12,
      paddingHorizontal: 4,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
  });
