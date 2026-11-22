/**
 * Sign-up activation flow (2.5.0): the user's boat on the paywall and the
 * locked Home, with its real recent activity from AIS history ("6 days underway
 * in the last 10 days"). The activity comes from the backend's history cache
 * (GET /api/vessels/:id/recent-activity), never a paid AIS call. No stat is
 * shown when none is cached.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Purchases, { INTRO_ELIGIBILITY_STATUS, type PurchasesPackage } from 'react-native-purchases';
import { colors, withOpacity } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { getActivation, activityLine } from '@/utils/activation';
import { getVessels, getRecentActivity, type RecentActivity } from '@/utils/seaTimeApi';
import { warn } from '@/utils/log';

export interface ActivationBoat {
  id: string;
  name: string;
  flag: string | null;
  mmsi: string | null;
}

/** The boat saved in the sign-up flow (or the user's only vessel) and its recent activity. */
export function useActivationBoat(enabled: boolean) {
  const { user } = useAuth();
  const [state, setState] = useState<{ loading: boolean; boat: ActivationBoat | null; activity: RecentActivity | null }>({
    loading: enabled,
    boat: null,
    activity: null,
  });

  useEffect(() => {
    if (!enabled || !user?.id) {
      setState({ loading: false, boat: null, activity: null });
      return;
    }
    let live = true;
    (async () => {
      try {
        const [record, vessels] = await Promise.all([getActivation(user.id), getVessels()]);
        const list: any[] = Array.isArray(vessels) ? vessels.filter(Boolean) : [];
        const v = list.find((x) => x.id === record.vesselId) || list.find((x) => x.is_active) || list[0];
        if (!v) {
          if (live) setState({ loading: false, boat: null, activity: null });
          return;
        }
        const boat: ActivationBoat = { id: v.id, name: v.vessel_name, flag: v.flag || null, mmsi: v.mmsi || null };
        if (live) setState({ loading: true, boat, activity: null });
        const activity = await getRecentActivity(v.id).catch((e) => {
          warn('[ActivationBoat] Recent activity unavailable:', e?.message);
          return null;
        });
        if (live) setState({ loading: false, boat, activity });
      } catch (e: any) {
        warn('[ActivationBoat] Could not load the boat:', e?.message);
        if (live) setState({ loading: false, boat: null, activity: null });
      }
    })();
    return () => { live = false; };
  }, [enabled, user?.id]);

  return state;
}

type Intro = NonNullable<PurchasesPackage['product']['introPrice']>;

/** A free intro offer, as "month" / "30 days" / "2 weeks". Null when the offer is not free. */
export function freePeriod(intro: Intro | null | undefined): string | null {
  if (!intro || intro.price !== 0) return null;
  const n = intro.periodNumberOfUnits;
  const unit = intro.periodUnit === 'DAY' ? 'day' : intro.periodUnit === 'WEEK' ? 'week' : intro.periodUnit === 'YEAR' ? 'year' : 'month';
  return n === 1 ? unit : `${n} ${unit}s`;
}

/**
 * The free trial this user can actually have, for the locked Home's button.
 * iOS: StoreKit lists the offer whether or not the Apple ID can still have it,
 * so eligibility is checked (unknown counts as not eligible, as on the paywall).
 * Google Play only returns offers the account is eligible for.
 */
export function useFreeTrial(): string | null {
  const { availablePackages } = useSubscription();
  const [eligible, setEligible] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (Platform.OS !== 'ios' || availablePackages.length === 0) return;
    const ids = availablePackages.map((p) => p.product.identifier);
    Purchases.checkTrialOrIntroductoryPriceEligibility(ids)
      .then((r) => {
        const out: Record<string, boolean> = {};
        for (const id of ids) out[id] = r[id]?.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE;
        setEligible(out);
      })
      .catch(() => {});
  }, [availablePackages]);
  for (const p of availablePackages) {
    if (Platform.OS === 'ios' && !eligible[p.product.identifier]) continue;
    const period = freePeriod(p.product.introPrice);
    if (period) return period;
  }
  return null;
}

interface CardProps {
  boat: ActivationBoat;
  activity: RecentActivity | null;
  isDark: boolean;
}

/** Boat name, flag and MMSI, plus the activity line when AIS history has one. */
export function BoatActivityCard({ boat, activity, isDark }: CardProps) {
  const s = styles(isDark);
  const line = activityLine(activity);
  const meta = [boat.flag, boat.mmsi ? `MMSI ${boat.mmsi}` : null].filter(Boolean).join('  ·  ');
  return (
    <View style={s.card} accessibilityLabel={`${boat.name}${line ? `. ${line}` : ''}`}>
      <View style={s.row}>
        <View style={s.icon}>
          <IconSymbol ios_icon_name="ferry.fill" android_material_icon_name="directions-boat" size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={1}>{boat.name}</Text>
          {!!meta && <Text style={s.meta}>{meta}</Text>}
        </View>
      </View>
      {!!line && (
        <View style={s.statRow}>
          <IconSymbol ios_icon_name="waveform.path.ecg" android_material_icon_name="show-chart" size={16} color={colors.primary} />
          <Text style={s.stat}>{line}</Text>
        </View>
      )}
      {!!line && <Text style={s.source}>From the vessel's AIS history</Text>}
    </View>
  );
}

interface PromiseProps {
  /** e.g. "month" or "30 days"; null when no free trial is on offer for this user. */
  period: string | null;
  isDark: boolean;
}

/** What the free trial means, in plain words. Only shown when a free trial is on offer. */
export function TrialPromise({ period, isDark }: PromiseProps) {
  const s = styles(isDark);
  if (!period) return null;
  const store = Platform.OS === 'ios' ? 'App Store' : 'Google Play';
  const rows = [
    { ios: 'gift.fill', android: 'card-giftcard', text: `Your first ${period} is free` },
    { ios: 'bell.fill', android: 'notifications', text: 'We remind you 2 days before your trial ends' },
    {
      ios: 'xmark.circle.fill',
      android: 'cancel',
      text: Platform.OS === 'ios'
        ? `Cancel any time in ${store} settings. Cancel at least 24 hours before the trial ends and you pay nothing.`
        : `Cancel any time in ${store}. Cancel before the trial ends and you pay nothing.`,
    },
  ] as const;
  return (
    <View style={s.promise}>
      {rows.map((r) => (
        <View key={r.ios} style={s.promiseRow}>
          <IconSymbol ios_icon_name={r.ios} android_material_icon_name={r.android as any} size={18} color={colors.success} />
          <Text style={s.promiseText}>{r.text}</Text>
        </View>
      ))}
      <Text style={s.promiseSmall}>Reminders need notifications turned on.</Text>
    </View>
  );
}

const styles = (isDark: boolean) => {
  const text = isDark ? colors.text : colors.textLight;
  const text2 = isDark ? colors.textSecondary : colors.textSecondaryLight;
  return StyleSheet.create({
    card: {
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      backgroundColor: isDark ? colors.cardBackground : colors.card,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    icon: {
      width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
      backgroundColor: withOpacity(colors.primary, 0.12),
    },
    name: { fontSize: 18, fontWeight: '700', color: text },
    meta: { fontSize: 13, color: text2, marginTop: 2 },
    statRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
    stat: { flex: 1, fontSize: 16, fontWeight: '600', color: text },
    source: { fontSize: 12, color: text2, marginTop: 4, marginLeft: 24 },
    promise: { gap: 10, marginBottom: 20 },
    promiseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    promiseText: { flex: 1, fontSize: 15, lineHeight: 21, color: text },
    promiseSmall: { fontSize: 12, color: text2, marginLeft: 28 },
  });
};
