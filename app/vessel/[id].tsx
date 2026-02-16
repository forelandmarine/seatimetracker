
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import { IconSymbol } from '@/components/IconSymbol';
import * as Haptics from 'expo-haptics';
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
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import * as seaTimeApi from '@/utils/seaTimeApi';
import { useGlobalRefresh } from '@/hooks/useGlobalRefresh';
import { useSubscriptionEnforcement } from '@/hooks/useSubscriptionEnforcement';
import { SubscriptionPromptModal } from '@/components/SubscriptionPromptModal';

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
  engine_kilowatts?: number;
  engine_type?: string;
}

interface SeaTimeEntry {
  id: string;
  vessel: Vessel;
  start_time: string;
  end_time: string | null;
  duration_hours: number | null;
  status: 'pending' | 'confirmed' | 'rejected';
  notes: string | null;
  created_at: string;
  start_latitude?: number | null;
  start_longitude?: number | null;
  end_latitude?: number | null;
  end_longitude?: number | null;
  mca_compliant?: boolean | null;
}

interface AISData {
  name: string | null;
  mmsi: string | null;
  imo: string | null;
  speed_knots: number | null;
  latitude: number | null;
  longitude: number | null;
  course: number | null;
  heading: number | null;
  timestamp: string | null;
  status: string | null;
  destination: string | null;
  eta: string | null;
  callsign: string | null;
  ship_type: string | null;
  flag: string | null;
  is_moving: boolean;
}

