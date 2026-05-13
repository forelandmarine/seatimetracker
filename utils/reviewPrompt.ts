import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { log, error as logError } from '@/utils/log';

const ENTRY_COUNT_KEY = 'review_prompt_entry_count';
const LAST_PROMPTED_AT_KEY = 'review_prompt_last_at';
const PROMPTED_VERSION_KEY = 'review_prompt_version';

const MIN_ENTRIES = 3;
const COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;

type Trigger = 'pdf_export' | 'entry_saved';

export async function recordSeaTimeEntrySaved(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(ENTRY_COUNT_KEY);
    const next = (parseInt(raw || '0', 10) || 0) + 1;
    await AsyncStorage.setItem(ENTRY_COUNT_KEY, String(next));
    if (next >= MIN_ENTRIES) {
      await maybeRequestReview('entry_saved');
    }
  } catch (err) {
    logError('[reviewPrompt] recordSeaTimeEntrySaved failed', err);
  }
}

export async function recordPdfExported(): Promise<void> {
  await maybeRequestReview('pdf_export');
}

async function maybeRequestReview(trigger: Trigger): Promise<void> {
  try {
    if (Platform.OS === 'web') return;

    const [available, hasAction] = await Promise.all([
      StoreReview.isAvailableAsync(),
      StoreReview.hasAction(),
    ]);
    if (!available || !hasAction) return;

    const currentVersion =
      (Constants.expoConfig?.version as string | undefined) ?? 'unknown';
    const promptedVersion = await AsyncStorage.getItem(PROMPTED_VERSION_KEY);
    if (promptedVersion === currentVersion) return;

    const lastPromptedRaw = await AsyncStorage.getItem(LAST_PROMPTED_AT_KEY);
    const lastPromptedAt = lastPromptedRaw ? parseInt(lastPromptedRaw, 10) : 0;
    if (lastPromptedAt && Date.now() - lastPromptedAt < COOLDOWN_MS) return;

    log('[reviewPrompt] requesting review', { trigger, currentVersion });
    await StoreReview.requestReview();

    await AsyncStorage.multiSet([
      [LAST_PROMPTED_AT_KEY, String(Date.now())],
      [PROMPTED_VERSION_KEY, currentVersion],
    ]);
  } catch (err) {
    logError('[reviewPrompt] maybeRequestReview failed', err);
  }
}
