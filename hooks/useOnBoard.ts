import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { getOnBoardStatus, type OnBoardStatus } from '@/utils/seaTimeApi';
import { error as logError } from '@/utils/log';

/**
 * Shared on/off board state. The OnBoardCard changes it; the home screens read it
 * to show the vessel as paused and hide its position while the user is off board.
 * Defaults to on board until the server says otherwise, so nothing is hidden by mistake.
 */
let state: OnBoardStatus & { loaded: boolean } = {
  on_board: true,
  off_board_since: null,
  expected_return_date: null,
  off_board_passages: 0,
  loaded: false,
};
const listeners = new Set<() => void>();

export function setOnBoardState(next: Partial<OnBoardStatus>) {
  state = { ...state, ...next, loaded: true };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOnBoard() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);

  const refresh = useCallback(async () => {
    try {
      setOnBoardState(await getOnBoardStatus());
    } catch (e) {
      logError('[OnBoard] status fetch failed:', e);
    }
  }, []);

  useEffect(() => {
    if (!state.loaded) refresh();
  }, [refresh]);

  return { ...snapshot, refresh };
}
