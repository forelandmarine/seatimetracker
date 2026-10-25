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
import { answerVesselRename } from '@/utils/seaTimeApi';
import { log, error as logError } from '@/utils/log';

interface BannerVessel {
  id: string;
  vessel_name: string;
  pending_name?: string | null;
  pending_name_since?: string | null;
}

interface Props {
  vessels: BannerVessel[];
  onAnswered: () => void;
}

const fmt = (day?: string | null) =>
  day ? new Date(`${day.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

// When AIS shows a vessel under a new name, ask before renaming it: AIS names are
// upper case and cut short, so the user can keep their own spelling. Earlier service
// keeps the old name in reports either way.
export function VesselRenameBanner({ vessels, onAnswered }: Props) {
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);

  const [editing, setEditing] = useState<BannerVessel | null>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const pending = (vessels || []).filter((v) => v?.pending_name);
  if (pending.length === 0) return null;

  const openEditor = (vessel: BannerVessel) => {
    setEditing(vessel);
    setValue(vessel.pending_name || '');
    setErrorText(null);
  };

  const answer = async (accept: boolean) => {
    if (!editing) return;
    if (accept && !value.trim()) {
      setErrorText('Enter the new name.');
      return;
    }
    setSaving(true);
    try {
      await answerVesselRename(editing.id, accept, accept ? value.trim() : undefined);
      log('[VesselRename] Answered rename for vessel', editing.id, accept);
      setEditing(null);
      onAnswered();
    } catch (e: any) {
      logError('[VesselRename] Failed to answer rename:', e);
      setErrorText(e?.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {pending.map((vessel) => (
        <TouchableOpacity key={vessel.id} style={styles.banner} onPress={() => openEditor(vessel)} activeOpacity={0.8}>
          <IconSymbol ios_icon_name="pencil.circle.fill" android_material_icon_name="edit" size={24} color={colors.primary} />
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>{vessel.vessel_name} has a new name on AIS</Text>
            <Text style={styles.bannerBody}>
              AIS has shown it as {vessel.pending_name} since {fmt(vessel.pending_name_since)}. Tap to rename it in your records.
            </Text>
          </View>
        </TouchableOpacity>
      ))}

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Rename {editing?.vessel_name}?</Text>
            <Text style={styles.sheetBody}>
              From {fmt(editing?.pending_name_since)} your records will use the new name. Service before then keeps
              the name {editing?.vessel_name}. You can adjust the spelling.
            </Text>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={(text) => {
                setValue(text);
                setErrorText(null);
              }}
              maxLength={100}
              autoCapitalize="words"
              placeholder="New vessel name"
              placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
              accessibilityLabel="New vessel name"
            />
            {errorText && <Text style={styles.error}>{errorText}</Text>}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => answer(false)} disabled={saving}>
                <Text style={styles.cancelText}>Keep current name</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={() => answer(true)} disabled={saving}>
                {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveText}>Rename</Text>}
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.laterButton} onPress={() => setEditing(null)} disabled={saving}>
              <Text style={styles.laterText}>Decide later</Text>
            </TouchableOpacity>
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
      borderLeftColor: colors.primary,
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
      color: isDark ? colors.text : colors.textLight,
    },
    error: { fontSize: 13, color: colors.error, marginTop: 8 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 20 },
    cancelButton: { paddingVertical: 12, paddingHorizontal: 8 },
    cancelText: { fontSize: 16, color: colors.primary },
    saveButton: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 24,
      minWidth: 100,
      alignItems: 'center',
    },
    saveText: { fontSize: 16, fontWeight: '600', color: colors.white },
    laterButton: { alignSelf: 'center', paddingVertical: 12, marginTop: 4 },
    laterText: { fontSize: 14, color: isDark ? colors.textSecondary : colors.textSecondaryLight },
  });
