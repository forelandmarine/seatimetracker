
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import { authClient } from '@/lib/auth';
import { setToken } from '@/utils/tokenStorage';

import { log, warn, error as logError } from '@/utils/log';

export default function TwoFactorScreen() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [resendSuccess, setResendSuccess] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const router = useRouter();
  const { fetchUser } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);

  useEffect(() => {
    log('[TwoFactor] Screen mounted');
    // Auto-focus the input
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const handleVerify = async () => {
    log('[TwoFactor] Verify button pressed, code length:', code.length);

    if (code.length !== 6) {
      setError('Please enter the full 6-digit code');
      return;
    }

    setError('');
    setLoading(true);

    try {
      log('[TwoFactor] Calling authClient.twoFactor.verifyOtp...');
      const result = await authClient.twoFactor.verifyOtp({ code });
      if (result.error) {
        const msg = result.error.message || 'Verification failed';
        if (msg.toLowerCase().includes('expired')) {
          setError('Code has expired. Please request a new one.');
        } else if (msg.toLowerCase().includes('invalid')) {
          setError('Invalid code. Please check and try again.');
        } else {
          setError(msg);
        }
        return;
      }
      const data = result.data as any;

      // Extract token robustly — verifyOtp may return it directly or we fetch the session
      let sessionToken: string | null = data?.token || data?.session?.token || null;

      if (!sessionToken) {
        // Give authClient a moment to update its internal state, then fetch session
        await new Promise(resolve => setTimeout(resolve, 200));
        const sessionResult = await authClient.getSession();
        sessionToken = (sessionResult?.data as any)?.session?.token || null;
      }

      if (!sessionToken) {
        // Last resort: read from authClient's storage directly
        try {
          if (Platform.OS === 'web') {
            sessionToken = localStorage.getItem('seatimetracker.bearer_token');
          } else {
            const SecureStore = await import('expo-secure-store');
            sessionToken = await SecureStore.getItemAsync('seatimetracker.bearer_token');
          }
        } catch (e) { warn('[TwoFactor] Failed to recover token from storage:', e); }
      }

      if (sessionToken) {
        // Store via the unified token storage (always persist after 2FA)
        await setToken(sessionToken, true);
        log('[TwoFactor] Session token stored via unified tokenStorage');
      } else {
        warn('[TwoFactor] Could not extract session token — fetchUser will attempt via stored token');
      }

      log('[TwoFactor] Verification successful, hydrating user session...');
      await fetchUser();
      // Navigate to index so the full redirect chain runs:
      // index → subscription check → department check → /(tabs)
      log('[TwoFactor] User session hydrated, navigating to index for redirect chain');
      router.replace('/');
    } catch (err: any) {
      logError('[TwoFactor] verifyOtp threw:', err);
      setError(err?.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    log('[TwoFactor] Resend Code pressed');
    setResending(true);
    setError('');
    setResendSuccess(false);

    try {
      log('[TwoFactor] Calling authClient.twoFactor.sendOtp...');
      const result = await authClient.twoFactor.sendOtp();
      if (result.error) {
        setError(result.error.message || 'Failed to resend code');
        return;
      }
      log('[TwoFactor] OTP resent successfully');
      setResendSuccess(true);
      setCode('');
      setTimeout(() => setResendSuccess(false), 4000);
    } catch (err: any) {
      logError('[TwoFactor] sendOtp threw:', err);
      setError(err?.message || 'Failed to resend code. Please try again.');
    } finally {
      setResending(false);
    }
  };

  // Build the visual digit boxes from the code string
  const digits = Array.from({ length: 6 }, (_, i) => code[i] ?? '');
  const isFocused = inputRef.current?.isFocused?.() ?? false;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Icon */}
        <View style={styles.iconContainer}>
          <Text style={styles.iconText}>Verify</Text>
        </View>

        {/* Header */}
        <Text style={styles.title}>Verify Your Identity</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit code sent to your email
        </Text>

        {/* OTP Input — hidden real input + visual boxes */}
        <View style={styles.otpWrapper}>
          <View style={styles.otpBoxRow}>
            {digits.map((digit, index) => {
              const isActiveBox = code.length === index || (code.length === 6 && index === 5);
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.otpBox,
                    isActiveBox && styles.otpBoxFocused,
                    digit !== '' && styles.otpBoxFilled,
                    error !== '' && styles.otpBoxError,
                  ]}
                  onPress={() => inputRef.current?.focus()}
                  activeOpacity={0.8}
                >
                  <Text style={styles.otpDigit}>{digit}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Hidden real TextInput */}
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9]/g, '').slice(0, 6);
              log('[TwoFactor] OTP input changed, length:', cleaned.length);
              setCode(cleaned);
              if (cleaned.length === 6) {
                // Small delay to let state update render before verify
                setTimeout(() => handleVerify(), 100);
              }
              setError('');
            }}
            keyboardType="number-pad"
            maxLength={6}
            style={styles.hiddenInput}
            caretHidden
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
          />
        </View>

        {/* Error message */}
        {error !== '' && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Resend success */}
        {resendSuccess && (
          <View style={styles.successContainer}>
            <Text style={styles.successText}>A new code has been sent to your email</Text>
          </View>
        )}

        {/* Verify button */}
        <TouchableOpacity
          style={[styles.verifyButton, (loading || code.length !== 6) && styles.verifyButtonDisabled]}
          onPress={handleVerify}
          disabled={loading || code.length !== 6}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.verifyButtonText}>Verify</Text>
          )}
        </TouchableOpacity>

        {/* Resend link */}
        <TouchableOpacity
          style={styles.resendButton}
          onPress={handleResend}
          disabled={resending}
        >
          {resending ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text style={styles.resendText}>Resend Code</Text>
          )}
        </TouchableOpacity>

        {/* Back to sign in */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            log('[TwoFactor] Back to sign in pressed');
            router.back();
          }}
        >
          <Text style={styles.backText}>Back to Sign In</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(isDark: boolean) {
  return StyleSheet.create({
    flex: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    content: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 48,
    },
    iconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: isDark ? colors.cardBackground : '#E8F4FD',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    iconText: {
      fontSize: 36,
    },
    title: {
      fontSize: 26,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      textAlign: 'center',
      marginBottom: 10,
    },
    subtitle: {
      fontSize: 15,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 36,
      maxWidth: 280,
    },
    otpWrapper: {
      alignItems: 'center',
      marginBottom: 24,
    },
    otpBoxRow: {
      flexDirection: 'row',
      gap: 10,
    },
    otpBox: {
      width: 48,
      height: 56,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: isDark ? colors.border : colors.borderLight,
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    otpBoxFocused: {
      borderColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 3,
    },
    otpBoxFilled: {
      borderColor: colors.accent,
      backgroundColor: isDark ? '#0D2137' : '#EBF5FF',
    },
    otpBoxError: {
      borderColor: colors.error,
    },
    otpDigit: {
      fontSize: 22,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
    },
    hiddenInput: {
      position: 'absolute',
      width: 1,
      height: 1,
      opacity: 0,
    },
    errorContainer: {
      backgroundColor: isDark ? '#2D1515' : '#FFF0F0',
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? '#5C2020' : '#FFCCCC',
      maxWidth: 340,
      width: '100%',
    },
    errorText: {
      color: colors.error,
      fontSize: 14,
      textAlign: 'center',
      fontWeight: '500',
    },
    successContainer: {
      backgroundColor: isDark ? '#0D2A1A' : '#F0FFF4',
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? '#1A5C35' : '#C6F6D5',
      maxWidth: 340,
      width: '100%',
    },
    successText: {
      color: colors.success,
      fontSize: 14,
      textAlign: 'center',
      fontWeight: '500',
    },
    verifyButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 16,
      paddingHorizontal: 24,
      alignItems: 'center',
      width: '100%',
      maxWidth: 340,
      marginBottom: 16,
    },
    verifyButtonDisabled: {
      opacity: 0.5,
    },
    verifyButtonText: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '600',
    },
    resendButton: {
      paddingVertical: 12,
      paddingHorizontal: 24,
      alignItems: 'center',
      minHeight: 44,
      justifyContent: 'center',
    },
    resendText: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: '600',
      textDecorationLine: 'underline',
    },
    backButton: {
      marginTop: 8,
      paddingVertical: 10,
      paddingHorizontal: 24,
      alignItems: 'center',
    },
    backText: {
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      fontSize: 14,
      fontWeight: '500',
    },
  });
}
