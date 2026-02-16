
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

const BIOMETRIC_CREDENTIALS_KEY = 'seatime_biometric_credentials';

interface BiometricCredentials {
  email: string;
  password: string;
}

/**
 * Dynamic SecureStore loader to prevent module-scope TurboModule initialization
 * This prevents early initialization that can cause SIGABRT crashes post-auth
 */
const getSecureStore = async () => {
  console.log('[BiometricAuth] Dynamically loading expo-secure-store...');
  // Add a small delay to ensure the app is fully initialized
  await new Promise(resolve => setTimeout(resolve, 100));
  return await import('expo-secure-store');
};

/**
 * Check if biometric authentication is available on the device
 */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    console.log('[BiometricAuth] Checking biometric availability...');
    
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) {
      console.log('[BiometricAuth] Device does not support biometric authentication');
      return false;
    }
    console.log('[BiometricAuth] Device has biometric hardware');

    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) {
      console.log('[BiometricAuth] No biometric credentials enrolled on device');
      return false;
    }
    console.log('[BiometricAuth] Biometric credentials are enrolled');

    // Check security level (iOS specific)
    const securityLevel = await LocalAuthentication.getEnrolledLevelAsync();
    console.log('[BiometricAuth] Security level:', securityLevel);
    
    if (securityLevel === LocalAuthentication.SecurityLevel.NONE) {
      console.log('[BiometricAuth] No secure authentication available');
      return false;
    }

    console.log('[BiometricAuth] Biometric authentication is available and ready');
    return true;
  } catch (error: any) {
    console.error('[BiometricAuth] Error checking biometric availability:', error);
    console.error('[BiometricAuth] Error details:', {
      message: error?.message,
      code: error?.code,
      name: error?.name,
    });
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
  } catch (error) {
    console.error('[BiometricAuth] Error getting biometric type:', error);
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
      console.warn('[BiometricAuth] Biometric authentication no longer available');
      return false;
    }

    const biometricType = await getBiometricType();
    console.log('[BiometricAuth] Requesting biometric authentication:', biometricType);

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: `Sign in with ${biometricType}`,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
      fallbackLabel: 'Use passcode',
    });

    if (result.success) {
      console.log('[BiometricAuth] Biometric authentication successful');
      return true;
    } else {
      console.log('[BiometricAuth] Biometric authentication failed:', result.error);
      
      // Log specific error types for debugging
      if (result.error === 'user_cancel') {
        console.log('[BiometricAuth] User cancelled authentication');
      } else if (result.error === 'system_cancel') {
        console.log('[BiometricAuth] System cancelled authentication');
      } else if (result.error === 'lockout') {
        console.warn('[BiometricAuth] Too many failed attempts - biometric locked');
      } else if (result.error === 'not_enrolled') {
        console.warn('[BiometricAuth] No biometric credentials enrolled');
      }
      
      return false;
    }
  } catch (error: any) {
    console.error('[BiometricAuth] Error during biometric authentication:', error);
    console.error('[BiometricAuth] Error details:', {
      message: error?.message,
      code: error?.code,
      name: error?.name,
    });
    return false;
  }
}

/**
 * Save credentials for biometric authentication
 */
export async function saveBiometricCredentials(
  email: string,
  password: string
): Promise<void> {
  try {
    console.log('[BiometricAuth] Saving credentials for biometric authentication');
    
    const credentials: BiometricCredentials = {
      email,
      password,
    };

    if (Platform.OS === 'web') {
      // For web, use localStorage (not secure, but web doesn't have SecureStore)
      localStorage.setItem(BIOMETRIC_CREDENTIALS_KEY, JSON.stringify(credentials));
      console.log('[BiometricAuth] Credentials saved to localStorage (web)');
    } else {
      // For native, dynamically load SecureStore
      const SecureStore = await getSecureStore();
      await SecureStore.setItemAsync(
        BIOMETRIC_CREDENTIALS_KEY,
        JSON.stringify(credentials)
      );
      console.log('[BiometricAuth] Credentials saved to SecureStore');
    }
  } catch (error) {
    console.error('[BiometricAuth] Error saving biometric credentials:', error);
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
      console.log('[BiometricAuth] No saved credentials found');
      return null;
    }

    const credentials: BiometricCredentials = JSON.parse(credentialsJson);
    console.log('[BiometricAuth] Retrieved saved credentials for:', credentials.email);
    return credentials;
  } catch (error) {
    console.error('[BiometricAuth] Error getting biometric credentials:', error);
    return null;
  }
}

/**
 * Clear saved biometric credentials
 */
export async function clearBiometricCredentials(): Promise<void> {
  try {
    console.log('[BiometricAuth] Clearing saved biometric credentials');

    if (Platform.OS === 'web') {
      localStorage.removeItem(BIOMETRIC_CREDENTIALS_KEY);
    } else {
      // For native, dynamically load SecureStore
      const SecureStore = await getSecureStore();
      await SecureStore.deleteItemAsync(BIOMETRIC_CREDENTIALS_KEY);
    }

    console.log('[BiometricAuth] Biometric credentials cleared');
  } catch (error) {
    console.error('[BiometricAuth] Error clearing biometric credentials:', error);
  }
}
