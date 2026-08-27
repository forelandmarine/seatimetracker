
import { IconSymbol } from '@/components/IconSymbol';
import { CertificationProgress } from '@/components/CertificationProgress';
import type { MaritimeAuthority } from '@/constants/mcaRequirements';
import { USCG_SERVICE_DEFINITIONS } from '@/constants/mcaRequirements';
import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import * as seaTimeApi from '@/utils/seaTimeApi';
import { useAuth } from '@/contexts/AuthContext';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  Platform,
  Image,
  ActivityIndicator,
  Modal,
  Linking,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import {
  isBiometricAvailable,
  getBiometricCredentials,
  clearBiometricCredentials,
  getBiometricType
} from '@/utils/biometricAuth';
import { log, warn, error as logError } from '@/utils/log';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  maritime_authority?: MaritimeAuthority | null;
  target_certification?: string | null;
}

interface SeaTimeSummary {
  total_days: number;
  uscg_service?: {
    creditable: number;
    standby: number;
    yard: number;
    port: number;
    short_of_eight_hours: number;
  } | null;
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

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    scrollView: {
      flex: 1,
    },
    pageHeader: {
      padding: 20,
      paddingTop: Platform.OS === 'android' ? 48 : 20,
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
      padding: 20,
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
      color: '#ffffff',
    },
    profileName: {
      fontSize: 24,
      fontWeight: 'bold',
      color: isDark ? colors.text : '#1a1a1a',
      marginBottom: 5,
    },
    profileEmail: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : '#666666',
    },
    section: {
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 10,
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
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
      marginLeft: 10,
    },
    signOutButton: {
      backgroundColor: colors.error,
      borderRadius: 12,
      padding: 15,
      alignItems: 'center',
      marginTop: 20,
    },
    signOutButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    supportButton: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 15,
      alignItems: 'center',
      marginTop: 10,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    supportButtonText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    departmentBadge: {
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
      borderRadius: 10,
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
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      backgroundColor: isDark ? '#1c1c1e' : '#ffffff',
      borderRadius: 16,
      padding: 20,
      width: SCREEN_WIDTH - 40,
      maxHeight: '80%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: isDark ? '#ffffff' : '#000000',
      flex: 1,
    },
    closeButton: {
      padding: 4,
    },
    modalScrollView: {
      maxHeight: 400,
    },
    particularRow: {
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    particularRowLast: {
      borderBottomWidth: 0,
    },
    particularLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#8e8e93' : '#8e8e93',
      marginBottom: 4,
    },
    particularValue: {
      fontSize: 16,
      color: isDark ? '#ffffff' : '#000000',
      fontWeight: '500',
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
    confirmModalContent: {
      backgroundColor: isDark ? '#1c1c1e' : '#ffffff',
      borderRadius: 16,
      padding: 24,
      width: '100%',
      maxWidth: 340,
    },
    confirmModalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? '#ffffff' : '#000000',
      marginBottom: 12,
      textAlign: 'center',
    },
    confirmModalMessage: {
      fontSize: 15,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 24,
      textAlign: 'center',
      lineHeight: 22,
    },
    confirmModalButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    confirmModalButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      alignItems: 'center',
    },
    confirmModalCancelButton: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    confirmModalConfirmButton: {
      backgroundColor: colors.error,
    },
    confirmModalButtonText: {
      fontSize: 16,
      fontWeight: '600',
    },
    confirmModalCancelText: {
      color: isDark ? colors.text : colors.textLight,
    },
    confirmModalConfirmText: {
      color: '#ffffff',
    },
  });

