import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/styles/commonStyles';
import type { CertificateRevalidation } from '@/utils/certificatesApi';

const ROUTE_LABELS: Record<string, string> = {
  five_years: 'Last 5 years',
  six_months: 'Last 6 months',
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Revalidation guidance on a CoC card: logged service against each route the
 * notice allows, from the user's confirmed sea time. Guidance only; the MCA
 * decides on the evidence sent with the application.
 */
export function RevalidationPanel({ data, isDark }: { data: CertificateRevalidation; isDark: boolean }) {
  const styles = createStyles(isDark);
  const unranked = Math.max(0, ...data.routes.map((r) => r.unranked_days));
  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>
        Revalidation sea service <Text style={styles.notice}>({data.notice})</Text>
      </Text>
      {data.routes.map((r) => {
        const pct = Math.min(1, r.required ? r.days / r.required : 0);
        const done = r.days >= r.required;
        return (
          <View key={r.key} style={styles.route}>
            <View style={styles.routeRow}>
              <Text style={styles.routeLabel}>{ROUTE_LABELS[r.key] ?? r.key}</Text>
              <Text style={[styles.routeValue, done && { color: colors.success }]}>
                {fmt(r.days)} / {r.required} days
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: done ? colors.success : colors.primary }]} />
            </View>
          </View>
        );
      })}
      <Text style={styles.note}>{data.counts}.</Text>
      {unranked > 0 && (
        <Text style={styles.warn}>
          {unranked} more {unranked === 1 ? 'day has' : 'days have'} no rank recorded. Set the rank on those entries to count them.
        </Text>
      )}
      {data.keeps_anniversary && !data.met && (
        <Text style={styles.warn}>Within 6 months of expiry: apply now to keep your current anniversary date.</Text>
      )}
      {data.keeps_anniversary && data.met && (
        <Text style={styles.ok}>Service requirement met. Applying now keeps your current anniversary date.</Text>
      )}
      {data.rule !== 'bml' && data.rule !== 'bml_tier2' && data.rule !== 'workboat' && (
        <Text style={styles.note}>30 months in an acceptable shore occupation also counts (MSN 1861 3.6). Masters need a company letter.</Text>
      )}
    </View>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    panel: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: isDark ? colors.border : colors.borderLight,
    },
    heading: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 6,
    },
    notice: {
      fontWeight: '400',
      color: colors.textSecondary,
    },
    route: {
      marginBottom: 6,
    },
    routeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 3,
    },
    routeLabel: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    routeValue: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
    },
    track: {
      height: 5,
      borderRadius: 3,
      backgroundColor: isDark ? colors.border : colors.borderLight,
      overflow: 'hidden',
    },
    fill: {
      height: 5,
      borderRadius: 3,
    },
    note: {
      fontSize: 11,
      lineHeight: 15,
      color: colors.textSecondary,
      marginTop: 4,
    },
    warn: {
      fontSize: 11,
      lineHeight: 15,
      color: '#B26A00',
      marginTop: 4,
    },
    ok: {
      fontSize: 11,
      lineHeight: 15,
      color: colors.success,
      marginTop: 4,
    },
  });
