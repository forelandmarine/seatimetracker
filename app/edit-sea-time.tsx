
import React, { useState, useEffect, useCallback } from 'react';
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
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import * as seaTimeApi from '@/utils/seaTimeApi';
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
  rank_capacity?: string | null;
  trade_area?: string | null;
  bridge_watch_hours?: number | null;
}

type ServiceType = 'seagoing' | 'watchkeeping' | 'standby' | 'yard';

type RankCapacity = 'master' | 'chief_officer' | 'second_officer' | 'third_officer' | 'oow' | 'chief_engineer' | 'second_engineer' | 'eto' | 'cadet' | 'rating';
type TradeArea = 'unlimited' | 'near_coastal' | 'coastal' | 'inland';

const RANK_OPTIONS: { value: RankCapacity; label: string }[] = [
  { value: 'master', label: 'Master' },
  { value: 'chief_officer', label: 'Chief Officer' },
  { value: 'second_officer', label: '2nd Officer' },
  { value: 'third_officer', label: '3rd Officer' },
  { value: 'oow', label: 'OOW' },
  { value: 'chief_engineer', label: 'Chief Engineer' },
  { value: 'second_engineer', label: '2nd Engineer' },
  { value: 'eto', label: 'ETO' },
  { value: 'cadet', label: 'Cadet' },
  { value: 'rating', label: 'Rating' },
];

