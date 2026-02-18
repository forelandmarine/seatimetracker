
import { useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook to trigger and listen for app-wide data refreshes
 * 
 * Usage:
 * const { triggerRefresh, refreshTrigger } = useGlobalRefresh(() => {
 *   // This callback runs when any screen triggers a refresh
 *   loadData();
 * });
 * 
 * // Call triggerRefresh() after user actions like save, delete, etc.
 * triggerRefresh();
 */
export function useGlobalRefresh(onRefresh?: () => void) {
  const { refreshTrigger, triggerRefresh } = useAuth();

  useEffect(() => {
    if (refreshTrigger > 0 && onRefresh) {
      console.log('[useGlobalRefresh] Refresh triggered, calling onRefresh callback');
      onRefresh();
    }
  }, [refreshTrigger, onRefresh]);

  return { triggerRefresh, refreshTrigger };
}
