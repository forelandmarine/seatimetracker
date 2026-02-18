
import { IconSymbol } from '@/components/IconSymbol';
import { UpgradeButton } from "@/components/UpgradeButton";
import React, { useState, useEffect, useCallback } from 'react';
import * as seaTimeApi from '@/utils/seaTimeApi';
import { useAuth } from '@/contexts/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
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
  Modal,
  RefreshControl,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';

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
  total_hours: number;
  total_days: number;
  entries_by_vessel: {
    vessel_name: string;
    total_hours: number;
  }[];
  entries_by_month: {
    month: string;
    total_hours: number;
  }[];
  entries_by_service_type?: {
    service_type: string;
    total_hours: number;
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
    },
    scrollView: {
      flex: 1,
    },
    pageHeader: {
      padding: 20,
      paddingTop: topInset + 12,
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
      color: colors.text,
      marginBottom: 5,
    },
    profileEmail: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    section: {
      marginBottom: 20,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
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
      backgroundColor: '#ff4444',
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
      padding: 20,
    },
    modalContent: {
      backgroundColor: isDark ? '#1c1c1e' : '#ffffff',
      borderRadius: 16,
      padding: 20,
      width: '100%',
      maxWidth: 400,
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
      backgroundColor: '#ff4444',
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
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [downloadingCSV, setDownloadingCSV] = useState(false);
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);
  const [showVesselModal, setShowVesselModal] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const styles = createStyles(isDark, insets.top);
  const router = useRouter();
  const { signOut, refreshTrigger } = useAuth();

  console.log('ProfileScreen rendered (iOS)');

  const loadProfile = useCallback(async (retryCount = 0) => {
    const maxRetries = 1; // Reduced from 2 for faster failure on good connections
    console.log(`Loading user profile (attempt ${retryCount + 1}/${maxRetries + 1})`);
    
    try {
      const data = await seaTimeApi.getUserProfile();
      console.log('User profile loaded successfully:', data?.email);
      setProfile(data);
      setLoading(false);
    } catch (error: any) {
      console.error(`Failed to load profile (attempt ${retryCount + 1}):`, error?.message);
      
      if (retryCount < maxRetries && (error?.message?.includes('Network') || error?.message?.includes('fetch'))) {
        // Reduced wait time from exponential backoff to fixed 500ms for instant retry on good connections
        const waitTime = 500;
        console.log(`Retrying profile load in ${waitTime}ms...`);
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
    const maxRetries = 1; // Reduced from 2 for faster failure on good connections
    console.log(`Loading sea time summary (attempt ${retryCount + 1}/${maxRetries + 1})`);
    
    try {
      const data = await seaTimeApi.getReportSummary();
      console.log('Sea time summary loaded successfully');
      setSummary(data);
      setLoadingSummary(false);
    } catch (error: any) {
      console.error(`Failed to load sea time summary (attempt ${retryCount + 1}):`, error?.message);
      
      if (retryCount < maxRetries && (error?.message?.includes('Network') || error?.message?.includes('fetch'))) {
        // Reduced wait time from exponential backoff to fixed 500ms for instant retry on good connections
        const waitTime = 500;
        console.log(`Retrying summary load in ${waitTime}ms...`);
        setTimeout(() => loadSummary(retryCount + 1), waitTime);
      } else {
        setLoadingSummary(false);
        console.warn('Summary load failed after retries, continuing without summary');
      }
    }
  }, []);

  const loadVessels = useCallback(async (retryCount = 0) => {
    const maxRetries = 1; // Reduced from 2 for faster failure on good connections
    console.log(`Loading vessels (attempt ${retryCount + 1}/${maxRetries + 1})`);
    
    try {
      const data = await seaTimeApi.getVessels();
      console.log('Vessels loaded successfully:', data?.length);
      setVessels(data);
    } catch (error: any) {
      console.error(`Failed to load vessels (attempt ${retryCount + 1}):`, error?.message);
      
      if (retryCount < maxRetries && (error?.message?.includes('Network') || error?.message?.includes('fetch'))) {
        // Reduced wait time from exponential backoff to fixed 500ms for instant retry on good connections
        const waitTime = 500;
        console.log(`Retrying vessels load in ${waitTime}ms...`);
        setTimeout(() => loadVessels(retryCount + 1), waitTime);
      } else {
        console.warn('Vessels load failed after retries, continuing without vessels');
      }
    }
  }, []);

  useEffect(() => {
    console.log('ProfileScreen (iOS): Initial mount, loading data in parallel');
    // Load all data in parallel for instant access
    Promise.all([
      loadProfile(),
      loadSummary(),
      loadVessels(),
    ]).catch(error => {
      console.error('Failed to load profile data:', error);
    });
  }, [loadProfile, loadSummary, loadVessels]);

  useEffect(() => {
    if (refreshTrigger > 0) {
      console.log('ProfileScreen (iOS): Global refresh triggered, reloading profile data in parallel');
      // Load all data in parallel for instant access
      Promise.all([
        loadProfile(),
        loadSummary(),
        loadVessels(),
      ]).catch(error => {
        console.error('Failed to refresh profile data:', error);
      });
    }
  }, [refreshTrigger, loadProfile, loadSummary, loadVessels]);

  const handleEditProfile = () => {
    console.log('User tapped Edit Profile');
    router.push('/user-profile');
  };

  const handleScheduledTasks = () => {
    console.log('User tapped Scheduled Tasks');
    router.push('/scheduled-tasks');
  };

  const handleSupport = async () => {
    console.log('User tapped Support button');
    const supportEmail = 'info@forelandmarine.com';
    const subject = 'SeaTime Tracker Support Request';
    const body = 'Hello,\n\nI need assistance with:\n\n';
    
    const mailtoUrl = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
        console.log('Support email opened successfully');
      } else {
        console.log('Cannot open email client, showing fallback alert');
        Alert.alert(
          'Contact Support',
          `Please email us at:\n${supportEmail}`,
          [
            { text: 'OK' }
          ]
        );
      }
    } catch (error) {
      console.error('Failed to open email client:', error);
      Alert.alert(
        'Contact Support',
        `Please email us at:\n${supportEmail}`,
        [
          { text: 'OK' }
        ]
      );
    }
  };

  const handleVesselPress = (vesselName: string) => {
    console.log('User tapped vessel:', vesselName);
    const vessel = vessels.find((v) => v.vessel_name === vesselName);
    if (vessel) {
      setSelectedVessel(vessel);
      setShowVesselModal(true);
    }
  };

  const handleCloseModal = () => {
    console.log('User closed vessel modal');
    setShowVesselModal(false);
    setSelectedVessel(null);
  };

  const handleRefresh = async () => {
    console.log('User pulled to refresh profile');
    setRefreshing(true);
    try {
      await Promise.all([
        loadProfile(0),
        loadSummary(0),
        loadVessels(0),
      ]);
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setRefreshing(false);
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

  const getAllServiceTypesWithHours = () => {
    const serviceTypeMap: { [key: string]: number } = {};
    
    ALL_SERVICE_TYPES.forEach((type) => {
      serviceTypeMap[type] = 0;
    });
    
    if (summary?.entries_by_service_type) {
      summary.entries_by_service_type.forEach((entry) => {
        serviceTypeMap[entry.service_type] = entry.total_hours;
      });
    }
    
    return ALL_SERVICE_TYPES.map((type) => ({
      service_type: type,
      total_hours: serviceTypeMap[type],
    }));
  };

  const handleDownloadPDF = async () => {
    console.log('User tapped Download PDF Report');
    setDownloadingPDF(true);
    try {
      const pdfBlob = await seaTimeApi.downloadPDFReport();
      console.log('PDF report downloaded, blob size:', pdfBlob.size);

      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `SeaTime_Report_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        Alert.alert('Success', 'PDF report downloaded successfully');
      } else {
        const fileUri = `${FileSystem.documentDirectory}SeaTime_Report_${new Date().toISOString().split('T')[0]}.pdf`;
        
        const reader = new FileReader();
        reader.readAsDataURL(pdfBlob);
        reader.onloadend = async () => {
          const base64data = reader.result as string;
          const base64 = base64data.split(',')[1];
          
          await FileSystem.writeAsStringAsync(fileUri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          
          console.log('PDF saved to:', fileUri);
          
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri);
          } else {
            Alert.alert('Success', 'PDF report saved to device');
          }
        };
      }
    } catch (error) {
      console.error('Failed to download PDF report:', error);
      Alert.alert('Error', 'Failed to download PDF report. Please try again.');
    } finally {
      setDownloadingPDF(false);
    }
  };

  const handleDownloadCSV = async () => {
    console.log('User tapped Download CSV Report');
    setDownloadingCSV(true);
    try {
      const csvData = await seaTimeApi.downloadCSVReport();
      console.log('CSV report downloaded, size:', csvData.length);

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
        Alert.alert('Success', 'CSV report downloaded successfully');
      } else {
        const fileUri = `${FileSystem.documentDirectory}SeaTime_Report_${new Date().toISOString().split('T')[0]}.csv`;
        
        await FileSystem.writeAsStringAsync(fileUri, csvData, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        
        console.log('CSV saved to:', fileUri);
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri);
        } else {
          Alert.alert('Success', 'CSV report saved to device');
        }
      }
    } catch (error) {
      console.error('Failed to download CSV report:', error);
      Alert.alert('Error', 'Failed to download CSV report. Please try again.');
    } finally {
      setDownloadingCSV(false);
    }
  };

  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = () => {
    console.log('User tapped Sign Out button');
    setShowSignOutModal(true);
  };

  const confirmSignOut = async () => {
    console.log('User confirmed sign out in modal');
    setSigningOut(true);
    try {
      await signOut();
      console.log('Sign out successful');
      setShowSignOutModal(false);
    } catch (error) {
      console.error('Sign out error:', error);
      setShowSignOutModal(false);
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  const cancelSignOut = () => {
    console.log('User cancelled sign out');
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
  const totalDays = summary ? Math.floor(summary.total_hours / 24) : 0;

  const userDepartment = profile?.department?.toLowerCase();
  const filteredDefinitions = SEA_DAY_DEFINITIONS.filter(
    (def) => def.department === 'both' || def.department === userDepartment
  );

  const allServiceTypes = getAllServiceTypesWithHours();

  console.log('Profile image URL:', imageUrl);
  console.log('User department:', userDepartment, '- Showing', filteredDefinitions.length, 'definitions');

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
              Profile
            </Text>
            <Text style={styles.headerSubtitle}>Your Sea Time Profile & Reports</Text>
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
            colors={[colors.primary]}
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
                <Text style={styles.departmentBadgeText}>
                  {profile.department.toLowerCase() === 'deck' ? '⚓ Deck Department' : '⚙️ Engineering Department'}
                </Text>
              </View>
            )}
          </View>

          {!loadingSummary && summary && summary.entries_by_vessel.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Download Reports</Text>
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
                      <Text style={styles.reportButtonText}>Download PDF Report</Text>
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
                      <Text style={styles.reportButtonText}>Download CSV Report</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sea Time Summary</Text>
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
                        <Text style={styles.summaryLabel}>Total Days</Text>
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
              <Text style={styles.sectionTitle}>Sea Time by Vessel</Text>
              <View style={styles.card}>
                {summary.entries_by_vessel.map((vessel, index) => {
                  const vesselDays = Math.floor(vessel.total_hours / 24);
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
              <Text style={styles.sectionTitle}>Sea Time by Service Type</Text>
              <View style={styles.card}>
                {allServiceTypes.map((serviceEntry, index) => {
                  const serviceDays = Math.floor(serviceEntry.total_hours / 24);
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

          {profile.department && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {profile.department.toLowerCase() === 'deck' ? 'Deck Department - Sea Service Definitions (MSN 1858)' : 'Engineering Department - Sea Service Definitions (MSN 1904)'}
              </Text>
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  These definitions ensure your sea time records are compliant with MCA regulations for {profile.department.toLowerCase() === 'deck' ? 'Deck' : 'Engineering'} officers. All data capture in this app follows these standards.
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
                <Text style={styles.menuItemText}>Edit Profile</Text>
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

              <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/notification-settings')}>
                <IconSymbol
                  ios_icon_name="bell"
                  android_material_icon_name="notifications"
                  size={24}
                  color={colors.primary}
                  style={styles.menuItemIcon}
                />
                <Text style={styles.menuItemText}>Notification Settings</Text>
                                <UpgradeButton variant="banner" />
                
<IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="arrow-forward"
                  size={20}
                  color={colors.textSecondary}
                  style={styles.menuItemChevron}
                />
              </TouchableOpacity>

              <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={() => router.push('/admin-menu')}>
                <IconSymbol
                  ios_icon_name="wrench"
                  android_material_icon_name="settings"
                  size={24}
                  color={colors.primary}
                  style={styles.menuItemIcon}
                />
                <Text style={styles.menuItemText}>Admin Tools</Text>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="arrow-forward"
                  size={20}
                  color={isDark ? colors.textSecondaryDark : colors.textSecondaryLight}
                  style={styles.menuItemChevron}
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutButtonText}>Sign Out</Text>
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
            <Text style={styles.confirmModalTitle}>Sign Out</Text>
            <Text style={styles.confirmModalMessage}>
              Are you sure you want to sign out?
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity
                style={[styles.confirmModalButton, styles.confirmModalCancelButton]}
                onPress={cancelSignOut}
                disabled={signingOut}
              >
                <Text style={[styles.confirmModalButtonText, styles.confirmModalCancelText]}>
                  Cancel
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
                    Sign Out
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
