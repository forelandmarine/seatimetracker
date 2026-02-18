
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  useColorScheme,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import * as seaTimeApi from '@/utils/seaTimeApi';
import { IconSymbol } from '@/components/IconSymbol';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useSubscriptionEnforcement } from '@/hooks/useSubscriptionEnforcement';

interface UserProfile {
  id: string;
  name: string;
  email: string;
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
    title: 'Actual Day at Sea',
    description: 'Main propulsion machinery runs ≥4 hours within the same calendar day, OR vessel is powered by wind (sail yachts only)',
    department: 'both',
  },
  {
    title: 'Watchkeeping Service (Deck)',
    description: 'Bridge watch while vessel is underway. Every 4 hours of watchkeeping = 1 watchkeeping day. Requires OOW 3000 Certificate.',
    department: 'deck',
  },
  {
    title: 'Watchkeeping Service (Engineering)',
    description: 'Engine room watch while vessel is underway. Every 4 hours = 1 watchkeeping day. Accumulative across multiple days.',
    department: 'engineering',
  },
  {
    title: 'Additional Watchkeeping (Engineering)',
    description: 'Engine room watchkeeping while vessel is at anchor or moored. Generators must be running with safe watchkeeping maintained.',
    department: 'engineering',
  },
  {
    title: 'Yard Service',
    description: 'Standing by a vessel during build, refit, or serious repair. Maximum 90 days per OOW 3000 application. Routine maintenance does NOT qualify.',
    department: 'both',
  },
  {
    title: 'Anchor Time',
    description: 'Generally excluded. Included ONLY if: part of active 24-hour passage, operational necessity (berth wait, canal transit, weather), anchor duration ≤ previous voyage segment, not final end of passage.',
    department: 'both',
  },
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
    content: {
      padding: 20,
      paddingTop: Platform.OS === 'android' ? 48 : 20,
      paddingBottom: Platform.OS === 'web' ? 100 : 40,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 12,
    },
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
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
      paddingVertical: 14,
      backgroundColor: colors.primary + '15',
      borderRadius: 8,
      paddingHorizontal: 14,
      marginTop: 10,
    },
    totalLabel: {
      fontSize: 17,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
    },
    totalValue: {
      fontSize: 19,
      fontWeight: '700',
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
    departmentBadge: {
      backgroundColor: colors.primary + '20',
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 4,
      alignSelf: 'flex-start',
      marginTop: 6,
      marginBottom: 12,
    },
    departmentBadgeText: {
      fontSize: 11,
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
    vesselHours: {
      fontSize: 13,
      color: colors.primary,
    },
    reportButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 15,
      marginBottom: 10,
      minHeight: 50,
    },
    reportButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
      marginLeft: 10,
    },
    diagnosticButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 15,
      marginBottom: 10,
      borderWidth: 2,
      borderColor: colors.primary,
      minHeight: 50,
    },
    diagnosticButtonText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: '600',
      marginLeft: 10,
    },
    loadingText: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      textAlign: 'center',
      paddingVertical: 10,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
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
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      flex: 1,
    },
    closeButton: {
      padding: 4,
    },
    modalScrollView: {
      maxHeight: 400,
    },
    particularRow: {
      flexDirection: 'row',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    particularRowLast: {
      borderBottomWidth: 0,
    },
    particularLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      width: 120,
    },
    particularValue: {
      fontSize: 14,
      color: isDark ? colors.text : colors.textLight,
      flex: 1,
    },
  });

