
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
  RefreshControl,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import * as seaTimeApi from '@/utils/seaTimeApi';
import { colors } from '@/styles/commonStyles';

interface AISDebugLog {
  id: string;
  mmsi: string;
  api_url: string;
  request_time: string;
  response_status: string;
  response_body: string | null;
  authentication_status: string;
  error_message: string | null;
  created_at: string;
}

// Haversine formula to calculate distance between two coordinates in nautical miles
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3440.065; // Earth's radius in nautical miles
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function createStyles(isDark: boolean) {
  const textColor = isDark ? colors.text : colors.textLight;
  const secondaryTextColor = isDark ? colors.textSecondary : colors.textSecondaryLight;
  const backgroundColor = isDark ? colors.background : colors.backgroundLight;
  const cardColor = isDark ? colors.cardBackground : colors.card;
  const borderColor = isDark ? colors.border : colors.borderLight;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: backgroundColor,
    },
    scrollContent: {
      padding: 16,
      paddingTop: Platform.OS === 'android' ? 48 : 16,
      paddingBottom: 32,
    },
    header: {
      marginBottom: 20,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: textColor,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: secondaryTextColor,
      lineHeight: 20,
    },
    logCard: {
      backgroundColor: cardColor,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: borderColor,
    },
    logHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: borderColor,
    },
    logTime: {
      fontSize: 13,
      color: secondaryTextColor,
      fontWeight: '500',
    },
    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#fff',
    },
    logRow: {
      flexDirection: 'row',
      marginBottom: 10,
      alignItems: 'flex-start',
    },
    logLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: textColor,
      width: 110,
      flexShrink: 0,
    },
    logValue: {
      fontSize: 13,
      color: secondaryTextColor,
      flex: 1,
    },
    expandButton: {
      marginTop: 12,
      paddingVertical: 10,
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
      borderRadius: 8,
    },
    expandButtonText: {
      fontSize: 13,
      color: colors.primary,
      fontWeight: '600',
    },
    responseBody: {
      marginTop: 12,
      padding: 12,
      backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: borderColor,
    },
    responseBodyText: {
      fontSize: 11,
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      color: textColor,
      lineHeight: 16,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      paddingHorizontal: 20,
    },
    emptyStateText: {
      fontSize: 16,
      color: secondaryTextColor,
      textAlign: 'center',
      marginTop: 16,
      lineHeight: 22,
    },
    coordinatesContainer: {
      marginTop: 12,
      padding: 12,
      backgroundColor: isDark ? 'rgba(76, 175, 80, 0.15)' : 'rgba(76, 175, 80, 0.1)',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(76, 175, 80, 0.3)' : 'rgba(76, 175, 80, 0.2)',
    },
    coordinatesTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#81c784' : '#2e7d32',
      marginBottom: 8,
    },
    coordinatesText: {
      fontSize: 12,
      color: isDark ? '#a5d6a7' : '#388e3c',
      marginBottom: 4,
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    distanceContainer: {
      marginTop: 12,
      padding: 12,
      backgroundColor: isDark ? 'rgba(33, 150, 243, 0.15)' : 'rgba(33, 150, 243, 0.1)',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(33, 150, 243, 0.3)' : 'rgba(33, 150, 243, 0.2)',
    },
    distanceTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#64b5f6' : '#1976d2',
      marginBottom: 8,
    },
    distanceText: {
      fontSize: 14,
      color: isDark ? '#90caf9' : '#1565c0',
      fontWeight: '700',
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    distanceSubtext: {
      fontSize: 11,
      color: isDark ? '#90caf9' : '#1565c0',
      marginTop: 4,
    },
  });
}

