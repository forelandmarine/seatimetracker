import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { openHistoryImport } from '@/components/HistoryImportRow';
import * as seaTimeApi from '@/utils/seaTimeApi';
import { getHistoryProducts } from '@/utils/historyPurchase';
import { trackEvent } from '@/utils/appEvents';
import { error as logError } from '@/utils/log';

/**
 * Puts the AIS history import where people think about missing sea time: a card on
 * Home and a line under Certification Progress. The availability check reads AIS
 * (costs Datalastic credits), so it runs at most once per vessel every 14 days and
 * the answer is kept on the device. Shown only when history exists, the user can buy
 * (subscription or trial) and nothing has been imported for the vessel yet.
 */

const RECHECK_MS = 14 * 86_400_000;
const SNOOZE_MS = 21 * 86_400_000;
const MAX_DISMISSALS = 2;
const MIN_GAP_DAYS = 14;

// Brand blue is too dim for small text on dark cards (about 3.3:1); this lighter
// blue reads at about 5.6:1 on cardBackground.
const DARK_TEXT_BLUE = '#2E9BE0';
const textBlue = (isDark: boolean) => (isDark ? DARK_TEXT_BLUE : colors.primary);

const offerKey = (vesselId: string) => `history_offer_v1_${vesselId}`;
const dismissKey = (vesselId: string) => `history_offer_dismiss_v1_${vesselId}`;

export interface HistoryOffer {
  earliestDay: string;
  trackingStartDay: string;
}

interface CachedOffer {
  checkedAt: number;
  offer: HistoryOffer | null;
}

const inFlight = new Map<string, Promise<HistoryOffer | null>>();
let pricePromise: Promise<string | null> | null = null;

const monthYear = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const dayMonth = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

async function fetchOffer(vesselId: string): Promise<HistoryOffer | null> {
  const a = await seaTimeApi.getHistoryAvailability(vesselId);
  const imported = a.latest_import && a.latest_import.status !== 'failed';
  if (!a.available || !a.can_purchase || imported || !a.earliest_day) return null;
  const gap = (Date.parse(`${a.tracking_start_day}T12:00:00Z`) - Date.parse(`${a.earliest_day}T12:00:00Z`)) / 86_400_000;
  if (gap < MIN_GAP_DAYS) return null;
  return { earliestDay: a.earliest_day, trackingStartDay: a.tracking_start_day };
}

async function loadOffer(vesselId: string): Promise<HistoryOffer | null> {
  try {
    const raw = await AsyncStorage.getItem(offerKey(vesselId));
    if (raw) {
      const cached: CachedOffer = JSON.parse(raw);
      if (Date.now() - cached.checkedAt < RECHECK_MS) return cached.offer;
    }
  } catch {}
  let p = inFlight.get(vesselId);
  if (!p) {
    p = fetchOffer(vesselId)
      .then(async (offer) => {
        try {
          await AsyncStorage.setItem(offerKey(vesselId), JSON.stringify({ checkedAt: Date.now(), offer } as CachedOffer));
        } catch {}
        return offer;
      })
      .catch((e) => {
        logError('[HistoryOffer] Availability check failed:', e);
        return null;
      })
      .finally(() => inFlight.delete(vesselId));
    inFlight.set(vesselId, p);
  }
  return p;
}

/** Call after a purchase so Home and Profile stop offering it for this vessel. */
export async function clearHistoryOffer(vesselId: string) {
  try {
    await AsyncStorage.setItem(offerKey(vesselId), JSON.stringify({ checkedAt: Date.now(), offer: null } as CachedOffer));
  } catch {}
}

function loadPrice(): Promise<string | null> {
  if (!pricePromise) {
    pricePromise = getHistoryProducts()
      .then((p) => p.seatime_history_6m?.priceString ?? null)
      .catch(() => null);
  }
  return pricePromise;
}

function useHistoryOffer(vesselId?: string | null) {
  const [offer, setOffer] = useState<HistoryOffer | null>(null);
  useEffect(() => {
    let live = true;
    setOffer(null);
    if (vesselId) loadOffer(vesselId).then((o) => live && setOffer(o));
    return () => {
      live = false;
    };
  }, [vesselId]);
  return offer;
}

interface Props {
  vesselId?: string | null;
  vesselName?: string | null;
}

