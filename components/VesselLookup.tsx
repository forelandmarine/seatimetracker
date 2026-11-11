/**
 * Add Vessel: find the MMSI from the vessel's name (length overall optional, a
 * ranking hint only), for people who don't have the MMSI to hand. Matches come
 * from our own vessel index (or a web search when that finds nothing). The
 * user picks one, it is checked on AIS, and only then is its MMSI filled in.
 * Used by both Home screens.
 *
 * The parent's length value is always metres: when the user types feet, this
 * component converts before calling onLengthChange.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, useColorScheme, Alert, Linking, Platform,
} from 'react-native';
import Constants from 'expo-constants';
import { colors, withOpacity } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import {
  lookupVessel, confirmVesselLookup, getUserProfile,
  type VesselCandidate, type VesselConfirmResult,
} from '@/utils/seaTimeApi';
import { phoneRegion } from '@/utils/trainingProviders';
import { trackEvent } from '@/utils/appEvents';
import { useAuth } from '@/contexts/AuthContext';

type Unit = 'm' | 'ft';

interface Props {
  name: string;
  onNameChange: (v: string) => void;
  /** Length overall in metres (converted here when the user types feet). */
  length: string;
  onLengthChange: (metres: string) => void;
  /** User confirmed a match: fill the MMSI (and any empty particulars). */
  onConfirm: (c: VesselCandidate) => void;
  /** Take the user to the MMSI field (focus it). */
  onEnterMmsi?: () => void;
}

type State =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'error'; message: string }
  | { kind: 'results'; candidates: VesselCandidate[] }
  | { kind: 'checking'; candidate: VesselCandidate; candidates: VesselCandidate[] }
  | { kind: 'check'; candidate: VesselCandidate; result: VesselConfirmResult; candidates: VesselCandidate[] }
  | { kind: 'confirmed'; candidate: VesselCandidate };

const FT = 0.3048;
const MAIL_TO = 'info@forelandmarine.com';
const APP_VERSION = `${Constants.expoConfig?.version || 'unknown'} (${
  Platform.OS === 'ios'
    ? Constants.expoConfig?.ios?.buildNumber || '?'
    : String(Constants.expoConfig?.android?.versionCode || '?')
})`;

const round1 = (n: number) => Math.round(n * 10) / 10;
const parseNum = (s: string) => {
  const n = Number(s.replace(',', '.').trim());
  return s.trim() && Number.isFinite(n) && n > 0 ? n : null;
};

export const formatLength = (m: number | null | undefined) =>
  m ? `${round1(m)} m (${Math.round(m / FT)} ft)` : null;

const describe = (c: VesselCandidate) =>
  [c.type, c.flag, formatLength(c.length_metres)].filter(Boolean).join('  ·  ');

const ids = (c: VesselCandidate) =>
  [`MMSI ${c.mmsi}`, c.call_sign ? `Call sign ${c.call_sign}` : null].filter(Boolean).join('  ·  ');

const formerly = (c: VesselCandidate) =>
  c.former_names && c.former_names.length ? `Formerly ${c.former_names.slice(0, 3).join(', ')}` : null;

