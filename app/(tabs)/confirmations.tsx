
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import * as seaTimeApi from '@/utils/seaTimeApi';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  useColorScheme,
  RefreshControl,
  Platform,
  Image,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { scheduleSeaTimeNotification } from '@/utils/notifications';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

interface Vessel {
  id: string;
  mmsi: string;
  vessel_name: string;
  is_active: boolean;
  created_at: string;
}

interface SeaTimeEntry {
  id: string;
  vessel: Vessel | null;
  start_time: string;
  end_time: string | null;
  duration_hours: number | string | null;
  status: 'pending' | 'confirmed' | 'rejected';
  notes: string | null;
  created_at: string;
  start_latitude?: number | string | null;
  start_longitude?: number | string | null;
  end_latitude?: number | string | null;
  end_longitude?: number | string | null;
  service_type?: string | null;
  mca_compliant?: boolean | null;
  detection_window_hours?: number | string | null;
}

type ServiceType = 'actual_sea_service' | 'watchkeeping_service';

export default function ConfirmationsScreen() {
  const [entries, setEntries] = useState<SeaTimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [showServiceTypeModal, setShowServiceTypeModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<SeaTimeEntry | null>(null);
  const [selectedServiceType, setSelectedServiceType] = useState<ServiceType>('actual_sea_service');
  const [processingEntryId, setProcessingEntryId] = useState<string | null>(null);
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const notifiedEntriesRef = useRef<Set<string>>(new Set());
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // CRITICAL: Defensive auth context access
  const authContext = useAuth();
  const triggerRefresh = authContext?.triggerRefresh || (() => {
    console.warn('[Confirmations] triggerRefresh not available');
  });

  const toNumber = (value: number | string | null | undefined): number => {
    // CRITICAL: Safe number conversion to prevent NaN crashes
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') {
      // Check for NaN and Infinity
      if (isNaN(value) || !isFinite(value)) return 0;
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (isNaN(parsed) || !isFinite(parsed)) return 0;
      return parsed;
    }
    return 0;
  };

  const loadData = useCallback(async () => {
    try {
      console.log('[Confirmations] Loading pending entries');
      const pendingEntries = await seaTimeApi.getPendingEntries();
      
      console.log('[Confirmations] Loaded', pendingEntries.length, 'pending entries from backend');
      
      // CRITICAL: Validate entries array before setting state
      if (!Array.isArray(pendingEntries)) {
        console.error('[Confirmations] Invalid entries data received:', pendingEntries);
        setEntries([]);
        return;
      }
      
      // Show ALL pending entries returned by the backend
      // The backend determines what should be pending, not the frontend
      setEntries(pendingEntries);
    } catch (error: any) {
      console.error('[Confirmations] Failed to load data:', error);
      // CRITICAL: Don't crash on error - set empty array
      setEntries([]);
      Alert.alert('Error', 'Failed to load data: ' + (error?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, []);

  const checkForNewEntries = useCallback(async () => {
    if (Platform.OS === 'web') {
      console.log('[Confirmations] Skipping notification check on web');
      return;
    }

    try {
      console.log('[Confirmations] Checking for new entries to notify');
      const result = await seaTimeApi.getNewSeaTimeEntries();
      
      // CRITICAL: Validate result structure
      if (!result || !Array.isArray(result.newEntries)) {
        console.warn('[Confirmations] Invalid new entries result:', result);
        return;
      }
      
      if (result.newEntries && result.newEntries.length > 0) {
        console.log('[Confirmations] Found', result.newEntries.length, 'new entries');
        
        const validEntries = result.newEntries.filter((entry: any) => {
          // CRITICAL: Safe property access
          try {
            const hasEndTime = entry?.end_time !== null && entry?.end_time !== undefined;
            const durationHours = typeof entry?.duration_hours === 'string' 
              ? parseFloat(entry.duration_hours) 
              : entry?.duration_hours || 0;
            const isMCACompliant = durationHours >= 4.0;
            
            // Only notify for MCA-compliant entries (4+ hours)
            return hasEndTime && isMCACompliant;
          } catch (e) {
            console.error('[Confirmations] Error filtering entry:', e);
            return false;
          }
        });
        
        console.log('[Confirmations] Filtered to', validEntries.length, 'valid MCA-compliant sea days (4+ hours with end time)');
        
        for (const entry of validEntries) {
          // CRITICAL: Validate entry has required properties
          if (!entry?.id || !entry?.vessel_name) {
            console.warn('[Confirmations] Skipping invalid entry:', entry);
            continue;
          }
          
          if (notifiedEntriesRef.current.has(entry.id)) {
            console.log('[Confirmations] Skipping already notified entry:', entry.id);
            continue;
          }

          const vesselName = entry.vessel_name || 'Unknown Vessel';
          const durationHours = typeof entry.duration_hours === 'string' 
            ? parseFloat(entry.duration_hours) 
            : entry.duration_hours || 0;

          console.log('[Confirmations] Scheduling "Sea day detected" notification for entry:', {
            id: entry.id,
            vesselName,
            durationHours,
            mcaCompliant: true,
          });

          try {
            await scheduleSeaTimeNotification(vesselName, entry.id, durationHours, true);
            notifiedEntriesRef.current.add(entry.id);
          } catch (notifError) {
            console.error('[Confirmations] Failed to schedule notification:', notifError);
            // Continue with other entries
          }
        }

        if (validEntries.length > 0) {
          await loadData();
        }
      } else {
        console.log('[Confirmations] No new entries to notify');
      }
    } catch (error) {
      console.error('[Confirmations] Failed to check for new entries:', error);
      // Don't crash - just log the error
    }
  }, [loadData]);

  useEffect(() => {
    console.log('[Confirmations] Component mounted, loading data');
    
    // CRITICAL: Wrap in try-catch
    try {
      loadData();
    } catch (error) {
      console.error('[Confirmations] Error in initial load:', error);
      setLoading(false);
    }

    if (Platform.OS !== 'web') {
      console.log('[Confirmations] Setting up notification polling - will only notify for 4+ hour sea days with end time');
      pollIntervalRef.current = setInterval(checkForNewEntries, 30000);
    } else {
      console.log('[Confirmations] Skipping notification polling on web');
    }

    return () => {
      console.log('[Confirmations] Component unmounting, cleaning up polling');
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [loadData, checkForNewEntries]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } catch (error) {
      console.error('[Confirmations] Refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleConfirmEntry = (entry: SeaTimeEntry) => {
    // CRITICAL: Validate entry before proceeding
    if (!entry || !entry.id) {
      console.error('[Confirmations] Invalid entry for confirmation:', entry);
      Alert.alert('Error', 'Invalid entry');
      return;
    }
    
    console.log('[Confirmations] User confirming entry:', entry.id);
    setSelectedEntry(entry);
    setSelectedServiceType('actual_sea_service');
    setShowServiceTypeModal(true);
  };

  const confirmWithServiceType = async () => {
    if (!selectedEntry || !selectedEntry.id) {
      console.error('[Confirmations] No entry selected for confirmation');
      return;
    }

    try {
      console.log('[Confirmations] Confirming entry with service type:', selectedServiceType);
      setProcessingEntryId(selectedEntry.id);
      await seaTimeApi.confirmSeaTimeEntry(selectedEntry.id, selectedServiceType);
      setShowServiceTypeModal(false);
      setSelectedEntry(null);
      setProcessingEntryId(null);
      await loadData();
      
      // Trigger global refresh to update profile screen's "Sea Time by Service Type" section
      console.log('[Confirmations] Triggering global refresh after confirming entry');
      triggerRefresh();
      
      Alert.alert('Success', 'Sea time entry confirmed');
    } catch (error: any) {
      console.error('[Confirmations] Failed to confirm entry:', error);
      setProcessingEntryId(null);
      Alert.alert('Error', 'Failed to confirm entry: ' + (error?.message || 'Unknown error'));
    }
  };

  const handleRejectEntry = async (entryId: string) => {
    console.log('[Confirmations] User tapped Reject button for entry:', entryId);
    
    // CRITICAL: Validate entryId to prevent crashes
    if (!entryId || typeof entryId !== 'string') {
      console.error('[Confirmations] Invalid entryId:', entryId);
      Alert.alert('Error', 'Invalid entry ID');
      return;
    }
    
    if (processingEntryId) {
      console.log('[Confirmations] Already processing an entry, ignoring tap');
      return;
    }

    Alert.alert(
      'Reject Entry',
      'Are you sure you want to reject this sea time entry?',
      [
        { 
          text: 'Cancel', 
          style: 'cancel',
          onPress: () => {
            console.log('[Confirmations] User cancelled rejection');
          }
        },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('[Confirmations] User confirmed rejection, calling API for entry:', entryId);
              setProcessingEntryId(entryId);
              
              await seaTimeApi.rejectSeaTimeEntry(entryId);
              
              console.log('[Confirmations] Entry rejected successfully');
              setProcessingEntryId(null);
              
              await loadData();
              
              Alert.alert('Success', 'Sea time entry rejected');
            } catch (error: any) {
              console.error('[Confirmations] Failed to reject entry:', error);
              console.error('[Confirmations] Error details:', {
                message: error?.message || 'Unknown error',
                stack: error?.stack || 'No stack trace',
                name: error?.name || 'Unknown error type'
              });
              setProcessingEntryId(null);
              // CRITICAL: Safe error message extraction
              const errorMessage = error?.message || 'An unexpected error occurred';
              Alert.alert('Error', 'Failed to reject entry: ' + errorMessage);
            }
          },
        },
      ]
    );
  };

  const toggleExpanded = (entryId: string) => {
    // CRITICAL: Validate entryId
    if (!entryId) {
      console.error('[Confirmations] Invalid entryId for toggle:', entryId);
      return;
    }
    
    console.log('[Confirmations] Toggling expanded state for entry:', entryId);
    setExpandedEntries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(entryId)) {
        newSet.delete(entryId);
      } else {
        newSet.add(entryId);
      }
      return newSet;
    });
  };

  const formatDate = (dateString: string): string => {
    try {
      if (!dateString) return 'N/A';
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch (e) {
      console.error('[Confirmations] Failed to format date:', e);
      return dateString || 'N/A';
    }
  };

  const formatTime = (dateString: string): string => {
    try {
      if (!dateString) return 'N/A';
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      console.error('[Confirmations] Failed to format time:', e);
      return dateString || 'N/A';
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'confirmed':
        return colors.success;
      case 'rejected':
        return colors.error;
      case 'pending':
        return colors.warning;
      default:
        return colors.textSecondary;
    }
  };

  const formatCoordinate = (value: number | string | null | undefined): string => {
    const num = toNumber(value);
    return num.toFixed(6);
  };

  const convertToDMS = (decimal: number, isLatitude: boolean): string => {
    // CRITICAL: Validate input
    if (typeof decimal !== 'number' || isNaN(decimal) || !isFinite(decimal)) {
      return 'Invalid';
    }
    
    try {
      const absolute = Math.abs(decimal);
      const degrees = Math.floor(absolute);
      const minutesDecimal = (absolute - degrees) * 60;
      const minutes = Math.floor(minutesDecimal);
      const seconds = ((minutesDecimal - minutes) * 60).toFixed(1);
      
      let direction = '';
      if (isLatitude) {
        direction = decimal >= 0 ? 'N' : 'S';
      } else {
        direction = decimal >= 0 ? 'E' : 'W';
      }
      
      return `${degrees}° ${minutes}' ${seconds}" ${direction}`;
    } catch (e) {
      console.error('[Confirmations] Error converting to DMS:', e);
      return 'Invalid';
    }
  };

  const formatCoordinateDMS = (
    lat: number | string | null | undefined,
    lon: number | string | null | undefined
  ): string => {
    const latNum = toNumber(lat);
    const lonNum = toNumber(lon);
    
    if (latNum === 0 && lonNum === 0) return 'No coordinates';
    
    return `${convertToDMS(latNum, true)}, ${convertToDMS(lonNum, false)}`;
  };

  const formatDuration = (hours: number | string | null | undefined): string => {
    const num = toNumber(hours);
    if (num === 0) return 'In progress';
    
    // If duration is >= 24 hours, express as days
    if (num >= 24) {
      const days = Math.floor(num / 24);
      const remainingHours = Math.round(num % 24);
      if (remainingHours === 0) {
        return `${days} ${days === 1 ? 'day' : 'days'}`;
      }
      return `${days} ${days === 1 ? 'day' : 'days'}, ${remainingHours}h`;
    }
    
    // If < 24 hours, express as hours
    const wholeHours = Math.floor(num);
    const minutes = Math.round((num - wholeHours) * 60);
    if (minutes === 0) return `${wholeHours}h`;
    return `${wholeHours}h ${minutes}m`;
  };

  const formatServiceType = (serviceType: string | null | undefined): string => {
    if (!serviceType) return 'Not specified';
    
    const typeMap: { [key: string]: string } = {
      'actual_sea_service': 'Actual Sea Service',
      'watchkeeping_service': 'Watchkeeping Service',
      'standby_service': 'Stand-by Service',
      'yard_service': 'Yard Service',
      'service_in_port': 'Service in Port',
    };
    
    return typeMap[serviceType] || serviceType;
  };

  const isMCACompliant = (entry: SeaTimeEntry): boolean => {
    // CRITICAL: Safe property access
    try {
      if (entry?.mca_compliant !== null && entry?.mca_compliant !== undefined) {
        return entry.mca_compliant;
      }
      
      const hours = toNumber(entry?.duration_hours);
      return hours >= 4.0;
    } catch (e) {
      console.error('[Confirmations] Error checking MCA compliance:', e);
      return false;
    }
  };

  const getMCAWarningText = (entry: SeaTimeEntry): string | null => {
    if (isMCACompliant(entry)) {
      return null;
    }
    
    return `This entry does not meet the MCA 4-hour requirement but has been flagged for review to avoid missing potential sea days.`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Image
              source={require('@/assets/images/c13cbd51-c2f7-489f-bbbb-6b28094d9b2b.png')}
              style={styles.appIcon}
              resizeMode="contain"
            />
            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle}>Review Sea Time</Text>
              <Text style={styles.headerSubtitle}>
                {entries.length} {entries.length === 1 ? 'entry' : 'entries'} pending confirmation
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          {entries.length === 0 ? (
            <View style={styles.emptyState}>
              <IconSymbol
                ios_icon_name="checkmark.circle"
                android_material_icon_name="check-circle"
                size={64}
                color={isDark ? colors.textSecondary : colors.textSecondaryLight}
              />
              <Text style={styles.emptyText}>All caught up!</Text>
              <Text style={styles.emptySubtext}>
                No pending sea time entries to review
              </Text>
            </View>
          ) : (
            entries.map((entry) => {
              // CRITICAL: Validate entry has required properties
              if (!entry || !entry.id) {
                console.warn('[Confirmations] Skipping invalid entry:', entry);
                return null;
              }
              
              const isExpanded = expandedEntries.has(entry.id);
              const isProcessing = processingEntryId === entry.id;
              const mcaCompliant = isMCACompliant(entry);
              const warningText = getMCAWarningText(entry);
              
              return (
                <View key={entry.id} style={styles.entryCard}>
                  {!mcaCompliant && (
                    <View style={styles.warningBanner}>
                      <IconSymbol
                        ios_icon_name="exclamationmark.triangle"
                        android_material_icon_name="warning"
                        size={20}
                        color={colors.warning}
                      />
                      <Text style={styles.warningBannerText}>
                        Does not meet MCA 4-hour requirement
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.entryHeader}
                    onPress={() => toggleExpanded(entry.id)}
                    disabled={isProcessing}
                  >
                    <View style={styles.entryHeaderLeft}>
                      <Text style={styles.vesselName}>
                        {entry.vessel?.vessel_name || 'Unknown Vessel'}
                      </Text>
                      <Text style={styles.entryDate}>
                        {formatDate(entry.start_time)} at {formatTime(entry.start_time)}
                      </Text>
                      <View style={styles.durationBadge}>
                        <Text style={styles.durationText}>
                          {formatDuration(entry.duration_hours)}
                        </Text>
                      </View>
                    </View>
                    <IconSymbol
                      ios_icon_name={isExpanded ? 'chevron.up' : 'chevron.down'}
                      android_material_icon_name={isExpanded ? 'expand-less' : 'expand-more'}
                      size={24}
                      color={isDark ? colors.textSecondary : colors.textSecondaryLight}
                    />
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.entryDetails}>
                      {warningText && (
                        <View style={styles.warningBox}>
                          <View style={styles.warningBoxHeader}>
                            <IconSymbol
                              ios_icon_name="info.circle"
                              android_material_icon_name="info"
                              size={20}
                              color={colors.warning}
                            />
                            <Text style={styles.warningBoxTitle}>Movement Detected</Text>
                          </View>
                          <Text style={styles.warningBoxText}>{warningText}</Text>
                        </View>
                      )}

                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Start:</Text>
                        <Text style={styles.detailValue}>
                          {formatDate(entry.start_time)} {formatTime(entry.start_time)}
                        </Text>
                      </View>
                      {entry.end_time && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>End:</Text>
                          <Text style={styles.detailValue}>
                            {formatDate(entry.end_time)} {formatTime(entry.end_time)}
                          </Text>
                        </View>
                      )}
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Duration:</Text>
                        <Text style={styles.detailValue}>
                          {formatDuration(entry.duration_hours)}
                        </Text>
                      </View>

                      {(entry.start_latitude || entry.start_longitude) && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Start Position:</Text>
                          <Text style={styles.detailValue}>
                            {formatCoordinateDMS(entry.start_latitude, entry.start_longitude)}
                          </Text>
                        </View>
                      )}
                      {(entry.end_latitude || entry.end_longitude) && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>End Position:</Text>
                          <Text style={styles.detailValue}>
                            {formatCoordinateDMS(entry.end_latitude, entry.end_longitude)}
                          </Text>
                        </View>
                      )}
                      {entry.notes && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Notes:</Text>
                          <Text style={styles.detailValue}>{entry.notes}</Text>
                        </View>
                      )}
                    </View>
                  )}

                  <View style={styles.entryActions}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.confirmButton, isProcessing && styles.disabledButton]}
                      onPress={() => handleConfirmEntry(entry)}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <IconSymbol
                            ios_icon_name="checkmark"
                            android_material_icon_name="check"
                            size={20}
                            color="#fff"
                          />
                          <Text style={styles.actionButtonText}>Confirm</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.rejectButton, isProcessing && styles.disabledButton]}
                      onPress={() => handleRejectEntry(entry.id)}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <IconSymbol
                            ios_icon_name="xmark"
                            android_material_icon_name="close"
                            size={20}
                            color="#fff"
                          />
                          <Text style={styles.actionButtonText}>Reject</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <Modal
        visible={showServiceTypeModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowServiceTypeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Service Type</Text>
            <Text style={styles.modalSubtitle}>
              Please specify the type of sea service for this entry
            </Text>

            <View style={styles.serviceTypeContainer}>
              <TouchableOpacity
                style={[
                  styles.serviceTypeButton,
                  selectedServiceType === 'actual_sea_service' && styles.serviceTypeButtonActive,
                ]}
                onPress={() => setSelectedServiceType('actual_sea_service')}
              >
                <Text
                  style={[
                    styles.serviceTypeText,
                    selectedServiceType === 'actual_sea_service' && styles.serviceTypeTextActive,
                  ]}
                >
                  Actual Sea Service
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.serviceTypeButton,
                  selectedServiceType === 'watchkeeping_service' && styles.serviceTypeButtonActive,
                ]}
                onPress={() => setSelectedServiceType('watchkeeping_service')}
              >
                <Text
                  style={[
                    styles.serviceTypeText,
                    selectedServiceType === 'watchkeeping_service' && styles.serviceTypeTextActive,
                  ]}
                >
                  Watchkeeping Service
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowServiceTypeModal(false);
                  setSelectedEntry(null);
                }}
              >
                <Text style={[styles.modalButtonText, styles.cancelButtonText]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={confirmWithServiceType}
              >
                <Text style={[styles.modalButtonText, styles.saveButtonText]}>Confirm</Text>
              </TouchableOpacity>
            </View>
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
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    scrollView: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
      gap: 12,
    },
    loadingText: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    header: {
      padding: 20,
      paddingTop: Platform.OS === 'android' ? 48 : 20,
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? colors.border : colors.borderLight,
    },
    headerContent: {
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
    emptyState: {
      alignItems: 'center',
      padding: 40,
      marginTop: 60,
    },
    emptyText: {
      fontSize: 20,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginTop: 16,
    },
    emptySubtext: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 8,
      textAlign: 'center',
    },
    entryCard: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      overflow: 'hidden',
    },
    warningBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.warning + '20',
      paddingVertical: 8,
      paddingHorizontal: 16,
      gap: 8,
    },
    warningBannerText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.warning,
      flex: 1,
    },
    entryHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
    },
    entryHeaderLeft: {
      flex: 1,
    },
    vesselName: {
      fontSize: 18,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 4,
    },
    entryDate: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 8,
    },
    durationBadge: {
      backgroundColor: colors.primary + '20',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      alignSelf: 'flex-start',
    },
    durationText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
    entryDetails: {
      paddingHorizontal: 16,
      paddingBottom: 16,
      borderTopWidth: 1,
      borderTopColor: isDark ? colors.border : colors.borderLight,
    },
    warningBox: {
      backgroundColor: colors.warning + '15',
      borderLeftWidth: 3,
      borderLeftColor: colors.warning,
      padding: 12,
      borderRadius: 8,
      marginTop: 12,
      marginBottom: 12,
    },
    warningBoxHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    warningBoxTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.warning,
    },
    warningBoxText: {
      fontSize: 13,
      color: isDark ? colors.text : colors.textLight,
      lineHeight: 18,
    },
    detailRow: {
      flexDirection: 'row',
      marginTop: 12,
    },
    detailLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      width: 140,
    },
    detailValue: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      flex: 1,
    },
    entryActions: {
      flexDirection: 'row',
      gap: 12,
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: isDark ? colors.border : colors.borderLight,
    },
    actionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12,
      borderRadius: 8,
      gap: 8,
    },
    confirmButton: {
      backgroundColor: colors.success,
    },
    rejectButton: {
      backgroundColor: colors.error,
    },
    disabledButton: {
      opacity: 0.6,
    },
    actionButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 20,
      padding: 24,
      width: '90%',
      maxWidth: 400,
    },
    modalTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    modalSubtitle: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 20,
    },
    serviceTypeContainer: {
      gap: 12,
      marginBottom: 24,
    },
    serviceTypeButton: {
      paddingVertical: 16,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
      alignItems: 'center',
    },
    serviceTypeButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    serviceTypeText: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    serviceTypeTextActive: {
      color: '#FFFFFF',
    },
    modalButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    modalButton: {
      flex: 1,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
    },
    cancelButton: {
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
    },
    saveButton: {
      backgroundColor: colors.primary,
    },
    modalButtonText: {
      fontSize: 16,
      fontWeight: '600',
    },
    cancelButtonText: {
      color: isDark ? colors.text : colors.textLight,
    },
    saveButtonText: {
      color: '#FFFFFF',
    },
  });
}