export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [summary, setSummary] = useState<SeaTimeSummary | null>(null);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [reportTemplate, setReportTemplate] = useState<'mca' | 'uscg' | 'mnz' | 'amsa' | 'generic'>('mca');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [downloadingCSV, setDownloadingCSV] = useState(false);
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);
  const [showVesselModal, setShowVesselModal] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const [biometricType, setBiometricType] = useState('Biometric');
  const [infoModal, setInfoModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'error' | 'success' | 'info';
  }>({ visible: false, title: '', message: '', type: 'info' });
  const [showBiometricDisableModal, setShowBiometricDisableModal] = useState(false);

  const showInfo = (title: string, message: string, type: 'error' | 'success' | 'info' = 'info') => {
    setInfoModal({ visible: true, title, message, type });
  };
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const router = useRouter();
  const { signOut, refreshTrigger } = useAuth();
  const { t } = useTranslation();

  log('ProfileScreen rendered');

  const checkBiometricStatus = useCallback(async () => {
    try {
      const available = await isBiometricAvailable();
      setBiometricAvailable(available);
      
      if (available) {
        const type = await getBiometricType();
        setBiometricType(type);
        
        const credentials = await getBiometricCredentials();
        setHasSavedCredentials(!!credentials);
      }
    } catch (error) {
      logError('Error checking biometric status:', error);
    }
  }, []);

  const loadProfile = useCallback(async (retryCount = 0) => {
    const maxRetries = 1;
    log(`Loading user profile (attempt ${retryCount + 1}/${maxRetries + 1})`);

    if (retryCount === 0) {
      setLoadError(false);
    }

    try {
      const data = await seaTimeApi.getUserProfile();
      log('User profile loaded successfully:', data?.email);
      setProfile(data);
      setLoading(false);
      setLoadError(false);
    } catch (error: any) {
      logError(`Failed to load profile (attempt ${retryCount + 1}):`, error?.message);

      if (retryCount < maxRetries && (error?.message?.includes('Network') || error?.message?.includes('fetch'))) {
        const waitTime = 500;
        log(`Retrying profile load in ${waitTime}ms...`);
        setTimeout(() => loadProfile(retryCount + 1), waitTime);
      } else {
        setLoading(false);
        setLoadError(true);
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

  useFocusEffect(
    useCallback(() => {
      log('ProfileScreen: Screen focused, loading data in parallel');
      setLoading(true);
      setLoadingSummary(true);
      Promise.all([
        loadProfile(),
        loadSummary(),
        loadVessels(),
        checkBiometricStatus(),
      ]).catch(error => {
        logError('Failed to load profile data:', error);
      });
    }, [loadProfile, loadSummary, loadVessels, checkBiometricStatus])
  );

  useEffect(() => {
    if (refreshTrigger > 0) {
      log('ProfileScreen: Global refresh triggered, reloading profile data in parallel');
      Promise.all([
        loadProfile(),
        loadSummary(),
        loadVessels(),
      ]).catch(error => {
        logError('Failed to refresh profile data:', error);
      });
    }
  }, [refreshTrigger, loadProfile, loadSummary, loadVessels]);

  const handleEditProfile = () => {
    log('User tapped User Profile');
    router.push('/user-profile');
  };

  const handleScheduledTasks = () => {
    log('User tapped Scheduled Tasks');
    router.push('/scheduled-tasks');
  };

  const handleSupport = async () => {
    log('User tapped Support button');
    const supportEmail = 'info@forelandmarine.com';
    const subject = 'SeaTime Tracker Support Request';
    const body = 'Hello,\n\nI need assistance with:\n\n';
    
    const mailtoUrl = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
        log('Support email opened successfully');
      } else {
        log('Cannot open email client, showing modal with email address');
        showInfo('Contact Support', `Please email us at:\n${supportEmail}`, 'info');
      }
    } catch (error) {
      logError('Failed to open email client:', error);
      showInfo('Contact Support', `Please email us at:\n${supportEmail}`, 'info');
    }
  };

  const handleVesselPress = (vesselName: string) => {
    log('User tapped vessel:', vesselName);
    const vessel = vessels.find((v) => v.vessel_name === vesselName);
    if (vessel) {
      setSelectedVessel(vessel);
      setShowVesselModal(true);
    }
  };

  const handleCloseModal = () => {
    log('User closed vessel modal');
    setShowVesselModal(false);
    setSelectedVessel(null);
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
    log('User tapped Download PDF Report, template:', reportTemplate);
    setDownloadingPDF(true);
    try {
      log('Calling downloadPDFReport API...');
      const pdfBlob = await seaTimeApi.downloadPDFReport(reportTemplate);
      log('PDF report downloaded, blob size:', pdfBlob.size);

      if (Platform.OS === 'web') {
        log('Web platform: Creating download link');
        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `SeaTime_Report_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        log('PDF download triggered successfully on web');
        showInfo('Success', 'PDF report downloaded successfully', 'success');
      } else {
        log('Mobile platform: Saving PDF to file system');
        const fileName = `SeaTime_Report_${new Date().toISOString().split('T')[0]}.pdf`;
        const fileUri = `${FileSystem.documentDirectory}${fileName}`;

        log('Converting blob to base64...');
        const base64data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Failed to read PDF data'));
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(pdfBlob);
        });

        const base64 = base64data.split(',')[1];
        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        log('PDF saved to:', fileUri);

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/pdf',
            dialogTitle: 'Save or Share PDF Report',
            UTI: 'com.adobe.pdf',
          });
        } else {
          showInfo('Success', `PDF report saved to:\n${fileUri}`, 'success');
        }
      }
    } catch (error: any) {
      logError('Failed to download PDF report:', error);
      logError('Error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      });
      showInfo('Download Failed', `Unable to download PDF report. ${error?.message || 'Please try again or contact support if the issue persists.'}`, 'error');
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

      if (Platform.OS === 'web') {
        const blob = new Blob([csvData], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `SeaTime_Report_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showInfo('Success', 'CSV report downloaded successfully', 'success');
      } else {
        const fileUri = `${FileSystem.documentDirectory}SeaTime_Report_${new Date().toISOString().split('T')[0]}.csv`;
        
        await FileSystem.writeAsStringAsync(fileUri, csvData, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        
        log('CSV saved to:', fileUri);
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri);
        } else {
          showInfo('Success', 'CSV report saved to device', 'success');
        }
      }
    } catch (error) {
      logError('Failed to download CSV report:', error);
      showInfo('Error', 'Failed to download CSV report. Please try again.', 'error');
    } finally {
      setDownloadingCSV(false);
    }
  };

  const handleDownloadXLSX = async () => {
    log('User tapped Download Excel Report');
    setDownloadingCSV(true); // reuse loading state
    try {
      const { BACKEND_URL } = await import('@/utils/api');
      const { getToken } = await import('@/utils/tokenStorage');
      const token = await getToken();
      const res = await fetch(`${BACKEND_URL}/api/reports/xlsx`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed to download Excel report (${res.status})`);

      if (Platform.OS === 'web') {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `SeaTime_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showInfo('Success', 'Excel report downloaded successfully', 'success');
      } else {
        const arrayBuffer = await res.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        const fileUri = `${FileSystem.documentDirectory}SeaTime_Report_${new Date().toISOString().split('T')[0]}.xlsx`;
        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri);
        } else {
          showInfo('Success', 'Excel report saved to device', 'success');
        }
      }
    } catch (error) {
      logError('Failed to download Excel report:', error);
      showInfo('Error', 'Failed to download Excel report. Please try again.', 'error');
    } finally {
      setDownloadingCSV(false);
    }
  };

  const handleManageBiometric = async () => {
    log('User tapped Manage Biometric Authentication');
    
    if (!biometricAvailable) {
      showInfo(
        'Not Available',
        `${biometricType} is not available on this device. Please ensure you have enrolled biometric credentials in your device settings.`,
        'info'
      );
      return;
    }

    if (hasSavedCredentials) {
      setShowBiometricDisableModal(true);
    } else {
      showInfo(
        `Enable ${biometricType}`,
        `To enable ${biometricType} sign in, please sign out and sign in again with the "Remember me" checkbox enabled.`,
        'info'
      );
    }
  };

  const handleSignOut = () => {
    log('User tapped Sign Out button');
    setShowSignOutModal(true);
  };

  const confirmSignOut = async () => {
    log('User confirmed sign out in modal');
    setSigningOut(true);
    try {
      await signOut();
      log('Sign out successful');
      setShowSignOutModal(false);
    } catch (error) {
      logError('Sign out error:', error);
      setShowSignOutModal(false);
      showInfo('Error', 'Failed to sign out. Please try again.', 'error');
    } finally {
      setSigningOut(false);
    }
  };

  const cancelSignOut = () => {
    log('User cancelled sign out');
    setShowSignOutModal(false);
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

  if (loading && !loadError) {
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

  if (loadError || !profile) {
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
          Unable to load profile. Check your connection and try again.
        </Text>
        <TouchableOpacity
          style={[styles.reportButton, { marginTop: 20, width: 200 }]}
          onPress={() => {
            setLoading(true);
            setLoadError(false);
            setLoadingSummary(true);
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
  // The shipped definitions describe the MCA yacht rules (MSN 1858 / 1904), so
  // a USCG applicant gets the 46 CFR ones instead.
  const isUSCGPathway = profile?.maritime_authority === 'uscg';
  const definitionSource = isUSCGPathway ? USCG_SERVICE_DEFINITIONS : SEA_DAY_DEFINITIONS;
  const filteredDefinitions = definitionSource.filter(
    (def) => (def.department === 'both' || def.department === userDepartment) && def.title !== 'Administrative Rules'
  );

  const allServiceTypes = getAllServiceTypesWithDays();

  log('Profile image URL:', imageUrl);
  log('User department:', userDepartment, '- Showing', filteredDefinitions.length, 'definitions');

  return (
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

      <ScrollView style={styles.scrollView}>
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
                <Text style={styles.departmentBadgeText}>
                  {profile.department.toLowerCase() === 'deck' ? t('department.deck') : t('department.engineering')}
                </Text>
              </View>
            )}
          </View>

          {!loadingSummary && summary && summary.entries_by_vessel.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('profile.downloadReports')}</Text>
              <View style={styles.card}>
                {/* Report template selector */}
                <TouchableOpacity
                  style={[styles.reportButton, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary }]}
                  onPress={() => setShowTemplateModal(true)}
                >
                  <IconSymbol
                    ios_icon_name="building.columns"
                    android_material_icon_name="account-balance"
                    size={20}
                    color={colors.primary}
                  />
                  <Text style={[styles.reportButtonText, { color: colors.primary }]}>
                    Template: {reportTemplate.toUpperCase()}
                  </Text>
                </TouchableOpacity>

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

                <TouchableOpacity
                  style={styles.reportButton}
                  onPress={handleDownloadXLSX}
                  disabled={downloadingCSV}
                >
                  {downloadingCSV ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <>
                      <IconSymbol
                        ios_icon_name="tablecells.fill"
                        android_material_icon_name="table-chart"
                        size={24}
                        color="#ffffff"
                      />
                      <Text style={styles.reportButtonText}>Download Excel Report</Text>
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
          {!loadingSummary && summary && profile.department && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Certification Progress</Text>
              <View style={styles.card}>
                <CertificationProgress
                  authority={profile.maritime_authority ?? null}
                  department={profile.department}
                  targetId={profile.target_certification ?? null}
                  serviceTypes={allServiceTypes}
                  uscgService={summary.uscg_service ?? null}
                  isDark={isDark}
                  onChangeTarget={() =>
                    router.push(
                      `/mca-requirements?department=${profile.department?.toLowerCase() ?? 'deck'}` +
                        (profile.maritime_authority ? `&authority=${profile.maritime_authority}` : ''),
                    )
                  }
                />
              </View>
            </View>
          )}

          {profile.department && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {isUSCGPathway
                  ? `${profile.department.toLowerCase() === 'deck' ? 'Deck' : 'Engineering'} Department - USCG Service Definitions (46 CFR)`
                  : profile.department.toLowerCase() === 'deck'
                    ? 'Deck Department - Sea Service Definitions (MSN 1858)'
                    : 'Engineering Department - Sea Service Definitions (MSN 1904)'}
              </Text>
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  {isUSCGPathway
                    ? `How the Coast Guard counts service toward a ${profile.department.toLowerCase() === 'deck' ? 'deck' : 'engineer'} endorsement, under 46 CFR parts 10 and 11. Your logged time is counted on these rules.`
                    : `These definitions ensure your sea time records are compliant with MCA regulations for ${profile.department.toLowerCase() === 'deck' ? 'Deck' : 'Engineering'} officers. All data capture in this app follows these standards.`}
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

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>
            <View style={styles.card}>
              <TouchableOpacity style={styles.menuItem} onPress={handleEditProfile}>
                <IconSymbol
                  ios_icon_name="person.circle"
                  android_material_icon_name="person"
                  size={24}
                  color={colors.primary}
                  style={styles.menuItemIcon}
                />
                <Text style={styles.menuItemText}>User Profile</Text>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="arrow-forward"
                  size={20}
                  color={colors.textSecondary}
                  style={styles.menuItemChevron}
                />
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuItem} onPress={handleScheduledTasks}>
                <IconSymbol
                  ios_icon_name="clock"
                  android_material_icon_name="schedule"
                  size={24}
                  color={colors.primary}
                  style={styles.menuItemIcon}
                />
                <Text style={styles.menuItemText}>Scheduled Tasks</Text>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="arrow-forward"
                  size={20}
                  color={colors.textSecondary}
                  style={styles.menuItemChevron}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => router.push('/notification-settings')}
              >
                <IconSymbol
                  ios_icon_name="bell"
                  android_material_icon_name="notifications"
                  size={24}
                  color={colors.primary}
                  style={styles.menuItemIcon}
                />
                <Text style={styles.menuItemText}>{t('navigation.notificationSettings')}</Text>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="arrow-forward"
                  size={20}
                  color={colors.textSecondary}
                  style={styles.menuItemChevron}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => router.push('/certificates')}
              >
                <IconSymbol
                  ios_icon_name="doc.text.fill"
                  android_material_icon_name="article"
                  size={24}
                  color={colors.primary}
                  style={styles.menuItemIcon}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuItemText}>{t('certificates.title')}</Text>
                  <Text style={{ fontSize: 12, color: isDark ? colors.textSecondary : colors.textSecondaryLight, marginTop: 1 }}>
                    Upload and manage your maritime certificates
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="arrow-forward"
                  size={20}
                  color={colors.textSecondary}
                  style={styles.menuItemChevron}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => router.push('/signature')}
              >
                <IconSymbol
                  ios_icon_name="signature"
                  android_material_icon_name="draw"
                  size={24}
                  color={colors.primary}
                  style={styles.menuItemIcon}
                />
                <Text style={styles.menuItemText}>{t('settings.signatureForReports')}</Text>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="arrow-forward"
                  size={20}
                  color={colors.textSecondary}
                  style={styles.menuItemChevron}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => router.push('/refer')}
              >
                <IconSymbol
                  ios_icon_name="person.2.fill"
                  android_material_icon_name="people"
                  size={24}
                  color={colors.primary}
                  style={styles.menuItemIcon}
                />
                <Text style={styles.menuItemText}>{t('settings.referAFriend')}</Text>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="arrow-forward"
                  size={20}
                  color={colors.textSecondary}
                  style={styles.menuItemChevron}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => router.push('/language')}
              >
                <IconSymbol
                  ios_icon_name="globe"
                  android_material_icon_name="language"
                  size={24}
                  color={colors.primary}
                  style={styles.menuItemIcon}
                />
                <Text style={styles.menuItemText}>{t('settings.language')}</Text>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="arrow-forward"
                  size={20}
                  color={colors.textSecondary}
                  style={styles.menuItemChevron}
                />
              </TouchableOpacity>

              {biometricAvailable && (
                <TouchableOpacity style={styles.menuItem} onPress={handleManageBiometric}>
                  <IconSymbol
                    ios_icon_name="faceid"
                    android_material_icon_name="fingerprint"
                    size={24}
                    color={colors.primary}
                    style={styles.menuItemIcon}
                  />
                  <Text style={styles.menuItemText}>
                    {biometricType} Sign In {hasSavedCredentials ? '(Enabled)' : '(Disabled)'}
                  </Text>
                  <IconSymbol
                    ios_icon_name="chevron.right"
                    android_material_icon_name="arrow-forward"
                    size={20}
                    color={colors.textSecondary}
                    style={styles.menuItemChevron}
                  />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemLast]}
                onPress={() => router.push('/about')}
              >
                <IconSymbol
                  ios_icon_name="info.circle"
                  android_material_icon_name="info"
                  size={24}
                  color={colors.primary}
                  style={styles.menuItemIcon}
                />
                <Text style={styles.menuItemText}>{t('navigation.about')}</Text>
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

          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutButtonText}>{t('auth.signOut')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.supportButton} onPress={handleSupport}>
            <Text style={styles.supportButtonText}>Contact Support</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        visible={showVesselModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseModal}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleCloseModal}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Yacht Particulars</Text>
                <TouchableOpacity onPress={handleCloseModal} style={styles.closeButton}>
                  <IconSymbol
                    ios_icon_name="xmark"
                    android_material_icon_name="close"
                    size={24}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScrollView}>
                {selectedVessel && (
                  <>
                    <View style={styles.particularRow}>
                      <Text style={styles.particularLabel}>Vessel Name</Text>
                      <Text style={styles.particularValue}>{selectedVessel.vessel_name}</Text>
                    </View>
                    <View style={styles.particularRow}>
                      <Text style={styles.particularLabel}>MMSI</Text>
                      <Text style={styles.particularValue}>{selectedVessel.mmsi}</Text>
                    </View>
                    {selectedVessel.flag && (
                      <View style={styles.particularRow}>
                        <Text style={styles.particularLabel}>Flag</Text>
                        <Text style={styles.particularValue}>{selectedVessel.flag}</Text>
                      </View>
                    )}
                    {selectedVessel.official_number && (
                      <View style={styles.particularRow}>
                        <Text style={styles.particularLabel}>Official Number</Text>
                        <Text style={styles.particularValue}>{selectedVessel.official_number}</Text>
                      </View>
                    )}
                    {selectedVessel.vessel_type && (
                      <View style={styles.particularRow}>
                        <Text style={styles.particularLabel}>Vessel Type</Text>
                        <Text style={styles.particularValue}>{selectedVessel.vessel_type}</Text>
                      </View>
                    )}
                    {selectedVessel.length_metres && (
                      <View style={styles.particularRow}>
                        <Text style={styles.particularLabel}>Length</Text>
                        <Text style={styles.particularValue}>{selectedVessel.length_metres}m</Text>
                      </View>
                    )}
                    {selectedVessel.gross_tonnes && (
                      <View style={styles.particularRow}>
                        <Text style={styles.particularLabel}>Gross Tonnes</Text>
                        <Text style={styles.particularValue}>{selectedVessel.gross_tonnes}</Text>
                      </View>
                    )}
                    {selectedVessel.callsign && (
                      <View style={styles.particularRow}>
                        <Text style={styles.particularLabel}>Callsign</Text>
                        <Text style={styles.particularValue}>{selectedVessel.callsign}</Text>
                      </View>
                    )}
                    <View style={[styles.particularRow, styles.particularRowLast]}>
                      <Text style={styles.particularLabel}>Status</Text>
                      <Text style={styles.particularValue}>
                        {selectedVessel.is_active ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                  </>
                )}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showSignOutModal}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelSignOut}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <Text style={styles.confirmModalTitle}>{t('signOut.title')}</Text>
            <Text style={styles.confirmModalMessage}>
              {t('signOut.confirmation')}
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity
                style={[styles.confirmModalButton, styles.confirmModalCancelButton]}
                onPress={cancelSignOut}
                disabled={signingOut}
              >
                <Text style={[styles.confirmModalButtonText, styles.confirmModalCancelText]}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmModalButton, styles.confirmModalConfirmButton]}
                onPress={confirmSignOut}
                disabled={signingOut}
              >
                {signingOut ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={[styles.confirmModalButtonText, styles.confirmModalConfirmText]}>
                    {t('auth.signOut')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Report template selector modal */}
      <Modal
        visible={showTemplateModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowTemplateModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowTemplateModal(false)}
        >
          <View style={[styles.confirmModalContent, { width: '85%', maxWidth: 360 }]} onStartShouldSetResponder={() => true}>
            <Text style={[styles.confirmModalTitle, { color: isDark ? '#ffffff' : '#000000' }]}>
              Report template
            </Text>
            <Text style={[styles.confirmModalMessage, { marginBottom: 16 }]}>
              Choose the certification body for this report
            </Text>
            {[
              { id: 'mca', label: 'MCA — UK Maritime and Coastguard Agency' },
              { id: 'uscg', label: 'USCG — United States Coast Guard' },
              { id: 'mnz', label: 'MNZ — Maritime New Zealand' },
              { id: 'amsa', label: 'AMSA — Australian Maritime Safety Authority' },
              { id: 'generic', label: 'Generic' },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  marginBottom: 4,
                  backgroundColor: reportTemplate === opt.id ? colors.primary + '15' : 'transparent',
                }}
                onPress={() => {
                  setReportTemplate(opt.id as any);
                  setShowTemplateModal(false);
                }}
              >
                <Text style={{
                  fontSize: 14,
                  color: reportTemplate === opt.id ? colors.primary : (isDark ? colors.text : colors.textLight),
                  fontWeight: reportTemplate === opt.id ? '700' : '400',
                }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Info/Error/Success Modal - replaces Alert.alert() for web compatibility */}
      <Modal
        visible={infoModal.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setInfoModal(prev => ({ ...prev, visible: false }))}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <Text style={[styles.confirmModalTitle, {
              color: infoModal.type === 'error' ? colors.error : infoModal.type === 'success' ? colors.primary : (isDark ? '#ffffff' : '#000000')
            }]}>
              {infoModal.title}
            </Text>
            <Text style={styles.confirmModalMessage}>{infoModal.message}</Text>
            <TouchableOpacity
              style={[styles.confirmModalButton, styles.confirmModalConfirmButton, {
                backgroundColor: infoModal.type === 'error' ? colors.error : colors.primary,
                flex: undefined,
                width: '100%',
              }]}
              onPress={() => setInfoModal(prev => ({ ...prev, visible: false }))}
            >
              <Text style={[styles.confirmModalButtonText, styles.confirmModalConfirmText]}>{t('common.ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Biometric Disable Confirmation Modal */}
      <Modal
        visible={showBiometricDisableModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowBiometricDisableModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <Text style={styles.confirmModalTitle}>Disable {biometricType}</Text>
            <Text style={styles.confirmModalMessage}>
              Do you want to disable {biometricType} sign in? You will need to enter your password next time.
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity
                style={[styles.confirmModalButton, styles.confirmModalCancelButton]}
                onPress={() => setShowBiometricDisableModal(false)}
              >
                <Text style={[styles.confirmModalButtonText, styles.confirmModalCancelText]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmModalButton, styles.confirmModalConfirmButton]}
                onPress={async () => {
                  log('User confirmed disable biometric');
                  setShowBiometricDisableModal(false);
                  await clearBiometricCredentials();
                  setHasSavedCredentials(false);
                  showInfo('Success', `${biometricType} sign in has been disabled`, 'success');
                }}
              >
                <Text style={[styles.confirmModalButtonText, styles.confirmModalConfirmText]}>Disable</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
