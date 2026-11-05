// Continue with Google (Android). Off until all three are true:
//  1. this build was made with EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID set (EAS env),
//  2. the native Google sign-in module is in the binary (not Expo Go or an old dev client),
//  3. the backend reports Google as configured (GET /api/auth/providers).
// The native module is loaded lazily so a build without it never crashes on import.
import { Platform, TurboModuleRegistry } from 'react-native';
import { BACKEND_URL } from '@/utils/api';
import { warn } from '@/utils/log';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';

type GoogleModule = typeof import('@react-native-google-signin/google-signin');
let googleModule: GoogleModule | null | undefined;
let configured = false;

function loadGoogle(): GoogleModule | null {
  if (googleModule !== undefined) return googleModule;
  googleModule = null;
  try {
    if (TurboModuleRegistry.get('RNGoogleSignin')) {
      googleModule = require('@react-native-google-signin/google-signin') as GoogleModule;
    }
  } catch (e: any) {
    warn('[GoogleSignIn] Native module not available:', e?.message);
  }
  return googleModule;
}

/** True when this build could offer Google sign-in (before asking the backend). */
export function googleSignInBuildEnabled(): boolean {
  return Platform.OS === 'android' && WEB_CLIENT_ID.endsWith('.apps.googleusercontent.com') && !!loadGoogle();
}

/** Build check plus the backend's say-so. Any failure hides the button. */
export async function googleSignInAvailable(): Promise<boolean> {
  if (!googleSignInBuildEnabled() || !BACKEND_URL) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/providers`, { signal: controller.signal });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.google === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export type GoogleTokenResult =
  | { type: 'success'; idToken: string }
  | { type: 'cancelled' }
  | { type: 'error'; code: 'no_play_services' | 'in_progress' | 'unavailable' | 'no_token' | 'failed'; message?: string };

/** Show the Google account sheet and return an ID token for the backend. */
export async function getGoogleIdToken(): Promise<GoogleTokenResult> {
  const mod = loadGoogle();
  if (!mod || !WEB_CLIENT_ID) return { type: 'error', code: 'unavailable' };
  const { GoogleSignin, statusCodes, isErrorWithCode } = mod;

  if (!configured) {
    GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, scopes: ['email', 'profile'] });
    configured = true;
  }

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  } catch (e: any) {
    return { type: 'error', code: 'no_play_services', message: e?.message };
  }

  try {
    const result = await GoogleSignin.signIn();
    if (result.type === 'cancelled') return { type: 'cancelled' };
    const idToken = result.data.idToken;
    // Forget the Google choice on this device so the account picker shows next
    // time (someone may share a phone or have a work and a personal account).
    GoogleSignin.signOut().catch(() => {});
    return idToken ? { type: 'success', idToken } : { type: 'error', code: 'no_token' };
  } catch (e: any) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return { type: 'cancelled' };
      if (e.code === statusCodes.IN_PROGRESS) return { type: 'error', code: 'in_progress' };
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return { type: 'error', code: 'no_play_services' };
    }
    // DEVELOPER_ERROR (code 10) here almost always means the SHA-1 or package
    // name on the Android OAuth client does not match this build's signing key.
    return { type: 'error', code: 'failed', message: e?.message || String(e?.code ?? '') };
  }
}
