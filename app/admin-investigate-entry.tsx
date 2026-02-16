
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { API_BASE_URL, getApiHeaders } from '@/utils/seaTimeApi';

interface InvestigationResult {
  entry: {
    id: string;
    vessel_id: string;
    vessel_name: string;
    start_time: string;
    end_time: string | null;
    duration_hours: number | null;
    status: string;
    notes: string | null;
    created_at: string;
    start_latitude: number | null;
    start_longitude: number | null;
    end_latitude: number | null;
    end_longitude: number | null;
    service_type: string | null;
    mca_compliant: boolean | null;
    detection_window_hours: number | null;
    is_stationary: boolean | null;
  };
  user: {
    id: string;
    name: string;
    email: string;
  };
  vessel: {
    id: string;
    mmsi: string;
    vessel_name: string;
    is_active: boolean;
  };
  origin_analysis: {
    entry_source: 'manual' | 'automatic_scheduler' | 'unknown';
    evidence: string;
    related_ais_checks: any[];
    related_scheduled_tasks: any[];
    ais_debug_logs: any[];
  };
}

function createStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.backgroundDark : colors.backgroundLight,
    },
    scrollContent: {
      padding: 20,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: isDark ? colors.textDark : colors.textLight,
      marginBottom: 12,
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: isDark ? colors.textDark : colors.textLight,
      marginBottom: 6,
    },
    input: {
      backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7',
      borderRadius: 10,
      padding: 12,
      fontSize: 16,
      color: isDark ? colors.textDark : colors.textLight,
      marginBottom: 12,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      padding: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    resultCard: {
      backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    resultTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.textDark : colors.textLight,
      marginBottom: 8,
    },
    resultRow: {
      flexDirection: 'row',
      marginBottom: 6,
    },
    resultLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: isDark ? '#8E8E93' : '#6C6C70',
      width: 140,
    },
    resultValue: {
      fontSize: 14,
      color: isDark ? colors.textDark : colors.textLight,
      flex: 1,
    },
    sourceTag: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      alignSelf: 'flex-start',
      marginTop: 8,
    },
    sourceTagText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    evidenceText: {
      fontSize: 14,
      color: isDark ? colors.textDark : colors.textLight,
      marginTop: 8,
      fontStyle: 'italic',
    },
    errorText: {
      fontSize: 14,
      color: '#FF3B30',
      textAlign: 'center',
      marginTop: 12,
    },
    emptyText: {
      fontSize: 14,
      color: isDark ? '#8E8E93' : '#6C6C70',
      textAlign: 'center',
      marginTop: 20,
    },
    aisCheckCard: {
      backgroundColor: isDark ? '#1C1C1E' : '#F2F2F7',
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
    },
    aisCheckText: {
      fontSize: 13,
      color: isDark ? colors.textDark : colors.textLight,
      marginBottom: 4,
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
      backgroundColor: colors.primary,
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

export default function AdminInvestigateEntryScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const router = useRouter();

  const [email, setEmail] = useState('dan@forelandmarine.com');
  const [vesselName, setVesselName] = useState('Brigit');
  const [timestamp, setTimestamp] = useState('25/01/2026, 22:48:16');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleInvestigate = async () => {
    console.log('[AdminInvestigate] User tapped Investigate button');
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const queryParams = new URLSearchParams({
        email: email.trim(),
        vesselName: vesselName.trim(),
        timestamp: timestamp.trim(),
      });

      const url = `${API_BASE_URL}/api/admin/investigate-entry?${queryParams}`;
      console.log('[AdminInvestigate] Calling investigation endpoint:', url);

      // Use authenticated API call with proper headers
      const headers = await getApiHeaders();
      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      console.log('[AdminInvestigate] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AdminInvestigate] API error:', response.status, errorText);
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('[AdminInvestigate] Investigation result received');
      setResult(data);
    } catch (err: any) {
      console.error('[AdminInvestigate] Investigation failed:', err);
      const message = err.message || 'Failed to investigate entry';
      setError(message);
      setErrorMessage(message);
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'automatic_scheduler':
        return '#FF9500';
      case 'manual':
        return '#34C759';
      default:
        return '#8E8E93';
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'automatic_scheduler':
        return 'AUTOMATIC';
      case 'manual':
        return 'MANUAL';
      default:
        return 'UNKNOWN';
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Investigate Sea Time Entry',
          headerShown: true,
          headerBackTitle: 'Back',
        }}
      />
      <View style={styles.container}>
        <ScrollView style={styles.scrollContent}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Entry Details</Text>
            
            <Text style={styles.inputLabel}>User Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="user@example.com"
              placeholderTextColor={isDark ? '#8E8E93' : '#6C6C70'}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Vessel Name</Text>
            <TextInput
              style={styles.input}
              value={vesselName}
              onChangeText={setVesselName}
              placeholder="Vessel Name"
              placeholderTextColor={isDark ? '#8E8E93' : '#6C6C70'}
            />

            <Text style={styles.inputLabel}>Timestamp</Text>
            <TextInput
              style={styles.input}
              value={timestamp}
              onChangeText={setTimestamp}
              placeholder="DD/MM/YYYY, HH:MM:SS"
              placeholderTextColor={isDark ? '#8E8E93' : '#6C6C70'}
            />

            <TouchableOpacity
              style={styles.button}
              onPress={handleInvestigate}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Investigate Entry</Text>
              )}
            </TouchableOpacity>
          </View>

          {error && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          {result && (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>User Information</Text>
                <View style={styles.resultCard}>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Name:</Text>
                    <Text style={styles.resultValue}>{result.user.name}</Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Email:</Text>
                    <Text style={styles.resultValue}>{result.user.email}</Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>User ID:</Text>
                    <Text style={styles.resultValue}>{result.user.id}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Vessel Information</Text>
                <View style={styles.resultCard}>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Name:</Text>
                    <Text style={styles.resultValue}>{result.vessel.vessel_name}</Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>MMSI:</Text>
                    <Text style={styles.resultValue}>{result.vessel.mmsi}</Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Active:</Text>
                    <Text style={styles.resultValue}>{result.vessel.is_active ? 'Yes' : 'No'}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Sea Time Entry</Text>
                <View style={styles.resultCard}>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Entry ID:</Text>
                    <Text style={styles.resultValue}>{result.entry.id}</Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Start Time:</Text>
                    <Text style={styles.resultValue}>{formatDateTime(result.entry.start_time)}</Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>End Time:</Text>
                    <Text style={styles.resultValue}>{formatDateTime(result.entry.end_time)}</Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Duration:</Text>
                    <Text style={styles.resultValue}>
                      {result.entry.duration_hours ? `${result.entry.duration_hours.toFixed(2)} hours` : 'N/A'}
                    </Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Status:</Text>
                    <Text style={styles.resultValue}>{result.entry.status}</Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Service Type:</Text>
                    <Text style={styles.resultValue}>{result.entry.service_type || 'N/A'}</Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>MCA Compliant:</Text>
                    <Text style={styles.resultValue}>
                      {result.entry.mca_compliant === null ? 'N/A' : result.entry.mca_compliant ? 'Yes' : 'No'}
                    </Text>
                  </View>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>Created At:</Text>
                    <Text style={styles.resultValue}>{formatDateTime(result.entry.created_at)}</Text>
                  </View>
                  {result.entry.notes && (
                    <View style={styles.resultRow}>
                      <Text style={styles.resultLabel}>Notes:</Text>
                      <Text style={styles.resultValue}>{result.entry.notes}</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Origin Analysis</Text>
                <View style={styles.resultCard}>
                  <Text style={styles.resultTitle}>Entry Source</Text>
                  <View
                    style={[
                      styles.sourceTag,
                      { backgroundColor: getSourceColor(result.origin_analysis.entry_source) },
                    ]}
                  >
                    <Text style={styles.sourceTagText}>
                      {getSourceLabel(result.origin_analysis.entry_source)}
                    </Text>
                  </View>
                  <Text style={styles.evidenceText}>{result.origin_analysis.evidence}</Text>
                </View>

                {result.origin_analysis.related_ais_checks.length > 0 && (
                  <View style={styles.resultCard}>
                    <Text style={styles.resultTitle}>
                      Related AIS Checks ({result.origin_analysis.related_ais_checks.length})
                    </Text>
                    {result.origin_analysis.related_ais_checks.map((check: any, index: number) => (
                      <View key={index} style={styles.aisCheckCard}>
                        <Text style={styles.aisCheckText}>
                          Time: {formatDateTime(check.check_time)}
                        </Text>
                        <Text style={styles.aisCheckText}>
                          Moving: {check.is_moving ? 'Yes' : 'No'}
                        </Text>
                        {check.speed_knots !== null && (
                          <Text style={styles.aisCheckText}>
                            Speed: {check.speed_knots.toFixed(1)} knots
                          </Text>
                        )}
                        {check.latitude !== null && check.longitude !== null && (
                          <Text style={styles.aisCheckText}>
                            Position: {check.latitude.toFixed(4)}, {check.longitude.toFixed(4)}
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {result.origin_analysis.related_scheduled_tasks.length > 0 && (
                  <View style={styles.resultCard}>
                    <Text style={styles.resultTitle}>
                      Scheduled Tasks ({result.origin_analysis.related_scheduled_tasks.length})
                    </Text>
                    {result.origin_analysis.related_scheduled_tasks.map((task: any, index: number) => (
                      <View key={index} style={styles.aisCheckCard}>
                        <Text style={styles.aisCheckText}>
                          Task ID: {task.id}
                        </Text>
                        <Text style={styles.aisCheckText}>
                          Interval: {task.interval_hours} hours
                        </Text>
                        <Text style={styles.aisCheckText}>
                          Active: {task.is_active ? 'Yes' : 'No'}
                        </Text>
                        {task.last_run && (
                          <Text style={styles.aisCheckText}>
                            Last Run: {formatDateTime(task.last_run)}
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {result.origin_analysis.ais_debug_logs.length > 0 && (
                  <View style={styles.resultCard}>
                    <Text style={styles.resultTitle}>
                      AIS Debug Logs ({result.origin_analysis.ais_debug_logs.length})
                    </Text>
                    {result.origin_analysis.ais_debug_logs.map((log: any, index: number) => (
                      <View key={index} style={styles.aisCheckCard}>
                        <Text style={styles.aisCheckText}>
                          Time: {formatDateTime(log.request_time)}
                        </Text>
                        <Text style={styles.aisCheckText}>
                          Status: {log.response_status}
                        </Text>
                        <Text style={styles.aisCheckText}>
                          Auth: {log.authentication_status}
                        </Text>
                        {log.error_message && (
                          <Text style={[styles.aisCheckText, { color: '#FF3B30' }]}>
                            Error: {log.error_message}
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </>
          )}

          {!loading && !result && !error && (
            <Text style={styles.emptyText}>
              Enter details above and tap Investigate to analyze the sea time entry
            </Text>
          )}
        </ScrollView>

        {/* Error Modal - replaces Alert.alert for web compatibility */}
        <Modal
          visible={showErrorModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowErrorModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalContent, { backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF' }]}>
              <Text style={[styles.modalTitle, { color: isDark ? colors.textDark : colors.textLight }]}>
                Error
              </Text>
              <Text style={[styles.modalMessage, { color: isDark ? colors.textDark : colors.textLight }]}>
                {errorMessage}
              </Text>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setShowErrorModal(false)}
              >
                <Text style={styles.modalButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </>
  );
}
