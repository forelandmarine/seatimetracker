
import { Platform } from 'react-native';

console.log('[Notifications] Notification utility initialized');

/**
 * CRITICAL FIX: Lazy load notification modules
 * Modules are ONLY loaded when functions are called, not at import time
 */
async function loadNotificationModules() {
  if (Platform.OS === 'web') {
    return { Notifications: null, Device: null };
  }

  try {
    const [NotificationsModule, DeviceModule] = await Promise.all([
      import('expo-notifications'),
      import('expo-device'),
    ]);

    console.log('[Notifications] ✅ Modules loaded successfully');
    return {
      Notifications: NotificationsModule,
      Device: DeviceModule,
    };
  } catch (error) {
    console.error('[Notifications] ❌ Failed to load modules:', error);
    return { Notifications: null, Device: null };
  }
}

/**
 * Request notification permissions from the user
 * Required for iOS to show notifications
 * Returns false on web (not supported)
 */
export async function registerForPushNotificationsAsync(): Promise<boolean> {
  // Notifications are not supported on web
  if (Platform.OS === 'web') {
    console.log('[Notifications] Notifications not supported on web');
    return false;
  }

  console.log('[Notifications] Requesting notification permissions');
  
  try {
    const { Notifications, Device } = await loadNotificationModules();
    
    if (!Notifications || !Device) {
      console.error('[Notifications] Required modules not loaded');
      return false;
    }

    // Set notification handler first
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    console.log('[Notifications] ✅ Notification handler set');

    if (!Device.isDevice) {
      console.warn('[Notifications] Must use physical device for notifications');
      return false;
    }

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    console.log('[Notifications] Existing permission status:', existingStatus);

    // Request permissions if not already granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowDisplayInCarPlay: false,
          allowCriticalAlerts: false,
          provideAppNotificationSettings: false,
          allowProvisional: false,
          allowAnnouncements: false,
        },
      });
      finalStatus = status;
      console.log('[Notifications] Permission request result:', status);
    }

    if (finalStatus !== 'granted') {
      console.warn('[Notifications] Notification permissions not granted');
      return false;
    }

    // Set up notification channel for Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('sea-time-entries', {
        name: 'Sea Time Entries',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#007AFF',
        sound: 'default',
        description: 'Notifications for sea time entries that need review',
        enableVibrate: true,
        enableLights: true,
        showBadge: true,
      });
      console.log('[Notifications] Android notification channel created');
    }

    console.log('[Notifications] Notification permissions granted successfully');
    return true;
  } catch (error) {
    console.error('[Notifications] ❌ Permission request failed:', error);
    return false;
  }
}

/**
 * Schedule a local notification for a new sea time entry (4+ hours only)
 * @param vesselName - Name of the vessel
 * @param entryId - ID of the sea time entry
 * @param durationHours - Duration of the sea time in hours
 * @param mcaCompliant - Whether the entry meets MCA 4-hour requirement (should always be true)
 * @returns notification ID or null if not supported/failed
 */
export async function scheduleSeaTimeNotification(
  vesselName: string,
  entryId: string,
  durationHours: number,
  mcaCompliant: boolean = true
): Promise<string | null> {
  // Notifications are not supported on web
  if (Platform.OS === 'web') {
    console.log('[Notifications] Skipping notification on web');
    return null;
  }

  try {
    const { Notifications } = await loadNotificationModules();
    
    if (!Notifications) {
      console.error('[Notifications] Module not loaded');
      return null;
    }

    console.log('[Notifications] Scheduling notification for sea time entry:', {
      vesselName,
      entryId,
      durationHours,
      mcaCompliant,
    });

    // Simple, clear notification message
    const body = 'Sea day detected - tap to review';
    
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚓️ Sea Day Detected',
        body: body,
        data: {
          entryId,
          vesselName,
          durationHours,
          mcaCompliant,
          screen: 'confirmations',
          url: '/(tabs)/confirmations',
        },
        sound: 'default',
        badge: 1,
        ...(Platform.OS === 'android' && {
          channelId: 'sea-time-entries',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        }),
        ...(Platform.OS === 'ios' && {
          subtitle: vesselName,
          interruptionLevel: 'active',
        }),
      },
      trigger: null, // Deliver immediately
    });

    console.log('[Notifications] Notification scheduled successfully:', notificationId);
    return notificationId;
  } catch (error) {
    console.error('[Notifications] Failed to schedule notification:', error);
    return null;
  }
}

