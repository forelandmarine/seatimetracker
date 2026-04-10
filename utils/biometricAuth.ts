
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { log, error, warn } from '@/utils/log';

const BIOMETRIC_CREDENTIALS_KEY = 'seatime_biometric_credentials';

interface BiometricCredentials {
  email: string;
  /** Session token — used to resume the session without replaying the password. */
  token: string;
}

/**
 * Dynamic SecureStore loader to prevent module-scope TurboModule initialization
 * This prevents early initialization that can cause SIGABRT crashes post-auth
 */
const getSecureStore = async () => {
  return await import('expo-secure-store');
};

/**
 * Check if biometric authentication is available on the device
 */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) {
      return false;
    }

    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) {
      return false;
    }

    // Check security level (iOS specific)
    const securityLevel = await LocalAuthentication.getEnrolledLevelAsync();

    if (securityLevel === LocalAuthentication.SecurityLevel.NONE) {
      return false;
    }

    return true;
  } catch (e: any) {
    error('[BiometricAuth] Error checking biometric availability:', e?.message, e?.code);
    return false;
  }
}

/**
 * Get the type of biometric authentication available
 */
export async function getBiometricType(): Promise<string> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'Face ID';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return 'Fingerprint';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return 'Iris';
    }

    return 'Biometric';
  } catch (e) {
    error('[BiometricAuth] Error getting biometric type:', e);
    return 'Biometric';
  }
}

/**
 * Authenticate user with biometrics
 */
export async function authenticateWithBiometrics(): Promise<boolean> {
  try {
    // Check if biometric is still available
    const available = await isBiometricAvailable();
    if (!available) {
      warn('[BiometricAuth] Biometric authentication no longer available');
      return false;
    }

    const biometricType = await getBiometricType();

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: `Sign in with ${biometricType}`,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
      fallbackLabel: 'Use passcode',
    });

    if (result.success) {
      log('[BiometricAuth] Biometric auth successful');
      return true;
    } else {
      if (result.error === 'lockout') {
        warn('[BiometricAuth] Too many failed attempts - biometric locked');
      } else if (result.error === 'not_enrolled') {
        warn('[BiometricAuth] No biometric credentials enrolled');
      }

      return false;
    }
  } catch (e: any) {
    error('[BiometricAuth] Error during biometric authentication:', e?.message, e?.code);
    return false;
  }
}

/**
 * Save credentials for biometric authentication.
 *
 * Stores the session **token** (not the password) so that biometric re-auth
 * resumes the existing session instead of replaying the raw password.
 */
export async function saveBiometricCredentials(
  email: string,
  token: string
): Promise<void> {
  try {
    const credentials: BiometricCredentials = {
      email,
      token,
    };

    if (Platform.OS === 'web') {
      // For web, use localStorage (not secure, but web doesn't have SecureStore)
      localStorage.setItem(BIOMETRIC_CREDENTIALS_KEY, JSON.stringify(credentials));
    } else {
      // For native, dynamically load SecureStore
      const SecureStore = await getSecureStore();
      await SecureStore.setItemAsync(
        BIOMETRIC_CREDENTIALS_KEY,
        JSON.stringify(credentials)
      );
    }

    log('[BiometricAuth] Credentials saved');
  } catch (e) {
    error('[BiometricAuth] Error saving biometric credentials:', e);
    throw new Error('Failed to save credentials for biometric authentication');
  }
}

/**
 * Get saved biometric credentials
 */
export async function getBiometricCredentials(): Promise<BiometricCredentials | null> {
  try {
    let credentialsJson: string | null = null;

    if (Platform.OS === 'web') {
      credentialsJson = localStorage.getItem(BIOMETRIC_CREDENTIALS_KEY);
    } else {
      // For native, dynamically load SecureStore
      const SecureStore = await getSecureStore();
      credentialsJson = await SecureStore.getItemAsync(BIOMETRIC_CREDENTIALS_KEY);
    }

    if (!credentialsJson) {
      return null;
    }

    const credentials: BiometricCredentials = JSON.parse(credentialsJson);
    log('[BiometricAuth] Retrieved credentials for:', credentials.email);
    return credentials;
  } catch (e) {
    error('[BiometricAuth] Error getting biometric credentials:', e);
    return null;
  }
}

/**
 * Clear saved biometric credentials
 */
export async function clearBiometricCredentials(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      localStorage.removeItem(BIOMETRIC_CREDENTIALS_KEY);
    } else {
      // For native, dynamically load SecureStore
      const SecureStore = await getSecureStore();
      await SecureStore.deleteItemAsync(BIOMETRIC_CREDENTIALS_KEY);
    }

    log('[BiometricAuth] Credentials cleared');
  } catch (e) {
    error('[BiometricAuth] Error clearing biometric credentials:', e);
  }
}
