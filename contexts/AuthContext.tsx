
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { BACKEND_URL } from '@/utils/api';
import { clearBiometricCredentials } from '@/utils/biometricAuth';
import { useBridgeReady } from './BridgeReadyContext';
import { withAuthRetry, warmUpServer } from '@/utils/authRetry';
import * as tokenStorage from '@/utils/tokenStorage';
import { log, warn, error } from '@/utils/log';

// Reasonable timeouts
const API_TIMEOUT = 8000; // 8 seconds for API calls

interface User {
  id: string;
  email: string;
  name?: string;
  hasDepartment?: boolean;
  department?: string;
  testSubscriptionActive?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signInWithApple: (identityToken: string, appleUser?: any) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
  refreshTrigger: number;
  triggerRefresh: () => void;
  checkAuth: () => Promise<void>;
  /** Alias for checkAuth — re-fetches the current user session */
  fetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isBridgeReady, isInitializing } = useBridgeReady();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Ref to track in-flight auth operations.
  // Using a ref (not state) prevents stale-closure false-positives.
  const authInFlight = useRef(false);

  // Ref to track whether checkAuth is currently running so signIn/signUp
  // can avoid clobbering the loading state.
  const checkAuthInFlight = useRef(false);

  // Register the global 401 callback so API utils can trigger sign-out
  useEffect(() => {
    tokenStorage.registerOnUnauthorized(() => {
      log('[Auth] 401 received — signing out');
      tokenStorage.removeToken();
      clearBiometricCredentials();
      setUser(null);
      setLoading(false);
      try {
        router.replace('/auth');
      } catch {}
    });
    return () => tokenStorage.unregisterOnUnauthorized();
  }, []);

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const checkAuth = useCallback(async () => {
    // CRITICAL: Wait for bridge to be ready before accessing native modules
    if (!isBridgeReady) {
      return;
    }

    // Don't run checkAuth if a sign-in/sign-up is already in flight —
    // that operation owns the loading state and will call setUser itself.
    if (authInFlight.current) {
      return;
    }

    checkAuthInFlight.current = true;

    try {
      if (!BACKEND_URL) {
        setUser(null);
        setLoading(false);
        return;
      }

      const token = await tokenStorage.getToken();

      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

      try {
        const response = await fetch(`${BACKEND_URL}/api/auth/user`, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          log('[Auth] User authenticated:', data.user.email);

          // Fetch user profile to get department info and test subscription flag
          try {
            const profileController = new AbortController();
            const profileTimeoutId = setTimeout(() => profileController.abort(), API_TIMEOUT);

            const profileResponse = await fetch(`${BACKEND_URL}/api/profile`, {
              headers: { 'Authorization': `Bearer ${token}` },
              signal: profileController.signal,
            });

            clearTimeout(profileTimeoutId);

            if (profileResponse.ok) {
              const profileData = await profileResponse.json();
              setUser({
                ...data.user,
                department: profileData.department,
                hasDepartment: !!profileData.department,
                testSubscriptionActive: profileData.testSubscriptionActive || false,
              });
            } else {
              warn('[Auth] Profile fetch returned non-OK status:', profileResponse.status);
              setUser(data.user);
            }
          } catch (profileError) {
            warn('[Auth] Failed to fetch profile:', profileError);
            setUser(data.user);
          }
        } else {
          log('[Auth] Token invalid (status:', response.status, '), clearing');
          await tokenStorage.removeToken();
          setUser(null);
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);

        error('[Auth] Auth check fetch error:', fetchError);

        // On network errors or AbortError (timeout), keep existing user state.
        // Only clear the user on explicit auth failures from the server.
        const isNetworkError = fetchError instanceof TypeError && fetchError.message.includes('Network');
        const isAbortError = fetchError.name === 'AbortError';
        if (!(isNetworkError || isAbortError)) {
          await tokenStorage.removeToken();
          setUser(null);
        }
      }
    } catch (err) {
      error('[Auth] Check auth failed:', err);
      setUser(null);
    } finally {
      checkAuthInFlight.current = false;
      // Only update loading if no sign-in/sign-up is in flight — otherwise
      // that operation owns the loading state.
      if (!authInFlight.current) {
        setLoading(false);
      }
    }
  }, [isBridgeReady]);

  // CRITICAL: Only check auth after bridge is ready
  useEffect(() => {
    if (isBridgeReady && !isInitializing) {
      checkAuth();
      // Fire warm-up ping so the server is awake before the user taps Sign In
      warmUpServer();
    }
  }, [isBridgeReady, isInitializing, checkAuth]);

  // ---------------------------------------------------------------------------
  // Shared auth helper — all sign-in/sign-up methods delegate to this.
  // ---------------------------------------------------------------------------
  interface AuthenticateOpts {
    endpoint: string;
    body: object;
    label: string;
    /** Whether to persist the token to SecureStore (default true). */
    persist?: boolean;
    /** Extra error mapping applied before the generic handler. Return a
     *  user-facing message to throw, or null to fall through. */
    mapError?: (status: number, backendMsg: string) => string | null;
  }

  const authenticateWith = async (opts: AuthenticateOpts) => {
    const { endpoint, body, label, persist = true, mapError } = opts;

    if (authInFlight.current) {
      throw new Error('Authentication in progress. Please wait.');
    }
    if (!BACKEND_URL) {
      throw new Error('Backend not configured. Please contact support.');
    }

    authInFlight.current = true;
    setLoading(true);

    try {
      await withAuthRetry(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

        const fetchOptions: RequestInit = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        };

        if (Platform.OS === 'web') {
          fetchOptions.mode = 'cors';
          fetchOptions.credentials = 'include';
        }

        let response: Response;
        try {
          response = await fetch(`${BACKEND_URL}${endpoint}`, fetchOptions);
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          error(`[Auth] ${label} fetch failed:`, fetchError.message);

          if (fetchError.name === 'AbortError') {
            throw new Error('Request timed out. Please check your internet connection and try again.');
          }
          if (fetchError.message?.includes('Network') || fetchError.name === 'TypeError') {
            throw new Error('Cannot connect to server. Please check your internet connection.');
          }
          if (Platform.OS === 'ios' && fetchError.message?.includes('NSURLErrorDomain')) {
            throw new Error('Network error. Please check your internet connection and try again.');
          }
          if (Platform.OS === 'ios' && (fetchError.message?.includes('SSL') || fetchError.message?.includes('certificate'))) {
            throw new Error('Secure connection error. Please check your device date/time settings.');
          }
          if (Platform.OS === 'web' && (fetchError.message?.includes('CORS') || fetchError.message?.includes('cross-origin'))) {
            throw new Error('Connection blocked by browser security. Please contact support.');
          }
          throw new Error(`Network error: ${fetchError.message || 'Unable to connect to server'}`);
        }

        clearTimeout(timeoutId);

        if (!response.ok) {
          const contentType = response.headers.get('content-type');
          let errorText = '';
          try { errorText = await response.text(); } catch { /* ignore */ }

          error(`[Auth] ${label} failed — status:`, response.status);

          // HTML error page → server-side 5xx
          if (contentType?.includes('text/html') || errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
            throw new Error('Server error. Please try again in a moment.');
          }

          let errorData: any;
          try { errorData = JSON.parse(errorText); } catch {
            if (response.status === 401) throw new Error('Invalid email or password. Please check your credentials and try again.');
            if (response.status >= 500) throw new Error('Server error. Please try again in a moment.');
            throw new Error(`${label} failed (${response.status}). Please try again.`);
          }

          if (errorData.code === 'UND_ERR_CONNECT_TIMEOUT' || errorData.message?.includes('Connect Timeout')) {
            throw new Error('The server is experiencing connectivity issues. Please try again in a few moments.');
          }

          const backendMsg: string = errorData.error || errorData.message || '';

          // Let the caller supply custom error mapping first
          if (mapError) {
            const mapped = mapError(response.status, backendMsg);
            if (mapped) throw new Error(mapped);
          }

          // Generic fallbacks
          if (backendMsg.includes('relation') && backendMsg.includes('does not exist')) {
            throw new Error('The server is starting up. Please try again in a few moments.');
          }
          if (backendMsg.toLowerCase().includes('internal error') || response.status >= 500) {
            throw new Error('Server error. Please try again in a moment.');
          }

          throw new Error(backendMsg || `${label} failed (${response.status}). Please try again.`);
        }

        const data = await response.json();

        if (!data.session?.token) {
          throw new Error('No session token received. Please try again.');
        }

        await tokenStorage.setToken(data.session.token, persist);
        setUser(data.user);

        // Fetch profile (non-blocking) to get department + test subscription flag
        try {
          const profileController = new AbortController();
          const profileTimeoutId = setTimeout(() => profileController.abort(), API_TIMEOUT);
          const profileResponse = await fetch(`${BACKEND_URL}/api/profile`, {
            headers: { 'Authorization': `Bearer ${data.session.token}` },
            signal: profileController.signal,
          });
          clearTimeout(profileTimeoutId);
          if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            setUser({
              ...data.user,
              department: profileData.department,
              hasDepartment: !!profileData.department,
              testSubscriptionActive: profileData.testSubscriptionActive || false,
            });
          }
        } catch (profileError) {
          warn(`[Auth] Failed to fetch profile after ${label}:`, profileError);
        }

        log(`[Auth] ${label} successful`);
      }, label);
    } catch (err: any) {
      error(`[Auth] ${label} failed:`, err.message);
      throw err;
    } finally {
      authInFlight.current = false;
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Public auth methods — thin wrappers over authenticateWith
  // ---------------------------------------------------------------------------

  const signIn = useCallback(async (email: string, password: string, rememberMe: boolean = true) => {
    await authenticateWith({
      endpoint: '/api/auth/sign-in/email',
      body: { email, password },
      label: 'Sign in',
      persist: rememberMe,
      mapError: (status, msg) => {
        const lower = msg.toLowerCase();
        if (lower.includes('invalid email or password') || lower.includes('invalid credentials') || status === 401) {
          return 'Invalid email or password. Please check your credentials and try again.';
        }
        if (lower.includes('user not found')) {
          return 'No account found with that email address. Please sign up first.';
        }
        if (lower.includes('authentication failed')) {
          return 'Server error. Please try again in a moment.';
        }
        return null;
      },
    });
  }, []);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    await authenticateWith({
      endpoint: '/api/auth/sign-up/email',
      body: { email, password, name: name || 'User' },
      label: 'Sign up',
      persist: true,
      mapError: (status, msg) => {
        const lower = msg.toLowerCase();
        if (lower.includes('email already') || lower.includes('already registered') ||
            lower.includes('user already exists') || lower.includes('already in use') || status === 409) {
          return 'An account with this email already exists. Please sign in instead.';
        }
        return null;
      },
    });
  }, []);

  const signInWithApple = useCallback(async (identityToken: string, appleUser?: any) => {
    if (!identityToken) throw new Error('Invalid identity token');

    await authenticateWith({
      endpoint: '/api/auth/sign-in/apple',
      body: {
        identityToken,
        user: appleUser ? {
          email: appleUser.email || undefined,
          name: appleUser.name ? {
            firstName: appleUser.name.givenName || undefined,
            lastName: appleUser.name.familyName || undefined,
          } : undefined,
        } : undefined,
      },
      label: 'Apple sign in',
      persist: true,
    });
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await authenticateWith({
      endpoint: '/api/auth/sign-in/google',
      body: {},
      label: 'Google sign in',
      persist: true,
    });
  }, []);

  const signOut = useCallback(async () => {
    log('[Auth] Signing out');

    try {
      const token = await tokenStorage.getToken();

      // Fire-and-forget backend call
      if (token && BACKEND_URL) {
        fetch(`${BACKEND_URL}/api/auth/sign-out`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }).catch(() => {});
      }

      await tokenStorage.removeToken();
      await clearBiometricCredentials();

    } catch (err) {
      error('[Auth] Sign out cleanup error:', err);
    } finally {
      authInFlight.current = false;
      setUser(null);
      setLoading(false);
      log('[Auth] Sign out complete');

      try {
        router.replace('/auth');
      } catch (navError) {
        error('[Auth] Navigation error after sign out:', navError);
      }
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        signInWithApple,
        signInWithGoogle,
        signOut,
        isAuthenticated: !!user,
        refreshTrigger,
        triggerRefresh,
        checkAuth,
        fetchUser: checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
