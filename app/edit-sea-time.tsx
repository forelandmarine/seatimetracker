
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  useColorScheme,
  TextInput,
  Platform,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import * as seaTimeApi from '@/utils/seaTimeApi';
import DateTimePicker from '@react-native-community/datetimepicker';

interface Vessel {
  id: string;
  mmsi: string;
  vessel_name: string;
  is_active: boolean;
  created_at: string;
  callsign?: string;
}

interface SeaTimeEntry {
  id: string;
  vessel: Vessel | null;
  start_time: string;
  end_time: string | null;
  duration_hours: number | string | null;
  sea_days: number | null;
  status: 'pending' | 'confirmed' | 'rejected';
  notes: string | null;
  created_at: string;
  start_latitude?: number | string | null;
  start_longitude?: number | string | null;
  end_latitude?: number | string | null;
  end_longitude?: number | string | null;
  service_type?: string | null;
}

type ServiceType = 'seagoing' | 'standby' | 'yard';

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      paddingTop: Platform.OS === 'ios' ? 60 : 48,
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
    },
    backButton: {
      padding: 8,
      marginLeft: -8,
    },
    deleteButton: {
      padding: 8,
      marginRight: -8,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    inputGroup: {
      marginBottom: 20,
    },
    inputLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    inputLabelOptional: {
      fontSize: 13,
      fontWeight: '400',
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    input: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
      color: isDark ? colors.text : colors.textLight,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    pickerButton: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    pickerButtonText: {
      fontSize: 16,
      color: isDark ? colors.text : colors.textLight,
    },
    pickerButtonPlaceholder: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    dateTimeButton: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    dateTimeText: {
      fontSize: 16,
      color: isDark ? colors.text : colors.textLight,
    },
    dateTimePlaceholder: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    mcaButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 12,
      padding: 12,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    mcaButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
      marginLeft: 8,
    },
    serviceTypeContainer: {
      flexDirection: 'row',
      gap: 8,
    },
    serviceTypeButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
      alignItems: 'center',
    },
    serviceTypeButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    serviceTypeText: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    serviceTypeTextActive: {
      color: '#FFFFFF',
    },
    helperText: {
      fontSize: 12,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 6,
      fontStyle: 'italic',
      lineHeight: 16,
    },
    voyageRow: {
      flexDirection: 'row',
      gap: 12,
    },
    voyageColumn: {
      flex: 1,
    },
    divider: {
      height: 1,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      marginVertical: 20,
    },
    saveButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginTop: 20,
    },
    saveButtonDisabled: {
      opacity: 0.5,
    },
    saveButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
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
      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
    },
    modalCloseButton: {
      padding: 4,
    },
    modalBody: {
      maxHeight: 400,
    },
    vesselOption: {
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    vesselOptionLast: {
      borderBottomWidth: 0,
    },
    vesselOptionText: {
      fontSize: 16,
      color: isDark ? colors.text : colors.textLight,
    },
    vesselOptionSubtext: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 4,
    },
    datePickerContainer: {
      padding: 20,
    },
    datePickerButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginTop: 16,
    },
    datePickerButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    emptyState: {
      padding: 40,
      alignItems: 'center',
    },
    emptyStateText: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      textAlign: 'center',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 12,
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    disabledInput: {
      opacity: 0.6,
    },
  });

