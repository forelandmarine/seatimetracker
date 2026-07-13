/**
 * Manual GPS tracking — for vessels without AIS coverage
 * (tenders, sailing yachts, RIBs, dinghies).
 *
 * User taps "Start voyage" → captures phone GPS as start position
 * User taps "End voyage" → captures phone GPS as end position and creates entry
 *
 * The voyage is stored locally in AsyncStorage so the user can leave the
 * screen / app and come back. We do NOT do continuous background tracking
 * (battery + permissions) — just two snapshots.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import * as seaTimeApi from '@/utils/seaTimeApi';

import { error as logError } from '@/utils/log';

const ACTIVE_VOYAGE_KEY = 'seatime_active_manual_voyage';

interface ActiveVoyage {
  vesselId: string;
  vesselName: string;
  startTime: string; // ISO
  startLatitude: number;
  startLongitude: number;
}

interface Vessel {
  id: string;
  vessel_name: string;
  is_active: boolean;
}

export default function ManualTrackingScreen() {
  const router = useRouter();
  const { vesselId: paramVesselId } = useLocalSearchParams<{ vesselId?: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);

  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [selectedVesselId, setSelectedVesselId] = useState<string | null>(null);
  const [activeVoyage, setActiveVoyage] = useState<ActiveVoyage | null>(null);
  const [loading, setLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await seaTimeApi.getVessels();
        setVessels(data || []);
        // Pre-select vessel from query param, else fall back to active vessel
        if (paramVesselId) {
          setSelectedVesselId(paramVesselId);
        } else {
          const active = (data || []).find((v: any) => v.is_active);
          if (active) setSelectedVesselId(active.id);
        }
      } catch (err) {
        logError('[ManualTracking] Failed to load vessels:', err);
      }
    })();

    AsyncStorage.getItem(ACTIVE_VOYAGE_KEY).then((stored) => {
      if (stored) {
        try {
          setActiveVoyage(JSON.parse(stored));
        } catch {
          AsyncStorage.removeItem(ACTIVE_VOYAGE_KEY);
        }
      }
    });
  }, []);

  const requestLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      // Lazy import expo-location so the screen still loads if package is missing
      const Location = await import('expo-location').catch(() => null);
      if (!Location) {
        Alert.alert(
          'Location not available',
          'Manual GPS tracking will be available in a future update.'
        );
        return null;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        Alert.alert(
          'Location permission denied',
          'SeaTime Tracker needs your location to record manual voyages. Please enable it in Settings.'
        );
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
    } catch (err) {
      logError('[ManualTracking] Location error:', err);
      Alert.alert('Error', 'Failed to get current location. Please try again.');
      return null;
    }
  };

  const handleStartVoyage = async () => {
    if (!selectedVesselId) {
      Alert.alert('Select a vessel', 'Please choose which vessel you are aboard.');
      return;
    }
    const vessel = vessels.find((v) => v.id === selectedVesselId);
    if (!vessel) return;

    setLoading(true);
    const position = await requestLocation();
    setLoading(false);
    if (!position) return;

    const voyage: ActiveVoyage = {
      vesselId: vessel.id,
      vesselName: vessel.vessel_name,
      startTime: new Date().toISOString(),
      startLatitude: position.latitude,
      startLongitude: position.longitude,
    };

    await AsyncStorage.setItem(ACTIVE_VOYAGE_KEY, JSON.stringify(voyage));
    setActiveVoyage(voyage);
  };

  const handleEndVoyage = async () => {
    if (!activeVoyage) return;

    setLoading(true);
    const position = await requestLocation();
    if (!position) {
      setLoading(false);
      return;
    }

    try {
      await seaTimeApi.createManualSeaTimeEntry({
        vessel_id: activeVoyage.vesselId,
        start_time: activeVoyage.startTime,
        end_time: new Date().toISOString(),
        start_latitude: activeVoyage.startLatitude,
        start_longitude: activeVoyage.startLongitude,
        end_latitude: position.latitude,
        end_longitude: position.longitude,
        notes: 'Recorded via manual GPS tracking',
        service_type: 'actual_sea_service',
      });

      await AsyncStorage.removeItem(ACTIVE_VOYAGE_KEY);
      setActiveVoyage(null);
      Alert.alert('Voyage saved', 'Your sea time entry has been recorded.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      logError('[ManualTracking] Failed to save entry:', err);
      Alert.alert('Error', err?.message || 'Failed to save voyage. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDiscardVoyage = () => {
    Alert.alert('Discard voyage?', 'This will delete the in-progress voyage without saving.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem(ACTIVE_VOYAGE_KEY);
          setActiveVoyage(null);
        },
      },
    ]);
  };

  const elapsedHours = activeVoyage
    ? (Date.now() - new Date(activeVoyage.startTime).getTime()) / (1000 * 60 * 60)
    : 0;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Manual tracking',
          headerStyle: { backgroundColor: isDark ? colors.background : colors.backgroundLight },
          headerTitleStyle: { color: isDark ? colors.text : colors.textLight },
          headerTintColor: colors.primary,
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          For vessels without AIS (tenders, sailing yachts, RIBs). Tap{' '}
          <Text style={{ fontWeight: '700' }}>Start voyage</Text> when you depart and{' '}
          <Text style={{ fontWeight: '700' }}>End voyage</Text> when you arrive. Your phone's GPS
          will record both positions.
        </Text>

        {activeVoyage ? (
          <View style={styles.activeCard}>
            <View style={styles.activeHeader}>
              <View style={styles.activeDot} />
              <Text style={styles.activeLabel}>VOYAGE IN PROGRESS</Text>
            </View>
            <Text style={styles.activeVessel}>{activeVoyage.vesselName}</Text>
            <Text style={styles.activeDetail}>
              Started {new Date(activeVoyage.startTime).toLocaleString('en-GB')}
            </Text>
            <Text style={styles.activeDetail}>
              {elapsedHours < 1
                ? `${Math.round(elapsedHours * 60)} minutes elapsed`
                : `${elapsedHours.toFixed(1)} hours elapsed`}
            </Text>
            <Text style={styles.activeDetail}>
              Start: {activeVoyage.startLatitude.toFixed(4)}, {activeVoyage.startLongitude.toFixed(4)}
            </Text>

            <TouchableOpacity
              style={[styles.endButton, loading && { opacity: 0.6 }]}
              onPress={handleEndVoyage}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <IconSymbol
                    ios_icon_name="stop.circle.fill"
                    android_material_icon_name="stop-circle"
                    size={22}
                    color="#FFFFFF"
                  />
                  <Text style={styles.endButtonText}>End voyage</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.discardButton} onPress={handleDiscardVoyage}>
              <Text style={styles.discardButtonText}>Discard voyage</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.startCard}>
            <Text style={styles.label}>Vessel</Text>
            {vessels.length === 0 ? (
              <Text style={styles.emptyText}>No vessels yet. Add one from the home screen.</Text>
            ) : (
              vessels.map((v) => (
                <TouchableOpacity
                  key={v.id}
                  style={[
                    styles.vesselOption,
                    selectedVesselId === v.id && styles.vesselOptionActive,
                  ]}
                  onPress={() => setSelectedVesselId(v.id)}
                >
                  <Text
                    style={[
                      styles.vesselOptionText,
                      selectedVesselId === v.id && styles.vesselOptionTextActive,
                    ]}
                  >
                    {v.vessel_name}
                  </Text>
                  {selectedVesselId === v.id && (
                    <IconSymbol
                      ios_icon_name="checkmark.circle.fill"
                      android_material_icon_name="check-circle"
                      size={20}
                      color={colors.primary}
                    />
                  )}
                </TouchableOpacity>
              ))
            )}

            <TouchableOpacity
              style={[styles.startButton, (loading || !selectedVesselId) && { opacity: 0.6 }]}
              onPress={handleStartVoyage}
              disabled={loading || !selectedVesselId}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <IconSymbol
                    ios_icon_name="play.circle.fill"
                    android_material_icon_name="play-circle"
                    size={22}
                    color="#FFFFFF"
                  />
                  <Text style={styles.startButtonText}>Start voyage</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {permissionDenied && (
          <Text style={styles.permissionWarning}>
            Location permission denied. Enable it in Settings → SeaTime Tracker → Location.
          </Text>
        )}
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
    content: {
      padding: 20,
      paddingBottom: 60,
    },
    intro: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      lineHeight: 20,
      marginBottom: 24,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 10,
    },
    startCard: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    vesselOption: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 8,
      marginBottom: 6,
      backgroundColor: 'transparent',
    },
    vesselOptionActive: {
      backgroundColor: colors.primary + '15',
    },
    vesselOptionText: {
      fontSize: 15,
      color: isDark ? colors.text : colors.textLight,
    },
    vesselOptionTextActive: {
      color: colors.primary,
      fontWeight: '600',
    },
    emptyText: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      fontStyle: 'italic',
      paddingVertical: 12,
    },
    startButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.success,
      paddingVertical: 16,
      borderRadius: 12,
      marginTop: 16,
    },
    startButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
    activeCard: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 12,
      padding: 20,
      borderWidth: 2,
      borderColor: colors.success,
    },
    activeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    activeDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.success,
    },
    activeLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.success,
      letterSpacing: 1.2,
    },
    activeVessel: {
      fontSize: 20,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    activeDetail: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 4,
    },
    endButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.error,
      paddingVertical: 16,
      borderRadius: 12,
      marginTop: 20,
    },
    endButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
    discardButton: {
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 8,
    },
    discardButtonText: {
      color: colors.textSecondary,
      fontSize: 14,
    },
    permissionWarning: {
      marginTop: 20,
      padding: 12,
      backgroundColor: colors.warning + '15',
      borderRadius: 8,
      borderLeftWidth: 3,
      borderLeftColor: colors.warning,
      fontSize: 13,
      color: isDark ? colors.text : colors.textLight,
    },
  });
