import React, { useState, useEffect } from 'react';
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
  Image,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import {
  CERTIFICATE_TYPES,
  CERTIFICATE_TYPE_LABELS,
  Certificate,
  createCertificate,
  deleteCertificate,
  listCertificates,
  updateCertificate,
} from '@/utils/certificatesApi';
import { log, error as logError } from '@/utils/log';

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
  const [showIssuedPicker, setShowIssuedPicker] = useState(false);
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);

  const [type, setType] = useState<string>('stcw_basic_safety');
  const [number, setNumber] = useState('');
  const [issuingBody, setIssuingBody] = useState('');
  const [issuedDate, setIssuedDate] = useState<Date | null>(null);
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);

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
          setImageUri(cert.image_url || null);
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
      const payload = {
        certificate_type: type,
        certificate_number: number || null,
        issuing_body: issuingBody || null,
        issued_date: issuedDate ? issuedDate.toISOString().split('T')[0] : null,
        expiry_date: expiryDate ? expiryDate.toISOString().split('T')[0] : null,
        notes: notes || null,
        image_url: imageUri || null,
      };

      if (editId) {
        await updateCertificate(editId, payload);
      } else {
        await createCertificate(payload);
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

        <Text style={styles.label}>Certificate scan</Text>
        {imageUri ? (
          <View style={styles.imagePreviewContainer}>
            {imageUri.startsWith('data:application/pdf') ? (
              <View style={[styles.imagePreview, { alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7' }]}>
                <IconSymbol ios_icon_name="doc.fill" android_material_icon_name="description" size={48} color={colors.primary} />
                <Text style={{ color: isDark ? colors.textSecondary : colors.textSecondaryLight, marginTop: 8, fontSize: 14 }}>PDF attached</Text>
              </View>
            ) : (
              <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="contain" />
            )}
            <View style={styles.imageActions}>
              <TouchableOpacity style={styles.imageActionButton} onPress={() => setShowImagePicker(true)}>
                <IconSymbol ios_icon_name="arrow.triangle.2.circlepath" android_material_icon_name="refresh" size={18} color={colors.primary} />
                <Text style={styles.imageActionText}>Replace</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.imageActionButton} onPress={() => setImageUri(null)}>
                <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={18} color={colors.error} />
                <Text style={[styles.imageActionText, { color: colors.error }]}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.addImageButton} onPress={() => setShowImagePicker(true)}>
            <IconSymbol ios_icon_name="doc.badge.plus" android_material_icon_name="note-add" size={28} color={colors.primary} />
            <Text style={styles.addImageText}>Add photo, scan, or PDF</Text>
            <Text style={styles.addImageHint}>Take a photo, choose from library, or upload a document</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Save</Text>}
        </TouchableOpacity>
      </ScrollView>

      {/* Type picker modal */}
      <Modal visible={showTypeModal} transparent animationType="slide" onRequestClose={() => setShowTypeModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowTypeModal(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Select certificate type</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {CERTIFICATE_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeOption, t === type && styles.typeOptionActive]}
                  onPress={() => {
                    setType(t);
                    setShowTypeModal(false);
                  }}
                >
                  <Text style={[styles.typeOptionText, t === type && styles.typeOptionTextActive]}>
                    {CERTIFICATE_TYPE_LABELS[t]}
                  </Text>
                </TouchableOpacity>
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

      {/* Image picker modal */}
      <Modal visible={showImagePicker} transparent animationType="fade" onRequestClose={() => setShowImagePicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { justifyContent: 'center' }]}>
            <Text style={styles.modalTitle}>Add certificate scan</Text>

            <TouchableOpacity
              style={styles.imagePickerOption}
              onPress={async () => {
                setShowImagePicker(false);
                const { status } = await ImagePicker.requestCameraPermissionsAsync();
                if (status !== 'granted') {
                  Alert.alert('Permission needed', 'Camera access is required to take a photo.');
                  return;
                }
                const result = await ImagePicker.launchCameraAsync({
                  mediaTypes: ['images'],
                  quality: 0.7,
                  base64: true,
                });
                if (!result.canceled && result.assets[0]) {
                  const asset = result.assets[0];
                  if (asset.base64) {
                    setImageUri(`data:image/jpeg;base64,${asset.base64}`);
                  } else {
                    setImageUri(asset.uri);
                  }
                  log('[CertEdit] Photo captured');
                }
              }}
            >
              <IconSymbol ios_icon_name="camera.fill" android_material_icon_name="photo-camera" size={22} color={colors.primary} />
              <Text style={styles.imagePickerOptionText}>Take photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.imagePickerOption}
              onPress={async () => {
                setShowImagePicker(false);
                const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (status !== 'granted') {
                  Alert.alert('Permission needed', 'Photo library access is required.');
                  return;
                }
                const result = await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ['images'],
                  quality: 0.7,
                  base64: true,
                });
                if (!result.canceled && result.assets[0]) {
                  const asset = result.assets[0];
                  if (asset.base64) {
                    setImageUri(`data:image/jpeg;base64,${asset.base64}`);
                  } else {
                    setImageUri(asset.uri);
                  }
                  log('[CertEdit] Image picked from library');
                }
              }}
            >
              <IconSymbol ios_icon_name="photo.fill" android_material_icon_name="photo-library" size={22} color={colors.primary} />
              <Text style={styles.imagePickerOptionText}>Choose from library</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.imagePickerOption}
              onPress={async () => {
                setShowImagePicker(false);
                try {
                  const result = await DocumentPicker.getDocumentAsync({
                    type: ['application/pdf', 'image/*'],
                    copyToCacheDirectory: true,
                  });
                  if (!result.canceled && result.assets?.[0]) {
                    const asset = result.assets[0];
                    const base64 = await FileSystem.readAsStringAsync(asset.uri, {
                      encoding: FileSystem.EncodingType.Base64,
                    });
                    const mimeType = asset.mimeType || (asset.name?.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
                    setImageUri(`data:${mimeType};base64,${base64}`);
                    log('[CertEdit] Document picked:', asset.name);
                  }
                } catch (err) {
                  logError('[CertEdit] Document pick failed:', err);
                  Alert.alert('Error', 'Failed to pick document');
                }
              }}
            >
              <IconSymbol ios_icon_name="doc.fill" android_material_icon_name="description" size={22} color={colors.primary} />
              <Text style={styles.imagePickerOptionText}>Upload PDF or document</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.imagePickerOption, { borderBottomWidth: 0, marginTop: 8 }]}
              onPress={() => setShowImagePicker(false)}
            >
              <Text style={[styles.imagePickerOptionText, { color: colors.textSecondary, textAlign: 'center', flex: 1 }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
