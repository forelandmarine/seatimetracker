/**
 * Signature capture screen.
 *
 * Used before downloading a PDF report — captures the user's signature
 * via react-native-signature-canvas (WebView + canvas) and returns it
 * as a base64 PNG to the calling screen.
 *
 * Navigation: pushed onto the stack with router.push, on save it
 * stores the signature in AsyncStorage and goes back. The Profile
 * download flow then reads it and passes it to the PDF endpoint.
 */

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  Alert,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

export const SIGNATURE_STORAGE_KEY = 'seatime_user_signature';

export default function SignatureScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);

  const signatureRef = useRef<any>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [SignatureComponent, setSignatureComponent] = useState<any>(null);
  const [loadError, setLoadError] = useState(false);

  // Lazy-load react-native-signature-canvas — gracefully handle missing package
  React.useEffect(() => {
    import('react-native-signature-canvas')
      .then((mod) => setSignatureComponent(() => mod.default))
      .catch((err) => {
        console.warn('[Signature] Package not installed:', err);
        setLoadError(true);
      });
  }, []);

  const handleOK = async (signature: string) => {
    try {
      // signature is a base64 PNG data URL: data:image/png;base64,...
      // Save locally as cache
      await AsyncStorage.setItem(SIGNATURE_STORAGE_KEY, signature);

      // Upload to backend so it persists across devices and embeds in PDF
      const { updateUserSignature } = await import('@/utils/seaTimeApi');
      await updateUserSignature(signature).catch((err) =>
        console.warn('[Signature] Failed to upload to backend (non-critical):', err)
      );

      Alert.alert('Signature saved', 'Your signature will appear on all PDF reports.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      console.error('[Signature] Failed to save:', err);
      Alert.alert('Error', 'Failed to save signature.');
    }
  };

  const handleEmpty = () => {
    Alert.alert('Empty signature', 'Please draw your signature before saving.');
  };

  const handleClear = () => {
    signatureRef.current?.clearSignature();
    setHasSignature(false);
  };

  const handleConfirm = () => {
    signatureRef.current?.readSignature();
  };

  if (loadError) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Signature',
            headerStyle: { backgroundColor: isDark ? colors.background : colors.backgroundLight },
            headerTintColor: colors.primary,
          }}
        />
        <SafeAreaView style={styles.container}>
          <View style={styles.errorContainer}>
            <IconSymbol
              ios_icon_name="exclamationmark.triangle"
              android_material_icon_name="warning"
              size={48}
              color={colors.warning}
            />
            <Text style={styles.errorTitle}>Signature pad not available</Text>
            <Text style={styles.errorBody}>
              The signature module isn't installed in this build. The PDF report still includes a
              printable signature line — print, sign, and scan as usual.
            </Text>
            <TouchableOpacity style={styles.dismissButton} onPress={() => router.back()}>
              <Text style={styles.dismissButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </>
    );
  }

  if (!SignatureComponent) {
    return (
      <>
        <Stack.Screen options={{ title: 'Signature', headerTintColor: colors.primary }} />
        <SafeAreaView style={styles.container}>
          <View style={styles.errorContainer}>
            <Text style={styles.loadingText}>Loading signature pad...</Text>
          </View>
        </SafeAreaView>
      </>
    );
  }

  const webStyle = `
    .m-signature-pad { box-shadow: none; border: none; margin: 0; }
    .m-signature-pad--body { border: 2px dashed ${isDark ? '#3a3a3a' : '#cccccc'}; border-radius: 8px; }
    .m-signature-pad--footer { display: none; }
    body, html { background-color: ${isDark ? '#1a1a1a' : '#ffffff'}; }
    canvas { background-color: ${isDark ? '#2a2a2a' : '#ffffff'}; }
  `;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Sign here',
          headerStyle: { backgroundColor: isDark ? colors.background : colors.backgroundLight },
          headerTitleStyle: { color: isDark ? colors.text : colors.textLight },
          headerTintColor: colors.primary,
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.intro}>
          <Text style={styles.introText}>
            Sign in the box below. This signature will be embedded in your PDF testimonial.
          </Text>
        </View>

        <View style={styles.signatureContainer}>
          <SignatureComponent
            ref={signatureRef}
            onOK={handleOK}
            onEmpty={handleEmpty}
            onBegin={() => setHasSignature(true)}
            descriptionText=""
            clearText=""
            confirmText=""
            webStyle={webStyle}
            penColor={isDark ? '#FFFFFF' : '#0A1929'}
            backgroundColor={isDark ? '#2a2a2a' : '#ffffff'}
            autoClear={false}
            imageType="image/png"
          />
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.clearButton]}
            onPress={handleClear}
          >
            <IconSymbol
              ios_icon_name="arrow.counterclockwise"
              android_material_icon_name="refresh"
              size={18}
              color={colors.error}
            />
            <Text style={[styles.actionButtonText, { color: colors.error }]}>Clear</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.saveButton]}
            onPress={handleConfirm}
          >
            <IconSymbol
              ios_icon_name="checkmark"
              android_material_icon_name="check"
              size={18}
              color="#FFFFFF"
            />
            <Text style={[styles.actionButtonText, { color: '#FFFFFF' }]}>Save signature</Text>
          </TouchableOpacity>
        </View>
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
    intro: {
      padding: 20,
    },
    introText: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      lineHeight: 20,
    },
    signatureContainer: {
      flex: 1,
      marginHorizontal: 16,
      backgroundColor: isDark ? '#2a2a2a' : '#ffffff',
      borderRadius: 8,
      overflow: 'hidden',
    },
    actionRow: {
      flexDirection: 'row',
      gap: 12,
      padding: 16,
    },
    actionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 12,
    },
    clearButton: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.error,
    },
    saveButton: {
      backgroundColor: colors.primary,
    },
    actionButtonText: {
      fontSize: 15,
      fontWeight: '600',
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    errorTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      marginTop: 16,
      marginBottom: 8,
      textAlign: 'center',
    },
    errorBody: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 24,
    },
    loadingText: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    dismissButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 32,
      paddingVertical: 12,
      borderRadius: 10,
    },
    dismissButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '600',
    },
  });
