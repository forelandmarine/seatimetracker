/**
 * Sign one sea time entry on this phone.
 *
 * The seafarer hands the phone to the Master, or to the owner or a responsible
 * person where the seafarer was Master (MGN 496 5.3). They print their name, say
 * in which capacity they sign, confirm the entry and sign in the box. The
 * signature is drawn dark on white whatever the theme, so it prints on the
 * testimonial PDF.
 *
 * Params: entryId, servedAsMaster ('1' or '0').
 */

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  useColorScheme,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { signEntryInPerson, type SignerCapacity } from '@/utils/seaTimeApi';
import { log, warn, error as logError } from '@/utils/log';

export default function SignEntryScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const { entryId, servedAsMaster } = useLocalSearchParams<{ entryId: string; servedAsMaster?: string }>();
  const masterOnly = servedAsMaster === '1';

  const signatureRef = useRef<any>(null);
  const [SignatureComponent, setSignatureComponent] = useState<any>(null);
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState<SignerCapacity | null>(masterOnly ? 'responsible_person' : null);
  const [confirmed, setConfirmed] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  React.useEffect(() => {
    import('react-native-signature-canvas')
      .then((mod) => setSignatureComponent(() => mod.default))
      .catch((err) => {
        warn('[SignEntry] Package not installed:', err);
        setLoadError(true);
      });
  }, []);

  const problem = !name.trim()
    ? 'Please print the name of the person signing.'
    : !capacity
      ? 'Please choose Master or responsible person.'
      : !confirmed
        ? 'Please confirm the entry.'
        : !drawn
          ? 'Please sign in the box.'
          : null;

  const submit = () => {
    if (problem) {
      Alert.alert('Not signed yet', problem);
      return;
    }
    signatureRef.current?.readSignature();
  };

  const handleOK = async (signature: string) => {
    if (!entryId || !capacity) return;
    log('[SignEntry] Submitting signature');
    setSaving(true);
    try {
      await signEntryInPerson(entryId, { signer_name: name.trim(), signer_capacity: capacity, signature_image: signature });
      Alert.alert('Entry signed', 'The signature is saved with this entry.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      logError('[SignEntry] Failed:', e?.message || e);
      Alert.alert('Could not sign', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const clear = () => {
    signatureRef.current?.clearSignature();
    setDrawn(false);
  };

  const webStyle = `
    .m-signature-pad { box-shadow: none; border: none; margin: 0; }
    .m-signature-pad--body { border: 2px dashed #cccccc; border-radius: 8px; }
    .m-signature-pad--footer { display: none; }
    body, html { background-color: #ffffff; }
    canvas { background-color: #ffffff; }
  `;

  const CapacityOption = ({ value, label }: { value: SignerCapacity; label: string }) => (
    <TouchableOpacity
      style={[styles.option, capacity === value && styles.optionSelected]}
      onPress={() => setCapacity(value)}
    >
      <Text style={[styles.optionText, capacity === value && styles.optionTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Sign entry',
          headerStyle: { backgroundColor: isDark ? colors.background : colors.backgroundLight },
          headerTitleStyle: { color: isDark ? colors.text : colors.textLight },
          headerTintColor: colors.primary,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content} scrollEnabled={scrollEnabled} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>
            {masterOnly
              ? 'The seafarer served as Master on this entry, so the owner or a responsible person from the management company signs (MGN 496 5.3).'
              : 'For the Master: please check this entry against the vessel\'s records, then sign.'}
          </Text>

          <Text style={styles.label}>Name (print)</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
            autoCapitalize="words"
            maxLength={200}
          />

          <Text style={styles.label}>Signing as</Text>
          <View style={styles.options}>
            {!masterOnly && <CapacityOption value="master" label="Master" />}
            <CapacityOption value="responsible_person" label="Responsible person" />
          </View>

          <Text style={styles.label}>Signature</Text>
          {loadError ? (
            <Text style={styles.intro}>The signature pad is not available in this build. Share a link instead.</Text>
          ) : !SignatureComponent ? (
            <ActivityIndicator color={colors.primary} style={styles.pad} />
          ) : (
            <View style={styles.pad}>
              <SignatureComponent
                ref={signatureRef}
                onOK={handleOK}
                onEmpty={() => Alert.alert('Not signed yet', 'Please sign in the box.')}
                onBegin={() => { setDrawn(true); setScrollEnabled(false); }}
                onEnd={() => setScrollEnabled(true)}
                descriptionText=""
                clearText=""
                confirmText=""
                webStyle={webStyle}
                penColor="#0A1929"
                backgroundColor="#ffffff"
                autoClear={false}
                imageType="image/png"
              />
            </View>
          )}
          <TouchableOpacity onPress={clear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.link}>Clear signature</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.check} onPress={() => setConfirmed(!confirmed)}>
            <IconSymbol
              ios_icon_name={confirmed ? 'checkmark.square.fill' : 'square'}
              android_material_icon_name={confirmed ? 'check-box' : 'check-box-outline-blank'}
              size={24}
              color={colors.primary}
            />
            <Text style={styles.checkText}>I have checked this entry against the vessel's records and confirm it.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.save, (saving || loadError) && styles.saveDisabled]} onPress={submit} disabled={saving || loadError}>
            {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.saveText}>Sign entry</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
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
      padding: 16,
      paddingBottom: 40,
    },
    intro: {
      fontSize: 14,
      lineHeight: 20,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 8,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginTop: 16,
      marginBottom: 8,
    },
    input: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      borderRadius: 10,
      padding: 12,
      fontSize: 16,
      color: isDark ? colors.text : colors.textLight,
    },
    options: {
      flexDirection: 'row',
      gap: 10,
    },
    option: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    optionSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    optionText: {
      fontSize: 15,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
    },
    optionTextSelected: {
      color: '#ffffff',
    },
    pad: {
      height: 220,
      backgroundColor: '#ffffff',
      borderRadius: 8,
      overflow: 'hidden',
      justifyContent: 'center',
    },
    link: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
      marginTop: 8,
    },
    check: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginTop: 20,
    },
    checkText: {
      flex: 1,
      fontSize: 15,
      lineHeight: 21,
      color: isDark ? colors.text : colors.textLight,
    },
    save: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 24,
    },
    saveDisabled: {
      opacity: 0.5,
    },
    saveText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
  });