export default function DebugScreen() {
  const { vesselId } = useLocalSearchParams<{ vesselId: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);

  const [logs, setLogs] = useState<AISDebugLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  const loadLogs = useCallback(async () => {
    console.log('[Debug] Loading AIS debug logs for vessel:', vesselId);
    try {
      setLoading(true);
      const data = await seaTimeApi.getAISDebugLogs(vesselId);
      console.log('[Debug] Loaded', data.length, 'debug logs');
      setLogs(data);
    } catch (error) {
      console.error('[Debug] Failed to load debug logs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [vesselId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const onRefresh = () => {
    console.log('[Debug] User pulled to refresh debug logs');
    setRefreshing(true);
    loadLogs();
  };

  const toggleExpanded = (logId: string) => {
    console.log('[Debug] User toggled log expansion:', logId);
    setExpandedLogs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  const getStatusColor = (statusString: string): string => {
    const status = parseInt(statusString);
    if (status >= 200 && status < 300) return colors.success;
    if (status >= 400 && status < 500) return colors.warning;
    if (status >= 500) return colors.error;
    return '#9e9e9e';
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDateTime = (dateString: string): string => {
    const dateText = formatDate(dateString);
    const timeText = formatTime(dateString);
    return `${dateText} ${timeText}`;
  };

  const formatAuthStatus = (status: string): string => {
    if (status === 'authenticated') return '✅ Authenticated';
    if (status === 'unauthenticated') return '❌ Unauthenticated';
    if (status === 'api_key_masked') return '🔒 API Key Masked';
    return status;
  };

  const parseResponseBody = (body: string | null): any => {
    if (!body) return null;
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  };

  const extractCoordinates = (body: string | null): { lat: number; lon: number } | null => {
    if (!body) return null;
    try {
      const data = JSON.parse(body);
      const lat = data.latitude || data.lat || data.position?.latitude;
      const lon = data.longitude || data.lng || data.lon || data.position?.longitude;
      if (lat !== null && lat !== undefined && lon !== null && lon !== undefined) {
        return { lat: Number(lat), lon: Number(lon) };
      }
    } catch {
      console.log('[Debug] Failed to parse coordinates from response body');
    }
    return null;
  };

  const textColor = isDark ? colors.text : colors.textLight;
  const backgroundColor = isDark ? colors.background : colors.backgroundLight;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'AIS Debug Logs',
          headerShown: true,
          headerBackTitle: 'Back',
          headerBackTitleVisible: true,
          headerStyle: {
            backgroundColor: backgroundColor,
          },
          headerTintColor: textColor,
          headerShadowVisible: false,
        }}
      />
      <View style={styles.container}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View style={styles.header}>
            <Text style={styles.title}>AIS Debug Logs</Text>
            <Text style={styles.subtitle}>
              Detailed call history and responses for vessel monitoring. Distances calculated between consecutive observations.
            </Text>
          </View>

          {logs.length === 0 && !loading ? (
            <View style={styles.emptyState}>
              <IconSymbol
                ios_icon_name="doc.text.magnifyingglass"
                android_material_icon_name="search"
                size={64}
                color={isDark ? colors.textSecondary : colors.textSecondaryLight}
              />
              <Text style={styles.emptyStateText}>
                No debug logs found for this vessel.{'\n\n'}
                Try checking the vessel&apos;s AIS data to generate logs.
              </Text>
            </View>
          ) : (
            logs.map((log, index) => {
              const isExpanded = expandedLogs.has(log.id);
              const coordinates = extractCoordinates(log.response_body);
              
              // Calculate distance from previous observation
              let distance: number | null = null;
              let timeDiff: number | null = null;
              if (coordinates && index < logs.length - 1) {
                const prevLog = logs[index + 1]; // Logs are in reverse chronological order
                const prevCoordinates = extractCoordinates(prevLog.response_body);
                
                if (prevCoordinates) {
                  distance = calculateDistance(
                    prevCoordinates.lat,
                    prevCoordinates.lon,
                    coordinates.lat,
                    coordinates.lon
                  );
                  
                  // Calculate time difference in hours
                  const currentTime = new Date(log.request_time).getTime();
                  const prevTime = new Date(prevLog.request_time).getTime();
                  timeDiff = (currentTime - prevTime) / (1000 * 60 * 60); // Convert to hours
                  
                  console.log('[Debug] Distance calculation:', {
                    from: prevCoordinates,
                    to: coordinates,
                    distance: distance.toFixed(2) + ' nm',
                    timeDiff: timeDiff.toFixed(2) + ' hours'
                  });
                }
              }

              return (
                <View key={log.id} style={styles.logCard}>
                  <View style={styles.logHeader}>
                    <Text style={styles.logTime}>{formatDateTime(log.request_time)}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor(log.response_status) },
                      ]}
                    >
                      <Text style={styles.statusText}>{log.response_status}</Text>
                    </View>
                  </View>

                  <View style={styles.logRow}>
                    <Text style={styles.logLabel}>MMSI:</Text>
                    <Text style={styles.logValue}>{log.mmsi}</Text>
                  </View>

                  <View style={styles.logRow}>
                    <Text style={styles.logLabel}>Auth Status:</Text>
                    <Text style={styles.logValue}>{formatAuthStatus(log.authentication_status)}</Text>
                  </View>

                  {log.error_message && (
                    <View style={styles.logRow}>
                      <Text style={styles.logLabel}>Error:</Text>
                      <Text style={[styles.logValue, { color: colors.error }]}>
                        {log.error_message}
                      </Text>
                    </View>
                  )}

                  {coordinates && (
                    <View style={styles.coordinatesContainer}>
                      <Text style={styles.coordinatesTitle}>📍 Vessel Position</Text>
                      <Text style={styles.coordinatesText}>
                        Latitude: {coordinates.lat.toFixed(6)}°
                      </Text>
                      <Text style={styles.coordinatesText}>
                        Longitude: {coordinates.lon.toFixed(6)}°
                      </Text>
                    </View>
                  )}

                  {distance !== null && timeDiff !== null && (
                    <View style={styles.distanceContainer}>
                      <Text style={styles.distanceTitle}>📏 Distance from Previous Observation</Text>
                      <Text style={styles.distanceText}>
                        {distance.toFixed(2)} nautical miles
                      </Text>
                      <Text style={styles.distanceSubtext}>
                        Time elapsed: {timeDiff.toFixed(2)} hours
                      </Text>
                      {timeDiff > 0 && (
                        <Text style={styles.distanceSubtext}>
                          Average speed: {(distance / timeDiff).toFixed(2)} knots
                        </Text>
                      )}
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.expandButton}
                    onPress={() => toggleExpanded(log.id)}
                  >
                    <Text style={styles.expandButtonText}>
                      {isExpanded ? '▼ Hide Details' : '▶ Show Details'}
                    </Text>
                  </TouchableOpacity>

                  {isExpanded && (
                    <>
                      {log.response_body && (
                        <View style={styles.responseBody}>
                          <Text style={styles.responseBodyText}>
                            {JSON.stringify(parseResponseBody(log.response_body), null, 2)}
                          </Text>
                        </View>
                      )}
                    </>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </>
  );
}
