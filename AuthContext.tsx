
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { Platform } from 'react-native';
import { BACKEND_URL } from '@/utils/api';
import { clearBiometricCredentials } from '@/utils/biometricAuth';
import { useBridgeReady } from './BridgeReadyContext';

const TOKEN_KEY = 'seatime_auth_token';

// Reasonable timeouts
const API_TIMEOUT = 15000; // 15 seconds for API calls

interface User {
  id: string;
  email: string;
  name?: string;
  hasDepartment?: boolean;
  department?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signInWithApple: (identityToken: string, appleUser?: any) => Promise<void>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
  refreshTrigger: number;
  triggerRefresh: () => void;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// CRITICAL: Deferred token storage to prevent early TurboModule initialization
// SecureStore is ONLY loaded when actually needed, not at module scope
const tokenStorage = {
  async getToken(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem(TOKEN_KEY);
      }
      
      // CRITICAL: Dynamically import SecureStore to prevent module-scope initialization
      // This prevents TurboModule crashes during startup
      console.log('[Auth] Dynamically loading expo-secure-store for token retrieval...');
      
      const SecureStore = await import('expo-secure-store');
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      console.log('[Auth] Token retrieved:', token ? 'exists' : 'null');
      return token;
    } catch (error) {
      console.error('[Auth] Error getting token:', error);
      return null;
    }
  },
  
  async setToken(token: string): Promise<void> {
    if (!token) throw new Error('Invalid token');
    
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(TOKEN_KEY, token);
        console.log('[Auth] Token stored in localStorage');
        return;
      }
      
      // CRITICAL: Dynamically import SecureStore
      console.log('[Auth] Dynamically loading expo-secure-store for token storage...');
      
      const SecureStore = await import('expo-secure-store');
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      console.log('[Auth] Token stored in SecureStore');
    } catch (error) {
      console.error('[Auth] Error storing token:', error);
      throw error;
    }
  },
  
  async removeToken(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem(TOKEN_KEY);
        console.log('[Auth] Token removed from localStorage');
        return;
      }
      
      // CRITICAL: Dynamically import SecureStore
      console.log('[Auth] Dynamically loading expo-secure-store for token removal...');
      
      const SecureStore = await import('expo-secure-store');
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      console.log('[Auth] Token removed from SecureStore');
    } catch (error) {
      console.error('[Auth] Error removing token:', error);
      // Don't throw - we want sign out to always succeed locally
    }
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isBridgeReady, isInitializing } = useBridgeReady();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

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

    console.log('[Auth] Checking authentication...');
    
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
          
          // Fetch user profile to get department info
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
              setUser({
                ...data.user,
                department: profileData.department,
                hasDepartment: !!profileData.department,
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
        
        // Keep token on network errors (offline mode)
        if (!(fetchError instanceof TypeError && fetchError.message.includes('Network'))) {
          await tokenStorage.removeToken();
        }
        setUser(null);
      }
    } catch (error) {
      console.error('[Auth] Check auth failed:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [isBridgeReady]);

  // CRITICAL: Only check auth after bridge is ready
  useEffect(() => {
    if (isBridgeReady && !isInitializing) {
      console.log('[Auth] Bridge ready, checking authentication...');
      checkAuth();
    } else {
      console.log('[Auth] Waiting for bridge to be ready...');
    }
  }, [isBridgeReady, isInitializing, checkAuth]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (loading) {
      throw new Error('Authentication in progress');
    }

    if (!BACKEND_URL) {
      throw new Error('Backend not configured');
    }

    console.log('[Auth] ========== SIGN IN STARTED ==========');
    console.log('[Auth] Platform:', Platform.OS);
    console.log('[Auth] Email:', email);
    console.log('[Auth] Backend URL:', BACKEND_URL);
    console.log('[Auth] Request URL:', `${BACKEND_URL}/api/auth/sign-in/email`);
    
    setLoading(true);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error('[Auth] Request timeout after 15 seconds');
        controller.abort();
      }, API_TIMEOUT);
      
      const requestBody = { email, password };
      console.log('[Auth] Request body:', JSON.stringify(requestBody));
      
      console.log('[Auth] Sending fetch request...');
      const fetchStartTime = Date.now();
      
      const response = await fetch(`${BACKEND_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const fetchDuration = Date.now() - fetchStartTime;
      
      console.log('[Auth] Fetch completed in', fetchDuration, 'ms');
      console.log('[Auth] Response status:', response.status);
      console.log('[Auth] Response headers:', JSON.stringify(Object.fromEntries(response.headers.entries())));

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        console.error('[Auth] Sign in failed - Status:', response.status, 'Content-Type:', contentType);
        
        let errorText = '';
        try {
          errorText = await response.text();
          console.error('[Auth] Error response body:', errorText.substring(0, 500));
        } catch (textError) {
          console.error('[Auth] Could not read error response body:', textError);
        }
        
        // Check if response is HTML (500 error page)
        if (contentType?.includes('text/html') || errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
          console.error('[Auth] Received HTML error page instead of JSON - Backend returned 500 error');
          throw new Error('Server error. The backend may be restarting. Please wait a moment and try again.');
        }
        
        // Try to parse JSON error
        let errorData;
        try {
          errorData = JSON.parse(errorText);
          console.error('[Auth] Parsed error data:', errorData);
        } catch (parseError) {
          console.error('[Auth] Could not parse error as JSON:', parseError);
          
          if (response.status === 401) {
            throw new Error('Invalid email or password. Please check your credentials and try again.');
          } else if (response.status === 500) {
            throw new Error('Server error. Please try again in a moment.');
          } else if (response.status === 503) {
            throw new Error('Service temporarily unavailable. Please try again shortly.');
          }
          
          throw new Error(`Login failed (${response.status}). Please try again.`);
        }
        
        throw new Error(errorData.error || errorData.message || `Login failed (${response.status})`);
      }

      console.log('[Auth] Response OK, parsing JSON...');
      const data = await response.json();
      console.log('[Auth] Response data keys:', Object.keys(data));
      console.log('[Auth] Has session:', !!data.session);
      console.log('[Auth] Has user:', !!data.user);

      if (!data.session?.token) {
        console.error('[Auth] No session token in response:', JSON.stringify(data, null, 2));
        throw new Error('No session token received from server');
      }

      console.log('[Auth] Session token received, length:', data.session.token.length);
      
      // Store token
      console.log('[Auth] Storing token...');
      await tokenStorage.setToken(data.session.token);
      console.log('[Auth] Token stored successfully');
      
      // Set user immediately
      setUser(data.user);
      console.log('[Auth] User state set, email:', data.user.email);
      
      // Fetch user profile (non-blocking)
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
          setUser({
            ...data.user,
            department: profileData.department,
            hasDepartment: !!profileData.department,
          });
        }
      } catch (profileError) {
        console.warn('[Auth] Failed to fetch profile after sign in (non-critical):', profileError);
      }
      
      console.log('[Auth] ========== SIGN IN SUCCESSFUL ==========');
    } catch (error: any) {
      console.error('[Auth] ========== SIGN IN FAILED ==========');
      console.error('[Auth] Error type:', error.constructor.name);
      console.error('[Auth] Error message:', error.message);
      console.error('[Auth] Error stack:', error.stack);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.');
      }
      
      if (error.message?.includes('Network') || error.name === 'TypeError') {
        throw new Error('Cannot connect to server. Check your connection.');
      }
      
      throw error;
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    if (loading) {
      throw new Error('Authentication in progress');
    }

    if (!BACKEND_URL) {
      throw new Error('Backend not configured');
    }

    console.log('[Auth] ========== SIGN UP STARTED ==========');
    console.log('[Auth] Platform:', Platform.OS);
    console.log('[Auth] Email:', email);
    console.log('[Auth] Backend URL:', BACKEND_URL);
    
    setLoading(true);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
      
      const response = await fetch(`${BACKEND_URL}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ email, password, name: name || 'User' }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('[Auth] Sign up response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Auth] Sign up error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          throw new Error(`Registration failed: ${errorText}`);
        }
        throw new Error(errorData.error || 'Registration failed');
      }

      const data = await response.json();

      if (!data.session?.token) {
        throw new Error('No session token received');
      }

      await tokenStorage.setToken(data.session.token);
      setUser(data.user);
      
      console.log('[Auth] ========== SIGN UP SUCCESSFUL ==========');
    } catch (error: any) {
      console.error('[Auth] ========== SIGN UP FAILED ==========');
      console.error('[Auth] Error:', error);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.');
      }
      
      if (error.message?.includes('Network') || error.name === 'TypeError') {
        throw new Error('Cannot connect to server. Check your connection.');
      }
      
      throw error;
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const signInWithApple = useCallback(async (identityToken: string, appleUser?: any) => {
    if (loading) {
      throw new Error('Authentication in progress');
    }

    if (!identityToken) {
      throw new Error('Invalid identity token');
    }

    if (!BACKEND_URL) {
      throw new Error('Backend not configured');
    }

    console.log('[Auth] ========== APPLE SIGN IN STARTED ==========');
    console.log('[Auth] Platform:', Platform.OS);
    console.log('[Auth] Backend URL:', BACKEND_URL);
    console.log('[Auth] Identity token length:', identityToken.length);
    console.log('[Auth] Has user data:', !!appleUser);
    
    setLoading(true);
    
    try {
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

      console.log('[Auth] Request body:', JSON.stringify(requestBody, null, 2));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error('[Auth] Apple sign in timeout after 15 seconds');
        controller.abort();
      }, API_TIMEOUT);

      console.log('[Auth] Sending Apple sign in request...');
      const fetchStartTime = Date.now();

      const response = await fetch(`${BACKEND_URL}/api/auth/sign-in/apple`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const fetchDuration = Date.now() - fetchStartTime;
      
      console.log('[Auth] Apple sign in fetch completed in', fetchDuration, 'ms');
      console.log('[Auth] Response status:', response.status);
      console.log('[Auth] Response headers:', JSON.stringify(Object.fromEntries(response.headers.entries())));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Auth] Apple sign in error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          if (response.status === 500) {
            throw new Error('Server error. Please try again in a moment.');
          }
          throw new Error(`Apple sign in failed (${response.status}). Please try again.`);
        }
        throw new Error(errorData.error || 'Apple sign in failed');
      }

      const data = await response.json();
      console.log('[Auth] Apple sign in response data keys:', Object.keys(data));

      if (!data.session?.token) {
        throw new Error('No session token received');
      }

      await tokenStorage.setToken(data.session.token);
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
          });
        }
      } catch (profileError) {
        console.warn('[Auth] Failed to fetch profile after Apple sign in (non-critical):', profileError);
      }
      
      console.log('[Auth] ========== APPLE SIGN IN SUCCESSFUL ==========');
    } catch (error: any) {
      console.error('[Auth] ========== APPLE SIGN IN FAILED ==========');
      console.error('[Auth] Error type:', error.constructor.name);
      console.error('[Auth] Error message:', error.message);
      console.error('[Auth] Error stack:', error.stack);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.');
      }
      
      if (error.message?.includes('Network') || error.name === 'TypeError') {
        throw new Error('Cannot connect to server. Check your connection.');
      }
      
      throw error;
    } finally {
      setLoading(false);
    }
  }, [loading]);

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
      setUser(null);
      setLoading(false);
      console.log('[Auth] ========== SIGN OUT COMPLETE ==========');
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
        signOut,
        isAuthenticated: !!user,
        refreshTrigger,
        triggerRefresh,
        checkAuth,
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
      signOut: async () => {},
      isAuthenticated: false,
      refreshTrigger: 0,
      triggerRefresh: () => {},
      checkAuth: async () => {},
    };
  }
  return context;
}
