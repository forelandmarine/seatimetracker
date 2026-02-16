
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { Platform } from 'react-native';
import { BACKEND_URL } from '@/utils/api';
import { clearBiometricCredentials } from '@/utils/biometricAuth';

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

// Token storage with deferred SecureStore loading to prevent early TurboModule initialization
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true); // Start with loading true
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const triggerRefresh = useCallback(() => {
    console.log('[Auth] Global refresh triggered');
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const checkAuth = useCallback(async () => {
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
              // Profile fetch failed, but user is authenticated
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
  }, []);

  // Check auth on mount
  useEffect(() => {
    console.log('[Auth] AuthProvider mounted, checking auth...');
    checkAuth();
  }, [checkAuth]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (loading) {
      throw new Error('Authentication in progress');
    }

    if (!BACKEND_URL) {
      throw new Error('Backend not configured');
    }

    console.log('[Auth] Sign in attempt for:', email);
    console.log('[Auth] Backend URL:', BACKEND_URL);
    setLoading(true);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
      
      console.log('[Auth] Sending sign-in request to:', `${BACKEND_URL}/api/auth/sign-in/email`);
      
      const response = await fetch(`${BACKEND_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log('[Auth] Sign in response status:', response.status);
      console.log('[Auth] Sign in response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        console.error('[Auth] Sign in failed - Status:', response.status, 'Content-Type:', contentType);
        
        let errorText = '';
        try {
          errorText = await response.text();
          console.error('[Auth] Sign in error response body:', errorText.substring(0, 500));
        } catch (textError) {
          console.error('[Auth] Could not read error response body:', textError);
        }
        
        // Check if response is HTML (500 error page)
        if (contentType?.includes('text/html') || errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
          console.error('[Auth] Received HTML error page instead of JSON - Backend returned 500 error');
          throw new Error('Server error (500). The backend encountered an internal error. Please try again or contact support if the issue persists.');
        }
        
        // Try to parse JSON error
        let errorData;
        try {
          errorData = JSON.parse(errorText);
          console.error('[Auth] Parsed error data:', errorData);
        } catch (parseError) {
          console.error('[Auth] Could not parse error as JSON:', parseError);
          throw new Error(`Login failed (${response.status}): ${errorText || response.statusText}`);
        }
        
        throw new Error(errorData.error || errorData.message || `Login failed (${response.status})`);
      }

      const data = await response.json();
      console.log('[Auth] Sign in response data received, has session:', !!data.session);
      console.log('[Auth] Sign in response data has token:', !!data.session?.token);

      if (!data.session?.token) {
        console.error('[Auth] No session token in response:', JSON.stringify(data, null, 2));
        throw new Error('No session token received from server');
      }

      // Store token
      await tokenStorage.setToken(data.session.token);
      console.log('[Auth] Token stored successfully');
      
      // Fetch user profile to get department info
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
        } else {
          console.warn('[Auth] Profile fetch failed after sign in, using basic user data');
          setUser(data.user);
        }
      } catch (profileError) {
        console.warn('[Auth] Failed to fetch profile after sign in:', profileError);
        setUser(data.user);
      }
      
      console.log('[Auth] Sign in successful:', data.user.email);
    } catch (error: any) {
      console.error('[Auth] Sign in failed - Error name:', error.name);
      console.error('[Auth] Sign in failed - Error message:', error.message);
      console.error('[Auth] Sign in failed - Error stack:', error.stack);
      
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

    console.log('[Auth] Sign up attempt for:', email);
    setLoading(true);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
      
      const response = await fetch(`${BACKEND_URL}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name: name || 'User' }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log('[Auth] Sign up response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Auth] Sign up failed with status:', response.status, 'body:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          throw new Error(`Registration failed: ${errorText}`);
        }
        throw new Error(errorData.error || 'Registration failed');
      }

      const data = await response.json();
      console.log('[Auth] Sign up response data received');

      if (!data.session?.token) {
        console.error('[Auth] No session token in response:', data);
        throw new Error('No session token received');
      }

      await tokenStorage.setToken(data.session.token);
      console.log('[Auth] Token stored successfully');
      
      setUser(data.user);
      
      console.log('[Auth] Sign up successful:', data.user.email);
    } catch (error: any) {
      console.error('[Auth] Sign up failed:', error);
      
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

    console.log('[Auth] Apple sign in attempt');
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

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

      const response = await fetch(`${BACKEND_URL}/api/auth/sign-in/apple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log('[Auth] Apple sign in response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Auth] Apple sign in failed with status:', response.status, 'body:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          throw new Error(`Apple sign in failed: ${errorText}`);
        }
        throw new Error(errorData.error || 'Apple sign in failed');
      }

      const data = await response.json();
      console.log('[Auth] Apple sign in response data received');

      if (!data.session?.token) {
        console.error('[Auth] No session token in response:', data);
        throw new Error('No session token received');
      }

      await tokenStorage.setToken(data.session.token);
      console.log('[Auth] Token stored successfully');
      
      // Fetch user profile to get department info
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
          console.log('[Auth] Profile fetched after Apple sign in, department:', profileData.department);
          setUser({
            ...data.user,
            department: profileData.department,
            hasDepartment: !!profileData.department,
          });
        } else {
          console.warn('[Auth] Profile fetch failed after Apple sign in, using basic user data');
          setUser(data.user);
        }
      } catch (profileError) {
        console.warn('[Auth] Failed to fetch profile after Apple sign in:', profileError);
        setUser(data.user);
      }
      
      console.log('[Auth] Apple sign in successful:', data.user.email);
    } catch (error: any) {
      console.error('[Auth] Apple sign in failed:', error);
      
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
    console.log('[Auth] Sign out started');
    
    // Clear local state immediately - don't wait for backend
    setUser(null);
    setLoading(false);
    
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
        }).catch(() => {
          // Ignore backend errors
          console.log('[Auth] Backend sign out call failed (ignored)');
        });
      }
      
      // Clean up local storage
      await tokenStorage.removeToken();
      await clearBiometricCredentials();
      
      console.log('[Auth] Sign out complete');
    } catch (error) {
      console.error('[Auth] Sign out cleanup error (ignored):', error);
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
    // CRITICAL: Log error but don't crash the app
    console.error('[Auth] CRITICAL: useAuth called outside AuthProvider. This is a developer error.');
    // Return a safe default context to prevent crashes
    return {
      user: null,
      loading: false,
      signIn: async () => { throw new Error('Auth not initialized'); },
      signUp: async () => { throw new Error('Auth not initialized'); },
      signInWithApple: async () => { throw new Error('Auth not initialized'); },
      signOut: async () => { console.log('[Auth] Sign out called but auth not initialized'); },
      isAuthenticated: false,
      refreshTrigger: 0,
      triggerRefresh: () => { console.log('[Auth] Refresh triggered but auth not initialized'); },
      checkAuth: async () => { console.log('[Auth] Check auth called but auth not initialized'); },
    };
  }
  return context;
}