export default function ReportsScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [summary, setSummary] = useState<SeaTimeSummary | null>(null);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [downloadingCSV, setDownloadingCSV] = useState(false);
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);
  const [showVesselModal, setShowVesselModal] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const router = useRouter();
  const { handleSubscriptionError, requireSubscription } = useSubscriptionEnforcement();

  console.log('ReportsScreen rendered');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    console.log('Loading reports data');
    setLoading(true);
    setLoadingSummary(true);
    
    try {
      const [profileData, summaryData, vesselsData] = await Promise.all([
        seaTimeApi.getUserProfile(),
        seaTimeApi.getReportSummary(),
        seaTimeApi.getVessels(),
      ]);
      
      console.log('Reports data loaded successfully');
      setProfile(profileData);
      setSummary(summaryData);
      setVessels(vesselsData);
    } catch (error) {
      console.error('Failed to load reports data:', error);
      Alert.alert('Error', 'Failed to load reports data');
    } finally {
      setLoading(false);
      setLoadingSummary(false);
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

  const handleDownloadPDF = async () => {
    console.log('User tapped Download PDF Report');
    
    // Check subscription before downloading report
    if (!requireSubscription('PDF report generation')) {
      return;
    }
    
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
    } catch (error: any) {
      console.error('Failed to download PDF report:', error);
      
      // Check if it's a subscription error
      if (handleSubscriptionError(error)) {
        return;
      }
      
      Alert.alert('Error', 'Failed to download PDF report. Please try again.');
    } finally {
      setDownloadingPDF(false);
    }
  };

  const handleDownloadCSV = async () => {
    console.log('User tapped Download CSV Report');
    
    // Check subscription before downloading report
    if (!requireSubscription('CSV report generation')) {
      return;
    }
    
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
    } catch (error: any) {
      console.error('Failed to download CSV report:', error);
      
      // Check if it's a subscription error
      if (handleSubscriptionError(error)) {
        return;
      }
      
      Alert.alert('Error', 'Failed to download CSV report. Please try again.');
    } finally {
      setDownloadingCSV(false);
    }
  };

  const handleVesselDiagnostic = () => {
    console.log('User tapped Vessel Diagnostic button');
    router.push('/vessel-diagnostic');
  };

  const userDepartment = profile?.department?.toLowerCase();
  const filteredDefinitions = SEA_DAY_DEFINITIONS.filter(
    (def) => def.department === 'both' || def.department === userDepartment
  );

  const totalDays = summary ? Math.floor(summary.total_hours / 24) : 0;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Reports',
          headerShown: true,
          headerBackTitle: 'Back',
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={styles.content}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sea Time Summary</Text>
            <View style={styles.card}>
              {loadingSummary ? (
                <Text style={styles.loadingText}>Loading summary...</Text>
              ) : summary ? (
                <>
                  <View style={[styles.summaryRow, styles.summaryRowLast]}>
                    <Text style={styles.summaryLabel}>Total Days</Text>
                    <Text style={styles.summaryValue}>{totalDays}</Text>
                  </View>
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
                        <Text style={styles.vesselHours}>
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

          {!loadingSummary && summary && summary.entries_by_service_type && summary.entries_by_service_type.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Sea Time by Service Type</Text>
              <View style={styles.card}>
                {summary.entries_by_service_type.map((serviceEntry, index) => {
                  const serviceDays = Math.floor(serviceEntry.total_hours / 24);
                  const isLast = index === summary.entries_by_service_type!.length - 1;
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

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sea Day Definitions</Text>
            {profile?.department && (
              <View style={styles.departmentBadge}>
                <Text style={styles.departmentBadgeText}>
                  {profile.department === 'deck' ? '⚓ Deck Department' : '⚙️ Engineering Department'}
                </Text>
              </View>
            )}
            {filteredDefinitions.map((definition, index) => (
              <View key={index} style={styles.definitionCard}>
                <Text style={styles.definitionTitle}>{definition.title}</Text>
                <Text style={styles.definitionDescription}>{definition.description}</Text>
              </View>
            ))}
          </View>

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

              <TouchableOpacity
                style={styles.diagnosticButton}
                onPress={handleVesselDiagnostic}
              >
                <IconSymbol
                  ios_icon_name="stethoscope"
                  android_material_icon_name="settings"
                  size={24}
                  color={colors.primary}
                />
                <Text style={styles.diagnosticButtonText}>Vessel Diagnostic</Text>
              </TouchableOpacity>
            </View>
          </View>
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
    </View>
  );
}
