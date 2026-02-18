
import React, { useState, useEffect } from 'react';
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
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import * as seaTimeApi from '@/utils/seaTimeApi';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSubscriptionEnforcement } from '@/hooks/useSubscriptionEnforcement';

interface Vessel {
  id: string;
  mmsi: string;
  vessel_name: string;
  is_active: boolean;
  created_at: string;
  callsign?: string;
}

type ServiceType = 'seagoing' | 'watchkeeping' | 'standby' | 'yard';

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
    headerRight: {
      width: 40,
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
      flexWrap: 'wrap',
      gap: 8,
    },
    serviceTypeButton: {
      flex: 1,
      minWidth: '45%',
      paddingVertical: 12,
      paddingHorizontal: 8,
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
      fontSize: 13,
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

export default function AddSeaTimeScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const router = useRouter();
  const { handleSubscriptionError, requireSubscription } = useSubscriptionEnforcement();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType>('seagoing');
  const [voyageFrom, setVoyageFrom] = useState('');
  const [voyageTo, setVoyageTo] = useState('');
  const [showVesselPicker, setShowVesselPicker] = useState(false);

  useEffect(() => {
    console.log('[AddSeaTimeScreen] Component mounted');
    loadVessels();
  }, []);

  const loadVessels = async () => {
    try {
      console.log('[AddSeaTimeScreen] Loading vessels');
      setLoading(true);
      const vesselsData = await seaTimeApi.getVessels();
      console.log('[AddSeaTimeScreen] Loaded vessels:', vesselsData.length);
      setVessels(vesselsData);
    } catch (error) {
      console.error('[AddSeaTimeScreen] Error loading vessels:', error);
      Alert.alert('Error', 'Failed to load vessels');
    } finally {
      setLoading(false);
    }
  };

  const handleViewMCARequirements = async () => {
    console.log('[AddSeaTimeScreen] User tapped View MCA Requirements');
    try {
      const userProfile = await seaTimeApi.getUserProfile();
      const department = userProfile?.department?.toLowerCase() || 'deck';
      console.log('[AddSeaTimeScreen] User department:', department);
      router.push(`/mca-requirements?department=${department}`);
    } catch (error) {
      console.error('[AddSeaTimeScreen] Failed to get user profile:', error);
      router.push('/mca-requirements?department=deck');
    }
  };

  const parseLatLong = (text: string): { lat: number | null; lon: number | null } => {
    const coordPattern = /(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)/;
    const match = text.match(coordPattern);
    
    if (match) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      
      if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        return { lat, lon };
      }
    }
    
    return { lat: null, lon: null };
  };

  const handleSave = async () => {
    console.log('[AddSeaTimeScreen] User tapped Save');
    
    if (!selectedVessel) {
      Alert.alert('Error', 'Please select a vessel');
      return;
    }
    
    if (!startDate) {
      Alert.alert('Error', 'Please select a start date and time');
      return;
    }

    if (endDate && endDate <= startDate) {
      Alert.alert('Error', 'End date must be after start date');
      return;
    }

    // Check subscription before creating manual entry
    if (!requireSubscription('manual sea time entry creation')) {
      return;
    }

    try {
      setSaving(true);
      const fromCoords = parseLatLong(voyageFrom);
      const toCoords = parseLatLong(voyageTo);

      const serviceTypeMap: { [key: string]: string } = {
        'seagoing': 'actual_sea_service',
        'watchkeeping': 'watchkeeping_service',
        'standby': 'standby_service',
        'yard': 'yard_service',
      };
      const backendServiceType = serviceTypeMap[serviceType] || 'actual_sea_service';

      const voyageFromNote = voyageFrom ? `From: ${voyageFrom}` : '';
      const voyageToNote = voyageTo ? `To: ${voyageTo}` : '';
      
      const noteParts = [voyageFromNote, voyageToNote, notes].filter(Boolean);
      const fullNotes = noteParts.join('\n');

      console.log('[AddSeaTimeScreen] Creating manual sea time entry');
      await seaTimeApi.createManualSeaTimeEntry({
        vessel_id: selectedVessel.id,
        start_time: startDate.toISOString(),
        end_time: endDate?.toISOString() || null,
        notes: fullNotes || null,
        start_latitude: fromCoords.lat,
        start_longitude: fromCoords.lon,
        end_latitude: toCoords.lat,
        end_longitude: toCoords.lon,
        service_type: backendServiceType,
      });

      Alert.alert('Success', 'Sea time entry added successfully', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error: any) {
      console.error('[AddSeaTimeScreen] Error saving entry:', error);
      
      // Check if it's a subscription error
      if (handleSubscriptionError(error)) {
        return;
      }
      
      Alert.alert('Error', error.message || 'Failed to save sea time entry');
    } finally {
      setSaving(false);
    }
  };

  const mcaButtonText = 'View MCA Requirements';
  const seagoingText = 'Seagoing';
  const watchkeepingText = 'Watchkeeping';
  const standbyText = 'Standby';
  const yardText = 'Yard';
  const watchkeepingHelperText = 'Every 4 hours = 1 day, cumulative allowed. Cannot exceed days at sea.';
  const standbyHelperText = 'Max 14 consecutive days; cannot exceed previous voyage length';
  const yardHelperText = 'Up to 90 days total (continuous or split)';
  const serviceTypeLabel = 'Service Type';
  const vesselLabel = 'Vessel';
  const selectVesselPlaceholder = 'Select a vessel';
  const startDateLabel = 'Start Date & Time';
  const startDatePlaceholder = 'Select start date & time';
  const endDateLabel = 'End Date & Time';
  const optionalText = '(Optional)';
  const endDatePlaceholder = 'Select end date & time';
  const voyageLocationsLabel = 'Voyage Locations';
  const voyageHelperText = 'Enter location names or coordinates (e.g., "51.5074, -0.1278")';
  const fromLabel = 'From';
  const fromPlaceholder = 'Port or coordinates';
  const toLabel = 'To';
  const toPlaceholder = 'Port or coordinates';
  const notesLabel = 'Additional Notes';
  const notesPlaceholder = 'Add any notes about this sea time...';
  const saveButtonText = saving ? 'Saving...' : 'Save Entry';
  const noVesselsText = 'No vessels available';
  const noVesselsSubtext = 'Add a vessel first from the Home tab';
  const selectVesselTitle = 'Select Vessel';
  const startDatePickerTitle = 'Select Start Date & Time';
  const endDatePickerTitle = 'Select End Date & Time';
  const doneButtonText = 'Done';
  const loadingText = 'Loading vessels...';
  const headerTitleText = 'Add Sea Time Entry';
  const backButtonLabel = 'Back';

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
            <View style={styles.headerRight} />
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>{loadingText}</Text>
          </View>
        </View>
      </>
    );
  }

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
          <View style={styles.headerRight} />
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
                  serviceType === 'watchkeeping' && styles.serviceTypeButtonActive,
                ]}
                onPress={() => setServiceType('watchkeeping')}
              >
                <Text
                  style={[
                    styles.serviceTypeText,
                    serviceType === 'watchkeeping' && styles.serviceTypeTextActive,
                  ]}
                >
                  {watchkeepingText}
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
            {serviceType === 'watchkeeping' && (
              <Text style={styles.helperText}>
                {watchkeepingHelperText}
              </Text>
            )}
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
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => {
                console.log('[AddSeaTimeScreen] User tapped vessel picker');
                setShowVesselPicker(true);
              }}
            >
              <Text
                style={
                  selectedVessel
                    ? styles.pickerButtonText
                    : styles.pickerButtonPlaceholder
                }
              >
                {selectedVessel ? selectedVessel.vessel_name : selectVesselPlaceholder}
              </Text>
              <IconSymbol
                ios_icon_name="chevron.down"
                android_material_icon_name="arrow-drop-down"
                size={20}
                color={isDark ? colors.textSecondary : colors.textSecondaryLight}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{startDateLabel}</Text>
            <TouchableOpacity
              style={styles.dateTimeButton}
              onPress={() => {
                console.log('[AddSeaTimeScreen] User tapped start date/time');
                setShowStartDatePicker(true);
              }}
            >
              <Text style={startDate ? styles.dateTimeText : styles.dateTimePlaceholder}>
                {startDate ? formatDateTime(startDate) : startDatePlaceholder}
              </Text>
              <IconSymbol
                ios_icon_name="calendar"
                android_material_icon_name="calendar-today"
                size={20}
                color={isDark ? colors.textSecondary : colors.textSecondaryLight}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={styles.inputLabel}>{endDateLabel}</Text>
              <Text style={styles.inputLabel}>
                <Text style={styles.inputLabelOptional}> {optionalText}</Text>
              </Text>
            </View>
            <TouchableOpacity
              style={styles.dateTimeButton}
              onPress={() => {
                console.log('[AddSeaTimeScreen] User tapped end date/time');
                setShowEndDatePicker(true);
              }}
            >
              <Text style={endDate ? styles.dateTimeText : styles.dateTimePlaceholder}>
                {endDate ? formatDateTime(endDate) : endDatePlaceholder}
              </Text>
              <IconSymbol
                ios_icon_name="calendar"
                android_material_icon_name="calendar-today"
                size={20}
                color={isDark ? colors.textSecondary : colors.textSecondaryLight}
              />
            </TouchableOpacity>
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

        <Modal
          visible={showVesselPicker}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowVesselPicker(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowVesselPicker(false)}
          >
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{selectVesselTitle}</Text>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setShowVesselPicker(false)}
                >
                  <IconSymbol
                    ios_icon_name="xmark"
                    android_material_icon_name="close"
                    size={24}
                    color={isDark ? colors.text : colors.textLight}
                  />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBody}>
                {vessels.length > 0 ? (
                  vessels.map((vessel, index) => {
                    const vesselName = vessel.vessel_name;
                    const mmsiText = `MMSI: ${vessel.mmsi}`;
                    const callsignText = vessel.callsign ? ` • Call Sign: ${vessel.callsign}` : '';
                    const subtextDisplay = mmsiText + callsignText;
                    
                    return (
                      <TouchableOpacity
                        key={vessel.id}
                        style={[
                          styles.vesselOption,
                          index === vessels.length - 1 && styles.vesselOptionLast,
                        ]}
                        onPress={() => {
                          console.log('[AddSeaTimeScreen] User selected vessel:', vessel.vessel_name);
                          setSelectedVessel(vessel);
                          setShowVesselPicker(false);
                        }}
                      >
                        <Text style={styles.vesselOptionText}>{vesselName}</Text>
                        <Text style={styles.vesselOptionSubtext}>
                          {subtextDisplay}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>{noVesselsText}</Text>
                    <Text style={styles.emptyStateText}>{noVesselsSubtext}</Text>
                  </View>
                )}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        {showStartDatePicker && Platform.OS === 'ios' && (
          <Modal
            visible={showStartDatePicker}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowStartDatePicker(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setShowStartDatePicker(false)}
            >
              <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{startDatePickerTitle}</Text>
                  <TouchableOpacity
                    style={styles.modalCloseButton}
                    onPress={() => setShowStartDatePicker(false)}
                  >
                    <IconSymbol
                      ios_icon_name="xmark"
                      android_material_icon_name="close"
                      size={24}
                      color={isDark ? colors.text : colors.textLight}
                    />
                  </TouchableOpacity>
                </View>
                <View style={styles.datePickerContainer}>
                  <DateTimePicker
                    value={startDate || new Date()}
                    mode="datetime"
                    display="spinner"
                    onChange={(event, selectedDate) => {
                      if (selectedDate) {
                        console.log('[AddSeaTimeScreen] Start date selected:', selectedDate);
                        setStartDate(selectedDate);
                      }
                    }}
                    textColor={isDark ? colors.text : colors.textLight}
                  />
                  <TouchableOpacity
                    style={styles.datePickerButton}
                    onPress={() => setShowStartDatePicker(false)}
                  >
                    <Text style={styles.datePickerButtonText}>{doneButtonText}</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        )}

        {showEndDatePicker && Platform.OS === 'ios' && (
          <Modal
            visible={showEndDatePicker}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowEndDatePicker(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setShowEndDatePicker(false)}
            >
              <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{endDatePickerTitle}</Text>
                  <TouchableOpacity
                    style={styles.modalCloseButton}
                    onPress={() => setShowEndDatePicker(false)}
                  >
                    <IconSymbol
                      ios_icon_name="xmark"
                      android_material_icon_name="close"
                      size={24}
                      color={isDark ? colors.text : colors.textLight}
                    />
                  </TouchableOpacity>
                </View>
                <View style={styles.datePickerContainer}>
                  <DateTimePicker
                    value={endDate || new Date()}
                    mode="datetime"
                    display="spinner"
                    onChange={(event, selectedDate) => {
                      if (selectedDate) {
                        console.log('[AddSeaTimeScreen] End date selected:', selectedDate);
                        setEndDate(selectedDate);
                      }
                    }}
                    textColor={isDark ? colors.text : colors.textLight}
                  />
                  <TouchableOpacity
                    style={styles.datePickerButton}
                    onPress={() => setShowEndDatePicker(false)}
                  >
                    <Text style={styles.datePickerButtonText}>{doneButtonText}</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        )}

        {showStartDatePicker && Platform.OS !== 'ios' && (
          <DateTimePicker
            value={startDate || new Date()}
            mode="date"
            display="default"
            onChange={(event, selectedDate) => {
              setShowStartDatePicker(false);
              if (selectedDate) {
                const newDate = startDate ? new Date(startDate) : new Date();
                newDate.setFullYear(selectedDate.getFullYear());
                newDate.setMonth(selectedDate.getMonth());
                newDate.setDate(selectedDate.getDate());
                setStartDate(newDate);
                setShowStartTimePicker(true);
              }
            }}
          />
        )}

        {showStartTimePicker && Platform.OS !== 'ios' && (
          <DateTimePicker
            value={startDate || new Date()}
            mode="time"
            display="default"
            onChange={(event, selectedTime) => {
              setShowStartTimePicker(false);
              if (selectedTime) {
                const newDate = startDate ? new Date(startDate) : new Date();
                newDate.setHours(selectedTime.getHours());
                newDate.setMinutes(selectedTime.getMinutes());
                setStartDate(newDate);
              }
            }}
          />
        )}

        {showEndDatePicker && Platform.OS !== 'ios' && (
          <DateTimePicker
            value={endDate || new Date()}
            mode="date"
            display="default"
            onChange={(event, selectedDate) => {
              setShowEndDatePicker(false);
              if (selectedDate) {
                const newDate = endDate ? new Date(endDate) : new Date();
                newDate.setFullYear(selectedDate.getFullYear());
                newDate.setMonth(selectedDate.getMonth());
                newDate.setDate(selectedDate.getDate());
                setEndDate(newDate);
                setShowEndTimePicker(true);
              }
            }}
          />
        )}

        {showEndTimePicker && Platform.OS !== 'ios' && (
          <DateTimePicker
            value={endDate || new Date()}
            mode="time"
            display="default"
            onChange={(event, selectedTime) => {
              setShowEndTimePicker(false);
              if (selectedTime) {
                const newDate = endDate ? new Date(endDate) : new Date();
                newDate.setHours(selectedTime.getHours());
                newDate.setMinutes(selectedTime.getMinutes());
                setEndDate(newDate);
              }
            }}
          />
        )}
      </View>
    </>
  );
}
