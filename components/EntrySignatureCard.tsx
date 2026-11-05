import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Share } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import {
  cancelEntrySignatureRequest,
  createEntrySignatureRequest,
  getEntrySignature,
  removeEntrySignature,
  type EntrySignatureState,
} from '@/utils/seaTimeApi';
import { log, error as logError } from '@/utils/log';

const ukDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const CAPACITY = { master: 'Master', responsible_person: 'responsible person' } as const;

/**
 * Signature for one sea time entry: "Signed by X on date", or "Get this entry
 * signed" with two ways to do it. The Master (or a responsible person, where the
 * seafarer was Master, MGN 496 5.3) signs on this phone, or from a one-time link
 * the app shares. Editing the entry's times, vessel or service type removes the
 * signature, since the signer signed what they saw.
 */
export function EntrySignatureCard({ entryId, isDark }: { entryId: string; isDark: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<EntrySignatureState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getEntrySignature(entryId)
      .then(setState)
      .catch((e) => logError('[EntrySignatureCard] Load failed:', e?.message || e));
  }, [entryId]);

  // Reload on return from the signing screen
  useFocusEffect(load);

  if (!state) return null;
  const styles = createStyles(isDark);

  const signHere = () => {
    log('User tapped sign entry on this phone');
    router.push({ pathname: '/sign-entry', params: { entryId, servedAsMaster: state.served_as_master ? '1' : '0' } });
  };

  // The app shares the link; it never sends anything itself
  const shareLink = async () => {
    log('User tapped share entry signature link');
    setBusy(true);
    try {
      const req = await createEntrySignatureRequest(entryId);
      if (req.url) {
        await Share.share({
          message: `Please could you sign this sea time entry from my record? It takes a minute on your phone: ${req.url}`,
        });
      }
      load();
    } catch (e: any) {
      logError('[EntrySignatureCard] Link failed:', e?.message || e);
      Alert.alert('Could not make the link', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const getSigned = () => {
    Alert.alert(
      'Get this entry signed',
      state.served_as_master
        ? 'You served as Master, so the owner or a responsible person from the company signs (MGN 496 5.3).'
        : 'The Master signs to confirm this entry.',
      [
        { text: 'Sign on this phone', onPress: signHere },
        { text: 'Share a link', onPress: shareLink },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const cancelLink = () => {
    const link = state.pending_link;
    if (!link) return;
    Alert.alert('Cancel this link?', 'The link you shared will stop working.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel link',
        style: 'destructive',
        onPress: () => {
          cancelEntrySignatureRequest(link.id)
            .then(load)
            .catch((e) => Alert.alert('Could not cancel', e?.message || 'Please try again.'));
        },
      },
    ]);
  };

  const remove = () => {
    Alert.alert('Remove the signature?', 'The entry will need signing again.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          removeEntrySignature(entryId)
            .then(load)
            .catch((e) => Alert.alert('Could not remove', e?.message || 'Please try again.'));
        },
      },
    ]);
  };

  const sig = state.signature;
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <IconSymbol
          ios_icon_name={sig ? 'checkmark.seal.fill' : 'signature'}
          android_material_icon_name={sig ? 'verified' : 'draw'}
          size={20}
          color={sig ? colors.success : colors.primary}
        />
        <Text style={styles.title}>{sig ? 'Signed' : 'Signature'}</Text>
      </View>

      {sig ? (
        <>
          <Text style={styles.body}>
            Signed by {sig.signer_name} ({CAPACITY[sig.signer_capacity] ?? sig.signer_capacity}) on {ukDate(sig.signed_at)}
            {sig.method === 'link' ? ', from a shared link' : ''}.
          </Text>
          <Text style={styles.note}>Changing the times, vessel or service type removes the signature.</Text>
          <TouchableOpacity onPress={remove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.cancel}>Remove signature</Text>
          </TouchableOpacity>
        </>
      ) : state.cannot_sign_reason ? (
        <Text style={styles.note}>{state.cannot_sign_reason}</Text>
      ) : (
        <>
          <TouchableOpacity style={styles.button} onPress={getSigned} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.buttonText}>Get this entry signed</Text>
            )}
          </TouchableOpacity>
          {state.pending_link ? (
            <>
              <Text style={styles.note}>
                Waiting for a signature. The link works until {ukDate(state.pending_link.expires_at)}.
              </Text>
              <TouchableOpacity onPress={cancelLink} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.cancel}>Cancel link</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.note}>
              {state.served_as_master
                ? 'Hand your phone to the owner or a responsible person, or send them a link.'
                : 'Hand your phone to the Master, or send them a link.'}
            </Text>
          )}
        </>
      )}
    </View>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginLeft: 8,
    },
    body: {
      fontSize: 15,
      lineHeight: 21,
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 6,
    },
    button: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderRadius: 12,
      padding: 13,
      marginBottom: 8,
    },
    buttonText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    note: {
      fontSize: 13,
      lineHeight: 18,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 6,
    },
    cancel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.error,
      marginTop: 4,
    },
  });
