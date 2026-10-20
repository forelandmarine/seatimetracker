
import { Platform } from 'react-native';

import { log, warn, error as logError } from '@/utils/log';

log('[Notifications] Notification utility initialized');

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

    log('[Notifications] ✅ Modules loaded successfully');
    return {
      Notifications: NotificationsModule,
      Device: DeviceModule,
    };
  } catch (error) {
    logError('[Notifications] ❌ Failed to load modules:', error);
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
    log('[Notifications] Notifications not supported on web');
    return false;
  }

  log('[Notifications] Requesting notification permissions');
  
  try {
    const { Notifications, Device } = await loadNotificationModules();
    
    if (!Notifications || !Device) {
      logError('[Notifications] Required modules not loaded');
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
    log('[Notifications] ✅ Notification handler set');

    if (!Device.isDevice) {
      warn('[Notifications] Must use physical device for notifications');
      return false;
    }

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    log('[Notifications] Existing permission status:', existingStatus);

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
      log('[Notifications] Permission request result:', status);
    }

    if (finalStatus !== 'granted') {
      warn('[Notifications] Notification permissions not granted');
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
      log('[Notifications] Android notification channel created');
    }

    log('[Notifications] Notification permissions granted successfully');
    return true;
  } catch (error) {
    logError('[Notifications] ❌ Permission request failed:', error);
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
    log('[Notifications] Skipping notification on web');
    return null;
  }

  try {
    const { Notifications } = await loadNotificationModules();
    
    if (!Notifications) {
      logError('[Notifications] Module not loaded');
      return null;
    }

    log('[Notifications] Scheduling notification for sea time entry:', {
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

    log('[Notifications] Notification scheduled successfully:', notificationId);
    return notificationId;
  } catch (error) {
    logError('[Notifications] Failed to schedule notification:', error);
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
    log('[Notifications] Skipping daily notification setup on web');
    return null;
  }

  try {
    const { Notifications } = await loadNotificationModules();
    
    if (!Notifications) {
      logError('[Notifications] Module not loaded');
      return null;
    }

    log('[Notifications] Setting up daily sea time review notification at', scheduledTime);

    // Parse the scheduled time
    const [hourStr, minuteStr] = scheduledTime.split(':');
    const hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);

    if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      logError('[Notifications] Invalid time format:', scheduledTime);
      return null;
    }

    // Cancel any existing daily notifications first
    const existingNotifications = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of existingNotifications) {
      if (notification.content.data?.type === 'daily_sea_time_review') {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
        log('[Notifications] Cancelled existing daily notification:', notification.identifier);
      }
    }

    // Schedule daily notification at the specified time.
    // expo-notifications v0.32+ requires explicit trigger type — use DAILY
    // for daily-recurring notifications at a specific hour/minute.
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Sea Time Review',
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
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      } as any,
    });

    log('[Notifications] Daily notification scheduled successfully at', scheduledTime, ':', notificationId);
    return notificationId;
  } catch (error) {
    logError('[Notifications] Failed to schedule daily notification:', error);
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

    log('[Notifications] Canceling notification:', notificationId);
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    log('[Notifications] Notification canceled successfully');
  } catch (error) {
    logError('[Notifications] Failed to cancel notification:', error);
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

    log('[Notifications] Canceling all notifications');
    await Notifications.cancelAllScheduledNotificationsAsync();
    log('[Notifications] All notifications canceled successfully');
  } catch (error) {
    logError('[Notifications] Failed to cancel all notifications:', error);
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
    logError('[Notifications] Failed to get badge count:', error);
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

    log('[Notifications] Setting badge count to:', count);
    await Notifications.setBadgeCountAsync(count);
  } catch (error) {
    logError('[Notifications] Failed to set badge count:', error);
  }
}

/**
 * Clear the badge
 */
export async function clearBadge(): Promise<void> {
  await setBadgeCount(0);
}

// ---------------------------------------------------------------------------
// Certificate expiry reminders (local, on-device only)
//
// The certificate tracker stores only a type and an expiry date. These local
// notifications are the entire "reminder" feature: nothing about the
// certificate is sent anywhere, it is scheduled on the device from the expiry
// date alone.
// ---------------------------------------------------------------------------

/**
 * Fire a local notification immediately (used for shift clock-in / disembark
 * reminders driven by location). No-op on web or without permission.
 */