const formatDateTime = (date: Date | null) => {
  if (!date) return '';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function EditSeaTimeScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const router = useRouter();
  const params = useLocalSearchParams();
  const entryId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entry, setEntry] = useState<SeaTimeEntry | null>(null);
  const [notes, setNotes] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType>('seagoing');
  const [voyageFrom, setVoyageFrom] = useState('');
  const [voyageTo, setVoyageTo] = useState('');

  const loadEntry = useCallback(async () => {
    try {
      console.log('[EditSeaTimeScreen] Fetching entry details');
      setLoading(true);
      const entries = await seaTimeApi.getSeaTimeEntries();
      const foundEntry = entries.find((e) => e.id === entryId);
      
      if (!foundEntry) {
        Alert.alert('Error', 'Sea time entry not found');
        router.back();
        return;
      }

      console.log('[EditSeaTimeScreen] Entry loaded:', foundEntry);
      setEntry(foundEntry);

      const backendToUIServiceType: { [key: string]: ServiceType } = {
        'actual_sea_service': 'seagoing',
        'watchkeeping_service': 'seagoing',
        'standby_service': 'standby',
        'yard_service': 'yard',
        'service_in_port': 'seagoing',
      };
      const uiServiceType = foundEntry.service_type 
        ? (backendToUIServiceType[foundEntry.service_type] || 'seagoing')
        : 'seagoing';
      setServiceType(uiServiceType);
      
      const notesText = foundEntry.notes || '';
      const lines = notesText.split('\n');
      
      let extractedFrom = '';
      let extractedTo = '';
      let remainingNotes: string[] = [];
      
      lines.forEach(line => {
        if (line.startsWith('From:')) {
          extractedFrom = line.replace('From:', '').trim();
        } else if (line.startsWith('To:')) {
          extractedTo = line.replace('To:', '').trim();
        } else if (line.trim()) {
          remainingNotes.push(line);
        }
      });
      
      setVoyageFrom(extractedFrom);
      setVoyageTo(extractedTo);
      setNotes(remainingNotes.join('\n'));
    } catch (error) {
      console.error('[EditSeaTimeScreen] Error loading entry:', error);
      Alert.alert('Error', 'Failed to load sea time entry');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [entryId, router]);

  useEffect(() => {
    console.log('[EditSeaTimeScreen] Component mounted, loading entry:', entryId);
    loadEntry();
  }, [entryId, loadEntry]);

  const handleViewMCARequirements = async () => {
    console.log('[EditSeaTimeScreen] User tapped View MCA Requirements');
    try {
      const userProfile = await seaTimeApi.getUserProfile();
      const department = userProfile?.department?.toLowerCase() || 'deck';
      console.log('[EditSeaTimeScreen] User department:', department);
      router.push(`/mca-requirements?department=${department}`);
    } catch (error) {
      console.error('[EditSeaTimeScreen] Failed to get user profile:', error);
      router.push('/mca-requirements?department=deck');
    }
  };

  const handleSave = async () => {
    console.log('[EditSeaTimeScreen] User tapped Save');
    
    if (!entry) {
      Alert.alert('Error', 'Entry not found');
      return;
    }

    try {
      setSaving(true);

      const serviceTypeMap: { [key: string]: string } = {
        'seagoing': 'actual_sea_service',
        'standby': 'standby_service',
        'yard': 'yard_service',
      };
      const backendServiceType = serviceTypeMap[serviceType] || 'actual_sea_service';

      const voyageFromNote = voyageFrom ? `From: ${voyageFrom}` : '';
      const voyageToNote = voyageTo ? `To: ${voyageTo}` : '';
      
      const noteParts = [voyageFromNote, voyageToNote, notes].filter(Boolean);
      const fullNotes = noteParts.join('\n');

      console.log('[EditSeaTimeScreen] Updating sea time entry');
      await seaTimeApi.updateSeaTimeEntry(entry.id, {
        notes: fullNotes || null,
        service_type: backendServiceType,
      });

      Alert.alert('Success', 'Sea time entry updated successfully', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error: any) {
      console.error('[EditSeaTimeScreen] Error saving entry:', error);
      Alert.alert('Error', error.message || 'Failed to update sea time entry');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!entry) return;

    console.log('[EditSeaTimeScreen] User tapped delete button');
    
    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this sea time entry? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => console.log('[EditSeaTimeScreen] Delete cancelled'),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('[EditSeaTimeScreen] Deleting sea time entry:', entry.id);
              await seaTimeApi.deleteSeaTimeEntry(entry.id);
              Alert.alert('Success', 'Sea time entry deleted successfully', [
                {
                  text: 'OK',
                  onPress: () => router.back(),
                },
              ]);
            } catch (error: any) {
              console.error('[EditSeaTimeScreen] Error deleting entry:', error);
              Alert.alert('Error', error.message || 'Failed to delete sea time entry');
            }
          },
        },
      ]
    );
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

  const mcaButtonText = 'View MCA Requirements';
  const seagoingText = 'Seagoing';
  const standbyText = 'Standby';
  const yardText = 'Yard';
  const standbyHelperText = 'Max 14 consecutive days; cannot exceed previous voyage length';
  const yardHelperText = 'Up to 90 days total (continuous or split)';
  const serviceTypeLabel = 'Service Type';
  const vesselLabel = 'Vessel';
  const startDateLabel = 'Start Date & Time';
  const endDateLabel = 'End Date & Time';
  const voyageLocationsLabel = 'Voyage Locations';
  const voyageHelperText = 'Enter location names or coordinates (e.g., "51.5074, -0.1278")';
  const fromLabel = 'From';
  const fromPlaceholder = 'Port or coordinates';
  const toLabel = 'To';
  const toPlaceholder = 'Port or coordinates';
  const notesLabel = 'Additional Notes';
  const optionalText = '(Optional)';
  const notesPlaceholder = 'Add any notes about this sea time...';
  const saveButtonText = saving ? 'Saving...' : 'Update Entry';
  const loadingText = 'Loading entry...';
  const headerTitleText = 'Edit Sea Time Entry';
  const cannotChangeText = 'Cannot be changed when editing';

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <IconSymbol
                ios_icon_name="chevron.left"
                android_material_icon_name="arrow-back"
                size={24}
                color={colors.primary}
              />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{headerTitleText}</Text>
            <View style={styles.deleteButton} />
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>{loadingText}</Text>
          </View>
        </View>
      </>
    );
  }

  if (!entry) {
    return null;
  }

  const startDateDisplay = `${formatDate(entry.start_time)} at ${formatTime(entry.start_time)}`;
  const endDateDisplay = entry.end_time 
    ? `${formatDate(entry.end_time)} at ${formatTime(entry.end_time)}`
    : 'Not set';

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow-back"
              size={24}
              color={colors.primary}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{headerTitleText}</Text>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <IconSymbol
              ios_icon_name="trash"
              android_material_icon_name="delete"
              size={22}
              color="#FF3B30"
            />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
          bounces={true}
        >
          <TouchableOpacity style={styles.mcaButton} onPress={handleViewMCARequirements}>
            <IconSymbol
              ios_icon_name="info.circle"
              android_material_icon_name="info"
              size={20}
              color={colors.primary}
            />
            <Text style={styles.mcaButtonText}>{mcaButtonText}</Text>
          </TouchableOpacity>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{serviceTypeLabel}</Text>
            <View style={styles.serviceTypeContainer}>
              <TouchableOpacity
                style={[
                  styles.serviceTypeButton,
                  serviceType === 'seagoing' && styles.serviceTypeButtonActive,
                ]}
                onPress={() => setServiceType('seagoing')}
              >
                <Text
                  style={[
                    styles.serviceTypeText,
                    serviceType === 'seagoing' && styles.serviceTypeTextActive,
                  ]}
                >
                  {seagoingText}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.serviceTypeButton,
                  serviceType === 'standby' && styles.serviceTypeButtonActive,
                ]}
                onPress={() => setServiceType('standby')}
              >
                <Text
                  style={[
                    styles.serviceTypeText,
                    serviceType === 'standby' && styles.serviceTypeTextActive,
                  ]}
                >
                  {standbyText}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.serviceTypeButton,
                  serviceType === 'yard' && styles.serviceTypeButtonActive,
                ]}
                onPress={() => setServiceType('yard')}
              >
                <Text
                  style={[
                    styles.serviceTypeText,
                    serviceType === 'yard' && styles.serviceTypeTextActive,
                  ]}
                >
                  {yardText}
                </Text>
              </TouchableOpacity>
            </View>
            {serviceType === 'standby' && (
              <Text style={styles.helperText}>
                {standbyHelperText}
              </Text>
            )}
            {serviceType === 'yard' && (
              <Text style={styles.helperText}>
                {yardHelperText}
              </Text>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{vesselLabel}</Text>
            <View style={[styles.pickerButton, styles.disabledInput]}>
              <Text style={styles.pickerButtonText}>
                {entry.vessel?.vessel_name || 'Unknown Vessel'}
              </Text>
            </View>
            <Text style={styles.helperText}>{cannotChangeText}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{startDateLabel}</Text>
            <View style={[styles.dateTimeButton, styles.disabledInput]}>
              <Text style={styles.dateTimeText}>{startDateDisplay}</Text>
              <IconSymbol
                ios_icon_name="calendar"
                android_material_icon_name="calendar-today"
                size={20}
                color={isDark ? colors.textSecondary : colors.textSecondaryLight}
              />
            </View>
            <Text style={styles.helperText}>{cannotChangeText}</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{endDateLabel}</Text>
            <View style={[styles.dateTimeButton, styles.disabledInput]}>
              <Text style={styles.dateTimeText}>{endDateDisplay}</Text>
              <IconSymbol
                ios_icon_name="calendar"
                android_material_icon_name="calendar-today"
                size={20}
                color={isDark ? colors.textSecondary : colors.textSecondaryLight}
              />
            </View>
            <Text style={styles.helperText}>{cannotChangeText}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.inputGroup}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={styles.inputLabel}>{voyageLocationsLabel}</Text>
              <Text style={styles.inputLabel}>
                <Text style={styles.inputLabelOptional}> {optionalText}</Text>
              </Text>
            </View>
            <Text style={styles.helperText}>
              {voyageHelperText}
            </Text>
          </View>

          <View style={styles.voyageRow}>
            <View style={styles.voyageColumn}>
              <Text style={[styles.inputLabel, { marginBottom: 8 }]}>{fromLabel}</Text>
              <TextInput
                style={styles.input}
                placeholder={fromPlaceholder}
                placeholderTextColor={
                  isDark ? colors.textSecondary : colors.textSecondaryLight
                }
                value={voyageFrom}
                onChangeText={setVoyageFrom}
              />
            </View>
            <View style={styles.voyageColumn}>
              <Text style={[styles.inputLabel, { marginBottom: 8 }]}>{toLabel}</Text>
              <TextInput
                style={styles.input}
                placeholder={toPlaceholder}
                placeholderTextColor={
                  isDark ? colors.textSecondary : colors.textSecondaryLight
                }
                value={voyageTo}
                onChangeText={setVoyageTo}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={styles.inputLabel}>{notesLabel}</Text>
              <Text style={styles.inputLabel}>
                <Text style={styles.inputLabelOptional}> {optionalText}</Text>
              </Text>
            </View>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
              placeholder={notesPlaceholder}
              placeholderTextColor={
                isDark ? colors.textSecondary : colors.textSecondaryLight
              }
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
            />
          </View>

          <TouchableOpacity 
            style={[styles.saveButton, saving && styles.saveButtonDisabled]} 
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>{saveButtonText}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </>
  );
}
