
import { useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import * as seaTimeApi from '@/utils/seaTimeApi';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  useColorScheme,
  RefreshControl,
  Platform,
  Image,
  KeyboardAvoidingView,
  Dimensions,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import React, { useState, useEffect, useCallback } from 'react';
import CartoMap from '@/components/CartoMap';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useSubscriptionEnforcement } from '@/hooks/useSubscriptionEnforcement';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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

interface VesselLocation {
  latitude: number | null;
  longitude: number | null;
  timestamp: string | null;
}

export default function SeaTimeScreen() {
  console.log('[Home] Component mounted (iOS)');
  
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { handleSubscriptionError, requireSubscription, hasSubscription } = useSubscriptionEnforcement();
  
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [newVesselName, setNewVesselName] = useState('');
  const [newMMSI, setNewMMSI] = useState('');
  const [newCallSign, setNewCallSign] = useState('');
  const [newFlag, setNewFlag] = useState('');
  const [newOfficialNumber, setNewOfficialNumber] = useState('');
  const [newVesselType, setNewVesselType] = useState('');
  const [newLengthMetres, setNewLengthMetres] = useState('');
  const [newGrossTonnes, setNewGrossTonnes] = useState('');
  const [newEngineKilowatts, setNewEngineKilowatts] = useState('');
  const [newEngineType, setNewEngineType] = useState('');
  const [activeVesselLocation, setActiveVesselLocation] = useState<VesselLocation | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark, insets.top);

  // Separate vessels into active and historic
  const activeVessel = vessels.find(v => v.is_active);
  const historicVessels = vessels.filter(v => !v.is_active);

  // Check if user has active subscription
  const hasActiveSubscription = hasSubscription();

  const isLocationStale = useCallback((timestamp: string | null | undefined): boolean => {
    if (!timestamp) return false;
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const hoursSinceUpdate = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
      // Consider data stale if it's more than 2 hours old (matching the AIS check interval)
      return hoursSinceUpdate > 2;
    } catch (e) {
      return false;
    }
  }, []);

  const loadActiveVesselLocation = useCallback(async (vesselId: string, forceRefresh: boolean = false) => {
    try {
      setLocationLoading(true);
      console.log('[Home] Loading location for vessel:', vesselId, 'forceRefresh:', forceRefresh);
      
      // First, get the current cached location
      const locationData = await seaTimeApi.getVesselAISLocation(vesselId, false);
      setActiveVesselLocation({
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        timestamp: locationData.timestamp,
      });
      console.log('[Home] Location loaded:', locationData.latitude, locationData.longitude, 'timestamp:', locationData.timestamp);
      
      // If forceRefresh is true, trigger a fresh AIS check (no stale check - always fresh on good connection)
      if (forceRefresh) {
        console.log('[Home] Force refresh requested, triggering fresh AIS check for instant data');
        try {
          // This will trigger a fresh API call to MyShipTracking
          await seaTimeApi.checkVesselAIS(vesselId, true);
          
          // Reload the location after the fresh check
          const freshLocationData = await seaTimeApi.getVesselAISLocation(vesselId, false);
          setActiveVesselLocation({
            latitude: freshLocationData.latitude,
            longitude: freshLocationData.longitude,
            timestamp: freshLocationData.timestamp,
          });
          console.log('[Home] Fresh location loaded:', freshLocationData.latitude, freshLocationData.longitude, 'timestamp:', freshLocationData.timestamp);
        } catch (aisError: any) {
          console.error('[Home] Failed to get fresh AIS data:', aisError);
          // Keep the cached data, just log the error
        }
      }
    } catch (error: any) {
      console.error('[Home] Failed to load vessel location:', error);
      // Don't show alert for location errors, just log them
      setActiveVesselLocation(null);
    } finally {
      setLocationLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      console.log('[Home] Loading vessels...');
      const vesselsData = await seaTimeApi.getVessels();
      console.log('[Home] Vessels data received:', vesselsData?.length || 0, 'vessels');
      
      setVessels(vesselsData || []);
      console.log('[Home] Vessels loaded - Active:', vesselsData.filter(v => v.is_active).length, 'Historic:', vesselsData.filter(v => !v.is_active).length);
      
      // Load location for the active vessel - ALWAYS force refresh for instant fresh data
      const newActiveVessel = vesselsData.find(v => v.is_active);
      if (newActiveVessel) {
        console.log('[Home] Found active vessel, loading location with FORCE refresh for instant fresh data:', newActiveVessel.vessel_name);
        // CRITICAL: Wrap in try-catch to prevent location errors from crashing the app
        try {
          // Force refresh to ensure user always gets fresh data on good connection
          await loadActiveVesselLocation(newActiveVessel.id, true);
        } catch (locationError: any) {
          console.error('[Home] Failed to load vessel location (non-critical):', locationError);
          // Don't crash the app, just log the error
          setActiveVesselLocation(null);
        }
      } else {
        console.log('[Home] No active vessel found, clearing location');
        setActiveVesselLocation(null);
      }
    } catch (error: any) {
      console.error('[Home] Failed to load data:', error);
      console.error('[Home] Error details:', error.message, error.name, error.stack);
      
      // CRITICAL: Don't show alert on initial load failure
      // Just set empty state and let user retry with pull-to-refresh
      setVessels([]);
      setActiveVesselLocation(null);
    } finally {
      console.log('[Home] Load data complete, setting loading to false');
      setLoading(false);
    }
  }, [loadActiveVesselLocation]);

  // Initial data load
  useEffect(() => {
    console.log('[Home] Initial data load effect triggered (iOS)');
    
    // CRITICAL: Wrap in try-catch to prevent any uncaught errors from crashing the app
    try {
      loadData();
    } catch (error: any) {
      console.error('[Home] CRITICAL: Uncaught error in loadData:', error);
      setLoading(false);
    }
  }, [loadData]);

  const onRefresh = async () => {
    console.log('[Home] User triggered manual refresh');
    setRefreshing(true);
    
    // Reload vessels first
    const vesselsData = await seaTimeApi.getVessels();
    setVessels(vesselsData);
    
    // Load location for the active vessel with force refresh
    const newActiveVessel = vesselsData.find(v => v.is_active);
    if (newActiveVessel) {
      console.log('[Home] Found active vessel, loading location with force refresh:', newActiveVessel.vessel_name);
      await loadActiveVesselLocation(newActiveVessel.id, true);
    } else {
      console.log('[Home] No active vessel found, clearing location');
      setActiveVesselLocation(null);
    }
    
    setRefreshing(false);
  };

  const handleAddVessel = async () => {
    // CRITICAL: Validate inputs to prevent crashes
    if (!newMMSI || !newMMSI.trim() || !newVesselName || !newVesselName.trim()) {
      Alert.alert('Error', 'Please enter both MMSI and vessel name');
      return;
    }

    // Check subscription before creating vessel
    if (!requireSubscription('vessel creation')) {
      return;
    }

    try {
      const vesselNameTrimmed = newVesselName.trim();
      console.log('[Home] User action: Creating new vessel:', { 
        mmsi: newMMSI, 
        name: vesselNameTrimmed,
        callsign: newCallSign,
        flag: newFlag,
        official_number: newOfficialNumber,
        vessel_type: newVesselType,
        length_metres: newLengthMetres,
        gross_tonnes: newGrossTonnes,
        engine_kilowatts: newEngineKilowatts,
        engine_type: newEngineType
      });
      
      // ALWAYS activate new vessels - this ensures they become the active tracked vessel
      // with an attributed scheduled task created automatically by the backend
      const shouldActivate = true;
      
      console.log('[Home] New vessel will be automatically activated and tracked');
      
      const createdVessel = await seaTimeApi.createVessel(
        newMMSI.trim(), 
        vesselNameTrimmed, 
        shouldActivate,
        newFlag.trim() || undefined,
        newOfficialNumber.trim() || undefined,
        newVesselType || undefined,
        newLengthMetres ? parseFloat(newLengthMetres) : undefined,
        newGrossTonnes ? parseFloat(newGrossTonnes) : undefined,
        newCallSign.trim() || undefined,
        newEngineKilowatts ? parseFloat(newEngineKilowatts) : undefined,
        newEngineType.trim() || undefined
      );
      
      console.log('[Home] Vessel created successfully:', createdVessel.id);
      
      // Immediately capture the vessel's position by triggering an AIS check
      console.log('[Home] Capturing initial position for new vessel...');
      try {
        await seaTimeApi.checkVesselAIS(createdVessel.id, true);
        console.log('[Home] Initial position captured successfully');
      } catch (aisError: any) {
        console.error('[Home] Failed to capture initial position:', aisError);
        // Check if it's a subscription error
        if (handleSubscriptionError(aisError)) {
          return;
        }
        // Don't fail the whole operation if AIS check fails
        // The scheduled task will pick it up on the next run
      }
      
      setModalVisible(false);
      setNewMMSI('');
      setNewVesselName('');
      setNewCallSign('');
      setNewFlag('');
      setNewOfficialNumber('');
      setNewVesselType('');
      setNewLengthMetres('');
      setNewGrossTonnes('');
      setNewEngineKilowatts('');
      setNewEngineType('');
      await loadData();
      
      Alert.alert('Success', `${vesselNameTrimmed} has been added and is now being tracked`);
    } catch (error: any) {
      console.error('[Home] Failed to add vessel:', error);
      
      // Check if it's a subscription error
      if (handleSubscriptionError(error)) {
        return;
      }
      
      // Display the error message from the API (which now includes user-friendly messages)
      Alert.alert('Error', error.message || 'Failed to add vessel. Please try again.');
    }
  };

  const handleActivateVessel = async (vesselId: string, vesselName: string) => {
    // Check subscription before activating vessel
    if (!requireSubscription('vessel activation')) {
      return;
    }

    const message = activeVessel 
      ? `Start tracking ${vesselName}? This will deactivate ${activeVessel.vessel_name}.`
      : `Start tracking ${vesselName}? The app will monitor this vessel's AIS data.`;

    Alert.alert(
      'Activate Vessel',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate',
          onPress: async () => {
            try {
              console.log('[Home] User action: Activating vessel:', vesselId, '(will deactivate others)');
              await seaTimeApi.activateVessel(vesselId);
              await loadData();
              Alert.alert('Success', `${vesselName} is now being tracked`);
            } catch (error: any) {
              console.error('[Home] Failed to activate vessel:', error);
              
              // Check if it's a subscription error
              if (handleSubscriptionError(error)) {
                return;
              }
              
              Alert.alert('Error', 'Failed to activate vessel: ' + error.message);
            }
          },
        },
      ]
    );
  };

  const handleDeleteVessel = async (vesselId: string, vesselName: string) => {
    Alert.alert(
      'Delete Vessel',
      `Are you sure you want to delete ${vesselName}? This will also delete all associated sea time entries.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('[Home] User action: Deleting vessel:', vesselId);
              await seaTimeApi.deleteVessel(vesselId);
              await loadData();
              Alert.alert('Success', 'Vessel deleted');
            } catch (error: any) {
              console.error('[Home] Failed to delete vessel:', error);
              Alert.alert('Error', 'Failed to delete vessel: ' + error.message);
            }
          },
        },
      ]
    );
  };

  const handleVesselPress = (vesselId: string) => {
    console.log('[Home] Navigating to vessel detail:', vesselId);
    router.push(`/vessel/${vesselId}` as any);
  };

  const handleUserAccountPress = () => {
    console.log('[Home] User tapped account button, navigating to user profile');
    router.push('/user-profile');
  };

  const handleSubscribePress = () => {
    console.log('[Home] User tapped subscribe button, navigating to paywall');
    router.push('/paywall');
  };

  const convertToDMS = (decimal: number, isLatitude: boolean): string => {
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
  };

  const formatLocationDMS = (lat: number | null | undefined, lon: number | null | undefined): { lat: string; lon: string } | null => {
    if (lat === null || lat === undefined || lon === null || lon === undefined) {
      return null;
    }
    return {
      lat: convertToDMS(lat, true),
      lon: convertToDMS(lon, false)
    };
  };

  const formatTimestamp = (timestamp: string | null | undefined): string => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleString();
    } catch (e) {
      console.error('[Home] Failed to format timestamp:', e);
      return '';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const headerTitleText = 'SeaTime Tracker';
  const headerSubtitleText = 'Your AIS Tracking Companion';
  const logoSource = isDark 
    ? require('@/assets/images/c13cbd51-c2f7-489f-bbbb-6b28094d9b2b.png')
    : require('@/assets/images/c0b805f0-b63d-4d71-8549-490ab57ba961.png');

  // CRITICAL: Wrap entire component in ErrorBoundary to catch any rendering errors
  return (
    <ErrorBoundary>
      <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header - matching Logbook light header color */}
        <View style={styles.header}>
          <View style={styles.headerTitleContainer}>
            <Image
              source={logoSource}
              style={styles.appIcon}
              resizeMode="contain"
            />
            <View style={styles.headerTextContainer}>
              <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
                {headerTitleText}
              </Text>
              <Text style={styles.headerSubtitle}>{headerSubtitleText}</Text>
            </View>
            <TouchableOpacity 
              style={styles.userAccountButton}
              onPress={handleUserAccountPress}
            >
              <IconSymbol
                ios_icon_name="person.circle.fill"
                android_material_icon_name="account-circle"
                size={40}
                color={isDark ? colors.text : colors.textLight}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Subscription Required Banner - Show when no active subscription */}
        {!hasActiveSubscription && (
          <View style={styles.subscriptionBanner}>
            <View style={styles.subscriptionBannerContent}>
              <IconSymbol
                ios_icon_name="exclamationmark.triangle.fill"
                android_material_icon_name="warning"
                size={32}
                color={colors.warning}
              />
              <View style={styles.subscriptionBannerTextContainer}>
                <Text style={styles.subscriptionBannerTitle}>Vessel Tracking Paused</Text>
                <Text style={styles.subscriptionBannerMessage}>
                  Your subscription is inactive. Vessel tracking has been paused. Subscribe to resume automatic sea time tracking.
                </Text>
              </View>
            </View>
            <TouchableOpacity 
              style={styles.subscriptionBannerButton}
              onPress={handleSubscribePress}
            >
              <Text style={styles.subscriptionBannerButtonText}>Subscribe Now</Text>
              <IconSymbol
                ios_icon_name="arrow.right"
                android_material_icon_name="arrow-forward"
                size={18}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Active Vessel Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Active Vessel</Text>
            <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
              <IconSymbol
                ios_icon_name="plus.circle.fill"
                android_material_icon_name="add-circle"
                size={28}
                color={colors.primary}
              />
            </TouchableOpacity>
          </View>

          {!activeVessel ? (
            <View style={styles.emptyState}>
              <IconSymbol
                ios_icon_name="ferry"
                android_material_icon_name="directions-boat"
                size={64}
                color={isDark ? colors.textSecondary : colors.textSecondaryLight}
              />
              <Text style={styles.emptyText}>No active vessel</Text>
              <Text style={styles.emptySubtext}>
                {historicVessels.length > 0 
                  ? 'Tap a vessel below to view details and activate it'
                  : 'Tap the + button to add your first vessel'}
              </Text>
            </View>
          ) : (
            <View>
              <TouchableOpacity
                style={[styles.vesselCard, styles.activeVesselCard]}
                onPress={() => handleVesselPress(activeVessel.id)}
              >
                <View style={styles.activeVesselBadge}>
                  <View style={styles.activeIndicatorPulse} />
                  <Text style={styles.activeVesselBadgeText}>
                    {hasActiveSubscription ? 'TRACKING' : 'PAUSED'}
                  </Text>
                </View>
                
                <Text style={styles.vesselName}>{activeVessel.vessel_name}</Text>
                <Text style={styles.vesselMmsi}>MMSI: {activeVessel.mmsi}</Text>
                
                {/* Vessel Particulars in 2-column grid - now includes call sign */}
                <View style={styles.vesselParticularsGrid}>
                  {activeVessel.callsign && (
                    <View style={styles.particularItem}>
                      <Text style={styles.particularLabel}>Call Sign</Text>
                      <Text style={styles.particularValue}>{activeVessel.callsign}</Text>
                    </View>
                  )}
                  {activeVessel.flag && (
                    <View style={styles.particularItem}>
                      <Text style={styles.particularLabel}>Flag</Text>
                      <Text style={styles.particularValue}>{activeVessel.flag}</Text>
                    </View>
                  )}
                  {activeVessel.vessel_type && (
                    <View style={styles.particularItem}>
                      <Text style={styles.particularLabel}>Type</Text>
                      <Text style={styles.particularValue}>{activeVessel.vessel_type}</Text>
                    </View>
                  )}
                  {activeVessel.official_number && (
                    <View style={styles.particularItem}>
                      <Text style={styles.particularLabel}>Official No.</Text>
                      <Text style={styles.particularValue}>{activeVessel.official_number}</Text>
                    </View>
                  )}
                  {activeVessel.length_metres && (
                    <View style={styles.particularItem}>
                      <Text style={styles.particularLabel}>Length</Text>
                      <Text style={styles.particularValue}>{activeVessel.length_metres}m</Text>
                    </View>
                  )}
                  {activeVessel.gross_tonnes && (
                    <View style={styles.particularItem}>
                      <Text style={styles.particularLabel}>Gross Tonnes</Text>
                      <Text style={styles.particularValue}>{activeVessel.gross_tonnes}</Text>
                    </View>
                  )}
                </View>

                {/* Location in DMS format with timestamp */}
                {locationLoading ? (
                  <View style={styles.locationSection}>
                    <Text style={styles.locationSectionTitle}>Position</Text>
                    <Text style={styles.vesselLocation}>Loading location...</Text>
                  </View>
                ) : activeVesselLocation && (activeVesselLocation.latitude !== null || activeVesselLocation.longitude !== null) ? (
                  (() => {
                    const dmsLocation = formatLocationDMS(activeVesselLocation.latitude, activeVesselLocation.longitude);
                    return dmsLocation ? (
                      <View style={styles.locationSection}>
                        <Text style={styles.locationSectionTitle}>Position</Text>
                        <View style={styles.locationGrid}>
                          <View style={styles.locationItem}>
                            <Text style={styles.locationLabel}>Latitude</Text>
                            <Text style={styles.locationValue}>{dmsLocation.lat}</Text>
                          </View>
                          <View style={styles.locationItem}>
                            <Text style={styles.locationLabel}>Longitude</Text>
                            <Text style={styles.locationValue}>{dmsLocation.lon}</Text>
                          </View>
                        </View>
                        {activeVesselLocation.timestamp && (
                          <View>
                            <Text style={styles.vesselTimestamp}>
                              Updated: {formatTimestamp(activeVesselLocation.timestamp)}
                            </Text>
                            {isLocationStale(activeVesselLocation.timestamp) && (
                              <View style={styles.staleWarning}>
                                <IconSymbol
                                  ios_icon_name="exclamationmark.triangle.fill"
                                  android_material_icon_name="warning"
                                  size={16}
                                  color={colors.warning}
                                />
                                <Text style={styles.staleWarningText}>
                                  Position data is more than 2 hours old. Automatic refresh in progress.
                                </Text>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    ) : null;
                  })()
                ) : null}
              </TouchableOpacity>

              {/* Map showing vessel location - always show if we have any location data */}
              {activeVesselLocation && 
               activeVesselLocation.latitude !== null && 
               activeVesselLocation.longitude !== null ? (
                <View style={styles.mapContainer}>
                  <CartoMap
                    latitude={activeVesselLocation.latitude}
                    longitude={activeVesselLocation.longitude}
                    vesselName={activeVessel.vessel_name}
                  />
                </View>
              ) : (
                <View style={styles.mapPlaceholder}>
                  <IconSymbol
                    ios_icon_name="map"
                    android_material_icon_name="map"
                    size={48}
                    color={isDark ? colors.textSecondary : colors.textSecondaryLight}
                  />
                  <Text style={styles.mapPlaceholderText}>
                    {locationLoading ? 'Loading position...' : 'No position data available'}
                  </Text>
                  <Text style={styles.mapPlaceholderSubtext}>
                    {locationLoading ? 'Please wait' : 'Check AIS to update vessel location'}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Historic Vessels Section - Always show */}
        <View style={styles.section}>
          <View style={styles.historicHeader}>
            <Text style={styles.sectionTitle}>Historic Vessels</Text>
            <Text style={styles.sectionSubtitle}>
              {historicVessels.length > 0 
                ? 'Tap a vessel to view its history and activate it for tracking'
                : 'No historic vessels'}
            </Text>
          </View>
          {historicVessels.length === 0 ? (
            <View style={styles.emptyState}>
              <IconSymbol
                ios_icon_name="clock"
                android_material_icon_name="history"
                size={48}
                color={isDark ? colors.textSecondary : colors.textSecondaryLight}
              />
              <Text style={styles.emptyHistoricText}>No historic vessels</Text>
              <Text style={styles.emptySubtext}>
                Vessels you&apos;ve previously tracked will appear here
              </Text>
            </View>
          ) : (
            historicVessels.map((vessel) => (
              <React.Fragment key={vessel.id}>
                <TouchableOpacity
                  style={styles.vesselCard}
                  onPress={() => handleVesselPress(vessel.id)}
                >
                  <View style={styles.vesselHeader}>
                    <View style={styles.vesselInfo}>
                      <Text style={styles.vesselName}>{vessel.vessel_name}</Text>
                      <Text style={styles.vesselMmsi}>MMSI: {vessel.mmsi}</Text>
                      
                      {/* Vessel Particulars for historic vessels */}
                      <View style={styles.vesselParticulars}>
                        {vessel.callsign && (
                          <Text style={styles.vesselDetail}>Call Sign: {vessel.callsign}</Text>
                        )}
                        {vessel.flag && (
                          <Text style={styles.vesselDetail}>Flag: {vessel.flag}</Text>
                        )}
                        {vessel.official_number && (
                          <Text style={styles.vesselDetail}>Official No.: {vessel.official_number}</Text>
                        )}
                        {vessel.vessel_type && (
                          <Text style={styles.vesselDetail}>Type: {vessel.vessel_type}</Text>
                        )}
                        {vessel.length_metres && (
                          <Text style={styles.vesselDetail}>Length: {vessel.length_metres}m</Text>
                        )}
                        {vessel.gross_tonnes && (
                          <Text style={styles.vesselDetail}>Gross Tonnes: {vessel.gross_tonnes}</Text>
                        )}
                      </View>
                    </View>
                    <IconSymbol
                      ios_icon_name="chevron.right"
                      android_material_icon_name="chevron-right"
                      size={24}
                      color={isDark ? colors.textSecondary : colors.textSecondaryLight}
                    />
                  </View>
                </TouchableOpacity>
              </React.Fragment>
            ))
          )}
        </View>
      </ScrollView>

      {/* Add Vessel Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalBackdrop} 
            activeOpacity={1} 
            onPress={() => setModalVisible(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContentWrapper}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add New Vessel</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <IconSymbol
                    ios_icon_name="xmark.circle.fill"
                    android_material_icon_name="cancel"
                    size={28}
                    color={isDark ? colors.textSecondary : colors.textSecondaryLight}
                  />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.modalScrollView}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
                bounces={false}
              >
                {/* Auto-fill info banner */}
                <View style={styles.autoFillBanner}>
                  <IconSymbol
                    ios_icon_name="info.circle.fill"
                    android_material_icon_name="info"
                    size={20}
                    color={colors.primary}
                  />
                  <Text style={styles.autoFillText}>
                    Optional fields will be auto-filled from AIS data when available
                  </Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Vessel Name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., MV Serenity"
                    placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                    value={newVesselName}
                    onChangeText={setNewVesselName}
                    returnKeyType="next"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>MMSI Number *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 235012345"
                    placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                    value={newMMSI}
                    onChangeText={setNewMMSI}
                    keyboardType="numeric"
                    returnKeyType="next"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Call Sign</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., GBAA"
                    placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                    value={newCallSign}
                    onChangeText={setNewCallSign}
                    autoCapitalize="characters"
                    returnKeyType="next"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Flag</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., United Kingdom"
                    placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                    value={newFlag}
                    onChangeText={setNewFlag}
                    returnKeyType="next"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Official No.</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 123456"
                    placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                    value={newOfficialNumber}
                    onChangeText={setNewOfficialNumber}
                    returnKeyType="next"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Type (Motor/Sail)</Text>
                  <View style={styles.typeButtonContainer}>
                    <TouchableOpacity
                      style={[
                        styles.typeButton,
                        newVesselType === 'Motor' && styles.typeButtonActive
                      ]}
                      onPress={() => setNewVesselType('Motor')}
                    >
                      <Text style={[
                        styles.typeButtonText,
                        newVesselType === 'Motor' && styles.typeButtonTextActive
                      ]}>
                        Motor
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.typeButton,
                        newVesselType === 'Sail' && styles.typeButtonActive
                      ]}
                      onPress={() => setNewVesselType('Sail')}
                    >
                      <Text style={[
                        styles.typeButtonText,
                        newVesselType === 'Sail' && styles.typeButtonTextActive
                      ]}>
                        Sail
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Length (metres)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 45.5"
                    placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                    value={newLengthMetres}
                    onChangeText={setNewLengthMetres}
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Gross Tonnes</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 500"
                    placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                    value={newGrossTonnes}
                    onChangeText={setNewGrossTonnes}
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Engine Kilowatts (KW)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 1200"
                    placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                    value={newEngineKilowatts}
                    onChangeText={setNewEngineKilowatts}
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Engine Type</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., Caterpillar C32"
                    placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                    value={newEngineType}
                    onChangeText={setNewEngineType}
                    returnKeyType="done"
                    onSubmitEditing={handleAddVessel}
                  />
                </View>

                <TouchableOpacity style={styles.submitButton} onPress={handleAddVessel}>
                  <Text style={styles.submitButtonText}>Add Vessel</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
    </ErrorBoundary>
  );
}

function createStyles(isDark: boolean, topInset: number) {
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
    },
    loadingText: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    header: {
      padding: 20,
      paddingTop: topInset + 20,
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
    userAccountButton: {
      padding: 4,
    },
    subscriptionBanner: {
      backgroundColor: colors.warning + '20',
      borderLeftWidth: 4,
      borderLeftColor: colors.warning,
      padding: 16,
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.warning + '40',
    },
    subscriptionBannerContent: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 12,
    },
    subscriptionBannerTextContainer: {
      flex: 1,
    },
    subscriptionBannerTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 6,
    },
    subscriptionBannerMessage: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      lineHeight: 20,
    },
    subscriptionBannerButton: {
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 14,
      borderRadius: 8,
      gap: 8,
    },
    subscriptionBannerButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: 'bold',
    },
    section: {
      padding: 16,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    historicHeader: {
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 4,
    },
    sectionSubtitle: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 4,
    },
    addButton: {
      padding: 4,
    },
    vesselCard: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    activeVesselCard: {
      borderLeftWidth: 4,
      borderLeftColor: colors.success,
      backgroundColor: isDark ? colors.cardBackground : colors.card,
    },
    vesselHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    vesselInfo: {
      flex: 1,
    },
    activeVesselBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.success + '20',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
      alignSelf: 'flex-start',
      marginBottom: 12,
      gap: 6,
    },
    activeIndicatorPulse: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.success,
    },
    activeVesselBadgeText: {
      fontSize: 11,
      fontWeight: 'bold',
      color: colors.success,
      letterSpacing: 0.5,
    },
    vesselName: {
      fontSize: 20,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 4,
    },
    vesselMmsi: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 12,
    },
    vesselParticularsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: 16,
      gap: 12,
    },
    particularItem: {
      width: '48%',
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
      padding: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    particularLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    particularValue: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
    },
    locationSection: {
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    locationSectionTitle: {
      fontSize: 11,
      fontWeight: '600',
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    locationGrid: {
      flexDirection: 'row',
      gap: 12,
    },
    locationItem: {
      flex: 1,
    },
    locationLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 4,
    },
    locationValue: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    vesselLocation: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 1,
    },
    vesselTimestamp: {
      fontSize: 11,
      color: colors.primary,
      marginTop: 8,
      fontWeight: '600',
    },
    vesselParticulars: {
      marginTop: 4,
      marginBottom: 8,
    },
    vesselDetail: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 2,
    },
    mapContainer: {
      marginTop: 12,
      borderRadius: 8,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    mapPlaceholder: {
      marginTop: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
      padding: 40,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 200,
    },
    mapPlaceholderText: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginTop: 12,
      textAlign: 'center',
    },
    mapPlaceholderSubtext: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 4,
      textAlign: 'center',
    },
    statusIndicator: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    statusActive: {
      backgroundColor: colors.success,
    },
    vesselActions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
    },
    vesselButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 10,
      borderRadius: 8,
      gap: 6,
    },
    activateButton: {
      backgroundColor: colors.primary,
    },
    deleteButton: {
      backgroundColor: colors.error,
      flex: 0,
      paddingHorizontal: 12,
    },
    vesselButtonText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 14,
    },
    emptyState: {
      alignItems: 'center',
      padding: 40,
    },
    emptyText: {
      fontSize: 18,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginTop: 16,
    },
    emptyHistoricText: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginTop: 12,
    },
    emptySubtext: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 8,
      textAlign: 'center',
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
    modalContentWrapper: {
      maxHeight: SCREEN_HEIGHT * 0.9,
    },
    modalContent: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      height: '100%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? colors.border : colors.borderLight,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
    },
    modalScrollView: {
      flex: 1,
    },
    modalScrollContent: {
      padding: 20,
      paddingBottom: 40,
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
    submitButton: {
      backgroundColor: colors.primary,
      padding: 16,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 12,
    },
    submitButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: 'bold',
    },
    staleWarning: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 8,
      padding: 8,
      backgroundColor: colors.warning + '15',
      borderRadius: 6,
      borderLeftWidth: 3,
      borderLeftColor: colors.warning,
    },
    staleWarningText: {
      flex: 1,
      fontSize: 12,
      color: isDark ? colors.text : colors.textLight,
      fontWeight: '600',
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
  });
}
