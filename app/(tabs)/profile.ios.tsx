
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  useColorScheme,
  Platform,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import * as Sharing from 'expo-sharing';
import { colors } from '@/styles/commonStyles';
import { useRouter } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import * as FileSystem from 'expo-file-system/legacy';
import * as seaTimeApi from '@/utils/seaTimeApi';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  listCertificates,
  daysUntilExpiry,
  expiryStatus,
  CERTIFICATE_TYPE_LABELS,
  type Certificate,
} from '@/utils/certificatesApi';

import { log, warn, error as logError } from '@/utils/log';
import { useTranslation } from 'react-i18next';

const SIGNATURE_STORAGE_KEY = 'seatime_user_signature';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  emailVerified: boolean;
  image: string | null;
  imageUrl: string | null;
  created_at: string;
  createdAt: string;
  updatedAt: string;
  department?: string | null;
}

interface SeaTimeSummary {
  total_days: number;
  entries_by_vessel: {
    vessel_name: string;
    total_days: number;
  }[];
  entries_by_month: {
    month: string;
    total_days: number;
  }[];
  entries_by_service_type?: {
    service_type: string;
    total_days: number;
  }[];
}

interface Vessel {
  id: string;
  mmsi: string;
  vessel_name: string;
  is_active: boolean;
  created_at: string;
  flag?: string;
  official_number?: string;
  vessel_type?: string;
  length_metres?: number;
  gross_tonnes?: number;
  callsign?: string;
}

interface SeaDayDefinition {
  title: string;
  description: string;
  department: 'deck' | 'engineering' | 'both';
}

const SEA_DAY_DEFINITIONS: SeaDayDefinition[] = [
  {
    title: 'Onboard Yacht Service',
    description: 'All time signed on a yacht, regardless of activity.',
    department: 'both',
  },
  {
    title: 'Actual Days at Sea (Deck)',
    description: 'Vessel underway with propulsion (engine ≥4 hours or sailing). Anchor time only counts if unavoidable during passage (berth waiting, canal transit, severe weather). Anchor time must not exceed previous voyage duration, cannot end a passage, and does not count if for rest or leisure.',
    department: 'deck',
  },
  {
    title: 'Actual Days at Sea (Engineering)',
    description: 'Same propulsion and anchoring rules as Deck. Anchor time may qualify as Additional Watchkeeping, not sea time.',
    department: 'engineering',
  },
  {
    title: 'Watchkeeping Service - Bridge Watch (Deck)',
    description: 'Must be OOW 3000 CoC holder in charge of the navigational watch. Every 4 hours = 1 day, cumulative allowed. Watchkeeping days cannot exceed actual days at sea.',
    department: 'deck',
  },
  {
    title: 'Watchkeeping Service - Engine Room Underway (Engineering)',
    description: 'Every 4 hours = 1 day, cumulative allowed. OOW: may be subsidiary. Chief Engineer: must be in full charge or UMS. Cannot exceed days at sea.',
    department: 'engineering',
  },
  {
    title: 'Additional Watchkeeping (Engineering Only)',
    description: 'Engine room watch while stationary (anchor or alongside). Generators must be running. Cannot be logged on the same day as a sea day. Only valid for Yacht-restricted CoCs (not full SV).',
    department: 'engineering',
  },
  {
    title: 'Shipyard (Yard) Service - Deck',
    description: 'Time standing by during build, refit, or major repair. Routine maintenance excluded. Maximum 90 days per OOW 3000 NOE application. Over 90 days requires supporting documentation.',
    department: 'deck',
  },
  {
    title: 'Shipyard (Yard) Service - Engineering',
    description: 'Applies when vessel is in dock, drydock, or service facility. Must involve major engine, auxiliary, or systems work (e.g. engines, gearboxes, pumps, firefighting systems, hull fittings). Over 90 days requires works list and job descriptions. Evidence must be submitted with NOE application.',
    department: 'engineering',
  },
];

const ALL_SERVICE_TYPES = [
  'actual_sea_service',
  'watchkeeping_service',
  'standby_service',
  'yard_service',
  'service_in_port',
];

