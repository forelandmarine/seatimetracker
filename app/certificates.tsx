import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import {
  Certificate,
  CERTIFICATE_TYPE_LABELS,
  daysUntilExpiry,
  expiryStatus,
  listCertificates,
} from '@/utils/certificatesApi';

const LIGHTSHIP_URL = 'https://forelandmarine.com/tools/lightship-ism';

export default function CertificatesScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);

  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listCertificates();
      setCerts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[Certificates] Failed to load:', err);
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

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

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
      statusText = `Expires in ${days} days`;
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
      </TouchableOpacity>
    );
  };

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
            {certs.map(renderCert)}

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
            tracking, audits, and incident reports — built by Foreland Marine.
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
