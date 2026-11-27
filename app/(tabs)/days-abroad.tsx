/**
 * Days abroad (Profile and Settings).
 *
 * Crew log by hand where they were and when: ashore in a country, or signed on
 * a vessel. Nothing comes from AIS, because only the crew member knows when
 * they signed on and off. From that log the screen shows the Schengen 90/180
 * count (with a "try a trip" check) and day counts per country against each
 * country's tax year. Guidance only, never legal or tax advice.
 * One file for iOS and Android.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
  useColorScheme,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { getVessels } from '@/utils/seaTimeApi';
import { formatDayShort, localDate } from '@/utils/localDate';
import { error as logError } from '@/utils/log';
import {
  AT_SEA_CODE,
  deleteStay,
  downloadPresenceCsv,
  getPresenceSummary,
  getStays,
  savePresenceSettings,
  saveTaxOptions,
  type PresenceStay,
  type TaxOptions,
  type PresenceSummary,
  type TaxCountry,
  type TaxYear,
} from '@/utils/presenceApi';
import { createDaysAbroadStyles } from '@/components/daysAbroad/styles';
import {
  PlanSheet,
  SignOffSheet,
  SignOnSheet,
  StayEditor,
  TaxCountriesSheet,
  useCountryLabel,
  type VesselOption,
  Toggle,
} from '@/components/daysAbroad/DaysAbroadSheets';

const DAY_MS = 86_400_000;
const dayDiff = (a: string, b: string) => Math.round((localDate(b).getTime() - localDate(a).getTime()) / DAY_MS);

type Sheet = { type: 'stay'; stay: PresenceStay | null } | { type: 'signOn' } | { type: 'signOff' } | { type: 'plan' } | { type: 'countries' } | null;

export default function DaysAbroadScreen() {
  const { t, i18n } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const styles = createDaysAbroadStyles(isDark);
  const labelFor = useCountryLabel();
  const [summary, setSummary] = useState<PresenceSummary | null>(null);
  const [stays, setStays] = useState<PresenceStay[]>([]);
  const [vessels, setVessels] = useState<VesselOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [exporting, setExporting] = useState(false);

  const fmt = (d: string) => formatDayShort(d, i18n.language);

  const load = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([getPresenceSummary(), getStays()]);
      setSummary(s);
      setStays(list);
      setFailed(false);
    } catch (e: any) {
      logError('[DaysAbroad] Load failed:', e?.message || e);
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    try {
      const v = await getVessels();
      setVessels((v || []).map((x: any) => ({ id: x.id, vessel_name: x.vessel_name })));
    } catch {
      // Vessels are optional here.
    }
  }, []);

  const onTaxOptions = useCallback(async (opts: TaxOptions) => {
    try {
      await saveTaxOptions(opts);
      await load();
    } catch (e: any) {
      logError('[DaysAbroad] Tax options save failed:', e?.message || e);
      Alert.alert(t('daysAbroad.errors.notSaved'));
    }
  }, [load, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const schengenSet = useMemo(
    () => new Set([...(summary?.rules.schengen_members ?? []), ...(summary?.rules.schengen_microstates ?? [])]),
    [summary]
  );
  const isSchengen = useCallback((code: string) => schengenSet.has(code), [schengenSet]);

  const closeAndReload = () => {
    setSheet(null);
    load();
  };

  const confirmDelete = (stay: PresenceStay) => {
    Alert.alert(t('daysAbroad.deleteTitle'), t('daysAbroad.deleteBody', { country: labelFor(stay.country_code), range: rangeText(stay) }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteStay(stay.id);
            closeAndReload();
          } catch (e: any) {
            logError('[DaysAbroad] Delete failed:', e?.message || e);
            Alert.alert(t('common.error'), t('daysAbroad.errors.notSaved'));
          }
        },
      },
    ]);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const csv = await downloadPresenceCsv();
      const name = `Days_Abroad_${summary?.today ?? 'export'}.csv`;
      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        const uri = `${FileSystem.documentDirectory}${name}`;
        await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
        else Alert.alert(t('daysAbroad.export.savedTitle'), t('daysAbroad.export.saved'));
      }
    } catch (e: any) {
      logError('[DaysAbroad] Export failed:', e?.message || e);
      Alert.alert(t('common.error'), t('daysAbroad.export.failed'));
    } finally {
      setExporting(false);
    }
  };

  const rangeText = (s: PresenceStay) =>
    s.end_date ? t('daysAbroad.range', { start: fmt(s.start_date), end: fmt(s.end_date) }) : t('daysAbroad.since', { date: fmt(s.start_date) });
  const stayDays = (s: PresenceStay) => Math.max(0, dayDiff(s.start_date, s.end_date ?? summary?.today ?? s.start_date) + 1);

  const open = summary?.open_stay ?? null;
  const onBoard = open?.kind === 'on_board';

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <Text style={styles.intro}>{t('daysAbroad.intro')}</Text>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
        ) : failed || !summary ? (
          <Text style={styles.empty}>{t('daysAbroad.errors.loadFailed')}</Text>
        ) : (
          <>
            {/* Where you are now + quick actions */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('daysAbroad.now')}</Text>
              <Text style={styles.body}>
                {open
                  ? onBoard
                    ? t('daysAbroad.nowOnBoard', { country: labelFor(open.country_code), date: fmt(open.start_date) })
                    : t('daysAbroad.nowAshore', { country: labelFor(open.country_code), date: fmt(open.start_date) })
                  : t('daysAbroad.nowNone')}
              </Text>
              <View style={styles.actions}>
                {onBoard ? (
                  <ActionButton primary icon="figure.walk" androidIcon="directions-walk" label={t('daysAbroad.signedOff')} onPress={() => setSheet({ type: 'signOff' })} styles={styles} />
                ) : (
                  <ActionButton primary icon="ferry" androidIcon="directions-boat" label={t('daysAbroad.signedOn')} onPress={() => setSheet({ type: 'signOn' })} styles={styles} />
                )}
                <ActionButton icon="plus" androidIcon="add" label={t('daysAbroad.addStay')} onPress={() => setSheet({ type: 'stay', stay: null })} styles={styles} />
              </View>
            </View>

            <SchengenCard summary={summary} styles={styles} fmt={fmt} onPlan={() => setSheet({ type: 'plan' })} />

            {/* Tax days */}
            <View style={[styles.cardHeader, { marginTop: 24, marginBottom: 0 }]}>
              <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>{t('daysAbroad.tax.title')}</Text>
              <TouchableOpacity onPress={() => setSheet({ type: 'countries' })} hitSlop={8}>
                <Text style={styles.link}>{t('daysAbroad.tax.choose')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.disclaimer}>{t('daysAbroad.tax.disclaimer')}</Text>
            {summary.tax.length === 0 ? (
              <Text style={styles.empty}>{t('daysAbroad.tax.none')}</Text>
            ) : (
              summary.tax.map((c) => <TaxCard key={c.country} country={c} styles={styles} fmt={fmt} labelFor={labelFor} options={summary.settings.tax_options ?? {}} onOptions={onTaxOptions} />)
            )}
            {summary.sed && <SedCard sed={summary.sed} styles={styles} fmt={fmt} />}

            {/* Every country */}
            {summary.countries.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>{t('daysAbroad.perCountry')}</Text>
                <View style={styles.card}>
                  {summary.countries.map((c, i) => (
                    <View key={c.country} style={[styles.row, i === 0 && { borderTopWidth: 0 }]}>
                      <Text style={[styles.rowTitle, { flex: 1 }]}>{labelFor(c.country)}</Text>
                      <Text style={styles.rowValue}>{t('daysAbroad.days', { count: c.days })}</Text>
                    </View>
                  ))}
                  <Text style={styles.small}>{t('daysAbroad.perCountryHelp')}</Text>
                </View>
              </>
            )}

            {/* Stays */}
            <Text style={styles.sectionTitle}>{t('daysAbroad.stays')}</Text>
            <View style={styles.card}>
              {stays.length === 0 ? (
                <Text style={styles.small}>{t('daysAbroad.noStays')}</Text>
              ) : (
                stays.map((s, i) => (
                  <TouchableOpacity key={s.id} style={[styles.row, i === 0 && { borderTopWidth: 0 }]} onPress={() => setSheet({ type: 'stay', stay: s })}>
                    <IconSymbol
                      ios_icon_name={s.kind === 'on_board' ? 'ferry' : 'house'}
                      android_material_icon_name={s.kind === 'on_board' ? 'directions-boat' : 'home'}
                      size={20}
                      color={colors.primary}
                      style={{ marginRight: 12 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>
                        {labelFor(s.country_code)}
                        {s.kind === 'on_board' ? ` · ${t('daysAbroad.kindOnBoard')}` : ''}
                      </Text>
                      <Text style={styles.rowSub}>
                        {rangeText(s)}
                        {summary && s.start_date > summary.today ? ` · ${t('daysAbroad.planned')}` : ''}
                      </Text>
                      {s.kind === 'on_board' && !s.counts_schengen && isSchengen(s.country_code) && <Text style={styles.rowSub}>{t('daysAbroad.notSchengen')}</Text>}
                      {s.country_code === AT_SEA_CODE && !s.counts_schengen && <Text style={styles.rowSub}>{t('daysAbroad.atSeaClearedOut')}</Text>}
                      {s.country_code === AT_SEA_CODE && s.counts_schengen && summary?.schengen.at_sea_counted_ids?.includes(s.id) && (
                        <Text style={styles.rowSub}>{t('daysAbroad.atSeaCounted')}</Text>
                      )}
                      {!s.counts_tax && <Text style={styles.rowSub}>{t('daysAbroad.notTax')}</Text>}
                    </View>
                    <Text style={styles.rowValue}>{t('daysAbroad.days', { count: stayDays(s) })}</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>

            <TouchableOpacity style={[styles.actionButton, { marginTop: 16 }]} onPress={exportCsv} disabled={exporting}>
              {exporting ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <IconSymbol ios_icon_name="square.and.arrow.up" android_material_icon_name="file-download" size={18} color={colors.primary} />
                  <Text style={styles.actionText}>{t('daysAbroad.export.button')}</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {sheet?.type === 'stay' && (
        <StayEditor stay={sheet.stay} vessels={vessels} isSchengen={isSchengen} onCancel={() => setSheet(null)} onSaved={closeAndReload} onDelete={confirmDelete} />
      )}
      {sheet?.type === 'signOn' && <SignOnSheet vessels={vessels} isSchengen={isSchengen} onCancel={() => setSheet(null)} onDone={closeAndReload} />}
      {sheet?.type === 'signOff' && <SignOffSheet onCancel={() => setSheet(null)} onDone={closeAndReload} />}
      {sheet?.type === 'plan' && (
        <PlanSheet onCancel={() => setSheet(null)} onCheck={async (plan) => (await getPresenceSummary(plan)).schengen.plan} />
      )}
      {sheet?.type === 'countries' && summary && (
        <TaxCountriesSheet
          selected={summary.settings.tax_countries}
          ruleCountries={summary.rules.tax_countries}
          onCancel={() => setSheet(null)}
          onSave={async (codes) => {
            await savePresenceSettings(codes);
            closeAndReload();
          }}
        />
      )}
    </View>
  );
}

type Styles = ReturnType<typeof createDaysAbroadStyles>;

function ActionButton({ primary, icon, androidIcon, label, onPress, styles }: { primary?: boolean; icon: string; androidIcon: string; label: string; onPress: () => void; styles: Styles }) {
  return (
    <TouchableOpacity style={[styles.actionButton, primary && styles.actionButtonPrimary]} onPress={onPress}>
      <IconSymbol ios_icon_name={icon as any} android_material_icon_name={androidIcon as any} size={18} color={primary ? colors.white : colors.primary} />
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SchengenCard({ summary, styles, fmt, onPlan }: { summary: PresenceSummary; styles: Styles; fmt: (d: string) => string; onPlan: () => void }) {
  const { t } = useTranslation();
  const s = summary.schengen;
  const span = s.window_days;
  return (
    <>
      <Text style={styles.sectionTitle}>{t('daysAbroad.schengen.title')}</Text>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.big}>{t('daysAbroad.schengen.used', { used: s.used, limit: s.limit })}</Text>
        </View>
        <Text style={styles.small}>{t('daysAbroad.schengen.usedHelp', { count: s.window_days })}</Text>
        <Text style={styles.body}>{t('daysAbroad.schengen.left', { count: s.remaining })}</Text>
        {s.latest_stay_date ? (
          <Text style={styles.body}>{t('daysAbroad.schengen.latest', { date: fmt(s.latest_stay_date) })}</Text>
        ) : null}
        {s.over ? (
          <Text style={styles.danger}>{t('daysAbroad.schengen.over')}</Text>
        ) : s.warn ? (
          <Text style={styles.warning}>{t('daysAbroad.schengen.near')}</Text>
        ) : null}
        {s.future_breach && <Text style={styles.warning}>{t('daysAbroad.schengen.futureBreach', { date: fmt(s.future_breach) })}</Text>}
        {!!s.at_sea_days && <Text style={styles.small}>{t('daysAbroad.schengen.atSea', { count: s.at_sea_days })}</Text>}
        {!!s.unlogged_days && <Text style={styles.warning}>{t('daysAbroad.schengen.unlogged', { count: s.unlogged_days })}</Text>}
        {s.next_release && s.used > 0 && (
          <Text style={styles.small}>{t('daysAbroad.schengen.release', { date: fmt(s.next_release.date), count: s.next_release.remaining })}</Text>
        )}

        {/* Timeline of the 180-day window */}
        <View style={styles.timeline}>
          {s.segments.map((seg) => (
            <View
              key={seg.start_date}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${(dayDiff(s.window_start, seg.start_date) / span) * 100}%`,
                width: `${Math.max(0.6, (seg.days / span) * 100)}%`,
                backgroundColor: s.over ? colors.error : s.warn ? colors.warning : colors.primary,
              }}
            />
          ))}
        </View>
        <View style={styles.timelineLabels}>
          <Text style={styles.small}>{fmt(s.window_start)}</Text>
          <Text style={styles.small}>{t('daysAbroad.schengen.today')}</Text>
        </View>

        <TouchableOpacity style={[styles.actionButton, { marginTop: 12 }]} onPress={onPlan}>
          <IconSymbol ios_icon_name="calendar.badge.plus" android_material_icon_name="event" size={18} color={colors.primary} />
          <Text style={styles.actionText}>{t('daysAbroad.plan.button')}</Text>
        </TouchableOpacity>
        <Text style={styles.disclaimer}>{t('daysAbroad.schengen.disclaimer')}</Text>
      </View>
    </>
  );
}

function TaxCard({ country, styles, fmt, labelFor, options, onOptions }: {
  country: TaxCountry;
  styles: Styles;
  fmt: (d: string) => string;
  labelFor: (c: string) => string;
  options: TaxOptions;
  onOptions: (opts: TaxOptions) => void;
}) {
  const { t } = useTranslation();
  const note = country.has_rule
    ? t(`daysAbroad.tax.notes.${country.country}`, { defaultValue: country.note ?? '' })
    : t(`daysAbroad.tax.noRuleNotes.${country.country}`, { defaultValue: t('daysAbroad.tax.noRule') });
  const certYears = options.es_certificate_years ?? [];
  const toggleCert = (year: number, on: boolean) =>
    onOptions({ es_certificate_years: on ? [...certYears, year] : certYears.filter((y) => y !== year) });
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{labelFor(country.country)}</Text>
      <Text style={styles.small}>{note}</Text>
      <Text style={styles.small}>{t(`daysAbroad.tax.count.${country.counting}`)}</Text>
      {country.country === 'NZ' && country.has_rule && (
        <View style={[styles.row, { marginTop: 8 }]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.rowTitle}>{t('daysAbroad.tax.nzVisitor')}</Text>
            <Text style={styles.rowSub}>{t('daysAbroad.tax.nzVisitorHelp')}</Text>
          </View>
          <Toggle value={!!options.nz_visitor} onChange={(v) => onOptions({ nz_visitor: v })} />
        </View>
      )}
      {(country.country === 'CY' || country.country === 'AE') && country.has_rule && (
        <View style={[styles.row, { marginTop: 8 }]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.rowTitle}>{t(`daysAbroad.tax.alt.${country.country}.title`)}</Text>
            <Text style={styles.rowSub}>{t(`daysAbroad.tax.alt.${country.country}.help`)}</Text>
          </View>
          <Toggle
            value={!!(country.country === 'CY' ? options.cy_60_day : options.ae_90_day)}
            onChange={(v) => onOptions(country.country === 'CY' ? { cy_60_day: v } : { ae_90_day: v })}
          />
        </View>
      )}
      {country.years.map((y, i) => (
        <View key={y.label} style={[styles.row, { flexDirection: 'column', alignItems: 'stretch' }, i === 0 && { marginTop: 8 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{t('daysAbroad.tax.year', { label: y.label })}</Text>
              <Text style={styles.rowSub}>{t('daysAbroad.range', { start: fmt(y.start_date), end: fmt(y.end_date) })}</Text>
            </View>
            <Text style={styles.rowValue}>{t('daysAbroad.days', { count: y.days })}</Text>
            <StatusChip status={y.status} styles={styles} />
          </View>
          <TaxDetail country={country} year={y} styles={styles} fmt={fmt} />
          {y.planned_days > 0 && <Text style={styles.rowSub}>{t('daysAbroad.tax.planned', { count: y.planned_days })}</Text>}
          {y.unrecorded_days > 0 && <Text style={styles.rowSub}>{t('daysAbroad.tax.unrecorded', { count: y.unrecorded_days })}</Text>}
          {!!y.assumed_days && <Text style={styles.rowSub}>{t('daysAbroad.tax.assumed', { count: y.assumed_days })}</Text>}
          {country.country === 'ES' && (y.days > 0 || certYears.includes(Number(y.label))) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
              <Text style={[styles.rowSub, { flex: 1, paddingRight: 12 }]}>{t('daysAbroad.tax.esCertificate', { year: y.label })}</Text>
              <Toggle value={certYears.includes(Number(y.label))} onChange={(v) => toggleCert(Number(y.label), v)} />
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

function StatusChip({ status, styles }: { status: TaxYear['status']; styles: Styles }) {
  const { t } = useTranslation();
  if (status === 'none') return null;
  const bg = status === 'met' ? colors.error : status === 'near' ? colors.warning : colors.textSecondary;
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={styles.chipText}>{t(`daysAbroad.tax.status.${status}`)}</Text>
    </View>
  );
}

function TaxDetail({ country, year, styles, fmt }: { country: TaxCountry; year: TaxYear; styles: Styles; fmt: (d: string) => string }) {
  const { t } = useTranslation();
  const d = year.detail;
  let text: string | null = null;
  switch (country.test?.type) {
    case 'threshold':
      text = country.test.cmp === 'gt'
        ? t('daysAbroad.tax.detail.moreThan', { days: year.days, threshold: Number(d.threshold) - 1 })
        : t('daysAbroad.tax.detail.atLeast', { days: year.days, threshold: d.threshold });
      break;
    case 'majority':
      text = t('daysAbroad.tax.detail.majority', { days: year.days, threshold: d.threshold });
      break;
    case 'us_spt':
      text = t('daysAbroad.tax.detail.usSpt', { weighted: d.weighted_days, current: year.days, previous: d.previous_year, before: d.year_before });
      break;
    case 'ie_two_year':
      text = t('daysAbroad.tax.detail.ieTwoYear', { total: d.two_year_total });
      break;
    case 'za_ppt':
      text = t('daysAbroad.tax.detail.zaPpt', { total: d.previous_five_total });
      break;
    case 'nz_rolling':
      text = d.visitor
        ? t('daysAbroad.tax.detail.nzVisitor', { count: Number(d.best_18_months) })
        : t('daysAbroad.tax.detail.nzRolling', { count: Number(d.best_12_months) });
      break;
    case 'de_continuous':
      text = d.longest_stay_start
        ? t('daysAbroad.tax.detail.deLongest', { count: Number(d.longest_stay), start: fmt(String(d.longest_stay_start)), end: fmt(String(d.longest_stay_end)) })
        : t('daysAbroad.tax.detail.deNone');
      break;
    case 'continuous':
      text = d.longest_stay_start
        ? t('daysAbroad.tax.detail.continuous', { count: Number(d.longest_stay), start: fmt(String(d.longest_stay_start)), end: fmt(String(d.longest_stay_end)), threshold: d.threshold })
        : t('daysAbroad.tax.detail.continuousNone');
      break;
    case 'rolling':
      text = (country.test.tests ?? [])
        .map((rt, k) =>
          t('daysAbroad.tax.detail.rolling', {
            count: Number(d[`best_${k}`] ?? 0),
            months: rt.months,
            threshold: rt.cmp === 'gte' ? rt.days : rt.days + 1,
          }),
        )
        .join(' ');
      break;
    case 'year_or_multi':
      text = t('daysAbroad.tax.detail.yearOrMulti', { total: d.multi_total, years: country.test.years, over: country.test.total });
      break;
    default:
      text = null;
  }
  if (d.alt_rule_days != null) {
    const alt = t('daysAbroad.tax.detail.altRule', { count: Number(d.alt_rule_count), threshold: Number(d.alt_rule_days) });
    text = text ? `${text} ${alt}` : alt;
  }
  if (!text) return null;
  return <Text style={styles.rowSub}>{text}</Text>;
}

function SedCard({ sed, styles, fmt }: { sed: NonNullable<PresenceSummary['sed']>; styles: Styles; fmt: (d: string) => string }) {
  const { t } = useTranslation();
  const c = sed.current;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t('daysAbroad.sed.title')}</Text>
      <Text style={styles.small}>{t('daysAbroad.sed.intro')}</Text>
      {c ? (
        <>
          <Text style={styles.body}>
            {t('daysAbroad.sed.current', { start: fmt(c.start_date), end: fmt(c.end_date), days: c.days, away: c.absence_days, uk: c.uk_days })}
          </Text>
          {c.broken ? (
            <Text style={styles.warning}>{t('daysAbroad.sed.broken')}</Text>
          ) : c.eligible ? (
            <Text style={styles.ok}>{t('daysAbroad.sed.eligibleNow')}</Text>
          ) : (
            <Text style={styles.body}>{t('daysAbroad.sed.toGo', { count: c.days_to_365 })}</Text>
          )}
        </>
      ) : (
        <Text style={styles.body}>{t('daysAbroad.sed.none')}</Text>
      )}
      {sed.periods.length > 0 && (
        <>
          <Text style={[styles.editorLabel, { marginTop: 12 }]}>{t('daysAbroad.sed.periods')}</Text>
          {sed.periods.map((p) => (
            <Text key={p.start_date} style={styles.rowSub}>
              {t('daysAbroad.sed.period', { start: fmt(p.start_date), end: fmt(p.end_date), days: p.days })}
            </Text>
          ))}
        </>
      )}
      <Text style={styles.disclaimer}>{t('daysAbroad.sed.disclaimer')}</Text>
    </View>
  );
}