const TRADE_AREA_OPTIONS: { value: TradeArea; label: string }[] = [
  { value: 'unlimited', label: 'Unlimited' },
  { value: 'near_coastal', label: 'Near Coastal' },
  { value: 'coastal', label: 'Coastal' },
  { value: 'inland', label: 'Inland' },
];

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
    advancedToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 4,
      marginBottom: 8,
    },
    advancedToggleText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
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
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const entryId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [entry, setEntry] = useState<SeaTimeEntry | null>(null);
  const [notes, setNotes] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType>('seagoing');
  const [voyageFrom, setVoyageFrom] = useState('');
  const [voyageTo, setVoyageTo] = useState('');
  const [startLat, setStartLat] = useState('');
  const [startLng, setStartLng] = useState('');
  const [endLat, setEndLat] = useState('');
  const [endLng, setEndLng] = useState('');
  const [showPositionEditor, setShowPositionEditor] = useState(false);
  const [rankCapacity, setRankCapacity] = useState<RankCapacity | null>(null);
  const [tradeArea, setTradeArea] = useState<TradeArea | null>(null);
  const [watchkeepingHours, setWatchkeepingHours] = useState('');
  const [showRankPicker, setShowRankPicker] = useState(false);
  const [showTradeAreaPicker, setShowTradeAreaPicker] = useState(false);
  // Track whether user has modified any fields
  const [isDirty, setIsDirty] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const savedOrDeletedRef = React.useRef(false);
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'error' | 'success' | 'confirm';
    onConfirm?: () => void;
    confirmLabel?: string;
  }>({ visible: false, title: '', message: '', type: 'error' });

  const showFeedback = (title: string, message: string, type: 'error' | 'success', onConfirm?: () => void) => {
    setFeedbackModal({ visible: true, title, message, type, onConfirm });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void, confirmLabel = 'Delete') => {
    setFeedbackModal({ visible: true, title, message, type: 'confirm', onConfirm, confirmLabel });
  };

  const closeFeedbackModal = () => {
    // For success/error modals: call onConfirm (e.g. router.back()) when user taps OK
    // For confirm modals: onConfirm is only called via the explicit confirm button, not here
    const onConfirm = feedbackModal.onConfirm;
    const type = feedbackModal.type;
    setFeedbackModal(prev => ({ ...prev, visible: false, onConfirm: undefined }));
    if (onConfirm && type !== 'confirm') {
      onConfirm();
    }
  };

  // Warn about unsaved changes when navigating away
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (savedOrDeletedRef.current || !isDirty) return;
      e.preventDefault();
      Alert.alert(
        'Discard changes?',
        'You have unsaved changes. Are you sure you want to go back?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
        ]
      );
    });
    return unsubscribe;
  }, [navigation, isDirty]);

  const loadEntry = useCallback(async () => {
    try {
      log('[EditSeaTimeScreen] Fetching entry details for:', entryId);
      if (!entryId) {
        showFeedback('Error', 'No entry ID provided', 'error', () => router.back());
        return;
      }
      setLoading(true);
      const entries = await seaTimeApi.getSeaTimeEntries();
      const foundEntry = entries.find((e: any) => e.id === entryId);
      
      if (!foundEntry) {
        showFeedback('Error', 'Sea time entry not found', 'error', () => router.back());
        return;
      }

      log('[EditSeaTimeScreen] Entry loaded:', foundEntry);
      setEntry(foundEntry);

      const backendToUIServiceType: { [key: string]: ServiceType } = {
        'actual_sea_service': 'seagoing',
        'watchkeeping_service': 'watchkeeping',
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

      // Populate position editor state
      setStartLat(foundEntry.start_latitude != null ? String(foundEntry.start_latitude) : '');
      setStartLng(foundEntry.start_longitude != null ? String(foundEntry.start_longitude) : '');
      setEndLat(foundEntry.end_latitude != null ? String(foundEntry.end_latitude) : '');
      setEndLng(foundEntry.end_longitude != null ? String(foundEntry.end_longitude) : '');

      // Initialize compliance fields
      if (foundEntry.rank || foundEntry.rank_capacity) setRankCapacity((foundEntry.rank || foundEntry.rank_capacity) as RankCapacity);
      if (foundEntry.trade_area) setTradeArea(foundEntry.trade_area as TradeArea);
      if (foundEntry.bridge_watch_hours != null) setWatchkeepingHours(String(foundEntry.bridge_watch_hours));
    } catch (error) {
      logError('[EditSeaTimeScreen] Error loading entry:', error);
      showFeedback('Error', 'Failed to load sea time entry', 'error', () => router.back());
    } finally {
      setLoading(false);
    }
  // Only depend on entryId — router is excluded because useRouter() returns a
  // new object each render, which would cause an infinite load loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  useEffect(() => {
    log('[EditSeaTimeScreen] Component mounted, loading entry:', entryId);
    loadEntry();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  const handleViewMCARequirements = async () => {
    log('[EditSeaTimeScreen] User tapped View MCA Requirements');
    try {
      const userProfile = await seaTimeApi.getUserProfile();
      const department = userProfile?.department?.toLowerCase() || 'deck';
      log('[EditSeaTimeScreen] User department:', department);
      router.push(`/mca-requirements?department=${department}`);
    } catch (error) {
      logError('[EditSeaTimeScreen] Failed to get user profile:', error);
      router.push('/mca-requirements?department=deck');
    }
  };

  const handleSave = async () => {
    if (saving) return;
    log('[EditSeaTimeScreen] User tapped Save');

    if (!entry) {
      showFeedback('Error', 'Entry not found', 'error');
      return;
    }

    try {
      setSaving(true);

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

      log('[EditSeaTimeScreen] Updating sea time entry');

      // Parse position values; null = clear, undefined = leave alone
      const parseCoord = (s: string): number | null | undefined => {
        if (s === '') return null;
        const n = parseFloat(s);
        return Number.isFinite(n) ? n : undefined;
      };

      const updatePayload: any = {
        notes: fullNotes || null,
        service_type: backendServiceType,
        rank: rankCapacity || null,
        trade_area: tradeArea || null,
        ...(backendServiceType === 'watchkeeping_service' && watchkeepingHours
          ? { bridge_watch_hours: parseFloat(watchkeepingHours) }
          : {}),
      };
      if (showPositionEditor) {
        const sLat = parseCoord(startLat);
        const sLng = parseCoord(startLng);
        const eLat = parseCoord(endLat);
        const eLng = parseCoord(endLng);
        if (sLat !== undefined) updatePayload.start_latitude = sLat;
        if (sLng !== undefined) updatePayload.start_longitude = sLng;
        if (eLat !== undefined) updatePayload.end_latitude = eLat;
        if (eLng !== undefined) updatePayload.end_longitude = eLng;
      }

      await seaTimeApi.updateSeaTimeEntry(entry.id, updatePayload);

      savedOrDeletedRef.current = true;
      showFeedback('Success', 'Sea time entry updated successfully', 'success', () => router.back());
    } catch (error: any) {
      logError('[EditSeaTimeScreen] Error saving entry:', error);
      showFeedback('Error', error.message || 'Failed to update sea time entry', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!entry) return;

    log('[EditSeaTimeScreen] User tapped delete button');
    
    showConfirm(
      'Delete Entry',
      'Are you sure you want to delete this sea time entry? This action cannot be undone.',
      async () => {
        if (deleting) return; // guard against double-tap
        setDeleting(true);
        try {
          log('[EditSeaTimeScreen] Deleting sea time entry:', entry.id);
          await seaTimeApi.deleteSeaTimeEntry(entry.id);
          savedOrDeletedRef.current = true;
          // Show success modal; when user taps OK, navigate back once
          showFeedback('Success', 'Sea time entry deleted successfully', 'success', () => router.back());
        } catch (error: any) {
          logError('[EditSeaTimeScreen] Error deleting entry:', error);
          showFeedback('Error', error.message || 'Failed to delete sea time entry', 'error');
        } finally {
          setDeleting(false);
        }
      },
      'Delete'
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
  const watchkeepingText = 'Watchkeeping';
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
    return (
      <>
  
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
            <Text style={styles.headerTitle}>Edit Sea Time Entry</Text>
            <View style={styles.deleteButton} />
          </View>
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Failed to load entry</Text>
            <TouchableOpacity
              style={{ marginTop: 16, paddingVertical: 10, paddingHorizontal: 24, backgroundColor: colors.primary, borderRadius: 8 }}
              onPress={loadEntry}
            >
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </>
    );
  }

  const startDateDisplay = `${formatDate(entry.start_time)} at ${formatTime(entry.start_time)}`;
  const endDateDisplay = entry.end_time 
    ? `${formatDate(entry.end_time)} at ${formatTime(entry.end_time)}`
    : 'Not set';

  return (
    <>

      
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
                onPress={() => { setServiceType('seagoing'); setIsDirty(true); }}
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
                onPress={() => { setServiceType('watchkeeping'); setIsDirty(true); }}
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
                onPress={() => { setServiceType('standby'); setIsDirty(true); }}
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
                onPress={() => { setServiceType('yard'); setIsDirty(true); }}
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
            <Text style={styles.inputLabel}>Rank / Capacity</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowRankPicker(true)}
            >
              <Text
                style={
                  rankCapacity
                    ? styles.pickerButtonText
                    : styles.pickerButtonPlaceholder
                }
              >
                {rankCapacity
                  ? RANK_OPTIONS.find(r => r.value === rankCapacity)?.label ?? rankCapacity
                  : 'Select rank / capacity'}
              </Text>
              <IconSymbol
                ios_icon_name="chevron.down"
                android_material_icon_name="arrow-drop-down"
                size={20}
                color={isDark ? colors.textSecondary : colors.textSecondaryLight}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Trade Area</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowTradeAreaPicker(true)}
            >
              <Text
                style={
                  tradeArea
                    ? styles.pickerButtonText
                    : styles.pickerButtonPlaceholder
                }
              >
                {tradeArea
                  ? TRADE_AREA_OPTIONS.find(t => t.value === tradeArea)?.label ?? tradeArea
                  : 'Select trade area'}
              </Text>
              <IconSymbol
                ios_icon_name="chevron.down"
                android_material_icon_name="arrow-drop-down"
                size={20}
                color={isDark ? colors.textSecondary : colors.textSecondaryLight}
              />
            </TouchableOpacity>
          </View>

          {serviceType === 'watchkeeping' && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Bridge Watch Hours</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter watch hours"
                placeholderTextColor={
                  isDark ? colors.textSecondary : colors.textSecondaryLight
                }
                value={watchkeepingHours}
                onChangeText={(t) => { setWatchkeepingHours(t); setIsDirty(true); }}
                keyboardType="numeric"
              />
            </View>
          )}

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
                onChangeText={(t) => { setVoyageFrom(t); setIsDirty(true); }}
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
                onChangeText={(t) => { setVoyageTo(t); setIsDirty(true); }}
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
              onChangeText={(t) => { setNotes(t); setIsDirty(true); }}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Advanced: Edit Position */}
          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.advancedToggle}
            onPress={() => setShowPositionEditor(!showPositionEditor)}
          >
            <Text style={styles.advancedToggleText}>
              {showPositionEditor ? 'Hide' : 'Edit'} position (advanced)
            </Text>
            <IconSymbol
              ios_icon_name={showPositionEditor ? 'chevron.up' : 'chevron.down'}
              android_material_icon_name={showPositionEditor ? 'expand-less' : 'expand-more'}
              size={20}
              color={colors.primary}
            />
          </TouchableOpacity>

          {showPositionEditor && (
            <View style={styles.inputGroup}>
              <Text style={styles.helperText}>
                Override the AIS-detected position. Enter decimal degrees (e.g. 51.5074, -0.1278).
              </Text>
              <View style={styles.voyageRow}>
                <View style={styles.voyageColumn}>
                  <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Start Lat</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.0000"
                    placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                    value={startLat}
                    onChangeText={(t) => { setStartLat(t); setIsDirty(true); }}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={styles.voyageColumn}>
                  <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Start Lng</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.0000"
                    placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                    value={startLng}
                    onChangeText={(t) => { setStartLng(t); setIsDirty(true); }}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>
              <View style={styles.voyageRow}>
                <View style={styles.voyageColumn}>
                  <Text style={[styles.inputLabel, { marginBottom: 8 }]}>End Lat</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.0000"
                    placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                    value={endLat}
                    onChangeText={(t) => { setEndLat(t); setIsDirty(true); }}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={styles.voyageColumn}>
                  <Text style={[styles.inputLabel, { marginBottom: 8 }]}>End Lng</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.0000"
                    placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                    value={endLng}
                    onChangeText={(t) => { setEndLng(t); setIsDirty(true); }}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>{saveButtonText}</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Rank / Capacity Picker Modal */}
        <Modal
          visible={showRankPicker}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowRankPicker(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowRankPicker(false)}
          >
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Rank / Capacity</Text>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setShowRankPicker(false)}
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
                {RANK_OPTIONS.map((option, index) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.vesselOption,
                      index === RANK_OPTIONS.length - 1 && styles.vesselOptionLast,
                    ]}
                    onPress={() => {
                      setRankCapacity(option.value);
                      setShowRankPicker(false);
                      setIsDirty(true);
                    }}
                  >
                    <Text style={styles.vesselOptionText}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Trade Area Picker Modal */}
        <Modal
          visible={showTradeAreaPicker}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowTradeAreaPicker(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowTradeAreaPicker(false)}
          >
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Trade Area</Text>
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setShowTradeAreaPicker(false)}
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
                {TRADE_AREA_OPTIONS.map((option, index) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.vesselOption,
                      index === TRADE_AREA_OPTIONS.length - 1 && styles.vesselOptionLast,
                    ]}
                    onPress={() => {
                      setTradeArea(option.value);
                      setShowTradeAreaPicker(false);
                      setIsDirty(true);
                    }}
                  >
                    <Text style={styles.vesselOptionText}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Feedback Modal - replaces Alert.alert() for web compatibility */}
        <Modal
          visible={feedbackModal.visible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setFeedbackModal(prev => ({ ...prev, visible: false }))}
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
                color: feedbackModal.type === 'success' ? colors.primary : feedbackModal.type === 'confirm' ? (isDark ? '#ffffff' : '#000000') : colors.error,
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
              {feedbackModal.type === 'confirm' ? (
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: isDark ? colors.cardBackground : '#f3f4f6',
                      borderRadius: 12,
                      padding: 16,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: isDark ? colors.border : colors.borderLight,
                    }}
                    onPress={() => setFeedbackModal(prev => ({ ...prev, visible: false }))}
                  >
                    <Text style={{ color: isDark ? colors.text : colors.textLight, fontSize: 16, fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={deleting}
                    style={{
                      flex: 1,
                      backgroundColor: colors.error,
                      borderRadius: 12,
                      padding: 16,
                      alignItems: 'center',
                      opacity: deleting ? 0.5 : 1,
                    }}
                    onPress={() => {
                      const onConfirm = feedbackModal.onConfirm;
                      setFeedbackModal(prev => ({ ...prev, visible: false, onConfirm: undefined }));
                      onConfirm?.();
                    }}
                  >
                    {deleting ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                    <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
                      {feedbackModal.confirmLabel || 'Delete'}
                    </Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
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
              )}
            </View>
          </View>
        </Modal>
      </View>
    </>
  );
}
