
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as seaTimeApi from '@/utils/seaTimeApi';
import { scheduleDailySeaTimeReviewNotification, registerForPushNotificationsAsync } from '@/utils/notifications';
import { useAuth } from '@/contexts/AuthContext';

import { log, warn, error as logError } from '@/utils/log';

/**
 * Hook to manage notification scheduling and permissions
 * Automatically schedules daily notifications based on user's backend schedule
 */
export function useNotifications() {
  const { user } = useAuth();
  const hasScheduledRef = useRef(false);

  useEffect(() => {
    // Skip on web (notifications not supported)
    if (Platform.OS === 'web') {
      return;
    }

    // Skip if no user
    if (!user) {
      return;
    }

    // Skip if already scheduled in this session
    if (hasScheduledRef.current) {
      return;
    }

    const setupNotifications = async () => {
      try {
        log('[useNotifications] Setting up notifications for user:', user.id);

        // Request notification permissions
        const hasPermission = await registerForPushNotificationsAsync();
        if (!hasPermission) {
          warn('[useNotifications] Notification permissions not granted');
          return;
        }

        log('[useNotifications] Notification permissions granted');

        // Fetch user's notification schedule from backend
        const schedule = await seaTimeApi.getNotificationSchedule();
        log('[useNotifications] Notification schedule:', schedule);

        // If notifications are active, schedule them locally
        if (schedule.is_active) {
          const scheduledTime = schedule.scheduled_time || '18:00';
          log('[useNotifications] Scheduling daily notification at', scheduledTime);

          const notificationId = await scheduleDailySeaTimeReviewNotification(scheduledTime);
          if (notificationId) {
            log('[useNotifications] Daily notification scheduled successfully:', notificationId);
            hasScheduledRef.current = true;
          } else {
            warn('[useNotifications] Failed to schedule daily notification');
          }
        } else {
          log('[useNotifications] Notifications are disabled in user settings');
        }
      } catch (error) {
        logError('[useNotifications] Error setting up notifications:', error);
      }
    };

    setupNotifications();
  }, [user]);

  return null;
}
