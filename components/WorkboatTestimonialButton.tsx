import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Share } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import {
  cancelTestimonialRequest,
  createTestimonialRequest,
  downloadWorkboatTestimonial,
  getUserProfile,
  listTestimonialRequests,
  type TestimonialRequest,
} from '@/utils/seaTimeApi';
import { log, error as logError } from '@/utils/log';
import { sharePdfBlob } from '@/utils/sharePdf';

const ukDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/**
 * Download button for the MGN 496 Annex C Deck (Workboat) Testimonial, pre-filled
 * from the user's confirmed deck service, one per vessel. With vesselId it covers
 * that vessel only, and offers a one-time link for the Master or company to
 * complete and sign it on their phone; the signed details then fill the PDF.
 * Shown to MCA crew in the commercial sector.
 */
export function WorkboatTestimonialButton({ vesselId }: { vesselId?: string }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [latest, setLatest] = useState<TestimonialRequest | null>(null);

  useEffect(() => {
    getUserProfile()
      .then((p) => {
        const authority = p?.maritime_authority ?? 'mca';
        setVisible(authority === 'mca' && p?.vessel_sector === 'commercial');
      })
      .catch(() => {});
  }, []);

  const loadRequests = useCallback(() => {
    if (!vesselId) return;
    listTestimonialRequests(vesselId)
      .then((rows) => setLatest(rows.find((r) => r.status !== 'cancelled' && !r.expired) ?? null))
      .catch(() => {});
  }, [vesselId]);

  useEffect(() => {
    if (visible) loadRequests();
  }, [visible, loadRequests]);

  if (!visible) return null;

  const download = async (format: 'testimonial' | 'discharge' = 'testimonial') => {
    log(`User tapped workboat ${format}${vesselId ? ' (vessel)' : ''}`);
    setBusy(true);
    try {
      const blob = await downloadWorkboatTestimonial(vesselId, format);
      const name = format === 'discharge' ? 'Certificate_of_Discharge_MGN496' : 'Workboat_Testimonial_MGN496';
      await sharePdfBlob(blob, `${name}_${new Date().toISOString().split('T')[0]}.pdf`);
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

  // The app shares the link; it never sends anything itself
  const ask = async () => {
    if (!vesselId) return;
    log('User tapped ask for testimonial signature');
    setAsking(true);
    try {
      const req = await createTestimonialRequest(vesselId);
      setLatest(req);
      if (req.url) {
        await Share.share({
          message: `Please could you complete and sign my sea service testimonial? It takes a few minutes on your phone: ${req.url}`,
        });
      }
    } catch (e: any) {
      logError('[WorkboatTestimonialButton] Request failed:', e?.message || e);
      if (e?.status === 404) {
        Alert.alert('Nothing to sign', 'There is no confirmed deck sea service on this vessel yet.');
      } else {
        Alert.alert('Could not make the link', e?.message || 'Please try again.');
      }
    } finally {
      setAsking(false);
    }
  };

  const cancel = () => {
    if (!latest) return;
    Alert.alert('Cancel this request?', 'The link you shared will stop working.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: () => {
          cancelTestimonialRequest(latest.id)
            .then(() => setLatest(null))
            .catch((e) => Alert.alert('Could not cancel', e?.message || 'Please try again.'));
        },
      },
    ]);
  };

  const status = latest?.status === 'signed'
    ? `Signed by ${latest.signer_name ?? 'the signatory'} on ${ukDate(latest.signed_at ?? latest.created_at)}${latest.to ? `, covering service to ${ukDate(latest.to)}` : ''}. The PDF includes the signature.`
    : latest?.status === 'pending'
      ? `Waiting for a signature. The link works until ${ukDate(latest.expires_at)}.`
      : null;

  return (
    <View style={vesselId ? styles.card : undefined}>
      <TouchableOpacity style={styles.button} onPress={() => download()} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <>
            <IconSymbol ios_icon_name="signature" android_material_icon_name="draw" size={24} color="#ffffff" />
            <Text style={styles.buttonText}>Workboat Testimonial (MGN 496)</Text>
          </>
        )}
      </TouchableOpacity>
      {vesselId && (
        <TouchableOpacity style={[styles.button, styles.secondary]} onPress={ask} disabled={asking}>
          {asking ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <IconSymbol ios_icon_name="paperplane" android_material_icon_name="send" size={22} color={colors.primary} />
              <Text style={[styles.buttonText, styles.secondaryText]}>
                {latest?.status === 'signed' ? 'Ask for a new signature' : 'Ask the Master or company to sign'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}
      {status && <Text style={styles.status}>{status}</Text>}
      <TouchableOpacity onPress={() => download('discharge')} disabled={busy} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.link}>Certificate of Discharge (MGN 496 Annex B)</Text>
      </TouchableOpacity>
      {latest?.status === 'pending' && (
        <TouchableOpacity onPress={cancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.cancel}>Cancel request</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.note}>
        {vesselId
          ? 'Annex C format. Send the link to the Master, or to the company if you served as Master. They check your service and sign on their phone.'
          : 'Annex C format, one per vessel. Ask the Master to complete and sign it, or the company if you served as Master.'}
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
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  secondaryText: {
    color: colors.primary,
  },
  status: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  link: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 8,
  },
  cancel: {
    fontSize: 13,
    color: colors.error,
    marginBottom: 8,
  },
  note: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