export default function VesselLookup({ name, onNameChange, length, onLengthChange, onConfirm, onEnterMmsi }: Props) {
  const isDark = useColorScheme() === 'dark';
  const s = createStyles(isDark);
  const { user } = useAuth();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [unit, setUnit] = useState<Unit>(() => (phoneRegion() === 'US' ? 'ft' : 'm'));
  const unitTouched = useRef(false);
  // What the user typed, in their unit. The parent only ever sees metres.
  const [typed, setTyped] = useState(length);
  const lastEmitted = useRef(length);

  // USCG users get feet by default (the phone region is the backup above).
  useEffect(() => {
    let live = true;
    getUserProfile()
      .then((p: any) => {
        if (!live || unitTouched.current) return;
        if (String(p?.maritime_authority || '').toLowerCase() === 'uscg') setUnit('ft');
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // The parent cleared or filled the length itself (form reset, AIS fill).
  useEffect(() => {
    if (length === lastEmitted.current) return;
    lastEmitted.current = length;
    const m = parseNum(length);
    setTyped(m == null ? length : unit === 'ft' ? String(Math.round(m / FT)) : String(round1(m)));
  }, [length, unit]);

  const emitLength = (text: string, u: Unit) => {
    const n = parseNum(text);
    const metres = n == null ? (text.trim() ? text : '') : String(u === 'ft' ? round1(n * FT) : n);
    lastEmitted.current = metres;
    onLengthChange(metres);
  };

  const typedLength = parseNum(typed);
  const lettersOk = name.replace(/[^A-Za-z0-9\u00C0-\u024F]/g, '').length >= 3;
  const busy = state.kind === 'searching' || state.kind === 'checking';
  const canSearch = lettersOk && !busy;

  const resetIfShowing = () => {
    if (state.kind !== 'idle' && !busy) setState({ kind: 'idle' });
  };

  const onName = (v: string) => { onNameChange(v); resetIfShowing(); };
  const onLength = (v: string) => { setTyped(v); emitLength(v, unit); resetIfShowing(); };
  const onUnit = (u: Unit) => {
    if (u === unit) return;
    unitTouched.current = true;
    setUnit(u);
    // The number stays as typed; the user is saying which unit they meant.
    emitLength(typed, u);
    resetIfShowing();
  };

  const openRenamedMail = async () => {
    trackEvent('vessel_renamed_mail');
    const lengthText = typedLength ? `${typed.trim()} ${unit}` : 'not given';
    const subject = `Vessel renamed: ${name.trim()}`;
    const body = [
      `Name I searched for: ${name.trim()}`,
      `Length overall: ${lengthText}`,
      `Account email: ${user?.email || 'unknown'}`,
      `App version: ${APP_VERSION}, ${Platform.OS}`,
      '',
      'Current name:',
      'Former name:',
      'MMSI or call sign if known:',
      '',
    ].join('\n');
    const url = `mailto:${MAIL_TO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('No email app found', `Email ${MAIL_TO} with the vessel's current and former names.`);
    }
  };

  const enterMmsi = () => {
    setState({ kind: 'idle' });
    onEnterMmsi?.();
  };

  const showNoMatch = () => {
    Alert.alert(
      `No match for "${name.trim()}"`,
      "Check the spelling, or enter the MMSI. It's on the VHF or AIS unit and the ship's radio licence.",
      [
        { text: 'Enter MMSI', onPress: enterMmsi },
        { text: 'My vessel was renamed', onPress: openRenamedMail },
        { text: 'Close', style: 'cancel' },
      ],
    );
  };

  const search = async () => {
    if (!canSearch) return;
    setState({ kind: 'searching' });
    try {
      const { candidates, source } = await lookupVessel(name, typedLength ? String(typedLength) : '', unit);
      trackEvent('vessel_lookup', candidates.length);
      if (source === 'web') trackEvent('vessel_lookup_web', candidates.length);
      if (candidates.length) {
        setState({ kind: 'results', candidates });
      } else {
        setState({ kind: 'idle' });
        showNoMatch();
      }
    } catch (e: any) {
      trackEvent('vessel_lookup', 'error');
      // 400 (name too short once "MY" etc. is removed) and 429 carry a message meant for the user.
      const msg = (e?.status === 429 || e?.status === 400) && e?.message
        ? e.message
        : 'Vessel search is not available right now. Enter the MMSI below.';
      setState({ kind: 'error', message: msg });
    }
  };

  const pick = async (c: VesselCandidate, candidates: VesselCandidate[]) => {
    setState({ kind: 'checking', candidate: c, candidates });
    try {
      const result = await confirmVesselLookup(c);
      trackEvent('vessel_check', result.status);
      setState({ kind: 'check', candidate: c, result, candidates });
    } catch (e: any) {
      trackEvent('vessel_check', 'error');
      const result: VesselConfirmResult = { status: 'unavailable', vessel: null, note: e?.status === 429 ? e.message : null };
      setState({ kind: 'check', candidate: c, result, candidates });
    }
  };

  const accept = (picked: VesselCandidate, checked?: VesselCandidate | null) => {
    const c: VesselCandidate = checked
      ? {
          ...picked,
          ...checked,
          former_names: Array.from(new Set([...(checked.former_names || []), ...(picked.former_names || [])])),
        }
      : picked;
    trackEvent('vessel_confirmed');
    onConfirm(c);
    setState({ kind: 'confirmed', candidate: c });
  };

  const notMine = (candidates: VesselCandidate[]) => {
    if (candidates.length > 1) setState({ kind: 'results', candidates });
    else { setState({ kind: 'idle' }); showNoMatch(); }
  };

  const placeholderColor = isDark ? colors.textSecondary : colors.textSecondaryLight;

  return (
    <View>
      <View style={s.group}>
        <Text style={s.label}>Vessel name *</Text>
        <TextInput
          style={s.input}
          placeholder="As shown on AIS, e.g. Serenity"
          placeholderTextColor={placeholderColor}
          value={name}
          onChangeText={onName}
          // Vessel names are proper names; autocorrect turns e.g. Svitzer into Switzerland
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="next"
        />
      </View>

      <View style={s.group}>
        <Text style={s.label}>Length overall</Text>
        <View style={s.row}>
          <TextInput
            style={[s.input, s.lengthInput]}
            placeholder={unit === 'ft' ? 'e.g. 42' : 'e.g. 45.5'}
            placeholderTextColor={placeholderColor}
            value={typed}
            onChangeText={onLength}
            keyboardType="decimal-pad"
            returnKeyType="search"
            onSubmitEditing={search}
          />
          <View style={s.segment} accessibilityRole="radiogroup">
            {(['ft', 'm'] as Unit[]).map((u) => (
              <TouchableOpacity
                key={u}
                style={[s.segmentItem, unit === u && s.segmentOn]}
                onPress={() => onUnit(u)}
                accessibilityRole="radio"
                accessibilityState={{ selected: unit === u }}
                accessibilityLabel={u === 'ft' ? 'Feet' : 'Metres'}
              >
                <Text style={[s.segmentText, unit === u && s.segmentTextOn]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {typedLength != null && (
          <Text style={s.subtle}>
            {unit === 'ft' ? `${round1(typedLength * FT)} m` : `${Math.round(typedLength / FT)} ft`}
          </Text>
        )}
      </View>

      {(state.kind === 'idle' || state.kind === 'searching' || state.kind === 'error') && (
        <>
          <TouchableOpacity
            style={[s.findButton, !canSearch && s.findButtonOff]}
            onPress={search}
            disabled={!canSearch}
            accessibilityRole="button"
          >
            {state.kind === 'searching' ? (
              <View style={s.row}>
                <ActivityIndicator color={colors.primary} />
                <Text style={s.findText}>Searching</Text>
              </View>
            ) : (
              <Text style={[s.findText, !canSearch && s.findTextOff]}>Find my vessel</Text>
            )}
          </TouchableOpacity>
          <Text style={s.hint}>
            {state.kind === 'error'
              ? state.message
              : state.kind === 'searching'
                ? 'This can take up to half a minute if we have to search further afield.'
                : 'No MMSI to hand? Enter the name (and the length if you know it) and we will look it up.'}
          </Text>
        </>
      )}

      {state.kind === 'results' && (
        <View style={s.results}>
          <Text style={s.resultsTitle}>{state.candidates.length === 1 ? 'Is this your vessel?' : 'Which is your vessel?'}</Text>
          {typedLength != null && state.candidates.length > 1 && (
            <Text style={s.resultsSub}>Closest to {typed.trim()} {unit} first</Text>
          )}
          {state.candidates.map((c) => (
            <TouchableOpacity
              key={c.mmsi}
              style={s.card}
              onPress={() => pick(c, state.candidates)}
              accessibilityRole="button"
              accessibilityLabel={`${c.name}, MMSI ${c.mmsi}. This one`}
            >
              <Text style={[s.cardName, s.cardNameWithPick]}>{c.name}</Text>
              {!!describe(c) && <Text style={s.cardMeta}>{describe(c)}</Text>}
              {!!formerly(c) && <Text style={s.cardMeta}>{formerly(c)}</Text>}
              <Text style={s.cardMmsi}>{ids(c)}</Text>
              <Text style={s.pick}>This one</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => { setState({ kind: 'idle' }); showNoMatch(); }} style={s.notMine}>
            <Text style={s.notMineText}>None of these</Text>
          </TouchableOpacity>
        </View>
      )}

      {state.kind === 'checking' && (
        <View style={[s.card, s.center]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[s.cardMeta, { marginTop: 8 }]}>Checking AIS</Text>
          <Text style={s.cardName}>{state.candidate.name}</Text>
        </View>
      )}

      {state.kind === 'check' && renderCheck(state)}

      {state.kind === 'confirmed' && (
        <View style={s.confirmed}>
          <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={20} color={colors.success} />
          <Text style={s.confirmedText}>
            {state.candidate.name}, MMSI {state.candidate.mmsi} filled in.
          </Text>
          <TouchableOpacity onPress={() => setState({ kind: 'idle' })} hitSlop={8}>
            <Text style={s.change}>Change</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  function renderCheck(st: Extract<State, { kind: 'check' }>) {
    const { candidate, result, candidates } = st;
    const back = candidates.length > 1 ? () => setState({ kind: 'results', candidates }) : null;

    if (result.status === 'live' && result.vessel) {
      const v = result.vessel;
      const merged = { ...candidate, ...v, former_names: Array.from(new Set([...(v.former_names || []), ...(candidate.former_names || [])])) };
      const lastSeen = v.last_position_at ? new Date(v.last_position_at) : null;
      return (
        <View style={s.results}>
          <View style={[s.card, s.checkedCard]}>
            <View style={s.row}>
              <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={18} color={colors.success} />
              <Text style={s.checkedLabel}>Checked on AIS now</Text>
            </View>
            <Text style={[s.cardName, { marginTop: 8 }]}>{v.name}</Text>
            {!!describe(v) && <Text style={s.cardMeta}>{describe(v)}</Text>}
            {!!formerly(merged) && <Text style={s.cardMeta}>{formerly(merged)}</Text>}
            {(v.imo || v.year_built) && (
              <Text style={s.cardMeta}>
                {[v.imo ? `IMO ${v.imo}` : null, v.year_built ? `Built ${v.year_built}` : null].filter(Boolean).join('  ·  ')}
              </Text>
            )}
            {lastSeen && !Number.isNaN(lastSeen.getTime()) && (
              <Text style={s.cardMeta}>
                Last seen on AIS {lastSeen.toLocaleDateString()}{v.area ? `, ${v.area}` : ''}
              </Text>
            )}
            <Text style={s.cardMmsi}>{ids(v)}</Text>
            {!!result.note && <Text style={s.note}>{result.note}</Text>}
          </View>
          <TouchableOpacity style={s.yesButton} onPress={() => accept(candidate, v)} accessibilityRole="button">
            <Text style={s.yesText}>Yes, that's my vessel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => notMine(candidates)} style={s.notMine}>
            <Text style={s.notMineText}>Not my vessel</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (result.status === 'not_found') {
      return (
        <View style={s.results}>
          <View style={s.card}>
            <Text style={s.cardName}>{candidate.name}</Text>
            <Text style={s.cardMmsi}>{ids(candidate)}</Text>
            <Text style={[s.cardMeta, { marginTop: 8 }]}>
              This vessel isn't on AIS under that MMSI. Check the MMSI on the VHF or AIS unit, then enter it below.
            </Text>
          </View>
          <TouchableOpacity style={s.yesButton} onPress={enterMmsi} accessibilityRole="button">
            <Text style={s.yesText}>Enter MMSI</Text>
          </TouchableOpacity>
          {back && (
            <TouchableOpacity onPress={back} style={s.notMine}>
              <Text style={s.notMineText}>Back to the list</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    // AIS could not be checked just now: let them use the match anyway.
    return (
      <View style={s.results}>
        <View style={s.card}>
          <Text style={s.cardName}>{candidate.name}</Text>
          {!!describe(candidate) && <Text style={s.cardMeta}>{describe(candidate)}</Text>}
          <Text style={s.cardMmsi}>{ids(candidate)}</Text>
          <Text style={[s.cardMeta, { marginTop: 8 }]}>
            {result.note || "We couldn't check AIS just now."} Check the MMSI matches your vessel.
          </Text>
        </View>
        <TouchableOpacity style={s.yesButton} onPress={() => accept(candidate)} accessibilityRole="button">
          <Text style={s.yesText}>Yes, that's my vessel</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => notMine(candidates)} style={s.notMine}>
          <Text style={s.notMineText}>Not my vessel</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

function createStyles(isDark: boolean) {
  const text = isDark ? colors.text : colors.textLight;
  const text2 = isDark ? colors.textSecondary : colors.textSecondaryLight;
  const border = isDark ? colors.border : colors.borderLight;
  const field = isDark ? colors.background : colors.backgroundLight;
  return StyleSheet.create({
    group: { marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '600', color: text, marginBottom: 8 },
    input: {
      backgroundColor: field,
      borderRadius: 8, padding: 14, fontSize: 16, color: text, borderWidth: 1, borderColor: border,
    },
    lengthInput: { flex: 1 },
    subtle: { fontSize: 13, color: text2, marginTop: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    center: { alignItems: 'center' },
    segment: { flexDirection: 'row', borderWidth: 1, borderColor: border, borderRadius: 8, overflow: 'hidden' },
    segmentItem: { paddingVertical: 14, paddingHorizontal: 16, backgroundColor: field },
    segmentOn: { backgroundColor: colors.primary },
    segmentText: { fontSize: 16, fontWeight: '600', color: text2 },
    segmentTextOn: { color: colors.white },
    findButton: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 8, padding: 14, alignItems: 'center' },
    findButtonOff: { borderColor: border },
    findText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
    findTextOff: { color: text2 },
    hint: { fontSize: 13, color: text2, marginTop: 8, marginBottom: 20, lineHeight: 18 },
    results: { marginBottom: 8 },
    resultsTitle: { fontSize: 17, fontWeight: '700', color: text, marginBottom: 4 },
    resultsSub: { fontSize: 13, color: text2, marginBottom: 10 },
    card: {
      borderWidth: 1, borderColor: border, borderRadius: 10, padding: 14, marginBottom: 10, marginTop: 6,
      backgroundColor: field,
    },
    checkedCard: { borderColor: colors.success },
    checkedLabel: { fontSize: 14, fontWeight: '700', color: colors.success },
    cardName: { fontSize: 16, fontWeight: '700', color: text },
    cardNameWithPick: { paddingRight: 72 },
    cardMeta: { fontSize: 13, color: text2, marginTop: 2 },
    cardMmsi: { fontSize: 15, fontWeight: '600', color: text, marginTop: 8 },
    note: { fontSize: 13, color: text, marginTop: 6, fontStyle: 'italic' },
    pick: { position: 'absolute', right: 14, top: 14, color: colors.primary, fontWeight: '600', fontSize: 14 },
    yesButton: { backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 4 },
    yesText: { color: colors.white, fontSize: 16, fontWeight: '700' },
    notMine: { alignItems: 'center', paddingVertical: 12, marginBottom: 8 },
    notMineText: { color: text2, fontSize: 15, fontWeight: '600' },
    confirmed: {
      flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8, marginBottom: 20,
      backgroundColor: withOpacity(colors.success, 0.12),
    },
    confirmedText: { flex: 1, fontSize: 14, color: text },
    change: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  });
}
