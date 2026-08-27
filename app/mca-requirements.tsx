import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  Platform,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import * as seaTimeApi from '@/utils/seaTimeApi';
import {
  AUTHORITY_FULL_NAMES,
  AUTHORITY_LABELS,
  MCARequirement,
  MaritimeAuthority,
  getDefaultTargetId,
  getRequirementsByAuthority,
  groupRequirementsByCategory,
} from '@/constants/mcaRequirements';

import { log, error as logError } from '@/utils/log';

const AUTHORITIES: MaritimeAuthority[] = ['mca', 'uscg', 'amsa', 'mnz'];

const isAuthority = (value: unknown): value is MaritimeAuthority =>
  typeof value === 'string' && (AUTHORITIES as string[]).includes(value);

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    scrollContent: {
      padding: 20,
      paddingTop: Platform.OS === 'android' ? 48 : 20,
      paddingBottom: 40,
    },
    header: {
      marginBottom: 20,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      lineHeight: 22,
    },
    searchWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 12,
      paddingHorizontal: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    searchInput: {
      flex: 1,
      paddingVertical: Platform.OS === 'ios' ? 12 : 8,
      paddingHorizontal: 8,
      fontSize: 15,
      color: isDark ? colors.text : colors.textLight,
    },
    categoryHeader: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: colors.primary,
      marginTop: 8,
      marginBottom: 12,
    },
    requirementCard: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    requirementCardTarget: {
      borderColor: colors.primary,
      borderWidth: 2,
    },
    requirementHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    requirementTitleContainer: {
      flex: 1,
      marginRight: 12,
    },
    requirementTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 4,
    },
    regulationBadge: {
      backgroundColor: colors.primary + '20',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    regulationText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
    requirementDescription: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 16,
      fontStyle: 'italic',
    },
    requirementSection: {
      marginBottom: 16,
    },
    requirementLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 4,
    },
    requirementValue: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.primary,
      marginBottom: 8,
    },
    detailItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 6,
      paddingLeft: 8,
    },
    bullet: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginRight: 8,
      marginTop: 2,
    },
    detailText: {
      flex: 1,
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      lineHeight: 20,
    },
    notesSection: {
      marginTop: 8,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    notesTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    noteItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 6,
    },
    noteText: {
      flex: 1,
      fontSize: 13,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      lineHeight: 18,
      fontStyle: 'italic',
    },
    targetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    targetButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    targetButtonActive: {
      backgroundColor: colors.primary,
    },
    targetButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
      marginLeft: 6,
    },
    targetButtonTextActive: {
      color: '#ffffff',
    },
    emptyState: {
      paddingVertical: 40,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 15,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      textAlign: 'center',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    footnote: {
      fontSize: 12,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      lineHeight: 18,
      marginTop: 8,
    },
  });

