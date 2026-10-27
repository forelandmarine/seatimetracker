import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import * as seaTimeApi from '@/utils/seaTimeApi';
import { formatHoursMinutes } from '@/utils/entryNotes';

/**
 * Bulk accept / reject for the Review tab. Shared by confirmations.tsx and
 * confirmations.ios.tsx. The selection goes to POST /api/sea-time/bulk in one
 * request (one per entry on older backends); any that fail stay selected and
 * the reason is reported.
 */

export type BulkServiceType = 'actual_sea_service' | 'watchkeeping_service';

export interface BulkEntry {
  id: string;
  vessel: { vessel_name: string } | null;
  start_time: string;
  end_time: string | null;
  duration_hours: number | string | null;
}

const toNumber = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? 0 : n;
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Vessel names, date span and total time for the confirm/reject popups. */
export function summarise(entries: BulkEntry[]): string {
  if (entries.length === 0) return '';
  const vessels = Array.from(new Set(entries.map((e) => e.vessel?.vessel_name || 'Unknown vessel')));
  const starts = entries.map((e) => new Date(e.start_time).getTime());
  const ends = entries.map((e) => new Date(e.end_time || e.start_time).getTime());
  const first = new Date(Math.min(...starts)).toISOString();
  const last = new Date(Math.max(...ends)).toISOString();
  const span = shortDate(first) === shortDate(last) ? shortDate(first) : `${shortDate(first)} to ${shortDate(last)}`;
  const total = entries.reduce((sum, e) => sum + toNumber(e.duration_hours), 0);
  const vesselText = vessels.length <= 2 ? vessels.join(', ') : `${vessels.length} vessels`;
  return `${vesselText} · ${span}\n${formatHoursMinutes(total)} in total`;
}

/** Pulls the backend's message out of "Failed ...: 400 - {message}" style errors. */
export function backendMessage(error: any): string {
  let message: string = error?.message || 'Unknown error';
  const parts = message.split(' - ');
  if (parts.length > 1) message = parts.slice(1).join(' - ');
  try {
    const parsed = JSON.parse(message);
    if (parsed?.error) message = parsed.error;
  } catch {
    // not JSON
  }
  return message;
}

export function useBulkSelection<T extends { id: string }>(entries: T[]) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Drop ids that are no longer pending (confirmed, rejected or refreshed away).
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(entries.map((e) => e.id));
      const next = new Set(Array.from(prev).filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
    if (entries.length === 0) setSelecting(false);
  }, [entries]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = entries.length > 0 && selected.size === entries.length;
  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(entries.map((e) => e.id)));
  }, [allSelected, entries]);

  const start = useCallback(() => setSelecting(true), []);
  const cancel = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);

  const selectedEntries = useMemo(() => entries.filter((e) => selected.has(e.id)), [entries, selected]);

  return { selecting, selected, selectedEntries, toggle, toggleAll, allSelected, start, cancel, setSelected };
}

type Outcome = { done: number; failed: { id: string; message: string }[] };

async function runEach(ids: string[], action: (id: string) => Promise<unknown>): Promise<Outcome> {
  const failed: Outcome['failed'] = [];
  let done = 0;
  for (const id of ids) {
    try {
      await action(id);
      done += 1;
    } catch (error: any) {
      failed.push({ id, message: backendMessage(error) });
    }
  }
  return { done, failed };
}

function reportOutcome(verb: 'confirmed' | 'rejected', outcome: Outcome) {
  const { done, failed } = outcome;
  const noun = (n: number) => (n === 1 ? 'entry' : 'entries');
  if (failed.length === 0) {
    Alert.alert(`${done} ${noun(done)} ${verb}`);
    return;
  }
  const reasons = Array.from(new Set(failed.map((f) => f.message))).slice(0, 3).join('\n');
  Alert.alert(
    `${done} ${verb}, ${failed.length} not ${verb}`,
    `The ${failed.length === 1 ? 'one' : 'ones'} that didn't go through are still selected.\n\n${reasons}`
  );
}

/**
 * One request for the whole selection; backends older than 2.4.0 have no bulk
 * endpoint, so fall back to one request per entry there.
 */
async function runBulk(ids: string[], action: 'confirm' | 'reject', serviceType?: BulkServiceType): Promise<Outcome> {
  try {
    const res = await seaTimeApi.bulkUpdateSeaTimeEntries(ids, action, serviceType);
    if (res) return { done: res.done.length, failed: res.failed.map((f) => ({ id: f.id, message: f.error })) };
  } catch (error: any) {
    return { done: 0, failed: ids.map((id) => ({ id, message: backendMessage(error) })) };
  }
  return runEach(ids, (id) =>
    action === 'confirm' ? seaTimeApi.confirmSeaTimeEntry(id, serviceType) : seaTimeApi.rejectSeaTimeEntry(id)
  );
}

export async function bulkConfirm(ids: string[], serviceType: BulkServiceType) {
  const outcome = await runBulk(ids, 'confirm', serviceType);
  reportOutcome('confirmed', outcome);
  return outcome;
}

export async function bulkReject(ids: string[]) {
  const outcome = await runBulk(ids, 'reject');
  reportOutcome('rejected', outcome);
  return outcome;
}

