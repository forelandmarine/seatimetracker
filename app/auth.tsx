
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  useColorScheme,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { colors } from '@/styles/commonStyles';
import * as AppleAuthentication from 'expo-apple-authentication';
import { BACKEND_URL } from '@/utils/api';
import { warmUpServer } from '@/utils/authRetry';
import {
  getBiometricCredentials,
  saveBiometricCredentials,
  clearBiometricCredentials,
  isBiometricAvailable,
  authenticateWithBiometrics
} from '@/utils/biometricAuth';
import { getToken } from '@/utils/tokenStorage';
import { log, error as logError } from '@/utils/log';
import { RETRYABLE_CODES } from '@/utils/errorCodes';
import ErrorModal from '@/components/ErrorModal';
import { createAuthStyles } from '@/styles/authStyles';

export default function AuthScreen() {
  const { t } = useTranslation();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isRetryableError, setIsRetryableError] = useState(false);
  const pendingRetryAction = React.useRef<(() => void) | null>(null);
  const passwordRef = React.useRef<any>(null);
  const { user, signIn, signUp, signInWithApple, checkAuth } = useAuth();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    checkBiometricAvailability();
    checkSavedCredentials();
    // Fire warm-up ping immediately so server is ready when user taps Sign In
    warmUpServer();
  }, []);

  const checkBiometricAvailability = async () => {
    const available = await isBiometricAvailable();
    setBiometricAvailable(available);
  };

  const checkSavedCredentials = async () => {
    const credentials = await getBiometricCredentials();
    setHasSavedCredentials(!!credentials);
  };

  const showError = (message: string, retryAction?: () => void, errorCode?: string) => {
    setErrorMessage(message);
    // Use error code if available, otherwise fall back to message heuristic
    const isConnectionError = errorCode
      ? RETRYABLE_CODES.has(errorCode)
      : /trouble connecting|check your connection|Cannot connect|timed out|temporarily unavailable|connectivity issues|initializing|[Ss]erver error/.test(message);
    setIsRetryableError(isConnectionError && !!retryAction);
    pendingRetryAction.current = retryAction || null;
    setErrorModalVisible(true);
  };

  const handleRetryFromModal = () => {
    setErrorModalVisible(false);
    const action = pendingRetryAction.current;
    pendingRetryAction.current = null;
    if (action) {
      // Small delay so modal closes before re-attempting
      setTimeout(action, 150);
    }
  };

  const handleBiometricSignIn = async () => {
    try {
      setLoading(true);

      const credentials = await getBiometricCredentials();
      if (!credentials) {
        showError('No saved credentials found. Please sign in with email and password first.');
        return;
      }

      const authenticated = await authenticateWithBiometrics();
      if (!authenticated) {
        return;
      }

      // Detect stale credentials from before the password→token migration.
      // Old format stored a password (short, not hex); new format stores a
      // 64-char hex session token.
      const storedToken = credentials.token ?? (credentials as any).password;
      const looksLikeToken = storedToken && storedToken.length >= 32 && /^[a-f0-9]+$/i.test(storedToken);

      if (!storedToken || !looksLikeToken) {
        await clearBiometricCredentials();
        setHasSavedCredentials(false);
        showError(Platform.OS === 'ios' ? 'Please sign in with your email and password to re-enable Face ID.' : 'Please sign in with your email and password to re-enable biometric sign-in.');
        return;
      }

      // Resume session using the stored token.
      const { setToken, getToken } = await import('@/utils/tokenStorage');
      await setToken(storedToken, true);
      await checkAuth();

      // Verify the token was accepted by checking if it's still stored
      // (checkAuth clears invalid tokens). Can't rely on `user` state here
      // because React batches state updates.
      const tokenAfterCheck = await getToken();
      if (!tokenAfterCheck) {
        await clearBiometricCredentials();
        setHasSavedCredentials(false);
        showError('Your session has expired. Please sign in with email and password.');
        return;
      }

      router.replace('/');
    } catch (error: any) {
      logError('[AuthScreen] Biometric sign in failed:', error);
      // Clear stale biometric credentials on any error to prevent loops
      await clearBiometricCredentials();
      setHasSavedCredentials(false);
      showError('Biometric sign in failed. Please sign in with your email and password to re-enable it.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    if (loading) return;
    log('[AuthScreen] Email auth started, mode:', isSignUp ? 'Sign Up' : 'Sign In');

    if (!BACKEND_URL) {
      showError('Backend not configured. Please contact support.');
      return;
    }

    if (!email || !password) {
      showError('Please enter your email and password');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      showError('Please enter a valid email address');
      return;
    }

    if (password.length < 8) {
      showError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    
    try {
      if (isSignUp) {
        await signUp(email, password, name || 'User');
      } else {
        await signIn(email, password, rememberMe);
      }

      // Save session token for biometric sign-in (both sign-up and sign-in)
      if (rememberMe && biometricAvailable) {
        try {
          const token = await getToken();
          if (token) {
            await saveBiometricCredentials(email, token);
            setHasSavedCredentials(true);
          }
        } catch (_bioError) {
          // non-fatal — biometric save failed silently
        }
      }

      log('[AuthScreen] Auth successful, navigating to index');
      router.replace('/');
    } catch (error: any) {
      logError('[AuthScreen] Email auth failed:', error.message);

      const rawMsg: string = error.message || 'Authentication failed';

      // Map connection/server errors to a retryable message.
      // Credential errors (wrong password, user not found, etc.) surface as-is.
      const isConnectionError =
        rawMsg.includes('Having trouble connecting') ||
        rawMsg.includes('Cannot connect') ||
        rawMsg.includes('timed out') ||
        rawMsg.includes('timeout') ||
        rawMsg.includes('Server error') ||
        rawMsg.includes('server error') ||
        rawMsg.includes('temporarily unavailable') ||
        rawMsg.includes('connectivity issues') ||
        rawMsg.includes('starting up');

      const errorMsg = isConnectionError
        ? 'Having trouble connecting. Please check your connection and try again.'
        : rawMsg;

      // Only offer retry for connection errors, not credential errors
      showError(errorMsg, isConnectionError ? () => handleEmailAuth() : undefined);
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    if (loading) return;
    try {
      const isAvailable = await AppleAuthentication.isAvailableAsync();

      if (!isAvailable) {
        showError('Sign in with Apple is not available on this device');
        return;
      }

      setLoading(true);

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential?.identityToken) {
        showError('Failed to get Apple authentication token');
        return;
      }

      const appleUserData = {
        email: credential.email || undefined,
        name: credential.fullName ? {
          givenName: credential.fullName.givenName || undefined,
          familyName: credential.fullName.familyName || undefined,
        } : undefined,
      };
      
      await signInWithApple(credential.identityToken, appleUserData);

      log('[AuthScreen] Apple sign in successful, navigating to index');
      
      setTimeout(() => router.replace('/'), 100);
    } catch (error: any) {
      logError('[AuthScreen] Apple sign in failed:', error.message);

      // Don't show error for user cancellation
      if (error.code === 'ERR_CANCELED' || error.code === 'ERR_REQUEST_CANCELED') {
        return;
      }
      
      let errorMsg = 'Apple Sign In failed. Please try again.';
      let isRetryable = true;

      if (error.code === 'ERR_INVALID_RESPONSE') {
        errorMsg = 'Invalid response from Apple. Please try again.';
      } else if (error.message?.includes('Apple authentication failed')) {
        errorMsg = 'Apple Sign In could not be verified. Please try again.';
      } else if (error.message?.includes('Having trouble connecting') || error.message?.includes('Network') || error.message?.includes('timed out')) {
        errorMsg = 'Cannot reach the server. Please check your internet connection and try again.';
      } else if (error.message?.includes('Server error') || error.message?.includes('service error')) {
        errorMsg = 'Our servers are temporarily unavailable. Please try again in a moment.';
      } else if (error.message?.includes('Too many')) {
        errorMsg = error.message;
        isRetryable = false;
      } else if (error.message) {
        errorMsg = error.message;
      }

      showError(errorMsg, isRetryable ? () => handleAppleSignIn() : undefined);
    } finally {
      // Always reset loading state so the button is never permanently stuck
      setLoading(false);
    }
  };

  const styles = createAuthStyles(isDark);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">
      <View style={styles.header}>
        <Image
          source={isDark ? require('@/assets/images/8331a0b9-33c9-4ff2-93d0-772c257bd0c9.png') : require('@/assets/images/8044436c-d8cf-489e-bf5f-7a7114b33cc0.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>SeaTime Tracker</Text>
        <Text style={styles.subtitle}>By Foreland Marine</Text>
        
        {!BACKEND_URL && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>
              Backend not configured. Authentication may not work.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.form}>
        {biometricAvailable && hasSavedCredentials && !isSignUp && (
          <TouchableOpacity
            style={[styles.button, styles.biometricButton]}
            onPress={handleBiometricSignIn}
            disabled={loading}
            accessibilityLabel="Sign in with biometrics"
          >
            <Text style={styles.biometricButtonText}>
              {Platform.OS === 'ios' ? t('auth.signInWithFaceId') : 'Sign in with Biometrics'}
            </Text>
          </TouchableOpacity>
        )}

        {biometricAvailable && hasSavedCredentials && !isSignUp && (
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>
        )}

        {isSignUp && (
          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('auth.name')}</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>
        )}

        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('auth.email')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('auth.enterEmail')}
            placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="username"
            accessibilityLabel="Email address"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('auth.password')}</Text>
          <TextInput
            ref={passwordRef}
            style={styles.input}
            placeholder={isSignUp ? t('auth.minPassword') : t('auth.enterPassword')}
            placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={isSignUp ? 'password-new' : 'password'}
            textContentType={isSignUp ? 'newPassword' : 'password'}
            accessibilityLabel="Password"
            returnKeyType="done"
            onSubmitEditing={handleEmailAuth}
          />
        </View>

        {!isSignUp && (
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setRememberMe(!rememberMe)}
          >
            <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
              {rememberMe && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>
              {biometricAvailable
                ? (Platform.OS === 'ios' ? t('auth.rememberMeBiometric') : 'Remember me (enable biometric sign in)')
                : t('auth.rememberMe')}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={handleEmailAuth}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>
              {isSignUp ? t('auth.signUp') : t('auth.signIn')}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => {
            log('[AuthScreen] Switching mode to:', isSignUp ? 'Sign In' : 'Sign Up');
            setIsSignUp(!isSignUp);
            setEmail('');
            setPassword('');
            setName('');
          }}
        >
          <Text style={styles.switchText}>
            {isSignUp
              ? t('auth.alreadyHaveAccount')
              : t('auth.needAccount')}
          </Text>
        </TouchableOpacity>

        {!isSignUp && (
          <TouchableOpacity
            style={styles.forgotPasswordButton}
            onPress={() => router.push('/forgot-password')}
          >
            <Text style={styles.forgotPasswordText}>{t('auth.forgotPassword')}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        {Platform.OS === 'ios' && (
          <View pointerEvents={loading ? 'none' : 'auto'} style={loading ? { opacity: 0.5 } : undefined}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={
                isDark
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={12}
              style={styles.appleButton}
              onPress={handleAppleSignIn}
            />
          </View>
        )}

      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {t('auth.secureData')}
        </Text>
        <Text style={styles.footerText}>
          {t(Platform.OS === 'ios' ? 'auth.iosCompliant' : 'auth.androidCompliant')}
        </Text>
      </View>

      <ErrorModal
        visible={errorModalVisible}
        title={isRetryableError ? 'Connection Problem' : 'Sign In Error'}
        message={errorMessage}
        isRetryable={isRetryableError}
        onDismiss={() => setErrorModalVisible(false)}
        onRetry={handleRetryFromModal}
      />
    </ScrollView>
  );
}

