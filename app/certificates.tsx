import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
  RefreshControl,
  Linking,
  TextInput,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import {
  Certificate,
  CERTIFICATE_TYPE_LABELS,
  daysUntilExpiry,
  expiryStatus,
  certificateTypeMatches,
  listCertificates,
  listRevalidation,
  normaliseCertificateSearch,
  type CertificateRevalidation,
} from '@/utils/certificatesApi';
import { RevalidationPanel } from '@/components/RevalidationPanel';
import { syncRevalidationReminders } from '@/utils/revalidationReminders';
import { error as logError } from '@/utils/log';
import * as seaTimeApi from '@/utils/seaTimeApi';
import { getRequirementsByAuthority, getDefaultTargetId, type MaritimeAuthority } from '@/constants/mcaRequirements';
import {
  evaluateChecklist,
  certificatesNeedingDetails,
  courseLabel,
  type ItemState,
} from '@/utils/courseChecklist';
import { COURSE_CATALOG } from '@/constants/courseCatalog';
import { useCourseTicks } from '@/hooks/useCourseTicks';

const AUTHORITIES = ['mca', 'uscg', 'amsa', 'mnz', 'samsa'];

const quickTitle = (s: ItemState) => (COURSE_CATALOG[s.item.code] ? courseLabel(s.item.code) : s.item.label);

const LIGHTSHIP_URL = 'https://forelandmarine.com/tools/lightship-ism';

