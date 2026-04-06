
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { BACKEND_URL } from '@/utils/api';
import { clearBiometricCredentials } from '@/utils/biometricAuth';
import { useBridgeReady } from './BridgeReadyContext';
import { withAuthRetry, warmUpServer } from '@/utils/authRetry';
import * as tokenStorage from '@/utils/tokenStorage';

// Reasonable timeouts
const API_TIMEOUT = 30000; // 30 seconds for API calls

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
      console.log('[Auth] 401 received from API util — signing out');
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
    console.log('[Auth] Global refresh triggered');
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const checkAuth = useCallback(async () => {
    // CRITICAL: Wait for bridge to be ready before accessing native modules
    if (!isBridgeReady) {
      console.log('[Auth] Bridge not ready, deferring auth check');
      return;
    }

    // Don't run checkAuth if a sign-in/sign-up is already in flight —
    // that operation owns the loading state and will call setUser itself.
    if (authInFlight.current) {
      console.log('[Auth] Auth operation in flight, skipping checkAuth');
      return;
    }

    console.log('[Auth] Checking authentication...');
    checkAuthInFlight.current = true;

    try {
      if (!BACKEND_URL) {
        console.log('[Auth] No backend URL configured');
        setUser(null);
        setLoading(false);
        return;
      }

      const token = await tokenStorage.getToken();

      if (!token) {
        console.log('[Auth] No token found');
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
          console.log('[Auth] User authenticated:', data.user.email);

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
              console.log('[Auth] User profile loaded, department:', profileData.department);
              console.log('[Auth] Test subscription active:', profileData.testSubscriptionActive || false);
              setUser({
                ...data.user,
                department: profileData.department,
                hasDepartment: !!profileData.department,
                testSubscriptionActive: profileData.testSubscriptionActive || false,
              });
            } else {
              console.warn('[Auth] Profile fetch returned non-OK status:', profileResponse.status);
              setUser(data.user);
            }
          } catch (profileError) {
            console.warn('[Auth] Failed to fetch profile, continuing with basic user data:', profileError);
            setUser(data.user);
          }
        } else {
          console.log('[Auth] Token invalid (status:', response.status, '), clearing');
          await tokenStorage.removeToken();
          setUser(null);
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);

        console.error('[Auth] Auth check fetch error:', fetchError);

        // On network errors or AbortError (timeout), keep existing user state.
        // Only clear the user on explicit auth failures from the server.
        const isNetworkError = fetchError instanceof TypeError && fetchError.message.includes('Network');
        const isAbortError = fetchError.name === 'AbortError';
        if (isNetworkError || isAbortError) {
          console.log('[Auth] Network/timeout error during auth check — preserving existing user state');
        } else {
          await tokenStorage.removeToken();
          setUser(null);
        }
      }
    } catch (error) {
      console.error('[Auth] Check auth failed:', error);
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
      console.log('[Auth] Bridge ready, checking authentication...');
      checkAuth();
      // Fire warm-up ping so the server is awake before the user taps Sign In
      warmUpServer();
    } else {
      console.log('[Auth] Waiting for bridge to be ready...');
    }
  }, [isBridgeReady, isInitializing, checkAuth]);

  const signIn = useCallback(async (email: string, password: string, rememberMe: boolean = true) => {
    // Guard against concurrent auth operations
    if (authInFlight.current) {
      throw new Error('Authentication in progress. Please wait.');
    }

    if (!BACKEND_URL) {
      throw new Error('Backend not configured. Please contact support.');
    }

    console.log('[Auth] ========== SIGN IN STARTED ==========');
    console.log('[Auth] Platform:', Platform.OS);
    console.log('[Auth] Email:', email);
    console.log('[Auth] Backend URL:', BACKEND_URL);
    console.log('[Auth] Request URL:', `${BACKEND_URL}/api/auth/sign-in/email`);
    console.log('[Auth] Remember me:', rememberMe);

    authInFlight.current = true;
    setLoading(true);

    try {
      await withAuthRetry(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.error('[Auth] Request timeout after 30 seconds');
          controller.abort();
        }, API_TIMEOUT);

        const requestBody = { email, password };
        console.log('[Auth] Sending fetch request...');
        const fetchStartTime = Date.now();

        let response: Response;
        try {
          const fetchOptions: RequestInit = {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          };

          if (Platform.OS === 'web') {
            console.log('[Auth] Web platform detected - adding CORS mode and credentials');
            fetchOptions.mode = 'cors';
            fetchOptions.credentials = 'include';
          }

          response = await fetch(`${BACKEND_URL}/api/auth/sign-in/email`, fetchOptions);
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          const fetchDuration = Date.now() - fetchStartTime;

          console.error('[Auth] ========== FETCH FAILED ==========');
          console.error('[Auth] Fetch duration:', fetchDuration, 'ms');
          console.error('[Auth] Error type:', fetchError.constructor.name);
          console.error('[Auth] Error message:', fetchError.message);

          if (fetchError.name === 'AbortError') {
            throw new Error('Request timed out. Please check your internet connection and try again.');
          }

          if (fetchError.message?.includes('Network') || fetchError.name === 'TypeError') {
            throw new Error('Cannot connect to server. Please check your internet connection.');
          }

          if (Platform.OS === 'ios') {
            if (fetchError.message?.includes('NSURLErrorDomain')) {
              throw new Error('Network error. Please check your internet connection and try again.');
            }
            if (fetchError.message?.includes('SSL') || fetchError.message?.includes('certificate')) {
              throw new Error('Secure connection error. Please check your device date/time settings.');
            }
          }

          if (Platform.OS === 'web') {
            if (fetchError.message?.includes('CORS') || fetchError.message?.includes('cross-origin')) {
              throw new Error('Connection blocked by browser security. Please contact support.');
            }
          }

          throw new Error(`Network error: ${fetchError.message || 'Unable to connect to server'}`);
        }

        clearTimeout(timeoutId);
        const fetchDuration = Date.now() - fetchStartTime;

        console.log('[Auth] Fetch completed in', fetchDuration, 'ms');
        console.log('[Auth] Response status:', response.status);

        if (!response.ok) {
          const contentType = response.headers.get('content-type');
          console.error('[Auth] Sign in failed - Status:', response.status, 'Content-Type:', contentType);

          let errorText = '';
          try {
            errorText = await response.text();
            console.error('[Auth] Error response body (first 500 chars):', errorText.substring(0, 500));
          } catch (textError) {
            console.error('[Auth] Could not read error response body:', textError);
          }

          // HTML error page → server-side 5xx
          if (contentType?.includes('text/html') || errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
            console.error('[Auth] Received HTML error page — backend returned 5xx');
            throw new Error('Server error. Please try again in a moment.');
          }

          // Try to parse JSON error
          let errorData: any;
          try {
            errorData = JSON.parse(errorText);
            console.error('[Auth] Parsed error data:', errorData);
          } catch {
            // Non-JSON, non-HTML error body
            if (response.status === 401) {
              throw new Error('Invalid email or password. Please check your credentials and try again.');
            } else if (response.status >= 500) {
              throw new Error('Server error. Please try again in a moment.');
            } else if (response.status === 503) {
              throw new Error('Service temporarily unavailable. Please try again shortly.');
            }
            throw new Error(`Sign in failed (${response.status}). Please try again.`);
          }

          // Backend connection timeout
          if (errorData.code === 'UND_ERR_CONNECT_TIMEOUT' || errorData.message?.includes('Connect Timeout')) {
            console.error('[Auth] Backend connection timeout');
            throw new Error('The server is experiencing connectivity issues. Please try again in a few moments.');
          }

          // Map backend error messages to user-friendly messages
          const backendMsg: string = errorData.error || errorData.message || '';
          console.log('[Auth] Backend error message:', backendMsg);

          if (
            backendMsg.toLowerCase().includes('invalid email or password') ||
            backendMsg.toLowerCase().includes('invalid credentials') ||
            response.status === 401
          ) {
            throw new Error('Invalid email or password. Please check your credentials and try again.');
          }

          if (backendMsg.toLowerCase().includes('user not found')) {
            throw new Error('No account found with that email address. Please sign up first.');
          }

          if (backendMsg.includes('relation') && backendMsg.includes('does not exist')) {
            console.error('[Auth] Database table missing — database is being initialised');
            throw new Error('The server is starting up. Please try again in a few moments.');
          }

          if (
            backendMsg.toLowerCase().includes('internal error') ||
            backendMsg.toLowerCase().includes('authentication failed')
          ) {
            console.error('[Auth] Internal authentication error');
            throw new Error('Server error. Please try again in a moment.');
          }

          // Surface the raw backend message if it's meaningful, otherwise generic
          throw new Error(backendMsg || `Sign in failed (${response.status}). Please try again.`);
        }

        console.log('[Auth] Response OK, parsing JSON...');
        const data = await response.json();
        console.log('[Auth] Response data keys:', Object.keys(data));
        console.log('[Auth] Has session:', !!data.session);
        console.log('[Auth] Has user:', !!data.user);

        if (!data.session?.token) {
          console.error('[Auth] No session token in response:', JSON.stringify(data, null, 2));
          throw new Error('No session token received from server. Please try again.');
        }

        console.log('[Auth] Session token received, length:', data.session.token.length);

        // Store token — persist to SecureStore only when rememberMe=true
        console.log('[Auth] Storing token (persist:', rememberMe, ')...');
        await tokenStorage.setToken(data.session.token, rememberMe);
        console.log('[Auth] Token stored successfully');

        // Set user immediately
        setUser(data.user);
        console.log('[Auth] User state set, email:', data.user.email);

        // Fetch user profile (non-blocking) to get test subscription flag
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
            console.log('[Auth] Profile fetched after sign in, department:', profileData.department);
            console.log('[Auth] Test subscription active:', profileData.testSubscriptionActive || false);
            setUser({
              ...data.user,
              department: profileData.department,
              hasDepartment: !!profileData.department,
              testSubscriptionActive: profileData.testSubscriptionActive || false,
            });
          }
        } catch (profileError) {
          console.warn('[Auth] Failed to fetch profile after sign in (non-critical):', profileError);
        }

        console.log('[Auth] ========== SIGN IN SUCCESSFUL ==========');
      }, 'signIn');
    } catch (error: any) {
      console.error('[Auth] ========== SIGN IN FAILED (all retries exhausted) ==========');
      console.error('[Auth] Error type:', error.constructor.name);
      console.error('[Auth] Error message:', error.message);
      throw error;
    } finally {
      authInFlight.current = false;
      setLoading(false);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    if (authInFlight.current) {
      throw new Error('Authentication in progress. Please wait.');
    }

    if (!BACKEND_URL) {
      throw new Error('Backend not configured. Please contact support.');
    }

    console.log('[Auth] ========== SIGN UP STARTED ==========');
    console.log('[Auth] Platform:', Platform.OS);
    console.log('[Auth] Email:', email);
    console.log('[Auth] Backend URL:', BACKEND_URL);

    authInFlight.current = true;
    setLoading(true);

    try {
      await withAuthRetry(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

        const fetchOptions: RequestInit = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ email, password, name: name || 'User' }),
          signal: controller.signal,
        };

        if (Platform.OS === 'web') {
          fetchOptions.mode = 'cors';
          fetchOptions.credentials = 'include';
        }

        const response = await fetch(`${BACKEND_URL}/api/auth/sign-up/email`, fetchOptions);

        clearTimeout(timeoutId);
        console.log('[Auth] Sign up response status:', response.status);

        if (!response.ok) {
          const contentType = response.headers.get('content-type');
          let errorText = '';
          try {
            errorText = await response.text();
          } catch { /* ignore */ }

          console.error('[Auth] Sign up error response:', errorText.substring(0, 500));

          // HTML error page → server-side 5xx
          if (contentType?.includes('text/html') || errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
            console.error('[Auth] Received HTML error page on sign up — backend returned 5xx');
            throw new Error('Server error. Please try again in a moment.');
          }

          let errorData: any;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            if (response.status >= 500) {
              throw new Error('Server error. Please try again in a moment.');
            }
            throw new Error(`Registration failed (${response.status}). Please try again.`);
          }

          // Backend connection timeout
          if (errorData.code === 'UND_ERR_CONNECT_TIMEOUT' || errorData.message?.includes('Connect Timeout')) {
            throw new Error('The server is experiencing connectivity issues. Please try again in a few moments.');
          }

          const backendMsg: string = errorData.error || errorData.message || '';
          console.log('[Auth] Sign up backend error:', backendMsg);

          if (
            backendMsg.toLowerCase().includes('email already') ||
            backendMsg.toLowerCase().includes('already registered') ||
            backendMsg.toLowerCase().includes('user already exists') ||
            backendMsg.toLowerCase().includes('already in use') ||
            response.status === 409
          ) {
            throw new Error('An account with this email already exists. Please sign in instead.');
          }

          if (backendMsg.toLowerCase().includes('internal error') || response.status >= 500) {
            throw new Error('Server error. Please try again in a moment.');
          }

          throw new Error(backendMsg || `Registration failed (${response.status}). Please try again.`);
        }

        const data = await response.json();

        if (!data.session?.token) {
          throw new Error('No session token received. Please try again.');
        }

        // Sign-up always persists the token (user just created their account)
        await tokenStorage.setToken(data.session.token, true);
        setUser(data.user);

        console.log('[Auth] ========== SIGN UP SUCCESSFUL ==========');
      }, 'signUp');
    } catch (error: any) {
      console.error('[Auth] ========== SIGN UP FAILED (all retries exhausted) ==========');
      console.error('[Auth] Error:', error);
      throw error;
    } finally {
      authInFlight.current = false;
      setLoading(false);
    }
  }, []);

  const signInWithApple = useCallback(async (identityToken: string, appleUser?: any) => {
    if (authInFlight.current) {
      throw new Error('Authentication in progress. Please wait.');
    }

    if (!identityToken) {
      throw new Error('Invalid identity token');
    }

    if (!BACKEND_URL) {
      throw new Error('Backend not configured. Please contact support.');
    }

    console.log('[Auth] ========== APPLE SIGN IN STARTED ==========');
    console.log('[Auth] Platform:', Platform.OS);
    console.log('[Auth] Backend URL:', BACKEND_URL);
    console.log('[Auth] Identity token length:', identityToken.length);
    console.log('[Auth] Has user data:', !!appleUser);

    authInFlight.current = true;
    setLoading(true);

    try {
      await withAuthRetry(async () => {
        const requestBody = {
          identityToken,
          user: appleUser ? {
            email: appleUser.email || undefined,
            name: appleUser.name ? {
              firstName: appleUser.name.givenName || undefined,
              lastName: appleUser.name.familyName || undefined,
            } : undefined,
          } : undefined,
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.error('[Auth] Apple sign in timeout after 30 seconds');
          controller.abort();
        }, API_TIMEOUT);

        console.log('[Auth] Sending Apple sign in request...');
        const fetchStartTime = Date.now();

        const fetchOptions: RequestInit = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        };

        if (Platform.OS === 'web') {
          fetchOptions.mode = 'cors';
          fetchOptions.credentials = 'include';
        }

        const response = await fetch(`${BACKEND_URL}/api/auth/sign-in/apple`, fetchOptions);

        clearTimeout(timeoutId);
        const fetchDuration = Date.now() - fetchStartTime;

        console.log('[Auth] Apple sign in fetch completed in', fetchDuration, 'ms');
        console.log('[Auth] Response status:', response.status);

        if (!response.ok) {
          const contentType = response.headers.get('content-type');
          let errorText = '';
          try {
            errorText = await response.text();
          } catch { /* ignore */ }

          console.error('[Auth] Apple sign in error response:', errorText.substring(0, 500));

          if (contentType?.includes('text/html') || errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
            throw new Error('Server error. Please try again in a moment.');
          }

          let errorData: any;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            if (response.status >= 500) {
              throw new Error('Server error. Please try again in a moment.');
            }
            throw new Error(`Apple sign in failed (${response.status}). Please try again.`);
          }

          if (errorData.code === 'UND_ERR_CONNECT_TIMEOUT' || errorData.message?.includes('Connect Timeout')) {
            throw new Error('The server is experiencing connectivity issues. Please try again in a few moments.');
          }

          throw new Error(errorData.error || errorData.message || 'Apple sign in failed. Please try again.');
        }

        const data = await response.json();
        console.log('[Auth] Apple sign in response data keys:', Object.keys(data));

        if (!data.session?.token) {
          throw new Error('No session token received. Please try again.');
        }

        // Apple sign-in always persists the token
        await tokenStorage.setToken(data.session.token, true);
        setUser(data.user);

        // Fetch profile (non-blocking)
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
          console.warn('[Auth] Failed to fetch profile after Apple sign in (non-critical):', profileError);
        }

        console.log('[Auth] ========== APPLE SIGN IN SUCCESSFUL ==========');
      }, 'signInWithApple');
    } catch (error: any) {
      console.error('[Auth] ========== APPLE SIGN IN FAILED (all retries exhausted) ==========');
      console.error('[Auth] Error type:', error.constructor.name);
      console.error('[Auth] Error message:', error.message);
      throw error;
    } finally {
      authInFlight.current = false;
      setLoading(false);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (authInFlight.current) {
      throw new Error('Authentication in progress. Please wait.');
    }

    if (!BACKEND_URL) {
      throw new Error('Backend not configured. Please contact support.');
    }

    console.log('[Auth] ========== GOOGLE SIGN IN STARTED ==========');
    console.log('[Auth] Platform:', Platform.OS);
    console.log('[Auth] Backend URL:', BACKEND_URL);

    authInFlight.current = true;
    setLoading(true);

    try {
      await withAuthRetry(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.error('[Auth] Google sign in timeout after 30 seconds');
          controller.abort();
        }, API_TIMEOUT);

        const fetchOptions: RequestInit = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({}),
          signal: controller.signal,
        };

        if (Platform.OS === 'web') {
          fetchOptions.mode = 'cors';
          fetchOptions.credentials = 'include';
        }

        const response = await fetch(`${BACKEND_URL}/api/auth/sign-in/google`, fetchOptions);

        clearTimeout(timeoutId);
        console.log('[Auth] Google sign in response status:', response.status);

        if (!response.ok) {
          const contentType = response.headers.get('content-type');
          let errorText = '';
          try {
            errorText = await response.text();
          } catch { /* ignore */ }

          console.error('[Auth] Google sign in error response:', errorText.substring(0, 500));

          if (contentType?.includes('text/html') || errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
            throw new Error('Server error. Please try again in a moment.');
          }

          let errorData: any;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            if (response.status >= 500) {
              throw new Error(`Google sign in server error (${response.status}). Please try again.`);
            }
            throw new Error(`Google sign in failed (${response.status}). Please try again.`);
          }

          throw new Error(errorData.error || errorData.message || 'Google sign in failed. Please try again.');
        }

        const data = await response.json();
        console.log('[Auth] Google sign in response data keys:', Object.keys(data));

        if (!data.session?.token) {
          throw new Error('No session token received. Please try again.');
        }

        // Google sign-in always persists the token
        await tokenStorage.setToken(data.session.token, true);
        setUser(data.user);

        // Fetch profile (non-blocking)
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
          console.warn('[Auth] Failed to fetch profile after Google sign in (non-critical):', profileError);
        }

        console.log('[Auth] ========== GOOGLE SIGN IN SUCCESSFUL ==========');
      }, 'signInWithGoogle');
    } catch (error: any) {
      console.error('[Auth] ========== GOOGLE SIGN IN FAILED (all retries exhausted) ==========');
      console.error('[Auth] Error type:', error.constructor.name);
      console.error('[Auth] Error message:', error.message);
      throw error;
    } finally {
      authInFlight.current = false;
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    console.log('[Auth] ========== SIGN OUT STARTED ==========');

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

    } catch (error) {
      console.error('[Auth] Sign out cleanup error (will still clear local state):', error);
    } finally {
      authInFlight.current = false;
      setUser(null);
      setLoading(false);
      console.log('[Auth] ========== SIGN OUT COMPLETE ==========');

      try {
        router.replace('/auth');
      } catch (navError) {
        console.error('[Auth] Navigation error after sign out:', navError);
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
    console.error('[Auth] CRITICAL: useAuth called outside AuthProvider');
    return {
      user: null,
      loading: false,
      signIn: async () => { throw new Error('Auth not initialized'); },
      signUp: async () => { throw new Error('Auth not initialized'); },
      signInWithApple: async () => { throw new Error('Auth not initialized'); },
      signInWithGoogle: async () => { throw new Error('Auth not initialized'); },
      signOut: async () => {},
      isAuthenticated: false,
      refreshTrigger: 0,
      triggerRefresh: () => {},
      checkAuth: async () => {},
      fetchUser: async () => {},
    };
  }
  return context;
}