export default function VesselDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const { requireSubscription, subscriptionPromptProps } = useSubscriptionEnforcement();

  const [vessel, setVessel] = useState<Vessel | null>(null);
  const [seaTimeEntries, setSeaTimeEntries] = useState<SeaTimeEntry[]>([]);
  const [aisData, setAisData] = useState<AISData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editedVesselName, setEditedVesselName] = useState('');
  const [editedFlag, setEditedFlag] = useState('');
  const [editedOfficialNumber, setEditedOfficialNumber] = useState('');
  const [editedVesselType, setEditedVesselType] = useState('');
  const [editedLengthMetres, setEditedLengthMetres] = useState('');
  const [editedGrossTonnes, setEditedGrossTonnes] = useState('');
  const [editedCallSign, setEditedCallSign] = useState('');
  const [editedEngineKilowatts, setEditedEngineKilowatts] = useState('');
  const [editedEngineType, setEditedEngineType] = useState('');
  const [checkingAIS, setCheckingAIS] = useState(false);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  const vesselId = Array.isArray(id) ? id[0] : id;

  const loadData = useCallback(async () => {
    if (!vesselId) return;

    try {
      console.log('[VesselDetail] Loading data for vessel:', vesselId);
      const [vesselsData, seaTimeData] = await Promise.all([
        seaTimeApi.getVessels(),
        seaTimeApi.getVesselSeaTime(vesselId),
      ]);

      const currentVessel = vesselsData.find((v: Vessel) => v.id === vesselId);
      if (currentVessel) {
        setVessel(currentVessel);
        
        // Only fetch AIS location if vessel is active
        if (currentVessel.is_active) {
          try {
            console.log('[VesselDetail] Fetching AIS location for active vessel');
            const aisLocation = await seaTimeApi.getVesselAISLocation(vesselId, true);
            console.log('[VesselDetail] AIS location data:', aisLocation);
            
            // Transform the response to match AISData interface
            const transformedAisData: AISData = {
              name: aisLocation.name || null,
              mmsi: aisLocation.mmsi || null,
              imo: aisLocation.imo || null,
              speed_knots: aisLocation.speed !== undefined ? aisLocation.speed : null,
              latitude: aisLocation.latitude !== undefined ? aisLocation.latitude : null,
              longitude: aisLocation.longitude !== undefined ? aisLocation.longitude : null,
              course: aisLocation.course !== undefined ? aisLocation.course : null,
              heading: aisLocation.heading !== undefined ? aisLocation.heading : null,
              timestamp: aisLocation.timestamp || null,
              status: aisLocation.status || null,
              destination: aisLocation.destination || null,
              eta: aisLocation.eta || null,
              callsign: aisLocation.callsign || null,
              ship_type: aisLocation.vessel_type || null,
              flag: aisLocation.flag || null,
              is_moving: (aisLocation.speed !== undefined && aisLocation.speed !== null && aisLocation.speed > 2) || false,
            };
            
            setAisData(transformedAisData);
            console.log('[VesselDetail] AIS data set successfully');
          } catch (aisError) {
            console.error('[VesselDetail] Failed to fetch AIS location:', aisError);
            // Don't fail the whole load if AIS fetch fails
          }
        }
      }

      setSeaTimeEntries(seaTimeData);
      console.log('[VesselDetail] Data loaded successfully');
    } catch (error: any) {
      console.error('[VesselDetail] Failed to load data:', error);
      Alert.alert('Error', 'Failed to load vessel data: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [vesselId]);

  // Use global refresh hook - but don't pass loadData to avoid infinite loop
  const { triggerRefresh } = useGlobalRefresh();

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleEditParticulars = () => {
    if (!vessel) return;
    setEditedVesselName(vessel.vessel_name);
    setEditedFlag(vessel.flag || '');
    setEditedOfficialNumber(vessel.official_number || '');
    setEditedVesselType(vessel.vessel_type || '');
    setEditedLengthMetres(vessel.length_metres?.toString() || '');
    setEditedGrossTonnes(vessel.gross_tonnes?.toString() || '');
    setEditedCallSign(vessel.callsign || '');
    setEditedEngineKilowatts(vessel.engine_kilowatts?.toString() || '');
    setEditedEngineType(vessel.engine_type || '');
    setEditModalVisible(true);
  };

  const handleSaveParticulars = async () => {
    if (!vessel) return;

    try {
      console.log('[VesselDetail] User action: Saving vessel particulars');
      await seaTimeApi.updateVesselParticulars(vessel.id, {
        vessel_name: editedVesselName.trim() || undefined,
        flag: editedFlag.trim() || undefined,
        official_number: editedOfficialNumber.trim() || undefined,
        type: editedVesselType || undefined,
        length_metres: editedLengthMetres ? parseFloat(editedLengthMetres) : undefined,
        gross_tonnes: editedGrossTonnes ? parseFloat(editedGrossTonnes) : undefined,
        callsign: editedCallSign.trim() || undefined,
        engine_kilowatts: editedEngineKilowatts ? parseFloat(editedEngineKilowatts) : undefined,
        engine_type: editedEngineType.trim() || undefined,
      });

      setEditModalVisible(false);
      await loadData();
      triggerRefresh(); // Trigger app-wide refresh
      Alert.alert('Success', 'Vessel particulars updated');
    } catch (error: any) {
      console.error('[VesselDetail] Failed to update vessel particulars:', error);
      Alert.alert('Error', 'Failed to update vessel particulars: ' + error.message);
    }
  };

  const handleActivateVessel = () => {
    if (!vessel) return;

    // Check subscription before showing confirmation
    if (!requireSubscription('vessel activation')) {
      return;
    }

    Alert.alert(
      'Activate Vessel',
      `Start tracking ${vessel.vessel_name}? This will deactivate any other active vessel.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate',
          onPress: confirmActivateVessel,
        },
      ]
    );
  };

  const confirmActivateVessel = async () => {
    if (!vessel) return;

    try {
      console.log('[VesselDetail] User action: Activating vessel');
      await seaTimeApi.activateVessel(vessel.id);
      await loadData();
      triggerRefresh(); // Trigger app-wide refresh
      Alert.alert('Success', `${vessel.vessel_name} is now being tracked`);
    } catch (error: any) {
      console.error('[VesselDetail] Failed to activate vessel:', error);
      Alert.alert('Error', 'Failed to activate vessel: ' + error.message);
    }
  };

  const cancelActivateVessel = () => {
    console.log('[VesselDetail] User cancelled vessel activation');
  };

  const handleCheckAIS = async () => {
    if (!vessel) return;

    try {
      setCheckingAIS(true);
      console.log('[VesselDetail] User action: Manual AIS check requested');
      
      // First trigger the AIS check (POST) with forceRefresh=true to bypass rate limiting
      await seaTimeApi.checkVesselAIS(vessel.id, true);
      
      // Then fetch the detailed AIS location data (GET)
      const aisLocation = await seaTimeApi.getVesselAISLocation(vessel.id, true);
      console.log('[VesselDetail] AIS location data:', aisLocation);
      
      // Transform the response to match AISData interface
      const transformedAisData: AISData = {
        name: aisLocation.name || null,
        mmsi: aisLocation.mmsi || null,
        imo: aisLocation.imo || null,
        speed_knots: aisLocation.speed !== undefined ? aisLocation.speed : null,
        latitude: aisLocation.latitude !== undefined ? aisLocation.latitude : null,
        longitude: aisLocation.longitude !== undefined ? aisLocation.longitude : null,
        course: aisLocation.course !== undefined ? aisLocation.course : null,
        heading: aisLocation.heading !== undefined ? aisLocation.heading : null,
        timestamp: aisLocation.timestamp || null,
        status: aisLocation.status || null,
        destination: aisLocation.destination || null,
        eta: aisLocation.eta || null,
        callsign: aisLocation.callsign || null,
        ship_type: aisLocation.vessel_type || null,
        flag: aisLocation.flag || null,
        is_moving: (aisLocation.speed !== undefined && aisLocation.speed !== null && aisLocation.speed > 2) || false,
      };
      
      setAisData(transformedAisData);
      Alert.alert('Success', 'AIS data updated');
    } catch (error: any) {
      console.error('[VesselDetail] Failed to check AIS:', error);
      
      // Parse error message to provide user-friendly feedback
      let userMessage = 'Failed to check vessel location. Please try again.';
      
      if (error.message) {
        if (error.message.includes('Rate limit')) {
          // Show the rate limit message directly to the user
          userMessage = error.message;
        } else if (error.message.includes('502') || error.message.includes('temporarily unavailable')) {
          userMessage = 'Location service is temporarily unavailable. Please try again later.';
        } else if (error.message.includes('404') || error.message.includes('not found')) {
          userMessage = 'Vessel not found in tracking system. Please verify the MMSI number.';
        } else if (error.message.includes('401') || error.message.includes('authentication')) {
          userMessage = 'Authentication error. Please contact support.';
        }
      }
      
      Alert.alert('Error', userMessage);
    } finally {
      setCheckingAIS(false);
    }
  };

  const handleDeleteVessel = () => {
    if (!vessel) return;

    Alert.alert(
      'Delete Vessel',
      `Are you sure you want to delete ${vessel.vessel_name}? This will also delete all associated sea time entries.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: confirmDeleteVessel,
        },
      ]
    );
  };

  const confirmDeleteVessel = async () => {
    if (!vessel) return;

    try {
      console.log('[VesselDetail] User action: Deleting vessel');
      await seaTimeApi.deleteVessel(vessel.id);
      triggerRefresh(); // Trigger app-wide refresh
      Alert.alert('Success', 'Vessel deleted', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error: any) {
      console.error('[VesselDetail] Failed to delete vessel:', error);
      Alert.alert('Error', 'Failed to delete vessel: ' + error.message);
    }
  };

  const cancelDeleteVessel = () => {
    console.log('[VesselDetail] User cancelled vessel deletion');
  };

  const toggleExpanded = (entryId: string) => {
    console.log('[VesselDetail] Toggling expanded state for entry:', entryId);
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
    // CRITICAL: Safe date formatting to prevent crashes
    try {
      if (!dateString) return 'N/A';
      const date = new Date(dateString);
      // Check if date is valid
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleDateString();
    } catch (e) {
      console.error('[VesselDetail] Failed to format date:', e);
      return dateString || 'N/A';
    }
  };

  const formatDateTime = (dateString: string): string => {
    // CRITICAL: Safe datetime formatting to prevent crashes
    try {
      if (!dateString) return 'N/A';
      const date = new Date(dateString);
      // Check if date is valid
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleString();
    } catch (e) {
      console.error('[VesselDetail] Failed to format datetime:', e);
      return dateString || 'N/A';
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'confirmed':
        return colors.success;
      case 'pending':
        return colors.warning;
      case 'rejected':
        return colors.error;
      default:
        return isDark ? colors.textSecondary : colors.textSecondaryLight;
    }
  };

  const calculateTotalDays = (): number => {
    const totalHours = seaTimeEntries
      .filter(entry => entry.status === 'confirmed')
      .reduce((total, entry) => total + (entry.duration_hours || 0), 0);
    return Math.floor(totalHours / 24);
  };

  const groupEntriesByDate = () => {
    const grouped: { [key: string]: SeaTimeEntry[] } = {};
    seaTimeEntries.forEach(entry => {
      const date = formatDate(entry.start_time);
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(entry);
    });
    return grouped;
  };

  const handleViewDebugLogs = () => {
    if (!vessel) return;
    console.log('[VesselDetail] Navigating to debug logs');
    router.push(`/debug/${vessel.id}` as any);
  };

  const formatAISValue = (value: any, suffix: string = ''): string => {
    if (value === null || value === undefined) return 'N/A';
    return `${value}${suffix}`;
  };

  const formatCoordinates = (lat: number | null, lon: number | null): string => {
    if (lat === null || lon === null) return 'N/A';
    return `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
  };

  const convertToDMS = (decimal: number, isLatitude: boolean): string => {
    // CRITICAL: Safe coordinate conversion to prevent crashes
    try {
      // Validate input
      if (typeof decimal !== 'number' || isNaN(decimal) || !isFinite(decimal)) {
        return 'Invalid';
      }
      
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
      console.error('[VesselDetail] Failed to convert to DMS:', e);
      return 'Invalid';
    }
  };

  const formatCoordinateDMS = (lat: number | null, lon: number | null): string => {
    // CRITICAL: Safe coordinate formatting to prevent crashes
    try {
      if (lat === null || lat === undefined || lon === null || lon === undefined) {
        return 'No coordinates';
      }
      if (typeof lat !== 'number' || typeof lon !== 'number') {
        return 'Invalid coordinates';
      }
      if (isNaN(lat) || isNaN(lon) || !isFinite(lat) || !isFinite(lon)) {
        return 'Invalid coordinates';
      }
      if (lat === 0 && lon === 0) {
        return 'No coordinates';
      }
      return `${convertToDMS(lat, true)}, ${convertToDMS(lon, false)}`;
    } catch (e) {
      console.error('[VesselDetail] Failed to format coordinates:', e);
      return 'Invalid coordinates';
    }
  };

  const formatDuration = (hours: number | null): string => {
    // CRITICAL: Safe duration formatting to prevent crashes
    try {
      if (hours === null || hours === undefined) return 'In progress';
      
      // Validate input
      if (typeof hours !== 'number' || isNaN(hours) || !isFinite(hours)) {
        return 'Invalid duration';
      }
      
      // Handle negative values
      if (hours < 0) return 'Invalid duration';
      
      if (hours >= 24) {
        const days = Math.floor(hours / 24);
        const remainingHours = Math.round(hours % 24);
        if (remainingHours === 0) {
          return `${days} ${days === 1 ? 'day' : 'days'}`;
        }
        return `${days} ${days === 1 ? 'day' : 'days'}, ${remainingHours}h`;
      }
      
      const wholeHours = Math.floor(hours);
      const minutes = Math.round((hours - wholeHours) * 60);
      if (minutes === 0) return `${wholeHours}h`;
      return `${wholeHours}h ${minutes}m`;
    } catch (e) {
      console.error('[VesselDetail] Failed to format duration:', e);
      return 'Invalid duration';
    }
  };

  const isMCACompliant = (entry: SeaTimeEntry): boolean => {
    if (entry.mca_compliant !== null && entry.mca_compliant !== undefined) {
      return entry.mca_compliant;
    }
    
    const hours = entry.duration_hours || 0;
    return hours >= 4.0;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading vessel details...</Text>
      </View>
    );
  }

  if (!vessel) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Vessel not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const groupedEntries = groupEntriesByDate();
  const totalDays = calculateTotalDays();

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: vessel.vessel_name,
          headerBackTitle: 'Back',
          headerStyle: {
            backgroundColor: isDark ? colors.cardBackground : colors.card,
          },
          headerTintColor: isDark ? colors.text : colors.textLight,
          headerBackTitleVisible: true,
        }}
      />

      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header - matching Logbook light header color */}
        {vessel.is_active && (
          <View style={styles.activeVesselBadge}>
            <View style={styles.activeIndicator} />
            <Text style={styles.activeVesselBadgeText}>ACTIVE - TRACKING</Text>
          </View>
        )}

        {/* Vessel Particulars Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Vessel Particulars</Text>
            <TouchableOpacity onPress={handleEditParticulars}>
              <IconSymbol
                ios_icon_name="pencil.circle.fill"
                android_material_icon_name="edit"
                size={24}
                color={colors.primary}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>MMSI</Text>
            <Text style={styles.detailValue}>{vessel.mmsi}</Text>
          </View>

          {vessel.callsign && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Call Sign</Text>
              <Text style={styles.detailValue}>{vessel.callsign}</Text>
            </View>
          )}

          {vessel.flag && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Flag</Text>
              <Text style={styles.detailValue}>{vessel.flag}</Text>
            </View>
          )}

          {vessel.official_number && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Official Number</Text>
              <Text style={styles.detailValue}>{vessel.official_number}</Text>
            </View>
          )}

          {vessel.vessel_type && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Type</Text>
              <Text style={styles.detailValue}>{vessel.vessel_type}</Text>
            </View>
          )}

          {vessel.length_metres && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Length</Text>
              <Text style={styles.detailValue}>{vessel.length_metres}m</Text>
            </View>
          )}

          {vessel.gross_tonnes && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Gross Tonnes</Text>
              <Text style={styles.detailValue}>{vessel.gross_tonnes}</Text>
            </View>
          )}

          {vessel.engine_kilowatts && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Engine Kilowatts (KW)</Text>
              <Text style={styles.detailValue}>{vessel.engine_kilowatts} KW</Text>
            </View>
          )}

          {vessel.engine_type && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Engine Type</Text>
              <Text style={styles.detailValue}>{vessel.engine_type}</Text>
            </View>
          )}

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Added</Text>
            <Text style={styles.detailValue}>{formatDate(vessel.created_at)}</Text>
          </View>
        </View>

        {/* AIS Data Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>AIS Data</Text>
            <TouchableOpacity onPress={handleCheckAIS} disabled={checkingAIS}>
              {checkingAIS ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <IconSymbol
                  ios_icon_name="arrow.clockwise.circle.fill"
                  android_material_icon_name="refresh"
                  size={24}
                  color={colors.primary}
                />
              )}
            </TouchableOpacity>
          </View>

          {aisData ? (
            <>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Position</Text>
                <Text style={styles.detailValue}>
                  {formatCoordinates(aisData.latitude, aisData.longitude)}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Speed</Text>
                <Text style={styles.detailValue}>{formatAISValue(aisData.speed_knots, ' knots')}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Course</Text>
                <Text style={styles.detailValue}>{formatAISValue(aisData.course, '°')}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Heading</Text>
                <Text style={styles.detailValue}>{formatAISValue(aisData.heading, '°')}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Status</Text>
                <Text style={styles.detailValue}>{aisData.status || 'N/A'}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Destination</Text>
                <Text style={styles.detailValue}>{aisData.destination || 'N/A'}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Last Update</Text>
                <Text style={styles.detailValue}>
                  {aisData.timestamp ? formatDateTime(aisData.timestamp) : 'N/A'}
                </Text>
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.debugButton} onPress={handleViewDebugLogs}>
                  <Text style={styles.debugButtonText}>View Debug Logs</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <Text style={styles.noDataText}>No AIS data available. Tap refresh to check.</Text>
          )}
        </View>

        {/* Sea Time Summary Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sea Time Summary</Text>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{totalDays}</Text>
              <Text style={styles.summaryLabel}>Days</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{seaTimeEntries.length}</Text>
              <Text style={styles.summaryLabel}>Entries</Text>
            </View>
          </View>
        </View>

        {/* Sea Time Entries */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sea Time Entries</Text>

          {seaTimeEntries.length === 0 ? (
            <Text style={styles.noDataText}>No sea time entries for this vessel</Text>
          ) : (
            Object.entries(groupedEntries).map(([date, entries]) => (
              <View key={date} style={styles.dateGroup}>
                <Text style={styles.dateHeader}>{date}</Text>
                {entries.map((entry) => {
                  const isExpanded = expandedEntries.has(entry.id);
                  const mcaCompliant = isMCACompliant(entry);
                  const durationHours = entry.duration_hours || 0;
                  
                  return (
                    <View key={entry.id} style={styles.entryCard}>
                      {!mcaCompliant && entry.status === 'pending' && (
                        <View style={styles.mcaWarningBanner}>
                          <IconSymbol
                            ios_icon_name="exclamationmark.triangle"
                            android_material_icon_name="warning"
                            size={16}
                            color={colors.warning}
                          />
                          <Text style={styles.mcaWarningText}>
                            Does not meet MCA 4hr requirement
                          </Text>
                        </View>
                      )}
                      
                      {mcaCompliant && entry.status === 'pending' && (
                        <View style={styles.mcaComplianceBanner}>
                          <IconSymbol
                            ios_icon_name="checkmark.circle"
                            android_material_icon_name="check-circle"
                            size={16}
                            color={colors.success}
                          />
                          <Text style={styles.mcaComplianceText}>
                            Meets MCA 4hr requirement
                          </Text>
                        </View>
                      )}

                      <TouchableOpacity
                        style={styles.entryHeader}
                        onPress={() => toggleExpanded(entry.id)}
                      >
                        <View style={styles.entryHeaderLeft}>
                          <Text style={styles.entryTime}>
                            {new Date(entry.start_time).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            {entry.end_time &&
                              ` - ${new Date(entry.end_time).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}`}
                          </Text>
                          <View style={styles.entryMetaRow}>
                            <View
                              style={[
                                styles.statusBadge,
                                { backgroundColor: getStatusColor(entry.status) + '20' },
                              ]}
                            >
                              <Text
                                style={[styles.statusText, { color: getStatusColor(entry.status) }]}
                              >
                                {entry.status.toUpperCase()}
                              </Text>
                            </View>
                            {entry.duration_hours !== null && (
                              <Text style={styles.entryDuration}>
                                {formatDuration(entry.duration_hours)}
                              </Text>
                            )}
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
                        <View style={styles.entryExpandedDetails}>
                          {(entry.start_latitude !== null && entry.start_latitude !== undefined) && (
                            <View style={styles.expandedDetailRow}>
                              <Text style={styles.expandedDetailLabel}>Start Position:</Text>
                              <Text style={styles.expandedDetailValue}>
                                {formatCoordinateDMS(entry.start_latitude, entry.start_longitude)}
                              </Text>
                            </View>
                          )}
                          
                          {(entry.end_latitude !== null && entry.end_latitude !== undefined) && (
                            <View style={styles.expandedDetailRow}>
                              <Text style={styles.expandedDetailLabel}>End Position:</Text>
                              <Text style={styles.expandedDetailValue}>
                                {formatCoordinateDMS(entry.end_latitude, entry.end_longitude)}
                              </Text>
                            </View>
                          )}

                          {entry.notes && (
                            <View style={styles.expandedDetailRow}>
                              <Text style={styles.expandedDetailLabel}>Notes:</Text>
                              <Text style={styles.expandedDetailValue}>{entry.notes}</Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsCard}>
          {!vessel.is_active && (
            <TouchableOpacity style={styles.activateButton} onPress={handleActivateVessel}>
              <IconSymbol
                ios_icon_name="play.circle.fill"
                android_material_icon_name="play-circle-filled"
                size={20}
                color="#fff"
              />
              <Text style={styles.activateButtonText}>Activate Vessel</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteVessel}>
            <IconSymbol
              ios_icon_name="trash.circle.fill"
              android_material_icon_name="delete"
              size={20}
              color="#fff"
            />
            <Text style={styles.deleteButtonText}>Delete Vessel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Subscription Prompt Modal */}
      <SubscriptionPromptModal {...subscriptionPromptProps} />

      {/* Edit Particulars Modal */}
      <Modal visible={editModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setEditModalVisible(false)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Vessel Particulars</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color={isDark ? colors.textSecondary : colors.textSecondaryLight}
                />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView}>
              {/* Auto-fill info banner */}
              <View style={styles.autoFillBanner}>
                <IconSymbol
                  ios_icon_name="info.circle.fill"
                  android_material_icon_name="info"
                  size={20}
                  color={colors.primary}
                />
                <Text style={styles.autoFillText}>
                  Leave fields blank to auto-fill from AIS data
                </Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Vessel Name</Text>
                <TextInput
                  style={styles.input}
                  value={editedVesselName}
                  onChangeText={setEditedVesselName}
                  placeholder="Vessel Name"
                  placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Call Sign</Text>
                <TextInput
                  style={styles.input}
                  value={editedCallSign}
                  onChangeText={setEditedCallSign}
                  placeholder="Call Sign"
                  placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Flag</Text>
                <TextInput
                  style={styles.input}
                  value={editedFlag}
                  onChangeText={setEditedFlag}
                  placeholder="Flag"
                  placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Official Number</Text>
                <TextInput
                  style={styles.input}
                  value={editedOfficialNumber}
                  onChangeText={setEditedOfficialNumber}
                  placeholder="Official Number"
                  placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Type (Motor/Sail)</Text>
                <View style={styles.typeButtonContainer}>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      editedVesselType === 'Motor' && styles.typeButtonActive,
                    ]}
                    onPress={() => setEditedVesselType('Motor')}
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        editedVesselType === 'Motor' && styles.typeButtonTextActive,
                      ]}
                    >
                      Motor
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      editedVesselType === 'Sail' && styles.typeButtonActive,
                    ]}
                    onPress={() => setEditedVesselType('Sail')}
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        editedVesselType === 'Sail' && styles.typeButtonTextActive,
                      ]}
                    >
                      Sail
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Length (metres)</Text>
                <TextInput
                  style={styles.input}
                  value={editedLengthMetres}
                  onChangeText={setEditedLengthMetres}
                  placeholder="Length"
                  placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Gross Tonnes</Text>
                <TextInput
                  style={styles.input}
                  value={editedGrossTonnes}
                  onChangeText={setEditedGrossTonnes}
                  placeholder="Gross Tonnes"
                  placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Engine Kilowatts (KW)</Text>
                <TextInput
                  style={styles.input}
                  value={editedEngineKilowatts}
                  onChangeText={setEditedEngineKilowatts}
                  placeholder="Engine Kilowatts"
                  placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Engine Type</Text>
                <TextInput
                  style={styles.input}
                  value={editedEngineType}
                  onChangeText={setEditedEngineType}
                  placeholder="e.g., Diesel, Petrol, Electric"
                  placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                />
              </View>

              <TouchableOpacity style={styles.saveButton} onPress={handleSaveParticulars}>
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
      padding: 20,
    },
    loadingText: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 12,
    },
    errorText: {
      fontSize: 18,
      color: colors.error,
      marginBottom: 20,
    },
    backButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    backButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    activeVesselBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.success + '20',
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 8,
      gap: 8,
    },
    activeIndicator: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.success,
    },
    activeVesselBadgeText: {
      fontSize: 13,
      fontWeight: 'bold',
      color: colors.success,
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 16,
      margin: 16,
      marginBottom: 0,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 16,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? colors.border : colors.borderLight,
    },
    detailLabel: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      fontWeight: '500',
    },
    detailValue: {
      fontSize: 14,
      color: isDark ? colors.text : colors.textLight,
      fontWeight: '600',
    },
    noDataText: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      textAlign: 'center',
      paddingVertical: 20,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
    },
    debugButton: {
      flex: 1,
      padding: 12,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
      borderRadius: 8,
      alignItems: 'center',
    },
    debugButtonText: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: '600',
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingVertical: 8,
    },
    summaryItem: {
      alignItems: 'center',
    },
    summaryValue: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.primary,
    },
    summaryLabel: {
      fontSize: 12,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 4,
    },
    dateGroup: {
      marginBottom: 16,
    },
    dateHeader: {
      fontSize: 14,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    entryCard: {
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
      borderRadius: 8,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      overflow: 'hidden',
    },
    mcaWarningBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.warning + '20',
      paddingVertical: 6,
      paddingHorizontal: 12,
      gap: 6,
    },
    mcaWarningText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.warning,
      flex: 1,
    },
    mcaComplianceBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.success + '20',
      paddingVertical: 6,
      paddingHorizontal: 12,
      gap: 6,
    },
    mcaComplianceText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.success,
      flex: 1,
    },
    entryHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 12,
    },
    entryHeaderLeft: {
      flex: 1,
    },
    entryTime: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 6,
    },
    entryMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
    },
    statusText: {
      fontSize: 11,
      fontWeight: 'bold',
      letterSpacing: 0.5,
    },
    entryDuration: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    entryNotes: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 4,
      fontStyle: 'italic',
    },
    entryExpandedDetails: {
      paddingHorizontal: 12,
      paddingBottom: 12,
      borderTopWidth: 1,
      borderTopColor: isDark ? colors.border : colors.borderLight,
    },
    expandedDetailRow: {
      marginTop: 8,
    },
    expandedDetailLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 4,
    },
    expandedDetailValue: {
      fontSize: 13,
      color: isDark ? colors.text : colors.textLight,
      lineHeight: 18,
    },
    actionsCard: {
      margin: 16,
      gap: 12,
    },
    activateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      padding: 16,
      borderRadius: 8,
      gap: 8,
    },
    activateButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: 'bold',
    },
    deleteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.error,
      padding: 16,
      borderRadius: 8,
      gap: 8,
    },
    deleteButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: 'bold',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    modalContent: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '80%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? colors.border : colors.borderLight,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
    },
    modalScrollView: {
      padding: 20,
    },
    autoFillBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary + '15',
      padding: 12,
      borderRadius: 8,
      marginBottom: 20,
      gap: 8,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
    },
    autoFillText: {
      flex: 1,
      fontSize: 13,
      color: isDark ? colors.text : colors.textLight,
      fontWeight: '500',
    },
    inputGroup: {
      marginBottom: 20,
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    input: {
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
      borderRadius: 8,
      padding: 14,
      fontSize: 16,
      color: isDark ? colors.text : colors.textLight,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    typeButtonContainer: {
      flexDirection: 'row',
      gap: 12,
    },
    typeButton: {
      flex: 1,
      padding: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
      alignItems: 'center',
    },
    typeButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    typeButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
    },
    typeButtonTextActive: {
      color: '#fff',
    },
    saveButton: {
      backgroundColor: colors.primary,
      padding: 16,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 12,
    },
    saveButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: 'bold',
    },
  });
}
