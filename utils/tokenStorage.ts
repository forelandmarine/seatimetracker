
/**
 * Unified Token Storage
 *
 * THE single source of truth for auth-token reads and writes.
 * Every file that needs to read/write the session token MUST import from here.
 *
 * When rememberMe=true  → persisted to SecureStore / localStorage (survives restarts)
 * When rememberMe=false → held in memory only (cleared when app closes)
 */

import { Platform } from 'react-native';

const TOKEN_KEY = 'seatime_auth_token';

// ---------------------------------------------------------------------------
// In-memory token (used when rememberMe=false)
// ---------------------------------------------------------------------------
let inMemoryToken: string | null = null;

// ---------------------------------------------------------------------------
// 401 callback — registered by AuthContext so API utils can trigger sign-out
// ---------------------------------------------------------------------------
type UnauthorizedCallback = () => void;
let onUnauthorizedCallback: UnauthorizedCallback | null = null;

export function registerOnUnauthorized(cb: UnauthorizedCallback) {
  onUnauthorizedCallback = cb;
}

export function unregisterOnUnauthorized() {
  onUnauthorizedCallback = null;
}

/** Call this from any API util when a 401 is received. */
export function notifyUnauthorized() {
  if (onUnauthorizedCallback) {
    onUnauthorizedCallback();
  }
}

// ---------------------------------------------------------------------------
// Token operations
// ---------------------------------------------------------------------------

export async function getToken(): Promise<string | null> {
  // Check in-memory first (set when rememberMe=false)
  if (inMemoryToken) {
    return inMemoryToken;
  }

  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem(TOKEN_KEY);
    }

    const SecureStore = await import('expo-secure-store');
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (error) {
    console.error('[tokenStorage] Error getting token:', error);
    return null;
  }
}

export async function setToken(token: string, persist: boolean = true): Promise<void> {
  if (!token) throw new Error('Invalid token');

  if (!persist) {
    // Memory-only: do NOT write to SecureStore
    inMemoryToken = token;
    return;
  }

  // Clear any stale in-memory token when persisting
  inMemoryToken = null;

  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(TOKEN_KEY, token);
      return;
    }

    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (error) {
    console.error('[tokenStorage] Error storing token:', error);
    throw error;
  }
}

export async function removeToken(): Promise<void> {
  // Always clear in-memory token
  inMemoryToken = null;

  try {
    if (Platform.OS === 'web') {
      localStorage.removeItem(TOKEN_KEY);
      return;
    }

    const SecureStore = await import('expo-secure-store');
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (error) {
    console.error('[tokenStorage] Error removing token:', error);
    // Don't throw — sign out should always succeed locally
  }
}
