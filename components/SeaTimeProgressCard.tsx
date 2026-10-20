import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { getReportSummary, getUserProfile, getPendingEntries } from '@/utils/seaTimeApi';
import { headlineSeaDays } from '@/utils/seaDayTotals';
import { schedulePendingPassagesReminder } from '@/utils/notifications';
import { useGlobalRefresh } from '@/hooks/useGlobalRefresh';
import { error as logError } from '@/utils/log';

/**
 * Home card showing the confirmed sea-day total (the same figure as the report)
 * and how many AIS passages are waiting to be confirmed. Also keeps the weekly
 * "passages to confirm" reminder in step with the pending count.
 */
export function SeaTimeProgressCard() {
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const router = useRouter();
  const [seaDays, setSeaDays] = useState<number | null>(null);
  const [pending, setPending] = useState(0);

  const load = useCallback(async () => {
    try {
      const [summary, profile, pendingEntries] = await Promise.all([
        getReportSummary().catch(() => null),
        getUserProfile().catch(() => null),
        getPendingEntries().catch(() => null),
      ]);
      setSeaDays(headlineSeaDays(summary, profile?.maritime_authority));
      if (Array.isArray(pendingEntries)) {
        setPending(pendingEntries.length);
        schedulePendingPassagesReminder(pendingEntries.length);
      }
    } catch (error) {
      logError('[SeaTimeProgressCard] Failed to load:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useGlobalRefresh(load);

  if (seaDays == null) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>CONFIRMED SEA DAYS</Text>
      <Text style={styles.total}>{seaDays}</Text>
      {pending > 0 && (
        <TouchableOpacity
          style={styles.pendingRow}
          onPress={() => router.push('/(tabs)/confirmations')}
        >
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>{pending}</Text>
          </View>
          <Text style={styles.pendingText}>
            {pending === 1 ? 'passage' : 'passages'} to confirm. They only count once confirmed.
          </Text>
          <IconSymbol
            ios_icon_name="chevron.right"
            android_material_icon_name="chevron-right"
            size={18}
            color={isDark ? colors.textSecondary : colors.textSecondaryLight}
          />
        </TouchableOpacity>
      )}
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
    label: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1.2,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    total: {
      fontSize: 44,
      fontWeight: '800',
      color: colors.primary,
      marginTop: 2,
    },
    pendingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? colors.border : colors.borderLight,
    },
    pendingBadge: {
      minWidth: 28,
      height: 28,
      borderRadius: 14,
      paddingHorizontal: 8,
      backgroundColor: colors.warning,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pendingBadgeText: {
      color: '#1A1A1A',
      fontWeight: '700',
      fontSize: 14,
    },
    pendingText: {
      flex: 1,
      fontSize: 14,
      color: isDark ? colors.text : colors.textLight,
    },
  });
