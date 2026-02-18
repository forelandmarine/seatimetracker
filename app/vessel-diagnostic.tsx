
import React, { useState, useEffect, useCallback } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  useColorScheme,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { API_BASE_URL, getApiHeaders } from '@/utils/seaTimeApi';

interface DiagnosticData {
  vessel: {
    id: string;
    mmsi: string;
    vessel_name: string;
    is_active: boolean;
    user_id: string | null;
  };
  scheduled_task: {
    id: string;
    is_active: boolean;
    last_run: string | null;
    next_run: string;
    interval_hours: string;
  } | null;
  ais_checks_last_24h: {
    check_time: string;
    is_moving: boolean;
    speed_knots: number | null;
    latitude: number | null;
    longitude: number | null;
  }[];
  sea_time_entries: {
    id: string;
    start_time: string;
    end_time: string | null;
    status: string;
    duration_hours: number | null;
  }[];
}

async function getAuthToken(): Promise<string | null> {
  try {
    const { getItem } = await import('@react-native-async-storage/async-storage');
    return await getItem('auth_token');
  } catch {
    return null;
  }
}

export default function VesselDiagnosticScreen() {
  const { mmsi } = useLocalSearchParams<{ mmsi: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<DiagnosticData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forcingCheck, setForcingCheck] = useState(false);
  const [amalgamating, setAmalgamating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalType, setModalType] = useState<'success' | 'error'>('success');

  const showModalMessage = (title: string, message: string, type: 'success' | 'error' = 'success') => {
    setModalTitle(title);
    setModalMessage(message);
    setModalType(type);
    setShowModal(true);
  };

  const loadDiagnostics = useCallback(async () => {
    console.log('[VesselDiagnostic] Loading diagnostics for MMSI:', mmsi);
    
    try {
      const headers = await getApiHeaders();
      const response = await fetch(`${API_BASE_URL}/api/admin/vessel-status/${mmsi}`, {
        headers,
      });

      console.log('[VesselDiagnostic] Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const diagnosticData = await response.json();
      console.log('[VesselDiagnostic] Diagnostic data:', JSON.stringify(diagnosticData, null, 2));
      setData(diagnosticData);
      setError(null);
    } catch (err) {
      console.error('[VesselDiagnostic] Error loading diagnostics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load diagnostics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mmsi]);

  useEffect(() => {
    loadDiagnostics();
  }, [loadDiagnostics]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadDiagnostics();
  };

  const handleForceCheck = async () => {
    if (!data?.vessel?.id) return;

    console.log('[VesselDiagnostic] Forcing AIS check for vessel:', data.vessel.id);
    setForcingCheck(true);

    try {
      const headers = await getApiHeaders();
      const response = await fetch(`${API_BASE_URL}/api/ais/check/${data.vessel.id}?forceRefresh=true`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });

      console.log('[VesselDiagnostic] Force check response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('[VesselDiagnostic] Force check result:', result);

      const message = `Position recorded:\nLat: ${result.latitude?.toFixed(5) || 'N/A'}\nLon: ${result.longitude?.toFixed(5) || 'N/A'}\nSpeed: ${result.speed_knots || 0} knots\nMoving: ${result.is_moving ? 'Yes' : 'No'}`;
      showModalMessage('AIS Check Complete', message, 'success');
      
      // Reload diagnostics after modal is closed
      setTimeout(() => loadDiagnostics(), 500);
    } catch (err) {
      console.error('[VesselDiagnostic] Error forcing check:', err);
      showModalMessage('Error', err instanceof Error ? err.message : 'Failed to force AIS check', 'error');
    } finally {
      setForcingCheck(false);
    }
  };

  const handleAmalgamate = async () => {
    if (!data?.vessel?.mmsi || !data?.vessel?.user_id) return;

    console.log('[VesselDiagnostic] Amalgamating sea time for MMSI:', data.vessel.mmsi);
    setAmalgamating(true);

    try {
      const headers = await getApiHeaders();
      const response = await fetch(`${API_BASE_URL}/api/admin/amalgamate-sea-time`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mmsi: data.vessel.mmsi,
          date: '26 Jan 2026',
        }),
      });

      console.log('[VesselDiagnostic] Amalgamate response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('[VesselDiagnostic] Amalgamate result:', result);

      const durationText = result.duration_hours ? `${result.duration_hours.toFixed(1)} hours` : 'N/A';
      const message = `Sea time entry amalgamated successfully!\n\nStart: ${formatDateTime(result.start_time)}\nEnd: ${formatDateTime(result.end_time)}\nDuration: ${durationText}\n\nThe entry is now ready for review in the Confirmations tab.`;
      showModalMessage('Amalgamation Complete', message, 'success');
      
      // Reload diagnostics after modal is closed
      setTimeout(() => loadDiagnostics(), 500);
    } catch (err) {
      console.error('[VesselDiagnostic] Error amalgamating:', err);
      showModalMessage('Error', err instanceof Error ? err.message : 'Failed to amalgamate sea time', 'error');
    } finally {
      setAmalgamating(false);
    }
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatTimeAgo = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: 'Vessel Diagnostics',
            headerShown: true,
            headerBackTitle: 'Back',
          }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading diagnostics...</Text>
        </View>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: 'Vessel Diagnostics',
            headerShown: true,
            headerBackTitle: 'Back',
          }}
        />
        <View style={styles.errorContainer}>
          <IconSymbol
            ios_icon_name="exclamationmark.triangle"
            android_material_icon_name="warning"
            size={48}
            color={colors.error}
          />
          <Text style={styles.errorTitle}>Error Loading Diagnostics</Text>
          <Text style={styles.errorText}>{error || 'Unknown error'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadDiagnostics}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const lastCheckText = formatTimeAgo(data.scheduled_task?.last_run || null);
  const nextCheckText = formatTimeAgo(data.scheduled_task?.next_run || null);
  const checksCount = data.ais_checks_last_24h.length;
  const entriesCount = data.sea_time_entries.length;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Vessel Diagnostics',
          headerShown: true,
          headerBackTitle: 'Back',
        }}
      />
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {/* Vessel Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vessel Information</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name:</Text>
            <Text style={styles.infoValue}>{data.vessel.vessel_name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>MMSI:</Text>
            <Text style={styles.infoValue}>{data.vessel.mmsi}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status:</Text>
            <View style={[styles.statusBadge, data.vessel.is_active ? styles.statusActive : styles.statusInactive]}>
              <Text style={styles.statusText}>{data.vessel.is_active ? 'Active' : 'Inactive'}</Text>
            </View>
          </View>
        </View>

        {/* Scheduled Task Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scheduled Task</Text>
          {data.scheduled_task ? (
            <>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Task Status:</Text>
                <View style={[styles.statusBadge, data.scheduled_task.is_active ? styles.statusActive : styles.statusInactive]}>
                  <Text style={styles.statusText}>{data.scheduled_task.is_active ? 'Active' : 'Inactive'}</Text>
                </View>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Interval:</Text>
                <Text style={styles.infoValue}>{data.scheduled_task.interval_hours} hours</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Last Run:</Text>
                <Text style={styles.infoValue}>{lastCheckText}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Next Run:</Text>
                <Text style={styles.infoValue}>{nextCheckText}</Text>
              </View>
            </>
          ) : (
            <Text style={styles.warningText}>⚠️ No scheduled task found</Text>
          )}
        </View>

        {/* AIS Checks */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AIS Checks (Last 24h)</Text>
          <Text style={styles.countText}>{checksCount} check{checksCount !== 1 ? 's' : ''} recorded</Text>
          {checksCount === 0 ? (
            <Text style={styles.warningText}>⚠️ No AIS checks found in the last 24 hours</Text>
          ) : (
            data.ais_checks_last_24h.slice(0, 5).map((check, index) => (
              <View key={index} style={styles.checkItem}>
                <Text style={styles.checkTime}>{formatDateTime(check.check_time)}</Text>
                <View style={styles.checkDetails}>
                  <Text style={styles.checkText}>
                    Moving: {check.is_moving ? 'Yes' : 'No'} | Speed: {check.speed_knots?.toFixed(1) || 'N/A'} kts
                  </Text>
                  <Text style={styles.checkText}>
                    Position: {check.latitude?.toFixed(5) || 'N/A'}, {check.longitude?.toFixed(5) || 'N/A'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Sea Time Entries */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sea Time Entries</Text>
          <Text style={styles.countText}>{entriesCount} entr{entriesCount !== 1 ? 'ies' : 'y'}</Text>
          {entriesCount === 0 ? (
            <Text style={styles.infoText}>No sea time entries created yet</Text>
          ) : (
            data.sea_time_entries.slice(0, 5).map((entry) => (
              <View key={entry.id} style={styles.entryItem}>
                <Text style={styles.entryTime}>{formatDateTime(entry.start_time)}</Text>
                <View style={styles.entryDetails}>
                  <Text style={styles.entryText}>Status: {entry.status}</Text>
                  <Text style={styles.entryText}>Duration: {entry.duration_hours?.toFixed(1) || 'N/A'} hours</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Force Check Button */}
        <TouchableOpacity
          style={[styles.forceButton, forcingCheck && styles.forceButtonDisabled]}
          onPress={handleForceCheck}
          disabled={forcingCheck}
        >
          {forcingCheck ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <IconSymbol
                ios_icon_name="arrow.clockwise"
                android_material_icon_name="refresh"
                size={20}
                color="#fff"
              />
              <Text style={styles.forceButtonText}>Force AIS Check Now</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Amalgamate Button */}
        <TouchableOpacity
          style={[styles.amalgamateButton, amalgamating && styles.forceButtonDisabled]}
          onPress={handleAmalgamate}
          disabled={amalgamating}
        >
          {amalgamating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <IconSymbol
                ios_icon_name="arrow.merge"
                android_material_icon_name="merge"
                size={20}
                color="#fff"
              />
              <Text style={styles.forceButtonText}>Amalgamate Sea Time (26 Jan 2026)</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Modal for messages - replaces Alert.alert for web compatibility */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { backgroundColor: isDark ? colors.cardDark : colors.cardLight }]}>
            <Text style={[styles.modalTitle, { color: isDark ? colors.textDark : colors.textLight }]}>
              {modalTitle}
            </Text>
            <Text style={[styles.modalMessage, { color: isDark ? colors.textDark : colors.textLight }]}>
              {modalMessage}
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: modalType === 'error' ? colors.error : colors.primary }]}
              onPress={() => setShowModal(false)}
            >
              <Text style={styles.modalButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.backgroundDark : colors.backgroundLight,
    },
    scrollView: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: isDark ? colors.textDark : colors.textLight,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    errorTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.error,
      marginTop: 16,
      marginBottom: 8,
    },
    errorText: {
      fontSize: 14,
      color: isDark ? colors.textDark : colors.textLight,
      textAlign: 'center',
      marginBottom: 24,
    },
    retryButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    retryButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    section: {
      backgroundColor: isDark ? colors.cardDark : colors.cardLight,
      margin: 16,
      padding: 16,
      borderRadius: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: isDark ? colors.textDark : colors.textLight,
      marginBottom: 12,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    infoLabel: {
      fontSize: 14,
      color: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
    },
    infoValue: {
      fontSize: 14,
      fontWeight: '500',
      color: isDark ? colors.textDark : colors.textLight,
    },
    statusBadge: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    statusActive: {
      backgroundColor: colors.success + '20',
    },
    statusInactive: {
      backgroundColor: colors.error + '20',
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? colors.textDark : colors.textLight,
    },
    warningText: {
      fontSize: 14,
      color: colors.warning,
      fontStyle: 'italic',
    },
    infoText: {
      fontSize: 14,
      color: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
      fontStyle: 'italic',
    },
    countText: {
      fontSize: 14,
      color: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
      marginBottom: 12,
    },
    checkItem: {
      marginBottom: 12,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? colors.borderDark : colors.borderLight,
    },
    checkTime: {
      fontSize: 12,
      color: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
      marginBottom: 4,
    },
    checkDetails: {
      marginTop: 4,
    },
    checkText: {
      fontSize: 13,
      color: isDark ? colors.textDark : colors.textLight,
    },
    entryItem: {
      marginBottom: 12,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? colors.borderDark : colors.borderLight,
    },
    entryTime: {
      fontSize: 12,
      color: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
      marginBottom: 4,
    },
    entryDetails: {
      marginTop: 4,
    },
    entryText: {
      fontSize: 13,
      color: isDark ? colors.textDark : colors.textLight,
    },
    forceButton: {
      backgroundColor: colors.primary,
      margin: 16,
      padding: 16,
      borderRadius: 12,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
    },
    amalgamateButton: {
      backgroundColor: colors.success,
      marginHorizontal: 16,
      marginBottom: 16,
      padding: 16,
      borderRadius: 12,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
    },
    forceButtonDisabled: {
      opacity: 0.6,
    },
    forceButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    bottomSpacer: {
      height: 32,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      borderRadius: 12,
      padding: 24,
      width: '100%',
      maxWidth: 400,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 5,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '600',
      marginBottom: 12,
      textAlign: 'center',
    },
    modalMessage: {
      fontSize: 16,
      marginBottom: 20,
      textAlign: 'center',
      lineHeight: 22,
    },
    modalButton: {
      borderRadius: 8,
      padding: 12,
      alignItems: 'center',
    },
    modalButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