/** Native destructive confirm for Reject N, then runs the rejections. */
export function askBulkReject(entries: BulkEntry[], onRun: () => Promise<void>) {
  const n = entries.length;
  Alert.alert(
    `Reject ${n} ${n === 1 ? 'entry' : 'entries'}?`,
    `${summarise(entries)}\n\nRejected entries won't count towards your sea time. You can't undo this.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: `Reject ${n}`, style: 'destructive', onPress: () => { onRun(); } },
    ]
  );
}

export function SelectToggle({ isDark, onPress }: { isDark: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button">
      <Text style={[shared.link, { color: colors.primary }]}>Select</Text>
    </TouchableOpacity>
  );
}

export function SelectionHeader({
  isDark,
  count,
  allSelected,
  onCancel,
  onToggleAll,
}: {
  isDark: boolean;
  count: number;
  allSelected: boolean;
  onCancel: () => void;
  onToggleAll: () => void;
}) {
  return (
    <View style={shared.selectionHeader}>
      <TouchableOpacity onPress={onCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={[shared.link, { color: colors.primary }]}>Cancel</Text>
      </TouchableOpacity>
      <Text style={[shared.count, { color: isDark ? colors.text : colors.textLight }]}>
        {count} selected
      </Text>
      <TouchableOpacity onPress={onToggleAll} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={[shared.link, { color: colors.primary }]}>{allSelected ? 'Deselect all' : 'Select all'}</Text>
      </TouchableOpacity>
    </View>
  );
}

export function SelectCircle({ checked, isDark }: { checked: boolean; isDark: boolean }) {
  return (
    <View
      style={[
        shared.circle,
        { borderColor: checked ? colors.primary : isDark ? colors.textSecondary : colors.textSecondaryLight },
        checked && { backgroundColor: colors.primary },
      ]}
    >
      {checked && (
        <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={14} color={colors.white} />
      )}
    </View>
  );
}

export function BulkActionBar({
  isDark,
  count,
  busy,
  onReject,
  onConfirm,
  bottomInset = 0,
}: {
  isDark: boolean;
  count: number;
  busy: boolean;
  onReject: () => void;
  onConfirm: () => void;
  bottomInset?: number;
}) {
  const disabled = count === 0 || busy;
  return (
    <View
      style={[
        shared.actionBar,
        {
          backgroundColor: isDark ? colors.cardBackground : colors.card,
          borderTopColor: isDark ? colors.border : colors.borderLight,
          paddingBottom: 12 + bottomInset,
        },
      ]}
    >
      {busy ? (
        <View style={shared.busyRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: isDark ? colors.textSecondary : colors.textSecondaryLight }}>Working…</Text>
        </View>
      ) : (
        <>
          <TouchableOpacity
            style={[shared.barButton, shared.rejectButton, disabled && shared.disabled]}
            onPress={onReject}
            disabled={disabled}
          >
            <Text style={[shared.barButtonText, { color: colors.error }]}>Reject {count}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[shared.barButton, { backgroundColor: colors.successDark }, disabled && shared.disabled]}
            onPress={onConfirm}
            disabled={disabled}
          >
            <Text style={[shared.barButtonText, { color: colors.white }]}>Confirm {count}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

export function BulkConfirmModal({
  visible,
  isDark,
  entries,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  isDark: boolean;
  entries: BulkEntry[];
  onCancel: () => void;
  onConfirm: (serviceType: BulkServiceType) => void;
}) {
  const [serviceType, setServiceType] = useState<BulkServiceType>('actual_sea_service');
  useEffect(() => {
    if (visible) setServiceType('actual_sea_service');
  }, [visible]);
  const n = entries.length;
  const text = isDark ? colors.text : colors.textLight;
  const muted = isDark ? colors.textSecondary : colors.textSecondaryLight;
  const option = (value: BulkServiceType, label: string) => {
    const active = serviceType === value;
    return (
      <TouchableOpacity
        key={value}
        style={[
          shared.option,
          { borderColor: active ? colors.primary : isDark ? colors.border : colors.borderLight },
          active && { backgroundColor: isDark ? colors.secondary : '#E6F1FB' },
        ]}
        onPress={() => setServiceType(value)}
      >
        <Text style={{ color: active ? (isDark ? colors.white : colors.secondary) : text, fontWeight: active ? '600' : '400' }}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={shared.overlay}>
        <View style={[shared.sheet, { backgroundColor: isDark ? colors.cardBackground : colors.card }]}>
          <Text style={[shared.sheetTitle, { color: text }]}>
            Confirm {n} {n === 1 ? 'entry' : 'entries'}?
          </Text>
          <Text style={[shared.sheetSummary, { color: muted }]}>{summarise(entries)}</Text>
          <Text style={[shared.logAs, { color: text }]}>Log all as</Text>
          {option('actual_sea_service', 'Actual sea service')}
          {option('watchkeeping_service', 'Watchkeeping service')}
          <View style={shared.sheetButtons}>
            <TouchableOpacity
              style={[shared.barButton, { borderWidth: 1, borderColor: isDark ? colors.border : colors.borderLight }]}
              onPress={onCancel}
            >
              <Text style={[shared.barButtonText, { color: text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[shared.barButton, { backgroundColor: colors.successDark }]}
              onPress={() => onConfirm(serviceType)}
            >
              <Text style={[shared.barButtonText, { color: colors.white }]}>Confirm {n}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const shared = StyleSheet.create({
  link: { fontSize: 16, fontWeight: '600' },
  count: { fontSize: 16, fontWeight: '600' },
  selectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionBar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  busyRow: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, paddingVertical: 12 },
  barButton: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  rejectButton: { borderWidth: 1.5, borderColor: colors.error },
  barButtonText: { fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  sheet: { borderRadius: 16, padding: 20 },
  sheetTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  sheetSummary: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  logAs: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  option: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 8 },
  sheetButtons: { flexDirection: 'row', gap: 12, marginTop: 10 },
});
