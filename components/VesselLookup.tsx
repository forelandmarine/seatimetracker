/**
 * Add Vessel: find the MMSI from the vessel's name and length overall, for
 * people who don't have the MMSI to hand. Matches come from AIS data and the
 * user must confirm one before its MMSI is filled in. Used by both Home screens.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, useColorScheme } from 'react-native';
import { colors, withOpacity } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { lookupVessel, type VesselCandidate } from '@/utils/seaTimeApi';
import { trackEvent } from '@/utils/appEvents';

interface Props {
  name: string;
  onNameChange: (v: string) => void;
  length: string;
  onLengthChange: (v: string) => void;
  /** User confirmed a match: fill the MMSI (and any empty particulars). */
  onConfirm: (c: VesselCandidate) => void;
}

type State =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'results'; candidates: VesselCandidate[] }
  | { kind: 'none'; message: string }
  | { kind: 'confirmed'; candidate: VesselCandidate };

const describe = (c: VesselCandidate) =>
  [c.type, c.flag, c.length_metres ? `${c.length_metres} m` : null].filter(Boolean).join('  ·  ');

const NOT_FOUND =
  "We couldn't find it on AIS. Check the spelling and length, or enter the MMSI below. " +
  "It's on the VHF or AIS unit and the ship's radio licence, or ask the captain.";

export default function VesselLookup({ name, onNameChange, length, onLengthChange, onConfirm }: Props) {
  const isDark = useColorScheme() === 'dark';
  const s = createStyles(isDark);
  const [state, setState] = useState<State>({ kind: 'idle' });

  const lengthOk = Number(length.replace(',', '.')) >= 2;
  const canSearch = name.trim().length >= 3 && lengthOk && state.kind !== 'searching';

  const edit = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    if (state.kind !== 'idle' && state.kind !== 'searching') setState({ kind: 'idle' });
  };

  const search = async () => {
    if (!canSearch) return;
    setState({ kind: 'searching' });
    try {
      const candidates = await lookupVessel(name, length.replace(',', '.'));
      trackEvent('vessel_lookup', candidates.length);
      setState(candidates.length ? { kind: 'results', candidates } : { kind: 'none', message: NOT_FOUND });
    } catch (e: any) {
      trackEvent('vessel_lookup', 'error');
      const msg = e?.status === 429 && e?.message ? e.message : 'Vessel search is not available right now. Please enter the MMSI below.';
      setState({ kind: 'none', message: msg });
    }
  };

  const confirm = (c: VesselCandidate) => {
    trackEvent('vessel_confirmed');
    onConfirm(c);
    setState({ kind: 'confirmed', candidate: c });
  };

  return (
    <View>
      <View style={s.group}>
        <Text style={s.label}>Vessel name *</Text>
        <TextInput
          style={s.input}
          placeholder="As shown on AIS, e.g. Serenity"
          placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
          value={name}
          onChangeText={edit(onNameChange)}
          // Vessel names are proper names; autocorrect turns e.g. Svitzer into Switzerland
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="next"
        />
      </View>

      <View style={s.group}>
        <Text style={s.label}>Length overall (metres)</Text>
        <TextInput
          style={s.input}
          placeholder="e.g. 45.5"
          placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
          value={length}
          onChangeText={edit(onLengthChange)}
          keyboardType="decimal-pad"
          returnKeyType="search"
          onSubmitEditing={search}
        />
      </View>

      {state.kind !== 'confirmed' && state.kind !== 'results' && (
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
                <Text style={s.findText}>Searching AIS</Text>
              </View>
            ) : (
              <Text style={[s.findText, !canSearch && s.findTextOff]}>Find my vessel</Text>
            )}
          </TouchableOpacity>
          <Text style={s.hint}>
            {state.kind === 'none' ? state.message : 'No MMSI to hand? Enter the name and length and we will look it up on AIS.'}
          </Text>
        </>
      )}

      {state.kind === 'results' && (
        <View style={s.results}>
          <Text style={s.resultsTitle}>{state.candidates.length === 1 ? 'Is this your vessel?' : 'Which is your vessel?'}</Text>
          {state.candidates.map((c) => (
            <TouchableOpacity
              key={c.mmsi}
              style={s.card}
              onPress={() => confirm(c)}
              disabled={state.candidates.length === 1}
              accessibilityRole="button"
              accessibilityLabel={`${c.name}, MMSI ${c.mmsi}`}
            >
              <Text style={s.cardName}>{c.name}</Text>
              {!!describe(c) && <Text style={s.cardMeta}>{describe(c)}</Text>}
              <Text style={s.cardMmsi}>MMSI {c.mmsi}</Text>
              {state.candidates.length > 1 && <Text style={s.pick}>This one</Text>}
            </TouchableOpacity>
          ))}
          <Text style={s.hint}>Check the MMSI matches your vessel.</Text>
          {state.candidates.length === 1 && (
            <TouchableOpacity style={s.yesButton} onPress={() => confirm(state.candidates[0])} accessibilityRole="button">
              <Text style={s.yesText}>Yes, that's my vessel</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => setState({ kind: 'none', message: NOT_FOUND })} style={s.notMine}>
            <Text style={s.notMineText}>{state.candidates.length === 1 ? 'Not my vessel' : 'None of these'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {state.kind === 'confirmed' && (
        <View style={s.confirmed}>
          <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check-circle" size={20} color={colors.success} />
          <Text style={s.confirmedText}>
            {state.candidate.name}, MMSI {state.candidate.mmsi} filled in from AIS.
          </Text>
          <TouchableOpacity onPress={() => setState({ kind: 'idle' })} hitSlop={8}>
            <Text style={s.change}>Change</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function createStyles(isDark: boolean) {
  const text = isDark ? colors.text : colors.textLight;
  const text2 = isDark ? colors.textSecondary : colors.textSecondaryLight;
  const border = isDark ? colors.border : colors.borderLight;
  return StyleSheet.create({
    group: { marginBottom: 20 },
    label: { fontSize: 14, fontWeight: '600', color: text, marginBottom: 8 },
    input: {
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
      borderRadius: 8, padding: 14, fontSize: 16, color: text, borderWidth: 1, borderColor: border,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    findButton: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: 8, padding: 14, alignItems: 'center' },
    findButtonOff: { borderColor: border },
    findText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
    findTextOff: { color: text2 },
    hint: { fontSize: 13, color: text2, marginTop: 8, marginBottom: 20, lineHeight: 18 },
    results: { marginBottom: 8 },
    resultsTitle: { fontSize: 17, fontWeight: '700', color: text, marginBottom: 10 },
    card: {
      borderWidth: 1, borderColor: border, borderRadius: 10, padding: 14, marginBottom: 10,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    cardName: { fontSize: 16, fontWeight: '700', color: text },
    cardMeta: { fontSize: 13, color: text2, marginTop: 2 },
    cardMmsi: { fontSize: 15, fontWeight: '600', color: text, marginTop: 8 },
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
