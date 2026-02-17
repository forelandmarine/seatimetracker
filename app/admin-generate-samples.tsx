
import { IconSymbol } from '@/components/IconSymbol';
import React, { useState } from 'react';
import { colors } from '@/styles/commonStyles';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  useColorScheme,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { generateDemoEntries } from '@/utils/seaTimeApi';

interface GeneratedEntry {
  id: string;
  start_time: string;
  end_time: string | null;
  duration_hours: number | null;
  sea_days: number | null;
  status: string;
  notes: string;
}

interface GenerateResponse {
  success: boolean;
  message: string;
  vessel: {
    id: string;
    vessel_name: string;
    mmsi: string;
  };
  entries: GeneratedEntry[];
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.backgroundDark : colors.backgroundLight,
    },
    scrollContent: {
      padding: 20,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: isDark ? colors.textDark : colors.textLight,
      marginBottom: 10,
    },
    subtitle: {
      fontSize: 14,
      color: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
      marginBottom: 30,
    },
    inputGroup: {
      marginBottom: 20,
    },
    label: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.textDark : colors.textLight,
      marginBottom: 8,
    },
    input: {
      backgroundColor: isDark ? colors.cardDark : colors.cardLight,
      borderRadius: 12,
      padding: 16,
      fontSize: 16,
      color: isDark ? colors.textDark : colors.textLight,
      borderWidth: 1,
      borderColor: isDark ? colors.borderDark : colors.borderLight,
    },
    generateButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginTop: 10,
      marginBottom: 30,
    },
    generateButtonDisabled: {
      opacity: 0.5,
    },
    generateButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    resultCard: {
      backgroundColor: isDark ? colors.cardDark : colors.cardLight,
      borderRadius: 12,
      padding: 16,
      marginBottom: 20,
    },
    resultTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: isDark ? colors.textDark : colors.textLight,
      marginBottom: 10,
    },
    resultText: {
      fontSize: 14,
      color: isDark ? colors.textDark : colors.textLight,
      marginBottom: 6,
    },
    entryCard: {
      backgroundColor: isDark ? colors.backgroundDark : colors.backgroundLight,
      borderRadius: 8,
      padding: 12,
      marginTop: 10,
      borderWidth: 1,
      borderColor: isDark ? colors.borderDark : colors.borderLight,
    },
    entryText: {
      fontSize: 12,
      color: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
      marginBottom: 4,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      alignSelf: 'flex-start',
      marginTop: 4,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#FFFFFF',
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

export default function AdminGenerateSamplesScreen() {
  console.log('AdminGenerateSamplesScreen: Screen loaded');
  
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);

  const [email, setEmail] = useState('jack@forelandmarine.com');
  const [count, setCount] = useState('43');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
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

  const handleGenerate = async () => {
    console.log('[AdminGenerate] User tapped Generate Demo Entries button', { email, count });
    
    if (!email) {
      showModalMessage('Error', 'Please enter an email address', 'error');
      return;
    }

    const entryCount = parseInt(count, 10);
    if (isNaN(entryCount) || entryCount < 1 || entryCount > 100) {
      showModalMessage('Error', 'Please enter a valid count between 1 and 100', 'error');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      console.log('[AdminGenerate] Calling generateDemoEntries API');
      const data = await generateDemoEntries(email, entryCount);
      console.log('[AdminGenerate] Response:', data);

      setResult(data);
      const entriesCount = data.entries?.length || data.entriesCreated || 0;
      const totalSeaDays = data.entries?.reduce((sum: number, entry: any) => sum + (entry.sea_days || 0), 0) || 0;
      
      showModalMessage(
        'Success',
        `Generated ${entriesCount} demo entries for ${email}\n\nTotal Sea Days: ${totalSeaDays}`,
        'success'
      );
    } catch (error) {
      console.error('[AdminGenerate] Error generating demo entries:', error);
      showModalMessage('Error', error instanceof Error ? error.message : 'Failed to generate demo entries', 'error');
    } finally {
      setLoading(false);
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

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return colors.success;
      case 'pending':
        return colors.warning;
      case 'rejected':
        return colors.error;
      default:
        return colors.textSecondaryDark;
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          title: 'Generate Sample Data',
          headerStyle: {
            backgroundColor: isDark ? colors.backgroundDark : colors.backgroundLight,
          },
          headerTintColor: isDark ? colors.textDark : colors.textLight,
          headerShadowVisible: false,
        }}
      />
      
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Generate Demo Sea Time Entries</Text>
        <Text style={styles.subtitle}>
          Create demo sea time entries for testing purposes. This will create a demo vessel and generate entries spread over the past 12 months.
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>User Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="jack@forelandmarine.com"
            placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondaryLight}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Number of Entries (1-100)</Text>
          <TextInput
            style={styles.input}
            value={count}
            onChangeText={setCount}
            placeholder="43"
            placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondaryLight}
            keyboardType="number-pad"
            editable={!loading}
          />
        </View>

        <TouchableOpacity
          style={[styles.generateButton, loading && styles.generateButtonDisabled]}
          onPress={handleGenerate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.generateButtonText}>Generate Demo Entries</Text>
          )}
        </TouchableOpacity>

        {result && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>✅ {result.message}</Text>
            {result.vessel && (
              <>
                <Text style={styles.resultText}>
                  <Text style={{ fontWeight: '600' }}>Vessel:</Text> {result.vessel.vessel_name}
                </Text>
                <Text style={styles.resultText}>
                  <Text style={{ fontWeight: '600' }}>MMSI:</Text> {result.vessel.mmsi}
                </Text>
              </>
            )}
            <Text style={styles.resultText}>
              <Text style={{ fontWeight: '600' }}>Entries Created:</Text> {result.entries?.length || result.entriesCreated || 0}
            </Text>
            {result.entries && result.entries.length > 0 && (
              <Text style={styles.resultText}>
                <Text style={{ fontWeight: '600' }}>Total Sea Days:</Text> {result.entries.reduce((sum: number, entry: any) => sum + (entry.sea_days || 0), 0)}
              </Text>
            )}

            {result.entries && result.entries.map((entry, index) => {
              const durationHours = typeof entry.duration_hours === 'number' 
                ? entry.duration_hours 
                : parseFloat(entry.duration_hours || '0');
              
              return (
                <View key={entry.id} style={styles.entryCard}>
                  <Text style={[styles.entryText, { fontWeight: '600' }]}>
                    Entry {index + 1}
                  </Text>
                  <Text style={styles.entryText}>
                    {formatDate(entry.start_time)} {formatTime(entry.start_time)}
                    {entry.end_time && ` → ${formatTime(entry.end_time)}`}
                  </Text>
                  <Text style={styles.entryText}>
                    Duration: {durationHours.toFixed(1)} hours | Sea Days: {entry.sea_days || 0}
                  </Text>
                  <Text style={styles.entryText} numberOfLines={2}>
                    Notes: {entry.notes}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(entry.status) }]}>
                    <Text style={styles.statusText}>{entry.status.toUpperCase()}</Text>
                  </View>
                </View>
              );
            })}
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
          <View style={[styles.modalContent, { backgroundColor: isDark ? colors.cardDark : colors.cardLight }]}>
            <Text style={[styles.modalTitle, { color: isDark ? colors.textDark : colors.textLight }]}>
              {modalTitle}
            </Text>
            <Text style={[styles.modalMessage, { color: isDark ? colors.textDark : colors.textLight }]}>
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
    </KeyboardAvoidingView>
  );
}