const createStyles = (isDark: boolean, topInset: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
      paddingTop: topInset,
    },
    scrollView: {
      flex: 1,
    },
    pageHeader: {
      padding: 20,
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? colors.border : colors.borderLight,
    },
    headerTitleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    appIcon: {
      width: 53,
      height: 53,
      borderRadius: 12,
    },
    headerTextContainer: {
      flex: 1,
      minWidth: 0,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
    },
    headerSubtitle: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 4,
    },
    content: {
      padding: 16,
    },
    profileSection: {
      alignItems: 'center',
      marginBottom: 30,
      paddingTop: 20,
    },
    profileImageContainer: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 15,
      overflow: 'hidden',
    },
    profileImage: {
      width: 100,
      height: 100,
    },
    profileInitials: {
      fontSize: 36,
      fontWeight: 'bold',
      color: colors.white,
    },
    profileName: {
      fontSize: 24,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 5,
    },
    profileEmail: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    section: {
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 10,
    },
    disclosureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    disclosureTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
    },
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 15,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    summaryRowLast: {
      borderBottomWidth: 0,
    },
    summaryLabel: {
      fontSize: 15,
      color: isDark ? colors.text : colors.textLight,
      flex: 1,
    },
    summaryValue: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.primary,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
      borderRadius: 8,
      paddingHorizontal: 12,
      marginTop: 8,
    },
    totalLabel: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
    },
    totalValue: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.primary,
    },
    loadingText: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      textAlign: 'center',
      paddingVertical: 10,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 15,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    menuItemLast: {
      borderBottomWidth: 0,
    },
    menuItemIcon: {
      marginRight: 15,
    },
    menuItemText: {
      flex: 1,
      fontSize: 16,
      color: isDark ? colors.text : colors.textLight,
    },
    menuItemChevron: {
      marginLeft: 10,
    },
    reportButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 15,
      marginBottom: 10,
    },
    reportButtonText: {
      color: colors.white,
      fontSize: 16,
      fontWeight: '600',
      marginLeft: 10,
    },
    departmentBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary + '20',
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 8,
      marginTop: 8,
      alignSelf: 'center',
    },
    departmentBadgeText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    vesselButton: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    vesselButtonLast: {
      borderBottomWidth: 0,
    },
    vesselButtonLeft: {
      flex: 1,
    },
    vesselName: {
      fontSize: 15,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 2,
    },
    vesselDays: {
      fontSize: 13,
      color: colors.primary,
    },
    definitionCard: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    definitionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 6,
    },
    definitionDescription: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      lineHeight: 20,
    },
    infoBox: {
      backgroundColor: colors.primary + '15',
      borderRadius: 10,
      padding: 14,
      marginBottom: 16,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
    },
    infoText: {
      fontSize: 13,
      color: isDark ? colors.text : colors.textLight,
      lineHeight: 20,
    },
  });