/** Home screen card for the active vessel. "Not now" hides it for 21 days, twice at most. */
export function HistoryImportCard({ vesselId, vesselName }: Props) {
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const offer = useHistoryOffer(vesselId);
  const [hidden, setHidden] = useState(true);
  const [price, setPrice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setHidden(true);
    if (!vesselId || !offer) return;
    (async () => {
      let show = true;
      try {
        const raw = await AsyncStorage.getItem(dismissKey(vesselId));
        if (raw) {
          const d: { count: number; until: number } = JSON.parse(raw);
          show = d.count < MAX_DISMISSALS && Date.now() > d.until;
        }
      } catch {}
      if (!live) return;
      setHidden(!show);
      if (show) {
        trackEvent('history_offer_shown', 'home');
        loadPrice().then((p) => live && setPrice(p));
      }
    })();
    return () => {
      live = false;
    };
  }, [vesselId, offer]);

  if (!vesselId || !offer || hidden) return null;

  const dismiss = async () => {
    setHidden(true);
    try {
      const raw = await AsyncStorage.getItem(dismissKey(vesselId));
      const count = raw ? (JSON.parse(raw).count || 0) + 1 : 1;
      await AsyncStorage.setItem(dismissKey(vesselId), JSON.stringify({ count, until: Date.now() + SNOOZE_MS }));
    } catch {}
  };

  const name = vesselName || 'your vessel';
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <IconSymbol ios_icon_name="clock.arrow.circlepath" android_material_icon_name="history" size={22} color={textBlue(isDark)} />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.title}>Recover sea time from before you started tracking</Text>
          <Text style={styles.body}>
            We found AIS history for {name} going back to {monthYear(offer.earliestDay)}. Tracking only began on{' '}
            {dayMonth(offer.trackingStartDay)}, so those passages are not in your records yet.
          </Text>
          <Text style={styles.price}>One-off purchase{price ? ` from ${price}` : ''}. No subscription.</Text>
        </View>
      </View>
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.ghost} onPress={dismiss} accessibilityRole="button">
          <Text style={styles.ghostText}>Not now</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.primary}
          onPress={() => openHistoryImport(vesselId, vesselName ?? undefined, 'home')}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>See what we can find</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** One line under Certification Progress, while the offer stands. */
export function HistoryImportNudge({ vesselId, vesselName }: Props) {
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const offer = useHistoryOffer(vesselId);

  useEffect(() => {
    if (offer) trackEvent('history_offer_shown', 'profile');
  }, [offer]);

  if (!vesselId || !offer) return null;
  return (
    <TouchableOpacity
      style={styles.nudge}
      onPress={() => openHistoryImport(vesselId, vesselName ?? undefined, 'profile')}
      activeOpacity={0.7}
      accessibilityRole="button"
    >
      <IconSymbol ios_icon_name="clock.arrow.circlepath" android_material_icon_name="history" size={20} color={textBlue(isDark)} />
      <View style={styles.textCol}>
        <Text style={styles.nudgeTitle}>Short on days? Recover sea time from before {dayMonth(offer.trackingStartDay)}</Text>
        <Text style={styles.nudgeBody}>
          {vesselName || 'Your vessel'} has AIS history back to {monthYear(offer.earliestDay)}. One-off purchase.
        </Text>
      </View>
      <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 16,
      padding: 18,
      marginHorizontal: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.primary + '55',
    },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    iconWrap: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary + (isDark ? '30' : '18'),
    },
    textCol: { flex: 1 },
    title: { fontSize: 16, fontWeight: '700', color: isDark ? colors.text : colors.textLight },
    body: { fontSize: 13, lineHeight: 18, color: isDark ? colors.textSecondary : colors.textSecondaryLight, marginTop: 4 },
    price: { fontSize: 13, fontWeight: '600', color: textBlue(isDark), marginTop: 6 },
    buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
    ghost: { paddingVertical: 8, paddingHorizontal: 12 },
    ghostText: { fontSize: 14, fontWeight: '600', color: textBlue(isDark) },
    primary: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.primary },
    primaryText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
    nudge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 12,
      padding: 12,
      borderRadius: 10,
      backgroundColor: colors.primary + (isDark ? '1F' : '12'),
      borderWidth: 1,
      borderColor: colors.primary + (isDark ? '55' : '30'),
    },
    nudgeTitle: { fontSize: 14, fontWeight: '600', color: textBlue(isDark) },
    nudgeBody: { fontSize: 12, color: isDark ? colors.textSecondary : colors.textSecondaryLight, marginTop: 2 },
  });
