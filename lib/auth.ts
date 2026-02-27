
/**
 * BetterAuth Client Configuration Template
 *
 * This template provides a ready-to-use BetterAuth client with:
 * - Platform-specific storage (localStorage for web, SecureStore for native)
 * - Bearer token handling for web to avoid cross-origin issues
 * - Expo client plugin for deep linking
 *
 * Usage:
 * 1. Replace YOUR_BACKEND_URL with actual backend URL
 * 2. Replace your-app-scheme with actual app scheme
 * 3. Replace your-app with actual app name/prefix
 * 4. Import and use authClient in your components
 */

import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import Constants from "expo-constants";

// Backend URL is automatically configured in app.json under expo.extra.backendUrl
const API_URL = Constants.expoConfig?.extra?.backendUrl || "";
const BEARER_TOKEN_KEY = "seatimetracker_bearer_token";

// Platform-specific storage adapter
const storage = Platform.OS === "web"
  ? {
      getItem: (key: string) => localStorage.getItem(key),
      setItem: (key: string, value: string) => localStorage.setItem(key, value),
      deleteItem: (key: string) => localStorage.removeItem(key),
    }
  : SecureStore;

// Create auth client with platform-specific configuration
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: "seatimetracker",
      storagePrefix: "seatimetracker",
      storage,
    }),
  ],
  // Web-specific configuration to handle bearer tokens
  ...(Platform.OS === "web" && {
    fetchOptions: {
      auth: {
        type: "Bearer" as const,
        token: () => localStorage.getItem(BEARER_TOKEN_KEY) || "",
      },
    },
  }),
});

/**
 * Store bearer token for web authentication
 * This is required for the popup-based OAuth flow on web
 */
export function storeWebBearerToken(token: string) {
  if (Platform.OS === "web") {
    localStorage.setItem(BEARER_TOKEN_KEY, token);
  }
}

/**
 * Clear stored authentication tokens
 */
export function clearAuthTokens() {
  if (Platform.OS === "web") {
    localStorage.removeItem(BEARER_TOKEN_KEY);
  }
}
