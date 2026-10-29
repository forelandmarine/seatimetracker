import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
  useColorScheme,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { PurchasesStoreProduct } from 'react-native-purchases';
import { colors } from '@/styles/commonStyles';
import * as seaTimeApi from '@/utils/seaTimeApi';
import type { HistoryAvailability, HistoryCheck, HistoryImport, HistoryProductId, HistoryRange } from '@/utils/seaTimeApi';
import {
  RedeemPendingError,
  buyHistoryImport,
  getHistoryProducts,
  resumePendingHistoryImport,
} from '@/utils/historyPurchase';
import { log, error as logError } from '@/utils/log';

const POLL_MS = 10_000;

const fmt = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const toDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayBefore = (day: string) => addDays(day, -1);
const asDate = (day: string) => new Date(`${day}T12:00:00`);
const daysIn = (from: string, last: string) =>
  Math.round((Date.parse(`${last}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;

/** A period as picked: both days inclusive, null until set. */
interface Period {
  from: string | null;
  last: string | null;
}

/** Complete periods as API ranges (`to` exclusive), sorted, with overlapping or touching ones merged. */
function toRanges(periods: Period[]): HistoryRange[] {
  const sorted = periods
    .filter((p): p is { from: string; last: string } => !!p.from && !!p.last)
    .map((p) => ({ from: p.from, to: addDays(p.last, 1) }))
    .sort((a, b) => (a.from < b.from ? -1 : 1));
  const out: HistoryRange[] = [];
  for (const r of sorted) {
    const prev = out[out.length - 1];
    if (prev && r.from <= prev.to) {
      if (r.to > prev.to) prev.to = r.to;
    } else out.push({ ...r });
  }
  return out;
}

const rangesDays = (ranges: HistoryRange[]) => ranges.reduce((n, r) => n + daysIn(r.from, dayBefore(r.to)), 0);

/** Import past sea time for one vessel from its AIS history (one-off purchase). */
export default function HistoryImportScreen() {
  const { vesselId, vesselName } = useLocalSearchParams<{ vesselId: string; vesselName?: string }>();
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<HistoryAvailability | null>(null);
  const [products, setProducts] = useState<Partial<Record<HistoryProductId, PurchasesStoreProduct>>>({});
  const [current, setCurrent] = useState<HistoryImport | null>(null);
  const [periods, setPeriods] = useState<Period[]>([{ from: null, last: null }]);
  const [editing, setEditing] = useState<{ index: number; field: 'from' | 'last' } | null>(null);
  const [startAnother, setStartAnother] = useState(false);
  // The last check, for the selection it was run on (shown only while that selection stands).
  const [check, setCheck] = useState<{ key: string; result: HistoryCheck } | null>(null);
  const [checking, setChecking] = useState(false);
  const [buying, setBuying] = useState<HistoryProductId | null>(null);
  const [paidPending, setPaidPending] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!vesselId) return;
    setLoadError(null);
    try {
      const resumed = await resumePendingHistoryImport();
      const a = await seaTimeApi.getHistoryAvailability(vesselId);
      setAvailability(a);
      setCurrent(resumed && resumed.vessel_id === vesselId ? resumed : a.latest_import);
      if (resumed) {
        setPaidPending(false);
        setStartAnother(false);
      }
      if (a.available && a.can_purchase) {
        try {
          setProducts(await getHistoryProducts());
        } catch (e) {
          logError('[HistoryImport] Could not load store products:', e);
          setProducts({});
        }
      }
    } catch (e: any) {
      logError('[HistoryImport] Failed to load availability:', e);
      setLoadError(e?.message || 'Could not check AIS history. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [vesselId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while an import is running.
  const running = current?.status === 'queued' || current?.status === 'running';
  useEffect(() => {
    if (!running || !current) return;
    pollRef.current = setInterval(async () => {
      try {
        const next = await seaTimeApi.getHistoryImport(current.id);
        setCurrent(next);
      } catch (e) {
        log('[HistoryImport] Poll failed:', e);
      }
    }, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [running, current?.id]);

  const handleCheck = async (ranges: HistoryRange[]) => {
    if (!vesselId || ranges.length === 0) return;
    setChecking(true);
    try {
      const result = await seaTimeApi.checkHistoryRanges(vesselId, ranges);
      setCheck({ key: JSON.stringify(ranges), result });
    } catch (e: any) {
      logError('[HistoryImport] Check failed:', e);
      Alert.alert('Could not check AIS history', e?.message || 'Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleBuy = async (productId: HistoryProductId, ranges: HistoryRange[]) => {
    const product = products[productId];
    if (!product || !vesselId || ranges.length === 0) return;
    setBuying(productId);
    try {
      const created = await buyHistoryImport({ vesselId, product, ranges });
      setCurrent(created);
      setStartAnother(false);
      setPeriods([{ from: null, last: null }]);
    } catch (e: any) {
      if (e?.userCancelled) return;
      if (e instanceof RedeemPendingError) {
        setPaidPending(true);
        return;
      }
      logError('[HistoryImport] Purchase failed:', e);
      Alert.alert('Purchase not completed', e?.message || 'Please try again.');
    } finally {
      setBuying(null);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.body, styles.loadingText]}>Checking AIS history…</Text>
      </View>
    );
  }

  if (loadError || !availability) {
    return (
      <View style={[styles.container, styles.center, styles.content]}>
        <Text style={styles.body}>{loadError}</Text>
        <TouchableOpacity style={[styles.button, styles.primary]} onPress={() => { setLoading(true); load(); }}>
          <Text style={styles.primaryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const introCard = (title: string) => (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>
        We look up the vessel's past AIS positions and add each day it was underway as a passage in
        Review. Nothing counts until you confirm it.
      </Text>
      <Text style={[styles.body, styles.spaced]}>
        Days moored or at anchor are not added, and gaps in AIS coverage are left out, so a vessel
        that stayed alongside may give few or no passages.
      </Text>
    </View>
  );
  const intro = introCard(`Import past sea time${vesselName ? ` on ${vesselName}` : ''}`);

  // An import already started for this vessel.
  if (current && current.status !== 'failed' && !startAnother) {
    const done = current.status === 'done';
    const ranges = current.ranges ?? [{ from: current.window_from, to: current.window_to }];
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>{done ? 'Import complete' : 'Importing your AIS history'}</Text>
          {ranges.map((r) => (
            <Text key={r.from} style={styles.body}>
              {fmt(r.from)} to {fmt(dayBefore(r.to))}
            </Text>
          ))}
          {!done && (
            <>
              <ActivityIndicator style={styles.spaced} color={colors.primary} />
              <Text style={[styles.body, styles.spaced]}>
                This usually takes a few minutes. You can leave this screen; the passages will appear
                in Review when it finishes.
              </Text>
            </>
          )}
          {done && (current.passages_created ?? 0) > 0 && (
            <>
              <Text style={[styles.body, styles.spaced]}>
                {current.passages_created} passage{current.passages_created === 1 ? '' : 's'} added to
                Review. Check each one and confirm the days you were aboard.
              </Text>
              <TouchableOpacity style={[styles.button, styles.primary]} onPress={() => router.push('/(tabs)/confirmations')}>
                <Text style={styles.primaryText}>Go to Review</Text>
              </TouchableOpacity>
            </>
          )}
          {done && (current.passages_created ?? 0) === 0 && (
            <Text style={[styles.body, styles.spaced]}>
              The AIS history shows the vessel was not underway on any day in this period that is not
              already in your logbook, so no passages were added.
            </Text>
          )}
        </View>
        {done && availability.available && availability.can_purchase && (
          <TouchableOpacity style={[styles.button, styles.secondary]} onPress={() => setStartAnother(true)}>
            <Text style={styles.secondaryText}>Import other periods</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  }

  if (current?.status === 'failed') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Import could not finish</Text>
          <Text style={styles.body}>
            Something went wrong fetching this vessel's history. Your purchase is recorded. Please
            email info@forelandmarine.com and we will finish the import or refund you.
          </Text>
          <TouchableOpacity
            style={[styles.button, styles.primary]}
            onPress={() => Linking.openURL(`mailto:info@forelandmarine.com?subject=${encodeURIComponent(`History import ${current.id}`)}`)}
          >
            <Text style={styles.primaryText}>Email support</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (paidPending) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Payment received</Text>
          <Text style={styles.body}>
            We could not start the import just now. It will start automatically next time you open
            this screen, or tap below to try again.
          </Text>
          <TouchableOpacity style={[styles.button, styles.primary]} onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.primaryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (!availability.available) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {intro}
        <View style={styles.card}>
          <Text style={styles.title}>No AIS history found</Text>
          <Text style={styles.body}>
            We could not find past AIS positions for this vessel's MMSI, so there is nothing to
            import. If the vessel changed its MMSI recently, history under the old number is not
            available.
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (!availability.can_purchase) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {intro}
        <View style={styles.card}>
          <Text style={styles.body}>Importing past sea time needs an active subscription or free trial.</Text>
          <TouchableOpacity style={[styles.button, styles.primary]} onPress={() => router.push('/paywall' as any)}>
            <Text style={styles.primaryText}>See plans</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  const firstDay = availability.range_from;
  const lastDay = dayBefore(availability.tracking_start_day);
  const ranges = toRanges(periods);
  const totalDays = rangesDays(ranges);
  const pickedDays = periods.reduce((n, p) => n + (p.from && p.last ? daysIn(p.from, p.last) : 0), 0);
  const product = [...availability.products].sort((a, b) => a.max_days - b.max_days).find((p) => totalDays <= p.max_days);
  const sixMonths = availability.products.find((p) => p.months === 6);
  const storeMissing = availability.products.every((p) => !products[p.product_id]);
  const incomplete = periods.some((p) => !p.from || !p.last);
  const previous = current?.status === 'done' ? current.ranges ?? [{ from: current.window_from, to: current.window_to }] : [];

  const setDay = (index: number, field: 'from' | 'last', day: string) =>
    setPeriods((ps) =>
      ps.map((p, i) => {
        if (i !== index) return p;
        const next = { ...p, [field]: day };
        // Keep each period the right way round.
        if (next.from && next.last && next.last < next.from) {
          if (field === 'from') next.last = null;
          else next.from = null;
        }
        return next;
      })
    );

  const pickerValue = (() => {
    if (!editing) return asDate(firstDay);
    const p = periods[editing.index];
    // A new period opens the day after the latest one already picked.
    const latest = periods.reduce<string | null>((m, q) => (q.last && (!m || q.last > m) ? q.last : m), null);
    const after = latest && latest < lastDay ? addDays(latest, 1) : firstDay;
    const day = p?.[editing.field] ?? (editing.field === 'last' ? p?.from : null) ?? after;
    return asDate(day);
  })();

  const shownCheck = check && check.key === JSON.stringify(ranges) ? check.result : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>When were you aboard{vesselName ? ` ${vesselName}` : ''}?</Text>
        <Text style={styles.body}>
          Add each period you were on board, any time from {fmt(firstDay)} to {fmt(lastDay)}. Leave out
          leave and time off rotation; only the days you pick are imported.
        </Text>
        {previous.length > 0 && (
          <Text style={[styles.body, styles.spaced]}>
            Already imported: {previous.map((r) => `${fmt(r.from)} to ${fmt(dayBefore(r.to))}`).join(', ')}.
          </Text>
        )}

        {periods.map((p, i) => {
          const isEditing = editing?.index === i;
          const minDay = isEditing && editing.field === 'last' && p.from ? p.from : firstDay;
          const maxDay = isEditing && editing.field === 'from' && p.last ? p.last : lastDay;
          return (
            <View key={i} style={styles.period}>
              <View style={styles.periodHeader}>
                <Text style={styles.periodTitle}>Period {i + 1}</Text>
                <Text style={styles.body}>
                  {p.from && p.last ? `${daysIn(p.from, p.last)} day${daysIn(p.from, p.last) === 1 ? '' : 's'}` : ''}
                </Text>
                {periods.length > 1 && (
                  <TouchableOpacity
                    onPress={() => {
                      setEditing(null);
                      setPeriods((ps) => ps.filter((_, j) => j !== i));
                    }}
                    accessibilityLabel={`Remove period ${i + 1}`}
                    hitSlop={8}
                  >
                    <Text style={styles.remove}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.rowButtons}>
                {(['from', 'last'] as const).map((field) => {
                  const active = isEditing && editing?.field === field;
                  return (
                    <TouchableOpacity
                      key={field}
                      style={[styles.dateButton, active && styles.dateButtonActive]}
                      onPress={() => setEditing(active ? null : { index: i, field })}
                      accessibilityLabel={`Period ${i + 1} ${field === 'from' ? 'first' : 'last'} day`}
                    >
                      <Text style={styles.dateCaption}>{field === 'from' ? 'Joined' : 'Left'}</Text>
                      <Text style={p[field] ? styles.dateValue : styles.datePlaceholder}>
                        {p[field] ? fmt(p[field]!) : 'Pick a date'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {isEditing && (
                <DateTimePicker
                  // iOS's inline calendar crashes if its date and limits change while it is shown
                  // (the date lands outside the old limits first), so a new range gets a new picker.
                  key={`${editing!.field}:${minDay}:${maxDay}`}
                  value={pickerValue}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  minimumDate={asDate(minDay)}
                  maximumDate={asDate(maxDay)}
                  onChange={(event, d) => {
                    if (Platform.OS !== 'ios') setEditing(null);
                    if (event.type === 'set' && d) setDay(i, editing!.field, toDay(d));
                  }}
                />
              )}
              {isEditing && Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={[styles.button, styles.primary]}
                  onPress={() => {
                    // The calendar opens on a day without firing onChange, so Done keeps that day.
                    const field = editing!.field;
                    const from = field === 'from' ? p.from ?? toDay(pickerValue) : p.from;
                    if (!p[field]) setDay(i, field, toDay(pickerValue));
                    // After the first day, go straight on to the last day.
                    setEditing(field === 'from' && from && !p.last ? { index: i, field: 'last' } : null);
                  }}
                >
                  <Text style={styles.primaryText}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {periods.length < availability.max_ranges ? (
          <TouchableOpacity
            style={[styles.button, styles.secondary]}
            onPress={() => {
              setPeriods((ps) => [...ps, { from: null, last: null }]);
              setEditing({ index: periods.length, field: 'from' });
            }}
          >
            <Text style={styles.secondaryText}>+ Add another period</Text>
          </TouchableOpacity>
        ) : (
          <Text style={[styles.footnote, styles.spaced]}>
            Up to {availability.max_ranges} periods per import. Buy another import for more.
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.totalRow}>
          <Text style={styles.label}>Total</Text>
          <Text style={styles.label}>
            {totalDays} day{totalDays === 1 ? '' : 's'}
          </Text>
        </View>
        {pickedDays > totalDays && (
          <Text style={styles.body}>Some periods overlap; those days are counted once.</Text>
        )}
        <Text style={[styles.body, styles.spaced]}>
          {sixMonths && products[sixMonths.product_id]
            ? `Up to ${sixMonths.max_days} days (6 months) costs ${products[sixMonths.product_id]!.priceString}. ` +
              (products.seatime_history_12m ? `Longer, up to 12 months, costs ${products.seatime_history_12m.priceString}.` : '')
            : 'The price depends on how many days you import.'}
        </Text>
        {totalDays > 0 && !incomplete && !shownCheck && (
          <TouchableOpacity
            style={[styles.button, styles.secondary]}
            onPress={() => handleCheck(ranges)}
            disabled={checking}
            accessibilityLabel="Check AIS history for these periods before buying"
          >
            {checking ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.secondaryText}>Check AIS history first (free)</Text>}
          </TouchableOpacity>
        )}
        {shownCheck && <CheckResult check={shownCheck} styles={styles} />}
      </View>

      {storeMissing ? (
        <View style={styles.card}>
          <Text style={styles.body}>History import is not on sale in your app store yet. Please check back soon.</Text>
        </View>
      ) : totalDays === 0 || incomplete ? (
        <Text style={styles.footnote}>
          {totalDays === 0 ? 'Pick the first and last day of each period to see the price.' : 'Finish or remove the period without dates to continue.'}
        </Text>
      ) : product && products[product.product_id] ? (
        <ProductButton
          label={`Import ${totalDays} day${totalDays === 1 ? '' : 's'}`}
          detail={`${ranges.length} period${ranges.length === 1 ? '' : 's'}, ${product.months === 6 ? 'up to 6 months' : '6 to 12 months'}`}
          price={products[product.product_id]!.priceString}
          busy={buying === product.product_id}
          disabled={!!buying}
          onPress={() => handleBuy(product.product_id, ranges)}
          styles={styles}
        />
      ) : (
        <Text style={styles.footnote}>This import is not on sale in your app store yet.</Text>
      )}

      {introCard('How it works')}

      <Text style={styles.footnote}>
        AIS positions for this vessel go back to at least {fmt(availability.earliest_day!)}. Live tracking
        started on {fmt(availability.tracking_start_day)}. One-off purchase for this vessel. Imported
        passages arrive as pending entries for you to check and confirm.
      </Text>
    </ScrollView>
  );
}

const VERDICT = {
  good: { title: 'Looks worthwhile', color: '#2E9E5B' },
  patchy: { title: 'Patchy history', color: '#D98E04' },
  none: { title: 'No AIS history found', color: '#D64545' },
} as const;

function CheckResult({ check, styles }: { check: HistoryCheck; styles: ReturnType<typeof createStyles> }) {
  const v = VERDICT[check.verdict];
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return (
    <View style={[styles.check, { borderLeftColor: v.color }]} accessibilityLiveRegion="polite">
      <Text style={[styles.label, { color: v.color }]}>{v.title}</Text>
      <Text style={styles.body}>
        {check.checked_days === 0
          ? 'We could not check any days just now. Please try again later.'
          : `We checked ${plural(check.checked_days, 'day')} spread through your periods: AIS positions on ${check.days_with_ais}, underway on ${check.days_underway}.`}
      </Text>
      {check.verdict === 'patchy' && (
        <Text style={[styles.body, styles.spaced]}>
          The vessel may have been alongside, or AIS coverage was poor. An import may add only a few passages.
        </Text>
      )}
      {check.verdict === 'none' && check.checked_days > 0 && (
        <Text style={[styles.body, styles.spaced]}>An import of these periods is unlikely to add any passages.</Text>
      )}
      <Text style={[styles.footnote, styles.spaced, styles.flush]}>A sample of days, not a guarantee of what the import finds.</Text>
    </View>
  );
}

function ProductButton(props: {
  label: string;
  detail: string;
  price: string;
  busy: boolean;
  disabled?: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const { styles } = props;
  return (
    <TouchableOpacity
      style={[styles.card, styles.product]}
      onPress={props.onPress}
      disabled={props.busy || props.disabled}
      accessibilityRole="button"
      accessibilityLabel={`Import ${props.label} for ${props.price}`}
    >
      <View style={styles.productText}>
        <Text style={styles.label}>{props.label}</Text>
        <Text style={styles.body}>{props.detail}</Text>
      </View>
      {props.busy ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.price}>{props.price}</Text>}
    </TouchableOpacity>
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
      gap: 12,
    },
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 8,
      color: isDark ? colors.text : colors.textLight,
    },
    label: {
      fontSize: 16,
      fontWeight: '600',
      marginBottom: 4,
      color: isDark ? colors.text : colors.textLight,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    spaced: {
      marginTop: 10,
    },
    loadingText: {
      marginTop: 12,
    },
    rowButtons: {
      flexDirection: 'row',
      gap: 8,
    },
    period: {
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
    },
    periodHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    periodTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
    },
    remove: {
      fontSize: 14,
      fontWeight: '600',
      color: '#D64545',
    },
    dateButton: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)',
    },
    dateButtonActive: {
      borderColor: colors.primary,
      borderWidth: 2,
    },
    dateCaption: {
      fontSize: 12,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    dateValue: {
      fontSize: 15,
      fontWeight: '600',
      marginTop: 2,
      color: isDark ? colors.text : colors.textLight,
    },
    datePlaceholder: {
      fontSize: 15,
      marginTop: 2,
      color: colors.primary,
    },
    flush: {
      paddingHorizontal: 0,
    },
    check: {
      marginTop: 12,
      paddingLeft: 12,
      borderLeftWidth: 4,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    button: {
      marginTop: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      alignItems: 'center',
    },
    primary: {
      backgroundColor: colors.primary,
    },
    primaryText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    secondary: {
      borderWidth: 1,
      borderColor: colors.primary,
    },
    secondaryText: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: '600',
    },
    product: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    productText: {
      flex: 1,
    },
    price: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.primary,
    },
    footnote: {
      fontSize: 13,
      lineHeight: 18,
      paddingHorizontal: 4,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
  });