export async function sendLocalNotification(
  title: string,
  body: string,
  data: Record<string, any> = {},
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { Notifications } = await loadNotificationModules();
    if (!Notifications) return;
    const granted = await registerForPushNotificationsAsync();
    if (!granted) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'default',
        ...(Platform.OS === 'android' && {
          channelId: 'sea-time-entries',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        }),
      },
      trigger: null, // deliver now
    });
  } catch (error) {
    logError('[Notifications] Failed to send local notification:', error);
  }
}

/** Days before expiry at which a reminder fires. */
export const CERTIFICATE_REMINDER_OFFSETS_DAYS = [90, 60, 30, 7];

/** Deterministic identifier so reminders can be cancelled/rescheduled per certificate + offset. */
function certReminderId(certId: string, offsetDays: number): string {
  return `cert-expiry-${certId}-${offsetDays}`;
}

/**
 * Cancel any pending expiry reminders for a certificate (used on edit + delete).
 */
export async function cancelCertificateExpiryReminders(certId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { Notifications } = await loadNotificationModules();
    if (!Notifications) return;
    await Promise.all(
      CERTIFICATE_REMINDER_OFFSETS_DAYS.map((d) =>
        Notifications.cancelScheduledNotificationAsync(certReminderId(certId, d)).catch(() => {}),
      ),
    );
    log('[Notifications] Cancelled certificate reminders for', certId);
  } catch (error) {
    logError('[Notifications] Failed to cancel certificate reminders:', error);
  }
}

/**
 * (Re)schedule local expiry reminders for a certificate at 90/60/30/7 days
 * before its expiry date. Existing reminders for the certificate are cancelled
 * first, so this is safe to call on both create and update. Only future
 * reminder dates are scheduled; a no-op when there is no expiry date.
 */
export async function scheduleCertificateExpiryReminders(
  certId: string,
  certLabel: string,
  expiryDateISO: string | null | undefined,
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { Notifications } = await loadNotificationModules();
    if (!Notifications) return;

    // Always clear existing first so an edit reschedules cleanly.
    await cancelCertificateExpiryReminders(certId);

    if (!expiryDateISO) return;
    const expiry = new Date(expiryDateISO);
    if (isNaN(expiry.getTime())) return;

    // Ensure permission + the Android channel exist (idempotent; returns false
    // on simulators and when permission is denied, in which case we skip).
    const granted = await registerForPushNotificationsAsync();
    if (!granted) {
      warn('[Notifications] Certificate reminders not scheduled (no permission / not a device)');
      return;
    }

    const now = Date.now();
    for (const offsetDays of CERTIFICATE_REMINDER_OFFSETS_DAYS) {
      // Fire at 09:00 local on the reminder day.
      const fire = new Date(expiry);
      fire.setDate(fire.getDate() - offsetDays);
      fire.setHours(9, 0, 0, 0);
      if (fire.getTime() <= now) continue; // skip reminder dates already past

      const when = offsetDays === 7 ? 'in 1 week' : `in ${offsetDays} days`;
      await Notifications.scheduleNotificationAsync({
        identifier: certReminderId(certId, offsetDays),
        content: {
          title: 'Certificate expiring soon',
          body: `${certLabel} expires ${when} (${expiry.toLocaleDateString('en-GB')}).`,
          data: { type: 'certificate_expiry', certId, screen: 'certificates', url: '/certificates' },
          sound: 'default',
          ...(Platform.OS === 'android' && {
            channelId: 'sea-time-entries',
            priority: Notifications.AndroidNotificationPriority.HIGH,
          }),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fire,
        } as any,
      });
    }
    log('[Notifications] Scheduled certificate reminders for', certId);
  } catch (error) {
    logError('[Notifications] Failed to schedule certificate reminders:', error);
  }
}

const RETURN_REMINDER_ID = 'on-board-return-reminder';

/**
 * Remind an off-board user to switch back on board, at 08:00 local on their
 * expected return date. Replaces any earlier reminder; a no-op for past dates.
 */
