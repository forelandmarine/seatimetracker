import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { normalizeMmsi, mmsiValidationError, updateVesselMmsi } from '@/utils/seaTimeApi';
import { log, error as logError } from '@/utils/log';

interface BannerVessel {
  id: string;
  vessel_name: string;
  mmsi: string;
}

interface Props {
  vessels: BannerVessel[];
  onFixed: () => void;
}

// Warns about vessels saved with an MMSI that isn't 9 digits (these are never
// found on AIS, so nothing is tracked) and lets the user correct it in place.
export function MmsiFixBanner({ vessels, onFixed }: Props) {
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);

  const [editing, setEditing] = useState<BannerVessel | null>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const invalid = (vessels || []).filter((v) => v?.mmsi && normalizeMmsi(v.mmsi).length !== 9);
  if (invalid.length === 0) return null;

  const openEditor = (vessel: BannerVessel) => {
    setEditing(vessel);
    setValue(normalizeMmsi(vessel.mmsi));
    setErrorText(null);
  };

  const save = async () => {
    if (!editing) return;
    const problem = mmsiValidationError(value);
    if (problem) {
      setErrorText(problem);
      return;
    }
    setSaving(true);
    try {
      await updateVesselMmsi(editing.id, value);
      log('[MmsiFix] MMSI corrected for vessel', editing.id);
      setEditing(null);
      onFixed();
    } catch (e: any) {
      logError('[MmsiFix] Failed to update MMSI:', e);
      setErrorText(e?.message || 'Could not update the MMSI. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {invalid.map((vessel) => (
        <TouchableOpacity key={vessel.id} style={styles.banner} onPress={() => openEditor(vessel)} activeOpacity={0.8}>
          <IconSymbol
            ios_icon_name="exclamationmark.triangle.fill"
            android_material_icon_name="warning"
            size={24}
            color={colors.error}
          />
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>{vessel.vessel_name} is not being tracked</Text>
            <Text style={styles.bannerBody}>
              Its MMSI ({vessel.mmsi}) has {normalizeMmsi(vessel.mmsi).length} digits. An MMSI is always 9 digits. Tap to correct it.
            </Text>
          </View>
        </TouchableOpacity>
      ))}

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Correct MMSI</Text>
            <Text style={styles.sheetBody}>
              Enter the 9-digit MMSI for {editing?.vessel_name}. You can find it on the ship's radio licence or the VHF/AIS unit.
            </Text>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={(text) => {
                setValue(normalizeMmsi(text));
                setErrorText(null);
              }}
              keyboardType="numeric"
              maxLength={9}
              placeholder="e.g., 235012345"
              placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
              autoFocus
            />
            <Text style={styles.counter}>{value.length}/9 digits</Text>
            {errorText && <Text style={styles.error}>{errorText}</Text>}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setEditing(null)} disabled={saving}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, value.length !== 9 && styles.saveDisabled]}
                onPress={save}
                disabled={saving || value.length !== 9}
              >
                {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderLeftWidth: 4,
      borderLeftColor: colors.error,
      borderRadius: 16,
      padding: 16,
      marginHorizontal: 16,
      marginBottom: 16,
    },
    bannerText: { flex: 1 },
    bannerTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 4,
    },
    bannerBody: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      padding: 24,
    },
    sheet: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 16,
      padding: 20,
    },
    sheetTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    sheetBody: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 16,
    },
    input: {
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      borderRadius: 10,
      padding: 12,
      fontSize: 18,
      letterSpacing: 1,
      color: isDark ? colors.text : colors.textLight,
    },
    counter: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 6,
    },
    error: { fontSize: 13, color: colors.error, marginTop: 8 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
    cancelButton: { paddingVertical: 12, paddingHorizontal: 16 },
    cancelText: { fontSize: 16, color: colors.primary },
    saveButton: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 24,
      minWidth: 90,
      alignItems: 'center',
    },
    saveDisabled: { opacity: 0.5 },
    saveText: { fontSize: 16, fontWeight: '600', color: colors.white },
  });
