
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  TextInput,
  Platform,
  Modal,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import * as seaTimeApi from '@/utils/seaTimeApi';
import { useSubscription } from '@/contexts/SubscriptionContext';
import DateTimePicker from '@react-native-community/datetimepicker';

import { log, error as logError } from '@/utils/log';

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
    keyboardAvoidingView: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 120,
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
      width: '48%',
      paddingVertical: 14,
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
      paddingBottom: 28,
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
  const navigation = useNavigation();
  const { isSubscribed, isLoading: subscriptionLoading } = useSubscription();

  // AbortController cancels in-flight requests when component unmounts
  const abortRef = React.useRef(new AbortController());
  const savedRef = React.useRef(false);
  useEffect(() => {
    return () => { abortRef.current.abort(); };
  }, []);

  const [loading, setLoading] = useState(false);
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
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'error' | 'success';
    onConfirm?: () => void;
  }>({ visible: false, title: '', message: '', type: 'error' });

  // Track form data in a ref so the beforeRemove listener doesn't need
  // state dependencies (avoids unsubscribe/resubscribe gaps that let
  // iOS swipe gestures and Android back button bypass the warning).
  const formDataRef = React.useRef({ selectedVessel, startDate, endDate, notes, voyageFrom, voyageTo });
  useEffect(() => {
    formDataRef.current = { selectedVessel, startDate, endDate, notes, voyageFrom, voyageTo };
  }, [selectedVessel, startDate, endDate, notes, voyageFrom, voyageTo]);

  // Warn user about unsaved changes when navigating away
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (savedRef.current) return; // entry was saved, allow navigation

      // Prevent default immediately — must happen synchronously before any
      // async work, otherwise iOS swipe gesture / Android back completes.
      e.preventDefault();

      // Check if user has entered any data worth keeping
      const { selectedVessel: v, startDate: sd, endDate: ed, notes: n, voyageFrom: vf, voyageTo: vt } = formDataRef.current;
      const hasData = v || sd || ed || n.trim() || vf.trim() || vt.trim();
      if (!hasData) {
        // Nothing to lose — allow navigation
        navigation.dispatch(e.data.action);
        return;
      }

      Alert.alert(
        'Discard changes?',
        'You have unsaved sea time data. Are you sure you want to go back?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]
      );
    });
    return unsubscribe;
  }, [navigation]);

  const showFeedback = (title: string, message: string, type: 'error' | 'success', onConfirm?: () => void) => {
    setFeedbackModal({ visible: true, title, message, type, onConfirm });
  };

  const closeFeedbackModal = () => {
    const onConfirm = feedbackModal.onConfirm;
    setFeedbackModal(prev => ({ ...prev, visible: false, onConfirm: undefined }));
    if (onConfirm) onConfirm();
  };

  useEffect(() => {
    log('[AddSeaTimeScreen] Subscription state - subscriptionLoading:', subscriptionLoading, 'isSubscribed:', isSubscribed);
    // Load vessels regardless of subscription state so the form is usable
    if (!subscriptionLoading) {
      loadVessels();
    }
  }, [subscriptionLoading]);

  const loadVessels = async () => {
    try {
      log('[AddSeaTimeScreen] Loading vessels');
      setLoading(true);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        logError('[AddSeaTimeScreen] Vessel fetch timed out after 15s');
        controller.abort();
      }, 15000);

      const API_URL = seaTimeApi.API_BASE_URL;
      const { getToken } = await import('@/utils/tokenStorage');
      const token = await getToken();
      log('[AddSeaTimeScreen] Token retrieved:', token ? 'exists' : 'null');

      const response = await fetch(`${API_URL}/api/vessels`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      log('[AddSeaTimeScreen] Vessels response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        logError('[AddSeaTimeScreen] Failed to fetch vessels:', response.status, errorText);
        throw new Error(`Failed to load vessels: ${response.status}`);
      }

      const data = await response.json();
      const rawVessels: any[] = Array.isArray(data) ? data : Array.isArray(data?.vessels) ? data.vessels : [];
      const vesselsData = rawVessels
        .filter(v => v && typeof v === 'object')
        .map(v => ({ ...v, vessel_type: v.vessel_type || v.type || null }))
        .filter((v): v is Vessel => v != null);

      log('[AddSeaTimeScreen] Loaded vessels:', vesselsData.length);
      setVessels(vesselsData);
      if (vesselsData.length === 0) {
        showFeedback('No Vessels', 'You need to add a vessel first before logging sea time.', 'error');
      }
    } catch (error: any) {
      if (error?.name === 'AbortError' && abortRef.current.signal.aborted) return; // unmount
      if (error?.name === 'AbortError') {
        logError('[AddSeaTimeScreen] Vessel fetch timed out');
        showFeedback('Connection Timeout', 'Could not load vessels. Please check your connection and try again.', 'error');
      } else {
        logError('[AddSeaTimeScreen] Error loading vessels:', error);
        showFeedback('Error', error.message || 'Failed to load vessels. Please try again.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleViewMCARequirements = async () => {
    log('[AddSeaTimeScreen] User tapped View MCA Requirements');
    try {
      const userProfile = await seaTimeApi.getUserProfile();
      const department = userProfile?.department?.toLowerCase() || 'deck';
      log('[AddSeaTimeScreen] User department:', department);
      router.push(`/mca-requirements?department=${department}`);
    } catch (error) {
      logError('[AddSeaTimeScreen] Failed to get user profile:', error);
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
    log('[AddSeaTimeScreen] User tapped Save');
    
    if (!selectedVessel) {
      showFeedback('Error', 'Please select a vessel', 'error');
      return;
    }
    
    if (!startDate) {
      showFeedback('Error', 'Please select a start date and time', 'error');
      return;
    }

    if (endDate && endDate <= startDate) {
      showFeedback('Error', 'End date must be after start date', 'error');
      return;
    }

    // Validate that duration is not 0 hours if end date is provided
    if (endDate) {
      const durationMs = endDate.getTime() - startDate.getTime();
      const durationHours = durationMs / (1000 * 60 * 60);
      
      if (durationHours === 0) {
        showFeedback('Error', 'Sea time duration cannot be 0 hours. Please ensure start and end times are different.', 'error');
        return;
      }
      
      log('[AddSeaTimeScreen] Duration validation passed:', durationHours, 'hours');
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

      log('[AddSeaTimeScreen] Creating manual sea time entry');
      const saveController = new AbortController();
      const saveTimeoutId = setTimeout(() => {
        logError('[AddSeaTimeScreen] Save entry timed out after 15s');
        saveController.abort();
      }, 15000);

      const API_URL = seaTimeApi.API_BASE_URL;
      const { getToken } = await import('@/utils/tokenStorage');
      const saveToken = await getToken();
      log('[AddSeaTimeScreen] Save token retrieved:', saveToken ? 'exists' : 'null');

      const saveResponse = await fetch(`${API_URL}/api/logbook/manual-entry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(saveToken ? { 'Authorization': `Bearer ${saveToken}` } : {}),
        },
        body: JSON.stringify({
          vessel_id: selectedVessel.id,
          start_time: startDate.toISOString(),
          end_time: endDate?.toISOString() || null,
          notes: fullNotes || null,
          start_latitude: fromCoords.lat,
          start_longitude: fromCoords.lon,
          end_latitude: toCoords.lat,
          end_longitude: toCoords.lon,
          service_type: backendServiceType,
        }),
        signal: saveController.signal,
      });

      clearTimeout(saveTimeoutId);
      log('[AddSeaTimeScreen] Save response status:', saveResponse.status);

      if (!saveResponse.ok) {
        const errorText = await saveResponse.text();
        logError('[AddSeaTimeScreen] Failed to save entry:', saveResponse.status, errorText);
        throw new Error(`Failed to save entry: ${saveResponse.status}`);
      }

      savedRef.current = true;
      showFeedback('Success', 'Sea time entry added successfully', 'success', () => router.back());
    } catch (error: any) {
      logError('[AddSeaTimeScreen] Error saving entry:', error);
      showFeedback('Error', error.message || 'Failed to save sea time entry', 'error');
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

        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
          bounces={true}
          keyboardDismissMode="interactive"
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
                log('[AddSeaTimeScreen] User tapped vessel picker');
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
                log('[AddSeaTimeScreen] User tapped start date/time');
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
                log('[AddSeaTimeScreen] User tapped end date/time');
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
        </KeyboardAvoidingView>

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
                          log('[AddSeaTimeScreen] User selected vessel:', vessel.vessel_name);
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
                        log('[AddSeaTimeScreen] Start date selected:', selectedDate);
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
                        log('[AddSeaTimeScreen] End date selected:', selectedDate);
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

        {/* Feedback Modal - replaces Alert.alert() for web compatibility */}
        <Modal
          visible={feedbackModal.visible}
          transparent={true}
          animationType="fade"
          onRequestClose={closeFeedbackModal}
        >
          <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center' }]}>
            <View style={{
              backgroundColor: isDark ? colors.cardBackground : '#FFFFFF',
              borderRadius: 16,
              padding: 24,
              width: '85%',
              maxWidth: 400,
            }}>
              <Text style={{
                fontSize: 20,
                fontWeight: 'bold',
                color: feedbackModal.type === 'success' ? colors.primary : colors.error,
                marginBottom: 12,
                textAlign: 'center',
              }}>
                {feedbackModal.title}
              </Text>
              <Text style={{
                fontSize: 16,
                color: isDark ? colors.textSecondary : colors.textSecondaryLight,
                marginBottom: 24,
                textAlign: 'center',
                lineHeight: 24,
              }}>
                {feedbackModal.message}
              </Text>
              <TouchableOpacity
                style={{
                  backgroundColor: feedbackModal.type === 'success' ? colors.primary : colors.error,
                  borderRadius: 12,
                  padding: 16,
                  alignItems: 'center',
                }}
                onPress={closeFeedbackModal}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </>
  );
}
