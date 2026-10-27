import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  useColorScheme,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import {
  CERTIFICATE_TYPE_GROUPS,
  CERTIFICATE_TYPE_LABELS,
  Certificate,
  createCertificate,
  deleteCertificate,
  listCertificates,
  updateCertificate,
} from '@/utils/certificatesApi';
import {
  scheduleCertificateExpiryReminders,
  cancelCertificateExpiryReminders,
} from '@/utils/notifications';
import { error as logError } from '@/utils/log';

export default function CertificateEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const editId = params.id as string | undefined;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);

  const [loading, setLoading] = useState(!!editId);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [typeSearch, setTypeSearch] = useState('');

  // 80 certificate types is too many for a flat list, so the picker groups them
  // and filters on the labels the user actually reads.
  const visibleTypeGroups = useMemo(() => {
    const query = typeSearch.trim().toLowerCase();
    return CERTIFICATE_TYPE_GROUPS
      .map((group) => ({
        title: group.title,
        types: query
          ? group.types.filter((t) =>
              (CERTIFICATE_TYPE_LABELS[t] || t).toLowerCase().includes(query),
            )
          : group.types,
      }))
      .filter((group) => group.types.length > 0);
  }, [typeSearch]);
  const [showIssuedPicker, setShowIssuedPicker] = useState(false);
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);

  // The oral checklist opens this screen with the course already chosen.
  // A course_ code is accepted even without a label, rather than quietly
  // switching to STCW basic safety and recording the wrong certificate.
  const presetType =
    typeof params.type === 'string' && (CERTIFICATE_TYPE_LABELS[params.type] || params.type.startsWith('course_'))
      ? params.type
      : null;
  const [type, setType] = useState<string>(presetType ?? 'stcw_basic_safety');
  const [number, setNumber] = useState('');
  const [issuingBody, setIssuingBody] = useState('');
  const [issuedDate, setIssuedDate] = useState<Date | null>(null);
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const all = await listCertificates();
        const cert = all.find((c) => c.id === editId);
        if (cert) {
          setType(cert.certificate_type);
          setNumber(cert.certificate_number || '');
          setIssuingBody(cert.issuing_body || '');
          setIssuedDate(cert.issued_date ? new Date(cert.issued_date) : null);
          setExpiryDate(cert.expiry_date ? new Date(cert.expiry_date) : null);
          setNotes(cert.notes || '');
        }
      } catch (e) {
        logError('[CertEdit] Failed to load:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [editId]);

  const formatDate = (d: Date | null): string =>
    d ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not set';

  const handleSave = async () => {
    if (saving) return;

    // Client-side date validation
    if (issuedDate && expiryDate && issuedDate >= expiryDate) {
      Alert.alert('Invalid Dates', 'Issued date must be before expiry date.');
      return;
    }

    setSaving(true);
    try {
      const expiryIso = expiryDate ? expiryDate.toISOString().split('T')[0] : null;
      const payload = {
        certificate_type: type,
        certificate_number: number || null,
        issuing_body: issuingBody || null,
        issued_date: issuedDate ? issuedDate.toISOString().split('T')[0] : null,
        expiry_date: expiryIso,
        notes: notes || null,
      };

      const label = CERTIFICATE_TYPE_LABELS[type] || type;
      if (editId) {
        await updateCertificate(editId, payload);
        // Reschedule reminders (the helper cancels the old ones first).
        await scheduleCertificateExpiryReminders(editId, label, expiryIso);
      } else {
        const created = await createCertificate(payload);
        if (created?.id) {
          await scheduleCertificateExpiryReminders(created.id, label, expiryIso);
        }
      }
      router.back();
    } catch (e: any) {
      logError('[CertEdit] Save failed:', e);
      Alert.alert('Error', e?.message || 'Failed to save certificate');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!editId) return;
    Alert.alert(
      'Delete certificate?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteCertificate(editId);
              await cancelCertificateExpiryReminders(editId);
              router.back();
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to delete');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: editId ? 'Edit certificate' : 'Add certificate' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: editId ? 'Edit certificate' : 'Add certificate',
          headerStyle: { backgroundColor: isDark ? colors.background : colors.backgroundLight },
          headerTitleStyle: { color: isDark ? colors.text : colors.textLight },
          headerTintColor: colors.primary,
          headerRight: editId
            ? () => (
                <TouchableOpacity onPress={handleDelete} disabled={deleting}>
                  <IconSymbol
                    ios_icon_name="trash"
                    android_material_icon_name="delete"
                    size={22}
                    color={colors.error}
                  />
                </TouchableOpacity>
              )
            : undefined,
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.label}>Type</Text>
        <TouchableOpacity style={styles.selectButton} onPress={() => setShowTypeModal(true)}>
          <Text style={styles.selectButtonText}>{CERTIFICATE_TYPE_LABELS[type] || type}</Text>
          <IconSymbol
            ios_icon_name="chevron.down"
            android_material_icon_name="expand-more"
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>

        <Text style={styles.label}>Certificate number</Text>
        <TextInput
          style={styles.input}
          value={number}
          onChangeText={setNumber}
          placeholder="Optional"
          placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
        />

        <Text style={styles.label}>Issuing body</Text>
        <TextInput
          style={styles.input}
          value={issuingBody}
          onChangeText={setIssuingBody}
          placeholder="MCA, USCG, MNZ..."
          placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
        />

        <Text style={styles.label}>Issued date</Text>
        <TouchableOpacity style={styles.selectButton} onPress={() => setShowIssuedPicker(true)}>
          <Text style={styles.selectButtonText}>{formatDate(issuedDate)}</Text>
          <IconSymbol
            ios_icon_name="calendar"
            android_material_icon_name="calendar-today"
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>

        <Text style={styles.label}>Expiry date</Text>
        <TouchableOpacity style={styles.selectButton} onPress={() => setShowExpiryPicker(true)}>
          <Text style={styles.selectButtonText}>{formatDate(expiryDate)}</Text>
          <IconSymbol
            ios_icon_name="calendar"
            android_material_icon_name="calendar-today"
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
        <Text style={styles.helper}>You'll get a reminder 90, 60, 30, and 7 days before expiry.</Text>

        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
          multiline
        />

        <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Save</Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* Type picker modal */}
      <Modal visible={showTypeModal} transparent animationType="slide" onRequestClose={() => setShowTypeModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowTypeModal(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Select certificate type</Text>
            <TextInput
              style={styles.typeSearchInput}
              value={typeSearch}
              onChangeText={setTypeSearch}
              placeholder="Search types"
              placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
              autoCorrect={false}
            />
            <ScrollView style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">
              {visibleTypeGroups.length === 0 && (
                <Text style={styles.typeEmptyText}>No certificate types match that search.</Text>
              )}
              {visibleTypeGroups.map((group) => (
                <View key={group.title}>
                  <Text style={styles.typeGroupHeader}>{group.title}</Text>
                  {group.types.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeOption, t === type && styles.typeOptionActive]}
                      onPress={() => {
                        setType(t);
                        setTypeSearch('');
                        setShowTypeModal(false);
                      }}
                    >
                      <Text style={[styles.typeOptionText, t === type && styles.typeOptionTextActive]}>
                        {CERTIFICATE_TYPE_LABELS[t]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Date pickers (use spinner on iOS) */}
      {showIssuedPicker && (
        <DateTimePicker
          value={issuedDate || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            setShowIssuedPicker(false);
            if (date) setIssuedDate(date);
          }}
        />
      )}
      {showExpiryPicker && (
        <DateTimePicker
          value={expiryDate || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, date) => {
            setShowExpiryPicker(false);
            if (date) setExpiryDate(date);
          }}
        />
      )}

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
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 6,
      marginTop: 14,
    },
    input: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 10,
      padding: 14,
      fontSize: 15,
      color: isDark ? colors.text : colors.textLight,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    selectButton: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    selectButtonText: {
      fontSize: 15,
      color: isDark ? colors.text : colors.textLight,
    },
    helper: {
      fontSize: 12,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 6,
      fontStyle: 'italic',
    },
    saveButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginTop: 30,
    },
    saveButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: 20,
      paddingBottom: 40,
    },
    typeSearchInput: {
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 12,
    },
    typeGroupHeader: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.primary,
      marginTop: 14,
      marginBottom: 6,
    },
    typeEmptyText: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      paddingVertical: 20,
      textAlign: 'center',
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 16,
    },
    typeOption: {
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: 8,
    },
    typeOptionActive: {
      backgroundColor: colors.primary + '15',
    },
    typeOptionText: {
      fontSize: 15,
      color: isDark ? colors.text : colors.textLight,
    },
    typeOptionTextActive: {
      color: colors.primary,
      fontWeight: '600',
    },
    addImageButton: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      borderStyle: 'dashed',
      padding: 24,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    addImageText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.primary,
    },
    addImageHint: {
      fontSize: 12,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    imagePreviewContainer: {
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    imagePreview: {
      width: '100%',
      height: 250,
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
    },
    imageActions: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: isDark ? colors.border : colors.borderLight,
    },
    imageActionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
    },
    imageActionText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    imagePickerOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? colors.border : colors.borderLight,
    },
    imagePickerOptionText: {
      fontSize: 16,
      color: isDark ? colors.text : colors.textLight,
    },
  });
