import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, useColorScheme } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '@/styles/commonStyles';
import { MSN_1815_URL, type MedicalOption } from '@/constants/medicalEquivalents';
import { approvalLabel } from '@/utils/providerSearch';
import type { MedicalAlternatives } from '@/utils/medicalAlternatives';

/**
 * "Also accepted instead of ENG1" on Find a course: the medical the user's own
 * authority asks for, and seafarer medicals the MCA accepts in place of an ENG1,
 * each with its conditions and the official source.
 */
export default function MedicalAlternativesCard({ data, authority }: { data: MedicalAlternatives; authority: string | null }) {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const authName = authority ? approvalLabel(authority.toLowerCase()) : '';
  const local = data.options.find((o) => o.kind === 'eng1_equivalent');

  const option = (o: MedicalOption, forAuthority: boolean) => {
    const country = o.countryName;
    return (
      <View key={o.id} style={styles.card}>
        <Text style={styles.name}>{t(`medicalAlt.names.${o.nameKey ?? 'national'}`, { country })}</Text>
        <Text style={styles.body}>{t(`medicalAlt.how.${o.howKey ?? 'national'}`, { country })}</Text>
        {forAuthority && <Text style={styles.body}>{t('medicalAlt.neededFor', { authority: authName })}</Text>}
        {o.mcaAccepted && <Text style={styles.accepted}>{t('medicalAlt.acceptedMca')}</Text>}
        {o.noteKey && <Text style={styles.body}>{t(`medicalAlt.notes.${o.noteKey}`)}</Text>}
        <View style={styles.links}>
          {o.finderUrl && (
            <TouchableOpacity onPress={() => Linking.openURL(o.finderUrl!)}>
              <Text style={styles.link}>{t('medicalAlt.findDoctor')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => Linking.openURL(o.sourceUrl)}>
            <Text style={styles.source}>{t('medicalAlt.source', { source: o.sourceName })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      {data.authorityOption && (
        <>
          <Text style={styles.title}>{t('medicalAlt.authorityTitle', { authority: authName })}</Text>
          {option(data.authorityOption, true)}
        </>
      )}
      <Text style={styles.title}>{t('medicalAlt.sectionTitle')}</Text>
      {data.lead && local && !data.hasMcaDoctor && <Text style={styles.intro}>{t('medicalAlt.leadIntro', { country: local.countryName })}</Text>}
      {data.options.map((o) => option(o, false))}
      <Text style={styles.intro}>{t('medicalAlt.flags')}</Text>
      <TouchableOpacity onPress={() => Linking.openURL(MSN_1815_URL)}>
        <Text style={[styles.link, styles.all]}>{t('medicalAlt.allCountries')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(isDark: boolean) {
  const text = isDark ? colors.text : colors.textLight;
  const muted = isDark ? colors.textSecondary : colors.textSecondaryLight;
  return StyleSheet.create({
    wrap: { marginTop: 10 },
    title: { fontSize: 13, fontWeight: '600', color: muted, marginHorizontal: 20, marginTop: 12 },
    intro: { fontSize: 13, color: muted, marginHorizontal: 20, marginTop: 6, lineHeight: 18 },
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderColor: colors.primary,
      borderWidth: 1,
      borderRadius: 12,
      marginHorizontal: 16,
      marginTop: 8,
      padding: 12,
      gap: 4,
    },
    name: { fontSize: 16, fontWeight: '600', color: text },
    body: { fontSize: 13, color: muted, lineHeight: 18 },
    accepted: { fontSize: 13, color: colors.successDark, fontWeight: '600', lineHeight: 18 },
    links: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 4 },
    link: { fontSize: 14, color: colors.primary, fontWeight: '600' },
    source: { fontSize: 13, color: colors.primary },
    all: { marginHorizontal: 20, marginTop: 8 },
  });
}
