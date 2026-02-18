
/**
 * API Utilities Template
 *
 * Provides utilities for making API calls to the backend.
 * Automatically reads backend URL from app.json configuration.
 *
 * Features:
 * - Automatic backend URL configuration
 * - Error handling with proper logging
 * - Type-safe request/response handling
 * - Helper functions for common HTTP methods
 * - Timeout support to prevent hanging requests
 *
 * Usage:
 * 1. Import BACKEND_URL or helper functions
 * 2. Use apiCall() for basic requests
 * 3. Use apiGet(), apiPost(), etc. for convenience
 * 4. Backend URL is automatically configured in app.json when backend deploys
 */

import Constants from "expo-constants";

/**
 * Backend URL is configured in app.json under expo.extra.backendUrl
 * It is set automatically when the backend is deployed
 */
export const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl || "";

console.log('[API] Backend URL configured:', BACKEND_URL || 'NOT CONFIGURED');

/**
 * Check if backend is properly configured
 */
export const isBackendConfigured = (): boolean => {
  return !!BACKEND_URL && BACKEND_URL.length > 0;
};

/**
 * Request options with optional timeout and signal
 */
interface RequestOptions extends RequestInit {
  timeout?: number;
}

/**
 * Generic API call helper with error handling and timeout support
 *
 * @param endpoint - API endpoint path (e.g., '/users', '/vessels')
 * @param options - Fetch options (method, headers, body, timeout, etc.)
 * @returns Parsed JSON response
 * @throws Error if backend is not configured or request fails
 */
export const apiCall = async <T = any>(
  endpoint: string,
  options?: RequestOptions
): Promise<T> => {
  if (!isBackendConfigured()) {
    throw new Error("Backend URL not configured. Please rebuild the app.");
  }

  const url = `${BACKEND_URL}${endpoint}`;
  console.log("[API] Calling:", url, options?.method || "GET");

  // Setup timeout if specified
  const timeout = options?.timeout || 10000; // Default 10 second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      signal: options?.signal || controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      console.error("[API] Error response:", response.status, text);
      throw new Error(`API error: ${response.status} - ${text}`);
    }

    const data = await response.json();
    console.log("[API] Success:", data);
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      console.error("[API] Request timed out after", timeout, "ms");
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    
    console.error("[API] Request failed:", error);
    throw error;
  }
};

/**
 * GET request helper
 */
export const apiGet = async <T = any>(endpoint: string, options?: RequestOptions): Promise<T> => {
  return apiCall<T>(endpoint, { ...options, method: "GET" });
};

/**
 * POST request helper
 */
export const apiPost = async <T = any>(
  endpoint: string,
  data: any,
  options?: RequestOptions
): Promise<T> => {
  return apiCall<T>(endpoint, {
    ...options,
    method: "POST",
    body: JSON.stringify(data),
  });
};

/**
 * PUT request helper
 */
export const apiPut = async <T = any>(
  endpoint: string,
  data: any,
  options?: RequestOptions
): Promise<T> => {
  return apiCall<T>(endpoint, {
    ...options,
    method: "PUT",
    body: JSON.stringify(data),
  });
};

/**
 * PATCH request helper
 */
export const apiPatch = async <T = any>(
  endpoint: string,
  data: any,
  options?: RequestOptions
): Promise<T> => {
  return apiCall<T>(endpoint, {
    ...options,
    method: "PATCH",
    body: JSON.stringify(data),
  });
};

/**
 * DELETE request helper
 */
export const apiDelete = async <T = any>(endpoint: string, options?: RequestOptions): Promise<T> => {
  return apiCall<T>(endpoint, { ...options, method: "DELETE" });
};

/**
 * Get authentication token from storage
 * Works on both web (localStorage) and native (SecureStore)
 * CRITICAL: Wrapped in try-catch to prevent crashes
 */
