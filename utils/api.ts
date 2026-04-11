
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
import { getToken, notifyUnauthorized } from '@/utils/tokenStorage';

import { log, error as logError } from '@/utils/log';

/**
 * Backend URL is configured in app.json under expo.extra.backendUrl
 * It is set automatically when the backend is deployed.
 * The hardcoded fallback ensures the app works even if Constants is not yet
 * populated (e.g. during cold-start before the Expo config is hydrated).
 */
export const BACKEND_URL: string =
  Constants.expoConfig?.extra?.backendUrl ||
  "https://seatimetracker-production.up.railway.app";

log('[API] Backend URL configured:', BACKEND_URL || 'NOT CONFIGURED');

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
  log("[API] Calling:", url, options?.method || "GET");

  // Setup timeout if specified
  const timeout = options?.timeout || 15000; // Default 15 second timeout
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
      logError("[API] Error response:", response.status, text);
      throw new Error(`API error: ${response.status} - ${text}`);
    }

    const data = await response.json();
    log("[API] Success:", data);
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      logError("[API] Request timed out after", timeout, "ms");
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    
    logError("[API] Request failed:", error);
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
 * Get authentication token from the unified token storage.
 * Checks in-memory token first (rememberMe=false), then persistent storage.
 */
const getAuthToken = (): Promise<string | null> => getToken();

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
  log("[API] Authenticated call:", url, options?.method || "GET");

  // Setup timeout if specified
  const timeout = options?.timeout || 15000; // Default 15 second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const method = options?.method || "GET";
    const hasBody = options?.body !== undefined;
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${token}`,
      ...options?.headers,
    };
    // Only set Content-Type for requests that carry a body
    if (hasBody || (method !== "GET" && method !== "DELETE" && method !== "HEAD")) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      ...options,
      headers,
      signal: options?.signal || controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      logError("[API] Error response:", response.status, text);
      
      if (response.status === 401) {
        notifyUnauthorized();
        throw new Error("Unauthorized. Please sign in again.");
      }
      
      throw new Error(`API error: ${response.status} - ${text}`);
    }

    // Handle 204 No Content responses (e.g., DELETE /api/users/me)
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      log("[API] Success: 204 No Content");
      return null as T;
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      log("[API] Success:", data);
      return data;
    }

    // For non-JSON responses, return text
    const text = await response.text();
    log("[API] Success (text):", text?.substring(0, 100));
    return text as unknown as T;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      logError("[API] Request timed out after", timeout, "ms");
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    
    logError("[API] Request failed:", error);
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
 * Authenticated fetch that returns the raw Response object.
 * Used by modules that need to inspect status codes or parse the body themselves
 * (e.g. referrals, certificates).
 */
export const authFetch = async (
  endpoint: string,
  options?: { method?: string; body?: any; formData?: boolean },
): Promise<Response> => {
  if (!isBackendConfigured()) {
    throw new Error("Backend URL not configured.");
  }

  const token = await getAuthToken();
  if (!token) {
    throw new Error("No authentication token found. Please sign in.");
  }

  const url = `${BACKEND_URL}${endpoint}`;
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
  };

  let fetchBody: any = undefined;
  if (options?.body !== undefined) {
    if (options.formData) {
      fetchBody = options.body;
    } else {
      headers["Content-Type"] = "application/json";
      fetchBody = JSON.stringify(options.body);
    }
  }

  const response = await fetch(url, {
    method: options?.method || "GET",
    headers,
    body: fetchBody,
  });

  return response;
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