export default function CertificatesScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);

  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [targetTitle, setTargetTitle] = useState<string | null>(null);
  const [revalidation, setRevalidation] = useState<Record<string, CertificateRevalidation>>({});

  // The Quick add list follows the same target CoC as the oral checklist.
  const loadTarget = useCallback(async () => {
    try {
      const profile = await seaTimeApi.getUserProfile();
      const auth = (AUTHORITIES.includes(profile?.maritime_authority) ? profile.maritime_authority : 'mca') as MaritimeAuthority;
      const dept = String(profile?.department ?? 'deck').toLowerCase() === 'engineering' ? 'engineering' : 'deck';
      const id: string | null = profile?.target_certification ?? getDefaultTargetId(auth, dept) ?? null;
      const target = id
        ? getRequirementsByAuthority(auth, 'deck').find((r) => r.id === id) ??
          getRequirementsByAuthority(auth, 'engineering').find((r) => r.id === id)
        : undefined;
      setTargetId(id);
      setTargetTitle(target?.title ?? null);
    } catch (err) {
      logError('[Certificates] Failed to load target:', err);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const [data] = await Promise.all([listCertificates(), loadTarget()]);
      setCerts(Array.isArray(data) ? data : []);
      // Revalidation guidance is extra: the list still shows if it fails
      listRevalidation()
        .then((rows) => {
          setRevalidation(Object.fromEntries(rows.map((r) => [r.certificate_id, r])));
          void syncRevalidationReminders(rows);
        })
        .catch((err) => logError('[Certificates] Failed to load revalidation:', err));
    } catch (err) {
      logError('[Certificates] Failed to load:', err);
      setLoadError('Failed to load certificates. Pull down to retry.');
      setCerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const reloadCerts = useCallback(async () => {
    try {
      const data = await listCertificates();
      setCerts(Array.isArray(data) ? data : []);
    } catch (err) {
      logError('[Certificates] Failed to reload:', err);
    }
  }, []);
  const { savingCode, tick, untick } = useCourseTicks(reloadCerts);

  const quickAdd = useMemo(() => {
    const result = targetId ? evaluateChecklist(targetId, certs) : null;
    if (!result) return [];
    const seen = new Set<string>();
    return [...result.states, ...result.recommended].filter((s) => !seen.has(s.item.code) && !!seen.add(s.item.code));
  }, [targetId, certs]);
  const needsDetailsIds = useMemo(() => new Set(certificatesNeedingDetails(certs).map((c) => c.id)), [certs]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filteredCerts = useMemo(() => {
    if (!searchQuery.trim()) return certs;
    const q = normaliseCertificateSearch(searchQuery);
    if (!q) return certs;
    return certs.filter((c) => {
      const status = expiryStatus(c);
      return (
        certificateTypeMatches(c.certificate_type, searchQuery) ||
        (c.certificate_number && normaliseCertificateSearch(c.certificate_number).includes(q)) ||
        (c.issuing_body && normaliseCertificateSearch(c.issuing_body).includes(q)) ||
        status.includes(q)
      );
    });
  }, [certs, searchQuery]);

  const renderCert = (cert: Certificate) => {
    const status = expiryStatus(cert);
    const days = daysUntilExpiry(cert);
    const label = CERTIFICATE_TYPE_LABELS[cert.certificate_type] || cert.certificate_type;

    let statusColor = colors.textSecondary;
    let statusText = '';
    if (status === 'expired') {
      statusColor = colors.error;
      statusText = `Expired ${Math.abs(days || 0)} day${Math.abs(days || 0) === 1 ? '' : 's'} ago`;
    } else if (status === 'soon') {
      statusColor = colors.warning;
      statusText = `Expires in ${days} day${days === 1 ? '' : 's'}`;
    } else if (status === 'ok') {
      statusColor = colors.success;
      statusText = `Expires in ${days} day${days === 1 ? '' : 's'}`;
    } else {
      statusText = 'No expiry set';
    }

    return (
      <TouchableOpacity
        key={cert.id}
        style={styles.certCard}
        onPress={() => router.push(`/certificate-edit?id=${cert.id}`)}
      >
        <View style={styles.certHeader}>
          <Text style={styles.certTitle}>{label}</Text>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        </View>
        {cert.certificate_number && (
          <Text style={styles.certNumber}>No. {cert.certificate_number}</Text>
        )}
        <Text style={[styles.certStatus, { color: statusColor }]}>{statusText}</Text>
        {cert.expiry_date && (
          <Text style={styles.certExpiryDate}>
            Expiry: {new Date(cert.expiry_date).toLocaleDateString('en-GB')}
          </Text>
        )}
        {needsDetailsIds.has(cert.id) && <Text style={styles.needsDetails}>{t('certChecker.needsDetails')}</Text>}
        {revalidation[cert.id] && <RevalidationPanel data={revalidation[cert.id]} isDark={isDark} />}
      </TouchableOpacity>
    );
  };

  const renderQuickRow = (s: ItemState, last: boolean) => {
    const held = !!s.certificate;
    const title = quickTitle(s);
    return (
      <View key={s.item.code} style={[styles.quickRow, last && { borderBottomWidth: 0 }]}>
        {savingCode === s.item.code ? (
          <View style={styles.tickbox}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => (held ? untick(s.item.code, title, s.certificate!) : tick(s.item.code))}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: held }}
            accessibilityLabel={title}
            style={[styles.tickbox, held ? styles.tickboxOn : styles.tickboxOff]}
          >
            {held ? (
              <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={13} color={colors.white} />
            ) : null}
          </TouchableOpacity>
        )}
        <Text style={styles.quickTitle}>{title}</Text>
        {held && s.missingDetails && (
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/certificate-edit', params: { id: s.certificate!.id } })}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.quickAction}>{t('certChecker.addDetails')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const quickAddSection =
    quickAdd.length === 0 ? null : (
      <View style={styles.quickSection}>
        <Text style={styles.quickHeading}>{t('certChecker.quickAddTitle')}</Text>
        <Text style={styles.quickBody}>
          {t('certChecker.quickAddBody', { target: targetTitle ?? targetId })}
        </Text>
        <View style={styles.quickGroup}>{quickAdd.map((s, i) => renderQuickRow(s, i === quickAdd.length - 1))}</View>
      </View>
    );

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Certificates',
          headerStyle: { backgroundColor: isDark ? colors.background : colors.backgroundLight },
          headerTitleStyle: { color: isDark ? colors.text : colors.textLight },
          headerTintColor: colors.primary,
        }}
      />
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : certs.length === 0 && loadError ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Something went wrong</Text>
            <Text style={styles.emptySubtitle}>{loadError}</Text>
          </View>
        ) : certs.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol
              ios_icon_name="doc.text"
              android_material_icon_name="article"
              size={64}
              color={isDark ? colors.textSecondary : colors.textSecondaryLight}
            />
            <Text style={styles.emptyTitle}>No certificates yet</Text>
            <Text style={styles.emptySubtitle}>
              Add your maritime certificates to get expiry reminders.
            </Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push('/certificate-edit')}
            >
              <Text style={styles.addButtonText}>Add certificate</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.list}>
            <View style={styles.searchContainer}>
              <IconSymbol
                ios_icon_name="magnifyingglass"
                android_material_icon_name="search"
                size={18}
                color={isDark ? colors.textSecondary : colors.textSecondaryLight}
                style={{ marginRight: 8 }}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Search certificates..."
                placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>
            {filteredCerts.length === 0 ? (
              <Text style={styles.noResults}>No certificates match "{searchQuery}"</Text>
            ) : (
              filteredCerts.map(renderCert)
            )}

            <TouchableOpacity
              style={styles.addButtonInline}
              onPress={() => router.push('/certificate-edit')}
            >
              <IconSymbol
                ios_icon_name="plus.circle.fill"
                android_material_icon_name="add-circle"
                size={22}
                color={colors.primary}
              />
              <Text style={styles.addButtonInlineText}>Add certificate</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !(certs.length === 0 && loadError) && quickAddSection}

        {/* Lightship CTA */}
        <View style={styles.lightshipCard}>
          <View style={styles.lightshipHeader}>
            <IconSymbol
              ios_icon_name="building.2"
              android_material_icon_name="business"
              size={24}
              color={colors.primary}
            />
            <Text style={styles.lightshipTitle}>Manage your whole crew</Text>
          </View>
          <Text style={styles.lightshipBody}>
            Tracking certificates for an entire crew? Lightship ISM handles fleet-wide certificate
            tracking, audits, and incident reports. Built by Foreland Marine.
          </Text>
          <TouchableOpacity
            onPress={async () => {
              try {
                const { trackLightshipClick } = await import('@/utils/seaTimeApi');
                trackLightshipClick();
              } catch {}
              Linking.openURL(LIGHTSHIP_URL);
            }}
          >
            <Text style={styles.lightshipCta}>Learn more about Lightship →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    loadingContainer: {
      paddingVertical: 60,
      alignItems: 'center',
    },
    list: {
      padding: 16,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: isDark ? colors.text : colors.textLight,
      padding: 0,
    },
    noResults: {
      textAlign: 'center',
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      fontSize: 14,
      paddingVertical: 20,
    },
    emptyState: {
      paddingVertical: 60,
      paddingHorizontal: 32,
      alignItems: 'center',
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      marginTop: 16,
      marginBottom: 8,
    },
    emptySubtitle: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      textAlign: 'center',
      marginBottom: 24,
    },
    addButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 10,
    },
    addButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '600',
    },
    addButtonInline: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primary,
      borderStyle: 'dashed',
      marginTop: 8,
    },
    addButtonInlineText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.primary,
    },
    certCard: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 12,
      padding: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    certHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    certTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      flex: 1,
    },
    certNumber: {
      fontSize: 12,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 4,
    },
    certStatus: {
      fontSize: 14,
      fontWeight: '600',
      marginTop: 4,
    },
    certExpiryDate: {
      fontSize: 12,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 2,
    },
    needsDetails: {
      fontSize: 12,
      fontWeight: '600',
      color: '#B26A00',
      marginTop: 4,
    },
    quickSection: {
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    quickHeading: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
    },
    quickBody: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 4,
      marginBottom: 10,
      lineHeight: 18,
    },
    quickGroup: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      overflow: 'hidden',
    },
    quickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? colors.border : colors.borderLight,
    },
    tickbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tickboxOn: {
      backgroundColor: colors.successDark,
    },
    tickboxOff: {
      borderWidth: 2,
      borderColor: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    quickTitle: {
      flex: 1,
      fontSize: 15,
      color: isDark ? colors.text : colors.textLight,
    },
    quickAction: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    statusDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    lightshipCard: {
      margin: 16,
      padding: 18,
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primary,
      borderLeftWidth: 4,
    },
    lightshipHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8,
    },
    lightshipTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
    },
    lightshipBody: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      lineHeight: 19,
      marginBottom: 12,
    },
    lightshipCta: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
  });