export async function scheduleReturnReminder(returnDateISO: string, vesselName?: string | null): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { Notifications } = await loadNotificationModules();
    if (!Notifications) return;
    await cancelReturnReminder();

    const [y, m, d] = returnDateISO.split('-').map(Number);
    const fire = new Date(y, m - 1, d, 8, 0, 0, 0);
    if (isNaN(fire.getTime()) || fire.getTime() <= Date.now()) return;

    const granted = await registerForPushNotificationsAsync();
    if (!granted) return;

    await Notifications.scheduleNotificationAsync({
      identifier: RETURN_REMINDER_ID,
      content: {
        title: 'Back on board today?',
        body: `Switch on board so ${vesselName || 'your vessel'}'s passages count towards your sea time.`,
        data: { type: 'on_board_return', url: '/(tabs)/(home)' },
        sound: 'default',
        ...(Platform.OS === 'android' && {
          channelId: 'sea-time-entries',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fire,
      } as any,
    });
    log('[Notifications] Return reminder scheduled for', fire.toISOString());
  } catch (error) {
    logError('[Notifications] Failed to schedule return reminder:', error);
  }
}

export async function cancelReturnReminder(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { Notifications } = await loadNotificationModules();
    if (!Notifications) return;
    await Notifications.cancelScheduledNotificationAsync(RETURN_REMINDER_ID).catch(() => {});
  } catch (error) {
    logError('[Notifications] Failed to cancel return reminder:', error);
  }
}

const PENDING_REMINDER_ID = 'pending-passages-reminder';
const NO_VESSEL_REMINDER_ID = 'no-vessel-reminder';

/** Local notification at `fire`, replacing any earlier one with the same id. */
async function scheduleOneOff(
  identifier: string,
  fire: Date,
  title: string,
  body: string,
  url: string
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { Notifications } = await loadNotificationModules();
    if (!Notifications) return;
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
    if (fire.getTime() <= Date.now()) return;

    const granted = await registerForPushNotificationsAsync();
    if (!granted) return;

    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title,
        body,
        data: { type: identifier, url },
        sound: 'default',
        ...(Platform.OS === 'android' && {
          channelId: 'sea-time-entries',
          priority: Notifications.AndroidNotificationPriority.HIGH,
        }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fire,
      } as any,
    });
    log('[Notifications] Scheduled', identifier, 'for', fire.toISOString());
  } catch (error) {
    logError('[Notifications] Failed to schedule', identifier, error);
  }
}

async function cancelById(identifier: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { Notifications } = await loadNotificationModules();
    if (!Notifications) return;
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
  } catch (error) {
    logError('[Notifications] Failed to cancel', identifier, error);
  }
}

/**
 * Remind the user about unconfirmed passages a week from now, at 09:00 local.
 * Called whenever the pending count is refreshed, so the reminder keeps moving
 * a week ahead while the user is active and fires once they stop opening the app.
 */
export async function schedulePendingPassagesReminder(pendingCount: number): Promise<void> {
  if (pendingCount <= 0) return cancelPendingPassagesReminder();
  const fire = new Date();
  fire.setDate(fire.getDate() + 7);
  fire.setHours(9, 0, 0, 0);
  const noun = pendingCount === 1 ? 'passage' : 'passages';
  await scheduleOneOff(
    PENDING_REMINDER_ID,
    fire,
    `You have ${pendingCount} ${noun} to confirm`,
    'Confirm them so they count towards your sea time.',
    '/(tabs)/confirmations'
  );
}

export async function cancelPendingPassagesReminder(): Promise<void> {
  await cancelById(PENDING_REMINDER_ID);
}

/** One reminder to add a vessel, if the user still has none at `fire`. */
export async function scheduleNoVesselReminder(fire: Date): Promise<void> {
  await scheduleOneOff(
    NO_VESSEL_REMINDER_ID,
    fire,
    'Add your vessel to start tracking',
    'Enter its 9-digit MMSI and SeaTime Tracker logs your passages from AIS automatically.',
    '/(tabs)/(home)'
  );
}

export async function cancelNoVesselReminder(): Promise<void> {
  await cancelById(NO_VESSEL_REMINDER_ID);
}

/**
 * Expo push token for server-sent alerts (e.g. "your vessel is underway").
 * Null on web, simulators, without permission, or if push credentials are missing.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const { Notifications, Device } = await loadNotificationModules();
    if (!Notifications || !Device?.isDevice) return null;
    const { default: Constants } = await import('expo-constants');
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (error) {
    warn('[Notifications] Could not get Expo push token:', error);
    return null;
  }
}
