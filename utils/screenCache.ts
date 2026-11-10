/**
 * Last good copy of the main lists (vessels, entries, summary, profile), kept on
 * the phone so a screen can draw straight away when it opens and refresh behind
 * it, instead of a spinner until the server answers.
 *
 * Each copy is tagged with a fingerprint of the sign-in it was saved under, and
 * a copy from any other sign-in is ignored, so one account never sees another's
 * data on a shared phone. Sign out removes them all.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ScreenCacheKey = 'vessels' | 'sea-time' | 'summary' | 'profile';

const PREFIX = 'screen_cache_v1:';
const KEYS: ScreenCacheKey[] = ['vessels', 'sea-time', 'summary', 'profile'];

type Stored = { owner: string; data: unknown };

// Copies read or written this launch, so a tab switch doesn't go back to storage
const memory = new Map<ScreenCacheKey, Stored>();

/** Short, one-way tag for a sign-in token (never the token itself). */
function fingerprint(token: string): string {
  let h = 5381;
  for (let i = 0; i < token.length; i++) h = ((h << 5) + h + token.charCodeAt(i)) | 0;
  return `${token.length}:${(h >>> 0).toString(36)}`;
}

/** The saved copy for this sign-in, or null. */
export async function readScreenCache<T>(key: ScreenCacheKey, token: string | null): Promise<T | null> {
  if (!token) return null;
  const owner = fingerprint(token);
  let stored = memory.get(key);
  if (!stored) {
    try {
      const raw = await AsyncStorage.getItem(PREFIX + key);
      if (!raw) return null;
      stored = JSON.parse(raw) as Stored;
      memory.set(key, stored);
    } catch {
      return null;
    }
  }
  return stored && stored.owner === owner ? (stored.data as T) : null;
}

/** Save a fresh copy for this sign-in. Never throws; a failed save just means no instant copy next time. */
export function writeScreenCache(key: ScreenCacheKey, token: string | null, data: unknown): void {
  if (!token || data == null) return;
  const stored: Stored = { owner: fingerprint(token), data };
  memory.set(key, stored);
  try {
    AsyncStorage.setItem(PREFIX + key, JSON.stringify(stored)).catch(() => {});
  } catch {
    // ignore
  }
}

/** Remove every saved copy (sign out). */
export async function clearScreenCache(): Promise<void> {
  memory.clear();
  try {
    await AsyncStorage.multiRemove(KEYS.map((k) => PREFIX + k));
  } catch {
    // ignore
  }
}