/**
 * Schedule a daily notification at a specific time (default 18:00 / 6 PM) local time
 * @param scheduledTime - Time in HH:MM format (e.g., "18:00")
 * @returns notification ID or null if not supported/failed
 */
export async function scheduleDailySeaTimeReviewNotification(scheduledTime: string = '18:00'): Promise<string | null> {
  // Notifications are not supported on web
  if (Platform.OS === 'web') {
    console.log('[Notifications] Skipping daily notification setup on web');
    return null;
  }

  try {
    const { Notifications } = await loadNotificationModules();
    
    if (!Notifications) {
      console.error('[Notifications] Module not loaded');
      return null;
    }

    console.log('[Notifications] Setting up daily sea time review notification at', scheduledTime);

    // Parse the scheduled time
    const [hourStr, minuteStr] = scheduledTime.split(':');
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);

    if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      console.error('[Notifications] Invalid time format:', scheduledTime);
      return null;
    }

    // Cancel any existing daily notifications first
    const existingNotifications = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of existingNotifications) {
      if (notification.content.data?.type === 'daily_sea_time_review') {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
        console.log('[Notifications] Cancelled existing daily notification:', notification.identifier);
      }
    }

    // Schedule daily notification at the specified time
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚓️ Sea Time Review',
        body: 'Time to review your sea time entries for today. Tap to check for pending confirmations.',
        data: {
          type: 'daily_sea_time_review',
          screen: 'confirmations',
          url: '/(tabs)/confirmations',
        },
        sound: 'default',
        badge: 1,
        ...(Platform.OS === 'android' && {
          channelId: 'sea-time-entries',
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
        }),
        ...(Platform.OS === 'ios' && {
          interruptionLevel: 'timeSensitive',
        }),
      },
      trigger: {
        hour,
        minute,
        repeats: true,
      },
    });

    console.log('[Notifications] Daily notification scheduled successfully at', scheduledTime, ':', notificationId);
    return notificationId;
  } catch (error) {
    console.error('[Notifications] Failed to schedule daily notification:', error);
    return null;
  }
}

/**
 * Cancel a specific notification
 * @param notificationId - ID of the notification to cancel
 */
export async function cancelNotification(notificationId: string): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    const { Notifications } = await loadNotificationModules();
    
    if (!Notifications) {
      return;
    }

    console.log('[Notifications] Canceling notification:', notificationId);
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    console.log('[Notifications] Notification canceled successfully');
  } catch (error) {
    console.error('[Notifications] Failed to cancel notification:', error);
  }
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    const { Notifications } = await loadNotificationModules();
    
    if (!Notifications) {
      return;
    }

    console.log('[Notifications] Canceling all notifications');
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('[Notifications] All notifications canceled successfully');
  } catch (error) {
    console.error('[Notifications] Failed to cancel all notifications:', error);
  }
}

/**
 * Get the badge count
 */
export async function getBadgeCount(): Promise<number> {
  if (Platform.OS === 'web') {
    return 0;
  }

  try {
    const { Notifications } = await loadNotificationModules();
    
    if (!Notifications) {
      return 0;
    }

    const count = await Notifications.getBadgeCountAsync();
    return count;
  } catch (error) {
    console.error('[Notifications] Failed to get badge count:', error);
    return 0;
  }
}

/**
 * Set the badge count
 * @param count - Number to set as badge
 */
export async function setBadgeCount(count: number): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  try {
    const { Notifications } = await loadNotificationModules();
    
    if (!Notifications) {
      return;
    }

    console.log('[Notifications] Setting badge count to:', count);
    await Notifications.setBadgeCountAsync(count);
  } catch (error) {
    console.error('[Notifications] Failed to set badge count:', error);
  }
}

/**
 * Clear the badge
 */
export async function clearBadge(): Promise<void> {
  await setBadgeCount(0);
}
