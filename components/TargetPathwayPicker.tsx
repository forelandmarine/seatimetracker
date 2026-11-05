/**
 * Add Vessel (first vessel only): ask where the user works (yachts or commercial)
 * and what they are working toward, so the first vessel gets the right sector and
 * the profile's progress card tracks the right certificate from day one instead
 * of the pathway default. Lists the trackable certificates for the user's
 * authority, department and chosen sector. Used by both Home screens.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { getUserProfile } from '@/utils/seaTimeApi';
import {
  MaritimeAuthority,
  VesselSector,
  filterRequirementsBySector,
  getRequirementsByAuthority,
  groupRequirementsByCategory,
  isTrackableRequirement,
} from '@/constants/mcaRequirements';

/** Chosen when the user does not know yet; saves no target. */
export const TARGET_NOT_SURE = 'not_sure';

/**
 * For a tug certificate target, the usual capacity to start the first vessel on:
 * the master certificates count officer service, the rest count rating service.
 * Null when the target is not a tug certificate.
 */
export const tugCapacityForTarget = (id: string | null): 'rating' | 'officer' | null => {
  if (!id) return null;
  const route = getRequirementsByAuthority('mca', 'deck').find((r) => r.id === id)?.tugRoute;
  if (!route) return null;
  return route.officerDays != null ? 'officer' : 'rating';
};

const AUTHORITIES: MaritimeAuthority[] = ['mca', 'uscg', 'amsa', 'mnz', 'samsa'];

interface Props {
  /** A requirement id, TARGET_NOT_SURE, or null when nothing is chosen yet. */
  value: string | null;
  onChange: (id: string | null) => void;
  /** Yachts or commercial; starts from the profile, null until it has loaded. */
  sector: VesselSector | null;
  onSectorChange: (sector: VesselSector) => void;
}

const SECTORS: { value: VesselSector; label: string }[] = [
  { value: 'yachting', label: 'Yachts' },
  { value: 'commercial', label: 'Commercial vessels' },
];

export default function TargetPathwayPicker({ value, onChange, sector, onSectorChange }: Props) {
  const isDark = useColorScheme() === 'dark';
  const s = createStyles(isDark);
  const [authority, setAuthority] = useState<MaritimeAuthority>('mca');
  const [department, setDepartment] = useState<'deck' | 'engineering'>('deck');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getUserProfile()
      .then((p: any) => {
        const a: MaritimeAuthority = AUTHORITIES.includes(p?.maritime_authority) ? p.maritime_authority : 'mca';
        const d = p?.department?.toLowerCase() === 'engineering' ? 'engineering' : 'deck';
        setAuthority(a);
        setDepartment(d);
        if (sector == null) onSectorChange(p?.vessel_sector === 'commercial' ? 'commercial' : 'yachting');
        // Someone who already picked a target in this pathway keeps it unless they change it here.
        const saved = p?.target_certification;
        if (value == null && saved && getRequirementsByAuthority(a, d).some((r) => r.id === saved)) onChange(saved);
      })
      .catch(() => {});
    // Load once when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options = useMemo(
    () => filterRequirementsBySector(getRequirementsByAuthority(authority, department), sector).filter(isTrackableRequirement),
    [authority, department, sector],
  );
  const groups = useMemo(() => groupRequirementsByCategory(options), [options]);
  const chosen = options.find((r) => r.id === value);
  const label =
    value === TARGET_NOT_SURE ? 'Not sure yet' : chosen ? chosen.title : 'Choose the certificate you are aiming for';

  // A certificate from the other sector's list no longer applies.
  const changeSector = (next: VesselSector) => {
    onSectorChange(next);
    const stillListed = filterRequirementsBySector(getRequirementsByAuthority(authority, department), next).some(
      (r) => r.id === value,
    );
    if (value && value !== TARGET_NOT_SURE && !stillListed) onChange(null);
  };

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <View style={s.group}>
      <Text style={s.label}>Where do you work? *</Text>
      <View style={s.segment}>
        {SECTORS.map((o) => {
          const selected = sector === o.value;
          return (
            <TouchableOpacity
              key={o.value}
              style={[s.segmentOption, selected && s.optionSelected]}
              onPress={() => changeSector(o.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[s.optionText, selected && s.optionTextSelected]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={s.label}>What are you working toward? *</Text>
      <TouchableOpacity
        style={[s.field, open && s.fieldOpen]}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={`What are you working toward: ${label}`}
      >
        <Text style={[s.fieldText, !chosen && value !== TARGET_NOT_SURE && s.placeholder]} numberOfLines={2}>
          {label}
        </Text>
        <IconSymbol
          ios_icon_name={open ? 'chevron.up' : 'chevron.down'}
          android_material_icon_name={open ? 'expand-less' : 'expand-more'}
          size={18}
          color={isDark ? colors.textSecondary : colors.textSecondaryLight}
        />
      </TouchableOpacity>
      {!open && (
        <Text style={s.hint}>Your progress toward it shows on your profile. You can change it any time.</Text>
      )}

      {open && (
        <View style={s.list}>
          {groups.map((g) => (
            <View key={g.category || 'all'}>
              {!!g.category && <Text style={s.category}>{g.category}</Text>}
              {g.items.map((r) => {
                const selected = r.id === value;
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={[s.option, selected && s.optionSelected]}
                    onPress={() => pick(r.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[s.optionText, selected && s.optionTextSelected]}>{r.title}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          <TouchableOpacity
            style={[s.option, value === TARGET_NOT_SURE && s.optionSelected]}
            onPress={() => pick(TARGET_NOT_SURE)}
            accessibilityRole="button"
          >
            <Text style={[s.optionText, value === TARGET_NOT_SURE && s.optionTextSelected]}>Not sure yet</Text>
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
    field: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
      borderRadius: 8, padding: 14, borderWidth: 1, borderColor: border,
    },
    fieldOpen: { borderColor: colors.primary },
    segment: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    segmentOption: {
      flex: 1, alignItems: 'center', borderWidth: 1, borderColor: border, borderRadius: 8, paddingVertical: 12,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    fieldText: { flex: 1, fontSize: 16, color: text },
    placeholder: { color: text2 },
    hint: { fontSize: 13, color: text2, marginTop: 8, lineHeight: 18 },
    list: { marginTop: 10 },
    category: {
      fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase',
      color: colors.primary, marginTop: 10, marginBottom: 6,
    },
    option: {
      borderWidth: 1, borderColor: border, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14,
      marginBottom: 8, backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    optionSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    optionText: { fontSize: 15, color: text },
    optionTextSelected: { color: '#FFFFFF', fontWeight: '600' },
  });
}