const getAuthToken = async (): Promise<string | null> => {
  try {
    // Web platform
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('seatime_auth_token');
    }
    
    // Native platform - dynamically import SecureStore
    try {
      const { Platform } = await import('react-native');
      if (Platform.OS !== 'web') {
        const SecureStore = await import('expo-secure-store');
        return await SecureStore.getItemAsync('seatime_auth_token');
      }
    } catch (importError) {
      console.error('[API] Error importing native modules:', importError);
    }
    
    return null;
  } catch (error) {
    console.error('[API] Error getting auth token:', error);
    return null;
  }
};

/**
 * Authenticated API call helper
 * Automatically includes Bearer token in Authorization header
 */
export const authenticatedApiCall = async <T = any>(
  endpoint: string,
  options?: RequestOptions
): Promise<T> => {
  if (!isBackendConfigured()) {
    throw new Error("Backend URL not configured. Please rebuild the app.");
  }

  // Get token from localStorage (web) or will be handled by AuthContext (native)
  const token = await getAuthToken();
  
  if (!token) {
    throw new Error("No authentication token found. Please sign in.");
  }

  const url = `${BACKEND_URL}${endpoint}`;
  console.log("[API] Authenticated call:", url, options?.method || "GET");

  // Setup timeout if specified
  const timeout = options?.timeout || 10000; // Default 10 second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        ...options?.headers,
      },
      signal: options?.signal || controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      console.error("[API] Error response:", response.status, text);
      
      if (response.status === 401) {
        throw new Error("Unauthorized. Please sign in again.");
      }
      
      throw new Error(`API error: ${response.status} - ${text}`);
    }

    const data = await response.json();
    console.log("[API] Success:", data);
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      console.error("[API] Request timed out after", timeout, "ms");
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    
    console.error("[API] Request failed:", error);
    throw error;
  }
};

/**
 * Authenticated GET request helper
 */
export const authenticatedGet = async <T = any>(endpoint: string, options?: RequestOptions): Promise<T> => {
  return authenticatedApiCall<T>(endpoint, { ...options, method: "GET" });
};

/**
 * Authenticated POST request helper
 */
export const authenticatedPost = async <T = any>(
  endpoint: string,
  data: any,
  options?: RequestOptions
): Promise<T> => {
  return authenticatedApiCall<T>(endpoint, {
    ...options,
    method: "POST",
    body: JSON.stringify(data),
  });
};

/**
 * Authenticated PUT request helper
 */
export const authenticatedPut = async <T = any>(
  endpoint: string,
  data: any,
  options?: RequestOptions
): Promise<T> => {
  return authenticatedApiCall<T>(endpoint, {
    ...options,
    method: "PUT",
    body: JSON.stringify(data),
  });
};

/**
 * Authenticated PATCH request helper
 */
export const authenticatedPatch = async <T = any>(
  endpoint: string,
  data: any,
  options?: RequestOptions
): Promise<T> => {
  return authenticatedApiCall<T>(endpoint, {
    ...options,
    method: "PATCH",
    body: JSON.stringify(data),
  });
};

/**
 * Authenticated DELETE request helper
 */
export const authenticatedDelete = async <T = any>(endpoint: string, options?: RequestOptions): Promise<T> => {
  return authenticatedApiCall<T>(endpoint, { ...options, method: "DELETE" });
};

/**
 * Check if an error is a subscription-related error (403 with subscription codes)
 */
export const isSubscriptionError = (error: any): boolean => {
  const errorMessage = error?.message || error?.toString() || '';
  return (
    errorMessage.includes('403') || 
    errorMessage.includes('SUBSCRIPTION_REQUIRED') ||
    errorMessage.includes('PAYMENT_REQUIRED') ||
    errorMessage.includes('Active subscription required')
  );
};

/**
 * Extract error message from various error formats
 */
export const getErrorMessage = (error: any): string => {
  if (typeof error === 'string') {
    return error;
  }
  
  if (error?.message) {
    return error.message;
  }
  
  if (error?.error) {
    return error.error;
  }
  
  return 'An unexpected error occurred';
};
