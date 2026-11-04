import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { colors } from '@/styles/commonStyles';

type Vesselish = { id?: string; sector?: string | null; is_workboat?: boolean | null; is_tug?: boolean | null } | null | undefined;

/** Commercial-sector (workboat) work: the user chose commercial, or the vessel is commercial, a workboat or a tug. */
export function isCommercialVessel(vessel: Vesselish, userSector?: string | null): boolean {
  return (
    userSector === 'commercial' ||
    vessel?.sector === 'commercial' ||
    vessel?.is_workboat === true ||
    vessel?.is_tug === true
  );
}

/** Short label for an entry's sea area: "Cat C · tidal", "Cat D", "Sea", "Non-tidal" or "Not classified". */
export function seaAreaLabel(t: TFunction, area: string | null | undefined, tidal: boolean | null | undefined): string {
  if (area === 'A' || area === 'B' || area === 'C') {
    if (tidal === true) return t('seaAreas.catTidal', { cat: area });
    if (tidal === false) return t('seaAreas.catNonTidal', { cat: area });
    return t('seaAreas.cat', { cat: area });
  }
  if (area === 'D') return t('seaAreas.cat', { cat: area });
  if (area === 'sea') return t('seaAreas.sea');
  if (tidal === false) return t('seaAreas.nonTidal');
  if (tidal === true) return t('seaAreas.tidal');
  return t('seaAreas.notClassified');
}

interface Props {
  areaCategory?: string | null;
  isTidal?: boolean | null;
}

/** Where an entry's service was, for workboat users. Guidance only. */
export function SeaAreaChip({ areaCategory, isTidal }: Props) {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const unclassified = areaCategory == null && isTidal == null;
  return (
    <View
      style={[styles.chip, { borderColor: unclassified ? (isDark ? colors.border : colors.borderLight) : colors.primary }]}
      accessibilityLabel={`${t('seaAreas.pickerTitle')}: ${seaAreaLabel(t, areaCategory, isTidal)}`}
    >
      <Text
        style={[
          styles.text,
          { color: unclassified ? (isDark ? colors.textSecondary : colors.textSecondaryLight) : colors.primary },
        ]}
      >
        {seaAreaLabel(t, areaCategory, isTidal)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 6,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
