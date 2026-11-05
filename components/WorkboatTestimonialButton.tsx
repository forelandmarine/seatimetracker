import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { downloadWorkboatTestimonial, getUserProfile } from '@/utils/seaTimeApi';
import { log, error as logError } from '@/utils/log';
import { sharePdfBlob } from '@/utils/sharePdf';

/**
 * Download button for the MGN 496 Annex C Deck (Workboat) Testimonial, pre-filled
 * from the user's confirmed deck service, one per vessel. With vesselId it covers
 * that vessel only. Shown to MCA crew in the commercial sector.
 */
export function WorkboatTestimonialButton({ vesselId }: { vesselId?: string }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getUserProfile()
      .then((p) => {
        const authority = p?.maritime_authority ?? 'mca';
        setVisible(authority === 'mca' && p?.vessel_sector === 'commercial');
      })
      .catch(() => {});
  }, []);

  if (!visible) return null;

  const download = async () => {
    log(`User tapped workboat testimonial${vesselId ? ' (vessel)' : ''}`);
    setBusy(true);
    try {
      const blob = await downloadWorkboatTestimonial(vesselId);
      await sharePdfBlob(blob, `Workboat_Testimonial_MGN496_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (e: any) {
      logError('[WorkboatTestimonialButton] Download failed:', e?.message || e);
      if (e?.status === 404) {
        Alert.alert('Nothing to include', 'There is no confirmed deck sea service to put on a testimonial yet.');
      } else {
        Alert.alert('Download Failed', `Unable to create the PDF. ${e?.message || 'Please try again.'}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={vesselId ? styles.card : undefined}>
      <TouchableOpacity style={styles.button} onPress={download} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <>
            <IconSymbol ios_icon_name="signature" android_material_icon_name="draw" size={24} color="#ffffff" />
            <Text style={styles.buttonText}>Workboat Testimonial (MGN 496)</Text>
          </>
        )}
      </TouchableOpacity>
      <Text style={styles.note}>
        Annex C format, one per vessel. Ask the Master to complete and sign it, or the company if you served as Master.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 16,
    marginBottom: 0,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  note: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