export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [summary, setSummary] = useState<SeaTimeSummary | null>(null);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [downloadingCSV, setDownloadingCSV] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showDefinitions, setShowDefinitions] = useState(false);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const styles = createStyles(isDark, insets.top);
  const router = useRouter();
  const { refreshTrigger } = useAuth();
  const { t } = useTranslation();

  log('ProfileScreen (iOS) rendered');

  const loadProfile = useCallback(async (retryCount = 0) => {
    const maxRetries = 1;
    log(`Loading user profile (attempt ${retryCount + 1}/${maxRetries + 1})`);
    
    try {
      const data = await seaTimeApi.getUserProfile();
      log('User profile loaded successfully:', data?.email);
      setProfile(data);
      setLoading(false);
    } catch (error: any) {
      logError(`Failed to load profile (attempt ${retryCount + 1}):`, error?.message);
      
      if (retryCount < maxRetries && (error?.message?.includes('Network') || error?.message?.includes('fetch'))) {
        const waitTime = 500;
        log(`Retrying profile load in ${waitTime}ms...`);
        setTimeout(() => loadProfile(retryCount + 1), waitTime);
      } else {
        setLoading(false);
        Alert.alert(
          'Profile Load Error',
          'Unable to load your profile. Please check your internet connection and try again.',
          [
            { text: 'Retry', onPress: () => loadProfile(0) },
            { text: 'Cancel', style: 'cancel' }
          ]
        );
      }
    }
  }, []);

  const loadSummary = useCallback(async (retryCount = 0) => {
    const maxRetries = 1;
    log(`Loading sea time summary (attempt ${retryCount + 1}/${maxRetries + 1})`);
    
    try {
      const data = await seaTimeApi.getReportSummary();
      log('Sea time summary loaded successfully');
      setSummary(data);
      setLoadingSummary(false);
    } catch (error: any) {
      logError(`Failed to load sea time summary (attempt ${retryCount + 1}):`, error?.message);
      
      if (retryCount < maxRetries && (error?.message?.includes('Network') || error?.message?.includes('fetch'))) {
        const waitTime = 500;
        log(`Retrying summary load in ${waitTime}ms...`);
        setTimeout(() => loadSummary(retryCount + 1), waitTime);
      } else {
        setLoadingSummary(false);
        warn('Summary load failed after retries, continuing without summary');
      }
    }
  }, []);

  const loadVessels = useCallback(async (retryCount = 0) => {
    const maxRetries = 1;
    log(`Loading vessels (attempt ${retryCount + 1}/${maxRetries + 1})`);
    
    try {
      const data = await seaTimeApi.getVessels();
      log('Vessels loaded successfully:', data?.length);
      setVessels(data);
    } catch (error: any) {
      logError(`Failed to load vessels (attempt ${retryCount + 1}):`, error?.message);
      
      if (retryCount < maxRetries && (error?.message?.includes('Network') || error?.message?.includes('fetch'))) {
        const waitTime = 500;
        log(`Retrying vessels load in ${waitTime}ms...`);
        setTimeout(() => loadVessels(retryCount + 1), waitTime);
      } else {
        warn('Vessels load failed after retries, continuing without vessels');
      }
    }
  }, []);

  const loadCertificates = useCallback(async () => {
    try {
      const certs = await listCertificates();
      setCertificates(certs);
    } catch (err) {
      logError('Failed to load certificates:', err);
    }
  }, []);

  useEffect(() => {
    log('ProfileScreen (iOS): Initial mount, loading data in parallel');
    Promise.all([
      loadProfile(),
      loadSummary(),
      loadVessels(),
      loadCertificates(),
    ]).catch(error => {
      logError('Failed to load profile data:', error);
    });
  }, [loadProfile, loadSummary, loadVessels, loadCertificates]);

  useEffect(() => {
    if (refreshTrigger > 0) {
      log('ProfileScreen (iOS): Global refresh triggered, reloading profile data in parallel');
      Promise.all([
        loadProfile(),
        loadSummary(),
        loadVessels(),
        loadCertificates(),
      ]).catch(error => {
        logError('Failed to refresh profile data:', error);
      });
    }
  }, [refreshTrigger, loadProfile, loadSummary, loadVessels, loadCertificates]);

  const handleRefresh = useCallback(async () => {
    log('User pulled to refresh profile screen');
    setRefreshing(true);
    try {
      await Promise.all([
        loadProfile(),
        loadSummary(),
        loadVessels(),
        loadCertificates(),
      ]);
    } catch (error) {
      logError('Failed to refresh profile data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [loadProfile, loadSummary, loadVessels, loadCertificates]);

  const handleVesselPress = (vesselName: string) => {
    log('User tapped vessel:', vesselName);
    const vessel = vessels.find((v) => v.vessel_name === vesselName);
    if (vessel) {
      router.push(`/vessel/${vessel.id}`);
    }
  };

  const formatServiceType = (serviceType: string): string => {
    const typeMap: { [key: string]: string } = {
      'actual_sea_service': 'Actual Sea Service',
      'watchkeeping_service': 'Watchkeeping Service',
      'standby_service': 'Stand-by Service',
      'yard_service': 'Yard Service',
      'service_in_port': 'Service in Port',
    };
    return typeMap[serviceType] || serviceType;
  };

  const getAllServiceTypesWithDays = () => {
    const serviceTypeMap: { [key: string]: number } = {};
    
    ALL_SERVICE_TYPES.forEach((type) => {
      serviceTypeMap[type] = 0;
    });
    
    if (summary?.entries_by_service_type) {
      summary.entries_by_service_type.forEach((entry) => {
        serviceTypeMap[entry.service_type] = entry.total_days;
      });
    }
    
    return ALL_SERVICE_TYPES.map((type) => ({
      service_type: type,
      total_days: serviceTypeMap[type],
    }));
  };

  const handleDownloadPDF = async () => {
    log('User tapped Download PDF Report');

    // Check whether the user has captured a signature. If not, prompt before
    // generating the PDF — signed reports look more credible to MCA assessors.
    try {
      const sig = await AsyncStorage.getItem(SIGNATURE_STORAGE_KEY);
      if (!sig) {
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Add your signature?',
            'Reports look more credible to MCA assessors when signed. You can add a signature now or download an unsigned report.',
            [
              { text: 'Download unsigned', style: 'cancel', onPress: () => resolve(true) },
              { text: 'Add signature', onPress: () => { router.push('/signature'); resolve(false); } },
            ],
            { cancelable: true, onDismiss: () => resolve(false) }
          );
        });
        if (!proceed) return;
      }
    } catch (err) {
      warn('[Profile] Failed to read signature, continuing without:', err);
    }

    setDownloadingPDF(true);
    try {
      log('Calling downloadPDFReport API...');
      const pdfBlob = await seaTimeApi.downloadPDFReport();
      log('PDF report downloaded, blob size:', pdfBlob.size);

      log('iOS platform: Saving PDF to file system');
      const fileName = `SeaTime_Report_${new Date().toISOString().split('T')[0]}.pdf`;
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      
      log('Converting blob to base64...');
      const reader = new FileReader();
      
      reader.onerror = (error) => {
        logError('FileReader error:', error);
        throw new Error('Failed to read PDF data');
      };
      
      reader.onloadend = async () => {
        try {
          log('Blob converted to base64, writing to file system...');
          const base64data = reader.result as string;
          const base64 = base64data.split(',')[1];
          
          await FileSystem.writeAsStringAsync(fileUri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          
          log('PDF saved to:', fileUri);
          
          const fileInfo = await FileSystem.getInfoAsync(fileUri);
          log('File info:', fileInfo);
          
          if (await Sharing.isAvailableAsync()) {
            log('Sharing is available, opening share dialog...');
            await Sharing.shareAsync(fileUri, {
              mimeType: 'application/pdf',
              dialogTitle: 'Save or Share PDF Report',
              UTI: 'com.adobe.pdf',
            });
            log('Share dialog opened successfully');
          } else {
            log('Sharing not available, showing success alert');
            Alert.alert('Success', `PDF report saved to:\n${fileUri}`);
          }
        } catch (error: any) {
          logError('Error in FileReader onloadend:', error);
          Alert.alert('Download Failed', `Unable to save PDF report. ${error?.message || 'Please try again.'}`);
          setDownloadingPDF(false);
        }
      };
      
      log('Starting FileReader...');
      reader.readAsDataURL(pdfBlob);
    } catch (error: any) {
      logError('Failed to download PDF report:', error);
      logError('Error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      });
      Alert.alert(
        'Download Failed', 
        `Unable to download PDF report. ${error?.message || 'Please try again or contact support if the issue persists.'}`
      );
    } finally {
      setDownloadingPDF(false);
    }
  };

  const handleDownloadCSV = async () => {
    log('User tapped Download CSV Report');
    setDownloadingCSV(true);
    try {
      const csvData = await seaTimeApi.downloadCSVReport();
      log('CSV report downloaded, size:', csvData.length);

      const fileUri = `${FileSystem.documentDirectory}SeaTime_Report_${new Date().toISOString().split('T')[0]}.csv`;
      
      await FileSystem.writeAsStringAsync(fileUri, csvData, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      
      log('CSV saved to:', fileUri);
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Success', 'CSV report saved to device');
      }
    } catch (error) {
      logError('Failed to download CSV report:', error);
      Alert.alert('Error', 'Failed to download CSV report. Please try again.');
    } finally {
      setDownloadingCSV(false);
    }
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name || typeof name !== 'string') {
      return '?';
    }
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: isDark ? colors.text : colors.textLight, marginTop: 16, fontSize: 16 }}>
          Loading your profile...
        </Text>
        <Text style={{ color: isDark ? colors.textSecondary : colors.textSecondaryLight, marginTop: 8, fontSize: 14, textAlign: 'center' }}>
          This may take a moment on slower connections
        </Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
        <IconSymbol
          ios_icon_name="exclamationmark.triangle"
          android_material_icon_name="warning"
          size={48}
          color={colors.primary}
        />
        <Text style={{ color: isDark ? colors.text : colors.textLight, marginTop: 16, fontSize: 18, fontWeight: '600' }}>
          Unable to Load Profile
        </Text>
        <Text style={{ color: isDark ? colors.textSecondary : colors.textSecondaryLight, marginTop: 8, fontSize: 14, textAlign: 'center' }}>
          Please check your internet connection
        </Text>
        <TouchableOpacity
          style={[styles.reportButton, { marginTop: 20, width: 200 }]}
          onPress={() => {
            setLoading(true);
            loadProfile(0);
            loadSummary(0);
            loadVessels(0);
          }}
        >
          <IconSymbol
            ios_icon_name="arrow.clockwise"
            android_material_icon_name="refresh"
            size={20}
            color="#ffffff"
          />
          <Text style={styles.reportButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const imageUrl = profile.imageUrl || (profile.image ? `${seaTimeApi.API_BASE_URL}/${profile.image}` : null);
  const displayName = profile.name || 'User';
  const initials = getInitials(profile.name);
  const totalDays = summary ? summary.total_days : 0;

  const userDepartment = profile?.department?.toLowerCase();
  const filteredDefinitions = SEA_DAY_DEFINITIONS.filter(
    (def) => (def.department === 'both' || def.department === userDepartment) && def.title !== 'Administrative Rules'
  );

  const allServiceTypes = getAllServiceTypesWithDays();

  log('Profile image URL:', imageUrl);
  log('User department:', userDepartment, '- Showing', filteredDefinitions.length, 'definitions');

  return (
    <ErrorBoundary>
    <View style={styles.container}>
      <View style={styles.pageHeader}>
        <View style={styles.headerTitleContainer}>
          <Image
            source={require('@/assets/images/c13cbd51-c2f7-489f-bbbb-6b28094d9b2b.png')}
            style={styles.appIcon}
            resizeMode="contain"
          />
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
              {t('profile.title')}
            </Text>
            <Text style={styles.headerSubtitle}>{t('profile.subtitle')}</Text>
          </View>
        </View>
      </View>

      <ScrollView 
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.content}>
          <View style={styles.profileSection}>
            <View style={styles.profileImageContainer}>
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.profileImage} />
              ) : (
                <Text style={styles.profileInitials}>{initials}</Text>
              )}
            </View>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.profileEmail}>{profile.email}</Text>
            {profile.department && (
              <View style={styles.departmentBadge}>
                <IconSymbol
                  ios_icon_name={profile.department.toLowerCase() === 'deck' ? 'sailboat.fill' : 'gearshape.2.fill'}
                  android_material_icon_name={profile.department.toLowerCase() === 'deck' ? 'directions-boat' : 'settings'}
                  size={14}
                  color={colors.primary}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.departmentBadgeText}>
                  {profile.department.toLowerCase() === 'deck' ? t('department.deck') : t('department.engineering')}
                </Text>
              </View>
            )}
          </View>

          {/* Certificates quick-access card */}
          <View style={styles.section}>
            <TouchableOpacity
              onPress={() => router.push('/certificates')}
              activeOpacity={0.7}
              style={{
                backgroundColor: isDark ? colors.cardBackground : colors.card,
                borderRadius: 12,
                padding: 16,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <View style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                backgroundColor: colors.primary + '15',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 14,
              }}>
                <IconSymbol
                  ios_icon_name="doc.text.fill"
                  android_material_icon_name="article"
                  size={22}
                  color={colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: isDark ? colors.text : colors.textLight,
                  marginBottom: 2,
                }}>
                  {t('certificates.title')}
                </Text>
                <Text style={{
                  fontSize: 13,
                  color: isDark ? colors.textSecondary : colors.textSecondaryLight,
                }}>
                  {(() => {
                    if (certificates.length === 0) return t('certificates.noCertificates');
                    const expiring = certificates.filter(c => {
                      const s = expiryStatus(c);
                      return s === 'expired' || s === 'soon';
                    });
                    if (expiring.length > 0) {
                      const expired = expiring.filter(c => expiryStatus(c) === 'expired').length;
                      const soon = expiring.filter(c => expiryStatus(c) === 'soon').length;
                      const parts: string[] = [];
                      if (expired > 0) parts.push(`${expired} ${t('certificates.expired').toLowerCase()}`);
                      if (soon > 0) parts.push(`${soon} ${t('certificates.expiringSoon').toLowerCase()}`);
                      return `${certificates.length} certificates - ${parts.join(', ')}`;
                    }
                    return `${certificates.length} certificates`;
                  })()}
                </Text>
              </View>
              {(() => {
                const hasExpired = certificates.some(c => expiryStatus(c) === 'expired');
                const hasSoon = certificates.some(c => expiryStatus(c) === 'soon');
                if (hasExpired) {
                  return (
                    <View style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: colors.error,
                      marginRight: 8,
                    }} />
                  );
                }
                if (hasSoon) {
                  return (
                    <View style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: colors.warning,
                      marginRight: 8,
                    }} />
                  );
                }
                return null;
              })()}
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="arrow-forward"
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          {!loadingSummary && summary && summary.entries_by_vessel.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('profile.downloadReports')}</Text>
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.reportButton}
                  onPress={handleDownloadPDF}
                  disabled={downloadingPDF}
                >
                  {downloadingPDF ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <IconSymbol
                        ios_icon_name="doc.fill"
                        android_material_icon_name="description"
                        size={24}
                        color="#ffffff"
                      />
                      <Text style={styles.reportButtonText}>{t('profile.downloadPDF')}</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.reportButton}
                  onPress={handleDownloadCSV}
                  disabled={downloadingCSV}
                >
                  {downloadingCSV ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <IconSymbol
                        ios_icon_name="tablecells"
                        android_material_icon_name="grid-on"
                        size={24}
                        color="#ffffff"
                      />
                      <Text style={styles.reportButtonText}>{t('profile.downloadCSV')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('profile.seaTimeSummary')}</Text>
            <View style={styles.card}>
              {loadingSummary ? (
                <Text style={styles.loadingText}>Loading summary...</Text>
              ) : summary ? (
                <>
                  {summary.entries_by_vessel.length === 0 && (
                    <Text style={styles.loadingText}>No confirmed sea time entries yet</Text>
                  )}

                  {summary.entries_by_vessel.length > 0 && (
                    <>
                      <View style={[styles.summaryRow, styles.summaryRowLast]}>
                        <Text style={styles.summaryLabel}>{t('profile.totalDays')}</Text>
                        <Text style={styles.summaryValue}>{totalDays}</Text>
                      </View>
                    </>
                  )}
                </>
              ) : (
                <Text style={styles.loadingText}>Unable to load summary</Text>
              )}
            </View>
          </View>

          {!loadingSummary && summary && summary.entries_by_vessel.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('profile.seaTimeByVessel')}</Text>
              <View style={styles.card}>
                {summary.entries_by_vessel.map((vessel, index) => {
                  const vesselDays = vessel.total_days;
                  const isLast = index === summary.entries_by_vessel.length - 1;
                  
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[styles.vesselButton, isLast && styles.vesselButtonLast]}
                      onPress={() => handleVesselPress(vessel.vessel_name)}
                    >
                      <View style={styles.vesselButtonLeft}>
                        <Text style={styles.vesselName}>{vessel.vessel_name}</Text>
                        <Text style={styles.vesselDays}>
                          {vesselDays} {vesselDays === 1 ? 'day' : 'days'}
                        </Text>
                      </View>
                      <IconSymbol
                        ios_icon_name="chevron.right"
                        android_material_icon_name="arrow-forward"
                        size={20}
                        color={colors.textSecondary}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {!loadingSummary && summary && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('profile.seaTimeByService')}</Text>
              <View style={styles.card}>
                {allServiceTypes.map((serviceEntry, index) => {
                  const serviceDays = serviceEntry.total_days;
                  const isLast = index === allServiceTypes.length - 1;
                  const formattedType = formatServiceType(serviceEntry.service_type);

                  return (
                    <View
                      key={index}
                      style={[styles.summaryRow, isLast && styles.summaryRowLast]}
                    >
                      <Text style={styles.summaryLabel}>{formattedType}</Text>
                      <Text style={styles.summaryValue}>
                        {serviceDays}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Certification Progress Tracker */}
          {!loadingSummary && summary && profile.department && (() => {
            const dept = profile.department.toLowerCase();
            const seagoingDays = allServiceTypes.find(s => s.service_type === 'actual_sea_service')?.total_days ?? 0;
            const watchkeepingDays = allServiceTypes.find(s => s.service_type === 'watchkeeping_service')?.total_days ?? 0;
            const additionalDays =
              (allServiceTypes.find(s => s.service_type === 'standby_service')?.total_days ?? 0) +
              (allServiceTypes.find(s => s.service_type === 'yard_service')?.total_days ?? 0);

            const isEngineering = dept === 'engineering';
            const certTitle = isEngineering
              ? 'EOOW (SV) <9,000 kW, <3,000 GT'
              : 'OOW (Deck) <3,000 GT';

            // Engineering: MSN 1904 Experienced Seafarer Route (section 4.4)
            // - 24 months onboard with 6 months seagoing (entry)
            // - 11 months additional seagoing post-registration, 6 months watchkeeping/UMS
            // Deck: MSN 1858 OOW Yachts <3000 GT
            // - 250 days seagoing, 115 days additional
            const requirements = isEngineering
              ? [
                  { label: 'Seagoing Service', current: seagoingDays, required: 240 },
                  { label: 'Watchkeeping / UMS', current: watchkeepingDays, required: 180 },
                ]
              : [
                  { label: 'Seagoing Service', current: seagoingDays, required: 250 },
                  { label: 'Additional Service', current: additionalDays, required: 115 },
                ];

            return (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Certification Progress</Text>
                <View style={styles.card}>
                  <Text style={{
                    fontSize: 15,
                    fontWeight: '700',
                    color: isDark ? colors.text : colors.textLight,
                    marginBottom: 14,
                  }}>
                    {certTitle}
                  </Text>
                  {requirements.map((req, index) => {
                    const pct = Math.min(req.current / req.required, 1);
                    const isLast = index === requirements.length - 1;
                    return (
                      <View key={req.label} style={{ marginBottom: isLast ? 0 : 14 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                          <Text style={{
                            fontSize: 14,
                            color: isDark ? colors.text : colors.textLight,
                          }}>
                            {req.label}
                          </Text>
                          <Text style={{
                            fontSize: 14,
                            fontWeight: '600',
                            color: pct >= 1 ? colors.success : colors.primary,
                          }}>
                            {req.current}/{req.required} days
                          </Text>
                        </View>
                        <View style={{
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                          overflow: 'hidden',
                        }}>
                          <View style={{
                            height: '100%',
                            width: `${Math.round(pct * 100)}%`,
                            backgroundColor: pct >= 1 ? colors.success : colors.primary,
                            borderRadius: 4,
                          }} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })()}

          {profile.department && (
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.disclosureRow}
                onPress={() => setShowDefinitions((s) => !s)}
                activeOpacity={0.7}
              >
                <Text style={styles.disclosureTitle}>
                  {t('profile.whatCountsAsSeaTime')}
                </Text>
                <IconSymbol
                  ios_icon_name={showDefinitions ? 'chevron.up' : 'chevron.down'}
                  android_material_icon_name={showDefinitions ? 'expand-less' : 'expand-more'}
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
              {showDefinitions && (
                <View style={{ marginTop: 10 }}>
                  <View style={styles.infoBox}>
                    <Text style={styles.infoText}>
                      These definitions ensure your sea time records are compliant with MCA regulations for {profile.department.toLowerCase() === 'deck' ? 'Deck' : 'Engineering'} officers ({profile.department.toLowerCase() === 'deck' ? 'MSN 1858' : 'MSN 1904'}). All data capture in this app follows these standards.
                    </Text>
                  </View>
                  {filteredDefinitions.map((definition, index) => (
                    <View key={index} style={styles.definitionCard}>
                      <Text style={styles.definitionTitle}>{definition.title}</Text>
                      <Text style={styles.definitionDescription}>{definition.description}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.card}>
              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemLast]}
                onPress={() => router.push('/settings')}
                activeOpacity={0.6}
              >
                <IconSymbol
                  ios_icon_name="gearshape.fill"
                  android_material_icon_name="settings"
                  size={24}
                  color={colors.primary}
                  style={styles.menuItemIcon}
                />
                <Text style={styles.menuItemText}>{t('settings.title')}</Text>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="arrow-forward"
                  size={20}
                  color={colors.textSecondary}
                  style={styles.menuItemChevron}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

    </View>
    </ErrorBoundary>
  );
}
