
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/**
 * CRITICAL FIX: Completely non-blocking notification hook
 * This hook sets up notification polling and daily reminders
 * but NEVER blocks app startup or causes crashes
 */
export function useNotifications() {
  const setupAttempted = useRef(false);

  useEffect(() => {
    // Only run on native platforms
    if (Platform.OS === 'web') {
      return;
    }

    // Only attempt setup once
    if (setupAttempted.current) {
      return;
    }

    setupAttempted.current = true;

    // CRITICAL: Delay notification setup to ensure app is stable
    const setupTimer = setTimeout(async () => {
      try {
        console.log('[useNotifications] Starting delayed notification setup...');
        
        // Dynamically import notification utilities
        const { scheduleDailySeaTimeReviewNotification } = await import('@/utils/notifications');
        
        // Schedule daily notification at 18:00 (6 PM) local time
        await scheduleDailySeaTimeReviewNotification('18:00');
        
        console.log('[useNotifications] ✅ Notification setup complete');
      } catch (error) {
        console.error('[useNotifications] ❌ Notification setup failed (non-critical):', error);
        // Don't throw - this is non-critical
      }
    }, 5000); // 5 second delay to ensure app is fully stable

    return () => {
      clearTimeout(setupTimer);
    };
  }, []);
}
