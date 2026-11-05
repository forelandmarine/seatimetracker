import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '@/styles/commonStyles';
import { getAreaGuidance, type AreaGuidance } from '@/utils/seaTimeApi';
import { error as logError } from '@/utils/log';
import { SeaAreaChip } from '@/components/SeaAreaChip';

interface Props {
  entryId: string;
}

/**
 * For a workboat trip: where it went (sea area chip), the Workboat Code 3 Area
 * Category its AIS track fits (3.10.1), and which tickets in Table A5.1 cover
 * that area, against the certificates on file; whether the trip stayed near
 * coastal (MSN 1856 s.5); and, on a high-speed craft, the Advanced Powerboat
 * rule (WBC3 Table A5.1 Note F). Guidance only. Hidden for yachting users.
 */
export function AreaGuidanceCard({ entryId }: Props) {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const [data, setData] = useState<AreaGuidance | null>(null);

  useEffect(() => {
    let alive = true;
    getAreaGuidance(entryId)
      .then((d) => alive && setData(d))
      .catch((e) => logError('[AreaGuidanceCard] Load failed:', e?.message || e));
    return () => {
      alive = false;
    };
  }, [entryId]);

  if (!data?.commercial) return null;
  const w = data.wbc3;
  const conditions = (list: string[]) => list.map((c) => t(`seaAreas.condition_${c}`)).join(t('seaAreas.wbc3And'));
  const held = data.tickets.filter((x) => x.held);
  const nc = data.near_coastal;
  const hs = data.high_speed;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('seaAreas.wbc3Title')}</Text>
      <SeaAreaChip areaCategory={data.area_category} isTidal={data.is_tidal} />

      {!w ? (
        <Text style={styles.body}>{t('seaAreas.noClassifier')}</Text>
      ) : w.options.length === 0 ? (
        <Text style={styles.body}>{t(`seaAreas.band_${w.band}`)}</Text>
      ) : (
        <>
          {w.options.map((o) => (
            <Text key={o.category} style={styles.option}>
              {t('seaAreas.wbc3Category', { cat: o.category })}
              {o.conditions.length > 0 ? `: ${t('seaAreas.wbc3Needs', { conditions: conditions(o.conditions) })}` : ''}
            </Text>
          ))}
          {w.options.some((o) => o.conditions.length > 0) && (
            <Text style={styles.note}>{t('seaAreas.conditionsNote')}</Text>
          )}
          {w.max_from_land_nm != null && w.max_from_safe_haven_nm != null && (
            <Text style={styles.note}>
              {t('seaAreas.wbc3Distances', { land: w.max_from_land_nm, haven: w.max_from_safe_haven_nm })}{' '}
              {t('seaAreas.safeHavenNote')}
            </Text>
          )}

          <Text style={styles.label}>{t('seaAreas.ticketsTitle')}</Text>
          {data.tickets.map((x) => (
            <View key={x.id} style={styles.ticketRow}>
              <Text style={[styles.ticket, x.held && styles.ticketHeld]}>
                {t(`seaAreas.ticket_${x.id}`)}
                {x.note ? ` (${t(`seaAreas.note_${x.note}`)})` : ''}
                {`, ${t('seaAreas.coversCats', { cats: x.covers.join(', ') })}`}
              </Text>
              {x.held && <Text style={styles.heldBadge}>{t('seaAreas.ticketHeld')}</Text>}
            </View>
          ))}
          {held.length === 0 && <Text style={styles.note}>{t('seaAreas.noTicketHeld')}</Text>}
        </>
      )}
      {nc?.limit && (
        <>
          <Text style={styles.label}>{t('seaAreas.coastalTitle')}</Text>
          <Text style={styles.option}>{t(`seaAreas.coastal_${nc.limit}`)}</Text>
          {nc.max_from_safe_haven_nm != null && nc.max_from_safe_haven_nm > 0 && (
            <Text style={styles.note}>{t('seaAreas.coastalFurthest', { haven: nc.max_from_safe_haven_nm })}</Text>
          )}
          <Text style={styles.note}>{t('seaAreas.coastalDefinition')}</Text>
        </>
      )}

      {hs && (
        <>
          <Text style={styles.label}>{t('seaAreas.highSpeedTitle')}</Text>
          <Text style={styles.option}>{t('seaAreas.highSpeedBody')}</Text>
          <Text style={[styles.note, hs.powerboat_advanced_held && styles.ticketHeld]}>
            {t(hs.powerboat_advanced_held ? 'seaAreas.highSpeedHeld' : 'seaAreas.highSpeedMissing')}
          </Text>
        </>
      )}
      <Text style={styles.note}>{t('seaAreas.areaGuidance')}</Text>
    </View>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 16,
      padding: 16,
      marginVertical: 12,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
    },
    body: {
      fontSize: 13,
      lineHeight: 18,
      marginTop: 8,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    option: {
      fontSize: 14,
      lineHeight: 20,
      marginTop: 8,
      color: isDark ? colors.text : colors.textLight,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      marginTop: 14,
      marginBottom: 4,
      color: isDark ? colors.text : colors.textLight,
    },
    ticketRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 3,
    },
    ticket: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    ticketHeld: {
      color: isDark ? colors.text : colors.textLight,
      fontWeight: '600',
    },
    heldBadge: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.successDark,
    },
    note: {
      fontSize: 12,
      lineHeight: 17,
      marginTop: 8,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
  });
