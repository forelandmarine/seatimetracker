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
import type { HistoryAvailability, HistoryImport, HistoryProductId } from '@/utils/seaTimeApi';
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
const dayBefore = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

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
  const [joinedDate, setJoinedDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
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
      if (resumed) setPaidPending(false);
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

  const handleBuy = async (productId: HistoryProductId) => {
    const product = products[productId];
    if (!product || !vesselId) return;
    setBuying(productId);
    try {
      const created = await buyHistoryImport({
        vesselId,
        product,
        joinedDate: joinedDate ? toDay(joinedDate) : null,
      });
      setCurrent(created);
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

  const intro = (
    <View style={styles.card}>
      <Text style={styles.title}>Import past sea time{vesselName ? ` on ${vesselName}` : ''}</Text>
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

  // An import already started for this vessel.
  if (current && current.status !== 'failed') {
    const done = current.status === 'done';
    // Only offer to go further back when the user was aboard for the whole 6 months:
    // an import that started later than the 6-month window was cut by a joining date,
    // so earlier days are not theirs to import.
    const sixMonthFrom = availability.products.find((p) => p.months === 6)?.window_from;
    const joinedLater = !!sixMonthFrom && current.window_from > sixMonthFrom;
    const canGoFurther =
      done &&
      current.months === 6 &&
      !joinedLater &&
      availability.products.some((p) => p.months === 12) &&
      !!products.seatime_history_12m;
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>{done ? 'Import complete' : 'Importing your AIS history'}</Text>
          <Text style={styles.body}>
            {fmt(current.window_from)} to {fmt(dayBefore(current.window_to))}
          </Text>
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
        {canGoFurther && (
          <ProductButton
            label="Go back 12 months"
            detail={`Adds ${fmt(availability.products.find((p) => p.months === 12)!.window_from)} onwards`}
            price={products.seatime_history_12m!.priceString}
            busy={buying === 'seatime_history_12m'}
            onPress={() => handleBuy('seatime_history_12m')}
            styles={styles}
          />
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

  const earliestFrom = availability.products.reduce((m, p) => (p.window_from < m ? p.window_from : m), availability.tracking_start_day);
  const lastDay = dayBefore(availability.tracking_start_day);
  const joinedDay = joinedDate ? toDay(joinedDate) : null;
  const offers = availability.products
    .map((p) => {
      const from = joinedDay && joinedDay > p.window_from ? joinedDay : p.window_from;
      return { ...p, from };
    })
    // When the joining date makes 12 months the same as 6, only offer 6.
    .filter((p, _, all) => p.months === 6 || !all.some((q) => q.months === 6 && q.from === p.from));
  const storeMissing = offers.every((p) => !products[p.product_id]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {intro}

      <View style={styles.card}>
        <Text style={styles.label}>History found</Text>
        <Text style={styles.body}>
          AIS positions go back to at least {fmt(availability.earliest_day!)}. Live tracking started on{' '}
          {fmt(availability.tracking_start_day)}, so the import covers the days before that.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>When did you join?</Text>
        <Text style={styles.body}>
          {joinedDate
            ? `From ${fmt(toDay(joinedDate))}`
            : 'Aboard for the whole period. If you joined later, set your joining date so only your time is imported.'}
        </Text>
        <View style={styles.rowButtons}>
          <TouchableOpacity style={[styles.button, styles.secondary]} onPress={() => setShowPicker(true)}>
            <Text style={styles.secondaryText}>{joinedDate ? 'Change date' : 'Set joining date'}</Text>
          </TouchableOpacity>
          {joinedDate && (
            <TouchableOpacity style={[styles.button, styles.secondary]} onPress={() => setJoinedDate(null)}>
              <Text style={styles.secondaryText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        {showPicker && (
          <DateTimePicker
            value={joinedDate ?? new Date(`${earliestFrom}T12:00:00`)}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            minimumDate={new Date(`${earliestFrom}T12:00:00`)}
            maximumDate={new Date(`${lastDay}T12:00:00`)}
            onChange={(event, d) => {
              if (Platform.OS !== 'ios') setShowPicker(false);
              if (event.type === 'set' && d) setJoinedDate(d);
            }}
          />
        )}
        {showPicker && Platform.OS === 'ios' && (
          <TouchableOpacity style={[styles.button, styles.primary]} onPress={() => setShowPicker(false)}>
            <Text style={styles.primaryText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>

      {storeMissing ? (
        <View style={styles.card}>
          <Text style={styles.body}>History import is not on sale in your app store yet. Please check back soon.</Text>
        </View>
      ) : (
        offers.map((p) =>
          products[p.product_id] ? (
            <ProductButton
              key={p.product_id}
              label={`${p.months} months`}
              detail={`${fmt(p.from)} to ${fmt(lastDay)}`}
              price={products[p.product_id]!.priceString}
              busy={buying === p.product_id}
              disabled={!!buying}
              onPress={() => handleBuy(p.product_id)}
              styles={styles}
            />
          ) : null
        )
      )}

      <Text style={styles.footnote}>
        One-off purchase for this vessel. Imported passages arrive as pending entries for you to check
        and confirm.
      </Text>
    </ScrollView>
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