export default function CertificationRequirementsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const params = useLocalSearchParams<{ department?: string; authority?: string }>();

  const [profileAuthority, setProfileAuthority] = useState<MaritimeAuthority | null>(null);
  const [profileDepartment, setProfileDepartment] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [savingTarget, setSavingTarget] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // The route params are a hint from the calling screen; the profile is the
  // source of truth. Fall back to the params (and then to MCA/deck) so the
  // screen still renders if the profile request fails.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await seaTimeApi.getUserProfile();
        if (cancelled) return;
        setProfileAuthority(isAuthority(profile?.maritime_authority) ? profile.maritime_authority : null);
        setProfileDepartment(profile?.department ?? null);
        setTargetId(profile?.target_certification ?? null);
      } catch (err) {
        logError('[CertificationRequirements] Failed to load profile', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const authority: MaritimeAuthority =
    profileAuthority ?? (isAuthority(params.authority) ? params.authority : 'mca');
  const department: 'deck' | 'engineering' =
    (profileDepartment ?? params.department)?.toLowerCase() === 'engineering' ? 'engineering' : 'deck';

  const requirements = useMemo(
    () => getRequirementsByAuthority(authority, department),
    [authority, department],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return requirements;
    return requirements.filter((req) =>
      [req.title, req.regulation, req.description, req.category ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [requirements, search]);

  const groups = useMemo(() => groupRequirementsByCategory(filtered), [filtered]);

  const effectiveTargetId = targetId ?? getDefaultTargetId(authority, department) ?? null;

  const handleSetTarget = useCallback(
    async (requirement: MCARequirement) => {
      const next = effectiveTargetId === requirement.id ? null : requirement.id;
      const previous = targetId;
      setTargetId(next);
      setSavingTarget(true);
      try {
        await seaTimeApi.updateUserProfile({ target_certification: next });
        log('[CertificationRequirements] Target certification saved:', next);
      } catch (err) {
        logError('[CertificationRequirements] Failed to save target certification', err);
        setTargetId(previous);
      } finally {
        setSavingTarget(false);
      }
    },
    [effectiveTargetId, targetId],
  );

  const authorityLabel = AUTHORITY_LABELS[authority];
  const departmentLabel = department === 'engineering' ? 'Engineering' : 'Deck';
  const pageTitle = `${authorityLabel} ${departmentLabel} Pathway`;
  const pageSubtitle =
    `Sea service requirements for ${departmentLabel.toLowerCase()} certification with the ` +
    `${AUTHORITY_FULL_NAMES[authority]}.`;

  const textColor = isDark ? colors.text : colors.textLight;
  const backgroundColor = isDark ? colors.background : colors.backgroundLight;

  log(
    '[CertificationRequirements] authority:', authority,
    'department:', department,
    'entries:', requirements.length,
  );

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Requirements', headerShown: true, headerBackTitle: 'Back' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: `${authorityLabel} Requirements`,
          headerShown: true,
          headerBackTitle: 'Back',
          headerStyle: {
            backgroundColor: backgroundColor,
          },
          headerTintColor: textColor,
          headerShadowVisible: false,
        }}
      />
      <View style={styles.container}>
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.title}>{pageTitle}</Text>
            <Text style={styles.subtitle}>{pageSubtitle}</Text>
            {authority === 'uscg' && (
              <Text style={styles.footnote}>
                Service is shown in creditable days. Under 46 CFR 10.107 a day is 8 hours of
                watchstanding or day-working, a month is 30 days and a year is 360 days.
              </Text>
            )}
          </View>

          {requirements.length > 6 && (
            <View style={styles.searchWrapper}>
              <IconSymbol
                ios_icon_name="magnifyingglass"
                android_material_icon_name="search"
                size={18}
                color={colors.textSecondary}
              />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search endorsements"
                placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                autoCorrect={false}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <IconSymbol
                    ios_icon_name="xmark.circle.fill"
                    android_material_icon_name="cancel"
                    size={18}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              )}
            </View>
          )}

          {filtered.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No endorsements match that search.</Text>
            </View>
          )}

          {groups.map((group) => (
            <React.Fragment key={group.category || 'all'}>
              {group.category ? <Text style={styles.categoryHeader}>{group.category}</Text> : null}

              {group.items.map((requirement) => {
                const isTarget = effectiveTargetId === requirement.id;
                return (
                  <View
                    key={requirement.id}
                    style={[styles.requirementCard, isTarget && styles.requirementCardTarget]}
                  >
                    <View style={styles.requirementHeader}>
                      <View style={styles.requirementTitleContainer}>
                        <Text style={styles.requirementTitle}>{requirement.title}</Text>
                      </View>
                      <View style={styles.regulationBadge}>
                        <Text style={styles.regulationText}>{requirement.regulation}</Text>
                      </View>
                    </View>

                    <Text style={styles.requirementDescription}>{requirement.description}</Text>

                    {requirement.requirements.map((req, reqIndex) => (
                      <View key={reqIndex} style={styles.requirementSection}>
                        <Text style={styles.requirementLabel}>{req.label}</Text>
                        <Text style={styles.requirementValue}>{req.value}</Text>
                        {req.details && req.details.length > 0 && (
                          <View>
                            {req.details.map((detail, detailIndex) => (
                              <View key={detailIndex} style={styles.detailItem}>
                                <Text style={styles.bullet}>•</Text>
                                <Text style={styles.detailText}>{detail}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    ))}

                    {requirement.notes && requirement.notes.length > 0 && (
                      <View style={styles.notesSection}>
                        <Text style={styles.notesTitle}>Additional Notes:</Text>
                        {requirement.notes.map((note, noteIndex) => (
                          <View key={noteIndex} style={styles.noteItem}>
                            <Text style={styles.bullet}>ℹ️</Text>
                            <Text style={styles.noteText}>{note}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {requirement.totalDays != null && (
                      <View style={styles.targetRow}>
                        <Text style={styles.detailText}>
                          {isTarget ? 'Tracking progress toward this' : 'Track progress toward this'}
                        </Text>
                        <TouchableOpacity
                          style={[styles.targetButton, isTarget && styles.targetButtonActive]}
                          onPress={() => handleSetTarget(requirement)}
                          disabled={savingTarget}
                        >
                          <IconSymbol
                            ios_icon_name={isTarget ? 'checkmark.circle.fill' : 'target'}
                            android_material_icon_name={isTarget ? 'check-circle' : 'my-location'}
                            size={16}
                            color={isTarget ? '#ffffff' : colors.primary}
                          />
                          <Text
                            style={[
                              styles.targetButtonText,
                              isTarget && styles.targetButtonTextActive,
                            ]}
                          >
                            {isTarget ? 'My target' : 'Set as target'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </React.Fragment>
          ))}
        </ScrollView>
      </View>
    </>
  );
}
