/**
 * Sheets for the Days abroad screen: country picker, add/edit a stay, signed
 * on, signed off, try a trip, and picking tax countries. One file for iOS and
 * Android.
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  Switch,
  ScrollView,
  FlatList,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { DatePickerSheet } from '@/components/DatePickerSheet';
import { countryList, countryName } from '@/utils/countryCodes';
import { formatDayShort, localDate, todayIso } from '@/utils/localDate';
import { error as logError } from '@/utils/log';
import {
  AT_SEA_CODE,
  addStay,
  signOff,
  signOn,
  updateStay,
  type PresenceStay,
  type SchengenPlan,
  type StayKind,
} from '@/utils/presenceApi';
import { createDaysAbroadStyles } from './styles';

export interface VesselOption {
  id: string;
  vessel_name: string;
}

export function useCountryLabel() {
  const { t } = useTranslation();
  return (code: string | null | undefined) => (code === AT_SEA_CODE ? t('daysAbroad.atSea') : countryName(code) ?? '');
}

function useStyles() {
  const isDark = useColorScheme() === 'dark';
  return createDaysAbroadStyles(isDark);
}

function problemFor(e: any, t: (k: string) => string): string {
  if (e?.status === 409) return t('daysAbroad.errors.overlap');
  if (e?.status === 400) return t('daysAbroad.errors.badDates');
  if (e?.status === 404) return t('daysAbroad.errors.notSignedOn');
  return t('daysAbroad.errors.notSaved');
}

// ── Small parts ───────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
      thumbColor={value ? colors.switchThumbOn : colors.switchThumbOff}
    />
  );
}

function DateField({ label, value, onChange, minimumDate, maximumDate }: { label: string; value: string; onChange: (v: string) => void; minimumDate?: string; maximumDate?: string }) {
  const { i18n } = useTranslation();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.editorBlock}>
      <Text style={styles.editorLabel}>{label}</Text>
      <TouchableOpacity style={styles.field} onPress={() => setOpen(true)}>
        <IconSymbol ios_icon_name="calendar" android_material_icon_name="calendar-today" size={16} color={colors.primary} />
        <Text style={styles.fieldText}>{formatDayShort(value, i18n.language)}</Text>
      </TouchableOpacity>
      <DatePickerSheet
        visible={open}
        value={localDate(value)}
        title={label}
        minimumDate={minimumDate ? localDate(minimumDate) : undefined}
        maximumDate={maximumDate ? localDate(maximumDate) : undefined}
        onCancel={() => setOpen(false)}
        onConfirm={(d) => {
          onChange(todayIso(d));
          setOpen(false);
        }}
      />
    </View>
  );
}

function CountryField({ label, value, onPress, placeholder }: { label: string; value: string | null; onPress: () => void; placeholder?: string }) {
  const styles = useStyles();
  const labelFor = useCountryLabel();
  return (
    <View style={styles.editorBlock}>
      <Text style={styles.editorLabel}>{label}</Text>
      <TouchableOpacity style={styles.field} onPress={onPress}>
        <IconSymbol ios_icon_name="globe" android_material_icon_name="public" size={16} color={colors.primary} />
        <Text style={styles.fieldText}>{value ? labelFor(value) : placeholder}</Text>
        <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

function VesselField({ vessels, value, onChange }: { vessels: VesselOption[]; value: string | null; onChange: (id: string | null) => void }) {
  const { t } = useTranslation();
  const styles = useStyles();
  if (vessels.length === 0) return null;
  return (
    <View style={styles.editorBlock}>
      <Text style={styles.editorLabel}>{t('daysAbroad.vessel')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {[{ id: '', vessel_name: t('daysAbroad.noVessel') }, ...vessels].map((v) => {
          const on = (value ?? '') === v.id;
          return (
            <TouchableOpacity key={v.id || 'none'} onPress={() => onChange(v.id || null)} style={[styles.chip, { marginLeft: 0, paddingVertical: 6, borderWidth: 1, borderColor: colors.primary, backgroundColor: on ? colors.primary : 'transparent' }]}>
              <Text style={[styles.chipText, { color: on ? colors.white : colors.primary }]}>{v.vessel_name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function SheetButtons({ saving, onCancel, onSave, saveLabel, onDelete }: { saving: boolean; onCancel: () => void; onSave: () => void; saveLabel?: string; onDelete?: () => void }) {
  const { t } = useTranslation();
  const styles = useStyles();
  return (
    <View style={styles.buttons}>
      {onDelete && (
        <TouchableOpacity style={[styles.button, { marginRight: 'auto', paddingHorizontal: 0, minWidth: 0 }]} onPress={onDelete} disabled={saving}>
          <Text style={styles.deleteText}>{t('common.delete')}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.button} onPress={onCancel} disabled={saving}>
        <Text style={styles.cancelText}>{t('common.cancel')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={onSave} disabled={saving}>
        {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveText}>{saveLabel ?? t('common.save')}</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ── Country picker ────────────────────────────────────────────────────

export function CountryPicker({ visible, allowAtSea, title, onPick, onCancel }: { visible: boolean; allowAtSea?: boolean; title: string; onPick: (code: string) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const [query, setQuery] = useState('');
  const items = useMemo(() => {
    const all = countryList();
    const q = query.trim().toLowerCase();
    const list = q ? all.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q) : all;
    return allowAtSea && (!q || t('daysAbroad.atSea').toLowerCase().includes(q)) ? [{ code: AT_SEA_CODE, name: t('daysAbroad.atSea') }, ...list] : list;
  }, [query, allowAtSea, t]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.editor, { height: '80%' }]}>
          <Text style={styles.editorTitle}>{title}</Text>
          <TextInput
            style={[styles.input, { marginTop: 12 }]}
            value={query}
            onChangeText={setQuery}
            placeholder={t('daysAbroad.searchCountry')}
            placeholderTextColor={colors.textSecondary}
            autoCorrect={false}
          />
          <FlatList
            style={{ marginTop: 8 }}
            data={items}
            keyExtractor={(c) => c.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.pickerItem}
                onPress={() => {
                  setQuery('');
                  onPick(item.code);
                }}
              >
                <Text style={styles.fieldText}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.button} onPress={onCancel}>
              <Text style={styles.cancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Add or edit a stay ────────────────────────────────────────────────

export function StayEditor({
  stay,
  vessels,
  isSchengen,
  onCancel,
  onSaved,
  onDelete,
}: {
  stay: PresenceStay | null;
  vessels: VesselOption[];
  isSchengen: (code: string) => boolean;
  onCancel: () => void;
  onSaved: () => void;
  onDelete?: (stay: PresenceStay) => void;
}) {
  const { t } = useTranslation();
  const styles = useStyles();
  const [kind, setKind] = useState<StayKind>(stay?.kind ?? 'ashore');
  const [country, setCountry] = useState<string | null>(stay?.country_code ?? null);
  const [vesselId, setVesselId] = useState<string | null>(stay?.vessel_id ?? null);
  const [start, setStart] = useState(stay?.start_date ?? todayIso());
  const [end, setEnd] = useState<string | null>(stay ? stay.end_date : todayIso());
  const [countsSchengen, setCountsSchengen] = useState(stay?.counts_schengen ?? true);
  const [countsTax, setCountsTax] = useState(stay?.counts_tax ?? true);
  const [note, setNote] = useState(stay?.note ?? '');
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    if (!country) {
      setProblem(t('daysAbroad.errors.pickCountry'));
      return;
    }
    if (end && end < start) {
      setProblem(t('daysAbroad.errors.badDates'));
      return;
    }
    if (!end && start > todayIso()) {
      setProblem(t('daysAbroad.errors.openFuture'));
      return;
    }
    setSaving(true);
    setProblem(null);
    const body = {
      country_code: country,
      start_date: start,
      end_date: end,
      kind,
      vessel_id: kind === 'on_board' ? vesselId : null,
      counts_schengen: kind === 'ashore' ? true : countsSchengen,
      counts_tax: countsTax,
      note: note.trim() || null,
    };
    try {
      if (stay) await updateStay(stay.id, body);
      else await addStay(body);
      onSaved();
    } catch (e: any) {
      logError('[DaysAbroad] Save stay failed:', e?.message || e);
      setProblem(problemFor(e, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.editor}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.editorTitle}>{stay ? t('daysAbroad.editStay') : t('daysAbroad.addStay')}</Text>

            <View style={styles.editorBlock}>
              <View style={styles.segment}>
                {(['ashore', 'on_board'] as StayKind[]).map((k) => (
                  <TouchableOpacity key={k} style={[styles.segmentItem, kind === k && styles.segmentItemOn]} onPress={() => setKind(k)}>
                    <Text style={[styles.segmentText, kind === k && styles.segmentTextOn]}>{k === 'ashore' ? t('daysAbroad.kindAshore') : t('daysAbroad.kindOnBoard')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <CountryField
              label={kind === 'on_board' ? t('daysAbroad.vesselCountry') : t('daysAbroad.country')}
              value={country}
              placeholder={t('daysAbroad.pickCountry')}
              onPress={() => setPicking(true)}
            />
            {kind === 'on_board' && <Text style={styles.small}>{t('daysAbroad.vesselCountryHelp')}</Text>}
            {kind === 'on_board' && <VesselField vessels={vessels} value={vesselId} onChange={setVesselId} />}

            <DateField label={kind === 'on_board' ? t('daysAbroad.signedOnDate') : t('daysAbroad.arrived')} value={start} onChange={setStart} />

            <View style={styles.editorBlock}>
              <View style={styles.editorRow}>
                <Text style={styles.editorRowText}>{kind === 'on_board' ? t('daysAbroad.stillOnBoard') : t('daysAbroad.stillHere')}</Text>
                <Toggle value={end == null} onChange={(open) => setEnd(open ? null : start > todayIso() ? start : todayIso())} />
              </View>
            </View>
            {end != null && (
              <DateField label={kind === 'on_board' ? t('daysAbroad.signedOffDate') : t('daysAbroad.left')} value={end} onChange={setEnd} minimumDate={start} />
            )}

            {kind === 'on_board' && country && isSchengen(country) && (
              <View style={styles.editorBlock}>
                <View style={styles.editorRow}>
                  <Text style={styles.editorRowText}>{t('daysAbroad.countsSchengen')}</Text>
                  <Toggle value={countsSchengen} onChange={setCountsSchengen} />
                </View>
                <Text style={styles.small}>{t('daysAbroad.countsSchengenHelp')}</Text>
              </View>
            )}

            <View style={styles.editorBlock}>
              <View style={styles.editorRow}>
                <Text style={styles.editorRowText}>{t('daysAbroad.countsTax')}</Text>
                <Toggle value={countsTax} onChange={setCountsTax} />
              </View>
              <Text style={styles.small}>{t('daysAbroad.countsTaxHelp')}</Text>
            </View>

            <View style={styles.editorBlock}>
              <Text style={styles.editorLabel}>{t('daysAbroad.note')}</Text>
              <TextInput style={styles.input} value={note} onChangeText={setNote} maxLength={500} placeholder={t('daysAbroad.notePlaceholder')} placeholderTextColor={colors.textSecondary} />
            </View>

            {problem && <Text style={styles.problem}>{problem}</Text>}
            <SheetButtons saving={saving} onCancel={onCancel} onSave={save} onDelete={stay && onDelete ? () => onDelete(stay) : undefined} />
          </ScrollView>
        </View>
      </View>
      <CountryPicker
        visible={picking}
        allowAtSea={kind === 'on_board'}
        title={t('daysAbroad.pickCountry')}
        onCancel={() => setPicking(false)}
        onPick={(c) => {
          setCountry(c);
          setPicking(false);
        }}
      />
    </Modal>
  );
}

// ── Signed on / signed off ────────────────────────────────────────────

export function SignOnSheet({ vessels, isSchengen, onCancel, onDone }: { vessels: VesselOption[]; isSchengen: (code: string) => boolean; onCancel: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const [country, setCountry] = useState<string | null>(null);
  const [vesselId, setVesselId] = useState<string | null>(vessels.length === 1 ? vessels[0].id : null);
  const [date, setDate] = useState(todayIso());
  const [countsSchengen, setCountsSchengen] = useState(true);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    if (!country) {
      setProblem(t('daysAbroad.errors.pickCountry'));
      return;
    }
    setSaving(true);
    setProblem(null);
    try {
      await signOn({ country_code: country, vessel_id: vesselId, counts_schengen: countsSchengen, date });
      onDone();
    } catch (e: any) {
      logError('[DaysAbroad] Sign on failed:', e?.message || e);
      setProblem(problemFor(e, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.editor}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.editorTitle}>{t('daysAbroad.signOnTitle')}</Text>
            <Text style={styles.small}>{t('daysAbroad.signOnIntro')}</Text>
            <CountryField label={t('daysAbroad.vesselCountry')} value={country} placeholder={t('daysAbroad.pickCountry')} onPress={() => setPicking(true)} />
            <VesselField vessels={vessels} value={vesselId} onChange={setVesselId} />
            <DateField label={t('daysAbroad.signedOnDate')} value={date} onChange={setDate} maximumDate={todayIso()} />
            {country && isSchengen(country) && (
              <View style={styles.editorBlock}>
                <View style={styles.editorRow}>
                  <Text style={styles.editorRowText}>{t('daysAbroad.countsSchengen')}</Text>
                  <Toggle value={countsSchengen} onChange={setCountsSchengen} />
                </View>
                <Text style={styles.small}>{t('daysAbroad.countsSchengenHelp')}</Text>
              </View>
            )}
            {problem && <Text style={styles.problem}>{problem}</Text>}
            <SheetButtons saving={saving} onCancel={onCancel} onSave={save} saveLabel={t('daysAbroad.signedOn')} />
          </ScrollView>
        </View>
      </View>
      <CountryPicker
        visible={picking}
        allowAtSea
        title={t('daysAbroad.vesselCountry')}
        onCancel={() => setPicking(false)}
        onPick={(c) => {
          setCountry(c);
          setPicking(false);
        }}
      />
    </Modal>
  );
}

export function SignOffSheet({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const [country, setCountry] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setProblem(null);
    try {
      await signOff({ country_code: country, date });
      onDone();
    } catch (e: any) {
      logError('[DaysAbroad] Sign off failed:', e?.message || e);
      setProblem(problemFor(e, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.editor}>
          <Text style={styles.editorTitle}>{t('daysAbroad.signOffTitle')}</Text>
          <DateField label={t('daysAbroad.signedOffDate')} value={date} onChange={setDate} maximumDate={todayIso()} />
          <CountryField label={t('daysAbroad.whereNow')} value={country} placeholder={t('daysAbroad.whereNowSkip')} onPress={() => setPicking(true)} />
          <Text style={styles.small}>{t('daysAbroad.whereNowHelp')}</Text>
          {problem && <Text style={styles.problem}>{problem}</Text>}
          <SheetButtons saving={saving} onCancel={onCancel} onSave={save} saveLabel={t('daysAbroad.signedOff')} />
        </View>
      </View>
      <CountryPicker
        visible={picking}
        title={t('daysAbroad.whereNow')}
        onCancel={() => setPicking(false)}
        onPick={(c) => {
          setCountry(c);
          setPicking(false);
        }}
      />
    </Modal>
  );
}

// ── Try a trip ────────────────────────────────────────────────────────

export function PlanSheet({ onCancel, onCheck }: { onCancel: () => void; onCheck: (plan: { start_date: string; end_date: string }) => Promise<SchengenPlan | null> }) {
  const { t, i18n } = useTranslation();
  const styles = useStyles();
  const tomorrow = todayIso(new Date(Date.now() + 86_400_000));
  const [start, setStart] = useState(tomorrow);
  const [end, setEnd] = useState(todayIso(new Date(Date.now() + 14 * 86_400_000)));
  const [result, setResult] = useState<SchengenPlan | null>(null);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const fmt = (d: string) => formatDayShort(d, i18n.language);

  const check = async () => {
    if (end < start) {
      setProblem(t('daysAbroad.errors.badDates'));
      return;
    }
    setChecking(true);
    setProblem(null);
    try {
      setResult(await onCheck({ start_date: start, end_date: end }));
    } catch (e: any) {
      logError('[DaysAbroad] Plan check failed:', e?.message || e);
      setProblem(t('daysAbroad.errors.loadFailed'));
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.editor}>
          <ScrollView>
            <Text style={styles.editorTitle}>{t('daysAbroad.plan.title')}</Text>
            <Text style={styles.small}>{t('daysAbroad.plan.intro')}</Text>
            <DateField label={t('daysAbroad.plan.enter')} value={start} onChange={(v) => { setStart(v); setResult(null); }} />
            <DateField label={t('daysAbroad.plan.leave')} value={end} onChange={(v) => { setEnd(v); setResult(null); }} minimumDate={start} />
            {result && (
              <View style={styles.editorBlock}>
                {result.ok ? (
                  <Text style={styles.ok}>{t('daysAbroad.plan.ok', { count: result.days })}</Text>
                ) : (
                  <Text style={styles.danger}>{t('daysAbroad.plan.breaks', { date: fmt(result.first_breach as string) })}</Text>
                )}
                <Text style={styles.body}>{t('daysAbroad.plan.maxUsed', { count: result.max_used })}</Text>
                {result.latest_stay_if_enter ? (
                  <Text style={styles.body}>{t('daysAbroad.plan.latest', { date: fmt(result.latest_stay_if_enter) })}</Text>
                ) : (
                  <Text style={styles.body}>{t('daysAbroad.plan.noDaysThen')}</Text>
                )}
              </View>
            )}
            {problem && <Text style={styles.problem}>{problem}</Text>}
            <Text style={styles.disclaimer}>{t('daysAbroad.schengen.disclaimer')}</Text>
            <SheetButtons saving={checking} onCancel={onCancel} onSave={check} saveLabel={t('daysAbroad.plan.check')} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Tax countries ─────────────────────────────────────────────────────

export function TaxCountriesSheet({ selected, ruleCountries, onCancel, onSave }: { selected: string[]; ruleCountries: string[]; onCancel: () => void; onSave: (codes: string[]) => Promise<void> }) {
  const { t } = useTranslation();
  const styles = useStyles();
  const labelFor = useCountryLabel();
  const [codes, setCodes] = useState<string[]>(selected);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const others = codes.filter((c) => !ruleCountries.includes(c));
  const toggle = (c: string) => setCodes((list) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]));

  const save = async () => {
    setSaving(true);
    setProblem(null);
    try {
      await onSave(codes);
    } catch (e: any) {
      logError('[DaysAbroad] Save countries failed:', e?.message || e);
      setProblem(t('daysAbroad.errors.notSaved'));
      setSaving(false);
    }
  };

  const row = (c: string) => (
    <TouchableOpacity key={c} style={styles.pickerItem} onPress={() => toggle(c)}>
      <Text style={styles.fieldText}>{labelFor(c)}</Text>
      <IconSymbol
        ios_icon_name={codes.includes(c) ? 'checkmark.circle.fill' : 'circle'}
        android_material_icon_name={codes.includes(c) ? 'check-circle' : 'radio-button-unchecked'}
        size={22}
        color={codes.includes(c) ? colors.primary : colors.textSecondary}
      />
    </TouchableOpacity>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.editor, { height: '80%' }]}>
          <Text style={styles.editorTitle}>{t('daysAbroad.tax.pickTitle')}</Text>
          <Text style={styles.small}>{t('daysAbroad.tax.pickIntro')}</Text>
          <ScrollView style={{ marginTop: 8 }}>
            {ruleCountries.map(row)}
            <Text style={[styles.editorLabel, { marginTop: 16 }]}>{t('daysAbroad.tax.otherCountries')}</Text>
            <Text style={styles.small}>{t('daysAbroad.tax.otherCountriesHelp')}</Text>
            {others.map(row)}
            <TouchableOpacity style={[styles.field, { marginTop: 10 }]} onPress={() => setPicking(true)}>
              <IconSymbol ios_icon_name="plus.circle" android_material_icon_name="add-circle-outline" size={18} color={colors.primary} />
              <Text style={styles.link}>{t('daysAbroad.tax.addCountry')}</Text>
            </TouchableOpacity>
          </ScrollView>
          {problem && <Text style={styles.problem}>{problem}</Text>}
          <SheetButtons saving={saving} onCancel={onCancel} onSave={save} />
        </View>
      </View>
      <CountryPicker
        visible={picking}
        title={t('daysAbroad.tax.addCountry')}
        onCancel={() => setPicking(false)}
        onPick={(c) => {
          setCodes((list) => (list.includes(c) ? list : [...list, c]));
          setPicking(false);
        }}
      />
    </Modal>
  );
}

