
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  useColorScheme,
  Modal,
} from 'react-native';
import { Stack } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { API_BASE_URL, getApiHeaders } from '@/utils/seaTimeApi';

interface User {
  id: string;
  email: string;
  name: string;
}

interface Vessel {
  id: string;
  mmsi: string;
  vessel_name: string;
  is_active: boolean;
}

interface SeaTimeEntry {
  id: string;
  start_time: string;
  end_time: string | null;
  duration_hours: number | null;
  status: 'pending' | 'confirmed' | 'rejected';
  notes: string | null;
  created_at: string;
  start_latitude: number | null;
  start_longitude: number | null;
  end_latitude: number | null;
  end_longitude: number | null;
}

interface Summary {
  totalEntries: number;
  pendingEntries: number;
  confirmedEntries: number;
  rejectedEntries: number;
  totalConfirmedHours: number;
  totalConfirmedDays: number;
}

interface VerificationResult {
  user: User;
  vessel: Vessel | null;
  seaTimeEntries: SeaTimeEntry[];
  summary: Summary;
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : '#f5f5f5',
    },
    content: {
      padding: 20,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 20,
    },
    inputGroup: {
      marginBottom: 15,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 5,
    },
    input: {
      backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: colors.text,
      borderWidth: 1,
      borderColor: isDark ? '#444' : '#ddd',
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 15,
      alignItems: 'center',
      marginTop: 10,
    },
    buttonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    resultContainer: {
      marginTop: 30,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 10,
      marginTop: 20,
    },
    card: {
      backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
      borderRadius: 12,
      padding: 15,
      marginBottom: 15,
      borderWidth: 1,
      borderColor: isDark ? '#444' : '#e0e0e0',
    },
    row: {
      flexDirection: 'row',
      marginBottom: 8,
    },
    rowLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      width: 120,
    },
    rowValue: {
      fontSize: 14,
      color: colors.text,
      flex: 1,
    },
    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      alignSelf: 'flex-start',
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#ffffff',
    },
    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    summaryCard: {
      backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
      borderRadius: 12,
      padding: 15,
      flex: 1,
      minWidth: '45%',
      borderWidth: 1,
      borderColor: isDark ? '#444' : '#e0e0e0',
    },
    summaryValue: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.primary,
      marginBottom: 5,
    },
    summaryLabel: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    noDataText: {
      fontSize: 14,
      color: colors.textSecondary,
      fontStyle: 'italic',
      textAlign: 'center',
      marginTop: 20,
    },
    errorText: {
      fontSize: 14,
      color: '#ff4444',
      textAlign: 'center',
      marginTop: 20,
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

export default function AdminVerifyScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);

  const [email, setEmail] = useState('macnally@me.com');
  const [mmsi, setMmsi] = useState('352978169');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifyTasksLoading, setVerifyTasksLoading] = useState(false);
  const [verifyTasksResult, setVerifyTasksResult] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalType, setModalType] = useState<'success' | 'error'>('success');
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [diagnosisResult, setDiagnosisResult] = useState<any>(null);
  const [fixLoading, setFixLoading] = useState(false);

  console.log('[AdminVerify] Screen rendered');

  const showModalMessage = (title: string, message: string, type: 'success' | 'error' = 'success') => {
    setModalTitle(title);
    setModalMessage(message);
    setModalType(type);
    setShowModal(true);
  };

  const handleVerify = async () => {
    console.log('[AdminVerify] User tapped Verify button', { email, mmsi });
    
    if (!email || !mmsi) {
      showModalMessage('Error', 'Please enter both email and MMSI', 'error');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      console.log('[AdminVerify] Calling admin verification endpoint');
      
      const headers = await getApiHeaders();
      const response = await fetch(
        `${API_BASE_URL}/api/admin/verify-sea-time?email=${encodeURIComponent(email)}&mmsi=${encodeURIComponent(mmsi)}`,
        { headers }
      );

      console.log('[AdminVerify] Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to verify');
      }

      const data = await response.json();
      console.log('[AdminVerify] Verification data received');
      setResult(data);
    } catch (err: any) {
      console.error('[AdminVerify] Verification error:', err);
      const message = err.message || 'Failed to verify sea time data';
      setError(message);
      showModalMessage('Error', message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyVesselTasks = async () => {
    console.log('[AdminVerify] User tapped Verify Vessel Tasks button');
    
    setVerifyTasksLoading(true);
    setVerifyTasksResult(null);

    try {
      console.log('[AdminVerify] Calling verify vessel tasks endpoint');
      
      const headers = await getApiHeaders();
      const response = await fetch(
        `${API_BASE_URL}/api/admin/verify-vessel-tasks`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        }
      );

      console.log('[AdminVerify] Verify vessel tasks response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to verify vessel tasks');
      }

      const data = await response.json();
      console.log('[AdminVerify] Verify vessel tasks data received');
      setVerifyTasksResult(data);
      
      const message = `Verification complete!\n\nActive vessels: ${data.summary?.total_active_vessels || 0}\nTasks created: ${data.summary?.tasks_created || 0}\nTasks reactivated: ${data.summary?.tasks_reactivated || 0}\nAlready active: ${data.summary?.tasks_already_active || 0}`;
      showModalMessage('Success', message, 'success');
    } catch (err: any) {
      console.error('[AdminVerify] Verify vessel tasks error:', err);
      showModalMessage('Error', err.message || 'Failed to verify vessel tasks', 'error');
    } finally {
      setVerifyTasksLoading(false);
    }
  };

  const handleDiagnoseWorkflow = async () => {
    console.log('[AdminVerify] User tapped Diagnose Workflow button', { email, mmsi });
    
    if (!email || !mmsi) {
      showModalMessage('Error', 'Please enter both email and MMSI', 'error');
      return;
    }

    setDiagnosisLoading(true);
    setDiagnosisResult(null);

    try {
      console.log('[AdminVerify] Calling diagnose vessel workflow endpoint');
      
      const headers = await getApiHeaders();
      const response = await fetch(
        `${API_BASE_URL}/api/admin/diagnose-vessel-workflow?email=${encodeURIComponent(email)}&mmsi=${encodeURIComponent(mmsi)}`,
        { headers }
      );

      console.log('[AdminVerify] Diagnose workflow response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to diagnose workflow');
      }

      const data = await response.json();
      console.log('[AdminVerify] Diagnosis data received:', data);
      setDiagnosisResult(data);
      
      if (data.workflow_status === 'OK') {
        showModalMessage('Success', 'Workflow is configured correctly!', 'success');
      } else {
        showModalMessage('Issues Found', data.workflow_status, 'error');
      }
    } catch (err: any) {
      console.error('[AdminVerify] Diagnose workflow error:', err);
      showModalMessage('Error', err.message || 'Failed to diagnose workflow', 'error');
    } finally {
      setDiagnosisLoading(false);
    }
  };

  const handleFixWorkflow = async () => {
    console.log('[AdminVerify] User tapped Fix Workflow button', { email, mmsi });
    
    if (!email || !mmsi) {
      showModalMessage('Error', 'Please enter both email and MMSI', 'error');
      return;
    }

    setFixLoading(true);

    try {
      console.log('[AdminVerify] Calling fix vessel workflow endpoint');
      
      const headers = await getApiHeaders();
      const response = await fetch(
        `${API_BASE_URL}/api/admin/fix-vessel-workflow`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ email, mmsi }),
        }
      );

      console.log('[AdminVerify] Fix workflow response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fix workflow');
      }

      const data = await response.json();
      console.log('[AdminVerify] Fix workflow data received:', data);
      
      const actionsText = data.actions_taken.join('\n');
      showModalMessage('Success', `Workflow fixed!\n\n${actionsText}`, 'success');
      
      // Refresh diagnosis after fix
      setTimeout(() => {
        handleDiagnoseWorkflow();
      }, 1000);
    } catch (err: any) {
      console.error('[AdminVerify] Fix workflow error:', err);
      showModalMessage('Error', err.message || 'Failed to fix workflow', 'error');
    } finally {
      setFixLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return '#4CAF50';
      case 'pending':
        return '#FF9800';
      case 'rejected':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Admin Verification',
          headerStyle: {
            backgroundColor: isDark ? colors.background : '#ffffff',
          },
          headerTintColor: colors.text,
        }}
      />

      <ScrollView style={styles.content}>
        <Text style={styles.title}>Admin Tools</Text>

        {/* Verify Vessel Tasks Section */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Verify Vessel Tasks</Text>
          <Text style={[styles.rowValue, { marginBottom: 15 }]}>
            Check all active vessels have scheduled tracking tasks and create missing tasks.
          </Text>
          
          <TouchableOpacity
            style={styles.button}
            onPress={handleVerifyVesselTasks}
            disabled={verifyTasksLoading}
          >
            {verifyTasksLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Verify Vessel Tasks</Text>
            )}
          </TouchableOpacity>

          {verifyTasksResult && (
            <View style={{ marginTop: 15 }}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Active Vessels:</Text>
                <Text style={styles.rowValue}>{verifyTasksResult.activeVessels}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Tasks Created:</Text>
                <Text style={styles.rowValue}>{verifyTasksResult.tasksCreated}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Already Had Tasks:</Text>
                <Text style={styles.rowValue}>{verifyTasksResult.alreadyHadTasks}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Diagnose & Fix Workflow Section */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Diagnose & Fix Workflow</Text>
          <Text style={[styles.rowValue, { marginBottom: 15 }]}>
            Diagnose why a specific vessel isn't creating sea time entries and fix the workflow.
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>User Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter user email"
              placeholderTextColor={colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Vessel MMSI</Text>
            <TextInput
              style={styles.input}
              value={mmsi}
              onChangeText={setMmsi}
              placeholder="Enter vessel MMSI"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
            />
          </View>

          <TouchableOpacity
            style={styles.button}
            onPress={handleDiagnoseWorkflow}
            disabled={diagnosisLoading}
          >
            {diagnosisLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Diagnose Workflow</Text>
            )}
          </TouchableOpacity>

          {diagnosisResult && (
            <View style={{ marginTop: 15 }}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>User ID:</Text>
                <Text style={styles.rowValue}>{diagnosisResult.user?.id || 'N/A'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Vessel ID:</Text>
                <Text style={styles.rowValue}>{diagnosisResult.vessel?.id || 'N/A'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Vessel Active:</Text>
                <Text style={styles.rowValue}>{diagnosisResult.vessel?.is_active ? 'Yes' : 'No'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Task Active:</Text>
                <Text style={styles.rowValue}>{diagnosisResult.scheduled_task?.is_active ? 'Yes' : 'No'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>AIS Checks:</Text>
                <Text style={styles.rowValue}>{diagnosisResult.recent_ais_checks?.length || 0}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Sea Time Entries:</Text>
                <Text style={styles.rowValue}>{diagnosisResult.sea_time_entries?.length || 0}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Status:</Text>
                <Text style={[styles.rowValue, { color: diagnosisResult.workflow_status === 'OK' ? '#4CAF50' : '#F44336' }]}>
                  {diagnosisResult.workflow_status}
                </Text>
              </View>
            </View>
          )}

          {diagnosisResult && diagnosisResult.workflow_status !== 'OK' && (
            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#FF9800', marginTop: 10 }]}
              onPress={handleFixWorkflow}
              disabled={fixLoading}
            >
              {fixLoading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>Fix Workflow</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Verify Sea Time Data Section */}
        <Text style={styles.title}>Verify Sea Time Data</Text>

        <TouchableOpacity
          style={styles.button}
          onPress={handleVerify}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Verify Sea Time</Text>
          )}
        </TouchableOpacity>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {result && (
          <View style={styles.resultContainer}>
            {/* User Info */}
            <Text style={styles.sectionTitle}>User Information</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Name:</Text>
                <Text style={styles.rowValue}>{result.user.name}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Email:</Text>
                <Text style={styles.rowValue}>{result.user.email}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>User ID:</Text>
                <Text style={styles.rowValue}>{result.user.id}</Text>
              </View>
            </View>

            {/* Vessel Info */}
            <Text style={styles.sectionTitle}>Vessel Information</Text>
            {result.vessel ? (
              <View style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Vessel Name:</Text>
                  <Text style={styles.rowValue}>{result.vessel.vessel_name}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>MMSI:</Text>
                  <Text style={styles.rowValue}>{result.vessel.mmsi}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Status:</Text>
                  <Text style={styles.rowValue}>
                    {result.vessel.is_active ? 'Active' : 'Inactive'}
                  </Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Vessel ID:</Text>
                  <Text style={styles.rowValue}>{result.vessel.id}</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.noDataText}>
                User is not tracking this MMSI
              </Text>
            )}

            {/* Summary */}
            <Text style={styles.sectionTitle}>Summary</Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{result.summary.totalEntries}</Text>
                <Text style={styles.summaryLabel}>Total Entries</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{result.summary.confirmedEntries}</Text>
                <Text style={styles.summaryLabel}>Confirmed</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{result.summary.pendingEntries}</Text>
                <Text style={styles.summaryLabel}>Pending</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{result.summary.rejectedEntries}</Text>
                <Text style={styles.summaryLabel}>Rejected</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>
                  {result.summary.totalConfirmedDays.toFixed(1)}
                </Text>
                <Text style={styles.summaryLabel}>Confirmed Days</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryValue}>
                  {result.summary.totalConfirmedHours.toFixed(1)}
                </Text>
                <Text style={styles.summaryLabel}>Confirmed Hours</Text>
              </View>
            </View>

            {/* Sea Time Entries */}
            <Text style={styles.sectionTitle}>
              Sea Time Entries ({result.seaTimeEntries.length})
            </Text>
            {result.seaTimeEntries.length > 0 ? (
              result.seaTimeEntries.map((entry) => (
                <View key={entry.id} style={styles.card}>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Status:</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor(entry.status) },
                      ]}
                    >
                      <Text style={styles.statusText}>
                        {entry.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Start:</Text>
                    <Text style={styles.rowValue}>
                      {formatDateTime(entry.start_time)}
                    </Text>
                  </View>
                  {entry.end_time && (
                    <View style={styles.row}>
                      <Text style={styles.rowLabel}>End:</Text>
                      <Text style={styles.rowValue}>
                        {formatDateTime(entry.end_time)}
                      </Text>
                    </View>
                  )}
                  {entry.duration_hours !== null && (
                    <View style={styles.row}>
                      <Text style={styles.rowLabel}>Duration:</Text>
                      <Text style={styles.rowValue}>
                        {entry.duration_hours.toFixed(1)} hours (
                        {(entry.duration_hours / 24).toFixed(1)} days)
                      </Text>
                    </View>
                  )}
                  {entry.notes && (
                    <View style={styles.row}>
                      <Text style={styles.rowLabel}>Notes:</Text>
                      <Text style={styles.rowValue}>{entry.notes}</Text>
                    </View>
                  )}
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Created:</Text>
                    <Text style={styles.rowValue}>
                      {formatDate(entry.created_at)}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.noDataText}>No sea time entries found</Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* Modal for messages - replaces Alert.alert for web compatibility */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF' }]}>
            <Text style={[styles.modalTitle, { color: isDark ? colors.text : colors.text }]}>
              {modalTitle}
            </Text>
            <Text style={[styles.modalMessage, { color: isDark ? colors.text : colors.text }]}>
              {modalMessage}
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: modalType === 'error' ? '#FF3B30' : colors.primary }]}
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
