import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { formatHoursMinutes } from '@/utils/entryNotes';

/**
 * Review tab section for live passages still being checked against the AIS track
 * (status 'checking', backend passage refinement). Shared by confirmations.tsx and
 * confirmations.ios.tsx. They can't be confirmed until the check releases them as
 * pending, but they can be rejected (for example when the user wasn't on board).
 */

export interface CheckingEntry {
  id: string;
  status?: string;
  vessel: { vessel_name: string } | null;
  start_time: string;
  end_time: string | null;
  duration_hours: number | string | null;
}

export const isChecking = (entry: { status?: string }) => entry.status === 'checking';

const toNumber = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? 0 : n;
};

const formatStart = (iso: string) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date} at ${time}`;
};

const formatSoFar = (hours: number) => {
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const rest = Math.round(hours % 24);
    return `${days} ${days === 1 ? 'day' : 'days'}${rest ? `, ${rest}h` : ''}`;
  }
  return formatHoursMinutes(hours);
};

export function CheckingPassages({
  entries,
  isDark,
  processingId,
  disabled,
  onReject,
}: {
  entries: CheckingEntry[];
  isDark: boolean;
  processingId: string | null;
  disabled?: boolean;
  onReject: (id: string) => void;
}) {
  if (entries.length === 0) return null;
  const text = isDark ? colors.text : colors.textLight;
  const muted = isDark ? colors.textSecondary : colors.textSecondaryLight;
  const border = isDark ? colors.border : colors.borderLight;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <IconSymbol ios_icon_name="location.magnifyingglass" android_material_icon_name="travel-explore" size={18} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: text }]}>Checking against AIS track</Text>
      </View>
      <Text style={[styles.sectionHint, { color: muted }]}>
        {entries.length === 1 ? 'This passage is' : 'These passages are'} still being tracked. Once the vessel has stopped,
        the start and end times are checked against the AIS track, usually within an hour of arrival. You can confirm
        {entries.length === 1 ? ' it' : ' them'} after that.
      </Text>

      {entries.map((entry) => {
        const busy = processingId === entry.id;
        const hours = toNumber(entry.duration_hours);
        return (
          <View
            key={entry.id}
            style={[styles.card, { backgroundColor: isDark ? colors.cardBackground : colors.card, borderColor: border }]}
          >
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.vessel, { color: text }]}>{entry.vessel?.vessel_name || 'Unknown Vessel'}</Text>
                <Text style={[styles.date, { color: muted }]}>Started {formatStart(entry.start_time)}</Text>
              </View>
              <View style={styles.chip}>
                <ActivityIndicator size="small" color={colors.primary} style={{ transform: [{ scale: 0.7 }] }} />
                <Text style={styles.chipText}>Checking</Text>
              </View>
            </View>
            {hours > 0 && (
              <Text style={[styles.soFar, { color: muted }]}>{formatSoFar(hours)} so far</Text>
            )}
            <View style={[styles.confirmDisabled, { borderColor: border }]}>
              <Text style={[styles.confirmDisabledText, { color: muted }]}>Confirm after the check</Text>
            </View>
            <TouchableOpacity
              style={[styles.reject, (busy || disabled) && { opacity: 0.5 }]}
              onPress={() => onReject(entry.id)}
              disabled={busy || disabled}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <Text style={styles.rejectText}>Not on board? Reject</Text>
              )}
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  sectionHint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  card: { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  vessel: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  date: { fontSize: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '20',
    borderRadius: 6,
    paddingRight: 10,
    paddingVertical: 2,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  soFar: { fontSize: 13, marginTop: 8 },
  confirmDisabled: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmDisabledText: { fontSize: 15, fontWeight: '600' },
  reject: { paddingTop: 12, alignItems: 'center' },
  rejectText: { color: colors.error, fontSize: 14, fontWeight: '600' },
});
