
# iOS Push Notifications Deployment Guide

## Overview
This guide covers deploying iOS push notifications for SeaTime Tracker's sea time review alerts. The app uses **local notifications** (scheduled on-device) rather than remote push notifications, which simplifies deployment significantly.

## Current Implementation

### Notification Types
1. **Immediate Sea Day Alerts**: Triggered when a 4+ hour sea day is detected
2. **Daily Review Reminders**: Scheduled at user-configurable time (default 18:00)

### Key Features
- ✅ Local notifications (no server-side push required)
- ✅ User-configurable notification times
- ✅ Timezone-aware scheduling
- ✅ Badge count management
- ✅ Deep linking to Confirmations tab
- ✅ iOS-specific notification settings (interruption levels, subtitles)

## Configuration Files

### 1. app.json
The `expo-notifications` plugin is configured with:
```json
{
  "plugins": [
    [
      "expo-notifications",
      {
        "icon": "./assets/images/f0500a31-f8b9-4d46-8b57-62c3847deff7.png",
        "color": "#ffffff",
        "sounds": [],
        "enableBackgroundRemoteNotifications": true
      }
    ]
  ]
}
```

**Important**: `enableBackgroundRemoteNotifications: true` enables the `remote-notification` background mode in iOS, which is required for notifications to work when the app is backgrounded or terminated.

### 2. iOS Info.plist
When you build with EAS or `npx expo run:ios`, the plugin automatically adds:
- `UIBackgroundModes` with `remote-notification` (for background notifications)
- Notification permissions (no usage description required for notifications)

## Deployment Steps

### Step 1: Build the iOS App
```bash
# For production build
eas build --platform ios --profile production

# For development/testing build
eas build --platform ios --profile preview
```

### Step 2: iOS Permissions
The app automatically requests notification permissions on first launch via `registerForPushNotificationsAsync()` in `app/_layout.tsx`.

**Permissions requested:**
- `allowAlert: true` - Show notification banners
- `allowBadge: true` - Update app icon badge
- `allowSound: true` - Play notification sounds

**User Experience:**
1. On first launch, iOS shows system permission prompt
2. User can grant or deny permissions
3. If denied, user can enable later in iOS Settings > SeaTime Tracker > Notifications

### Step 3: Testing Notifications

#### Test Immediate Notifications
1. Add a vessel with MMSI
2. Wait for vessel movement detection (4+ hours)
3. Notification should appear immediately when sea day is detected

#### Test Daily Notifications
1. Go to Profile tab → Notification Settings
2. Enable "Daily Notifications"
3. Set notification time to 1-2 minutes from now
4. Wait for scheduled time
5. Notification should appear at scheduled time

#### Test Deep Linking
1. Tap on any notification
2. App should open and navigate to Confirmations tab
3. Verify the entry is displayed

### Step 4: Verify Background Notifications
1. Close the app completely (swipe up from app switcher)
2. Wait for a scheduled notification time
3. Notification should still appear
4. Tap notification to open app

## Troubleshooting

### Notifications Not Appearing

**Check 1: Permissions**
```typescript
// In app, check permission status
const { status } = await Notifications.getPermissionsAsync();
console.log('Permission status:', status);
```

**Check 2: Scheduled Notifications**
```typescript
// View all scheduled notifications
const scheduled = await Notifications.getAllScheduledNotificationsAsync();
console.log('Scheduled notifications:', scheduled);
```

**Check 3: iOS Settings**
- Open iOS Settings
- Scroll to SeaTime Tracker
- Tap Notifications
- Verify "Allow Notifications" is ON
- Check Banner Style, Sounds, Badges are enabled

### Notifications Not Working in Background

**Verify Background Modes:**
1. Open Xcode project
2. Select target → Signing & Capabilities
3. Verify "Background Modes" capability exists
4. Verify "Remote notifications" is checked

**If missing:**
- Rebuild with `eas build` or `npx expo run:ios`
- The expo-notifications plugin should add this automatically

### Daily Notifications Not Triggering

**Check Timezone:**
```typescript
// Verify timezone is correct
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
console.log('Device timezone:', timezone);
```

**Check Scheduled Time:**
- Notifications use device local time
- Verify the scheduled time in Notification Settings
- Try setting to a few minutes from now for testing

## Production Checklist

- [ ] `enableBackgroundRemoteNotifications: true` in app.json
- [ ] Notification permissions requested on app launch
- [ ] Notification handler configured in app/_layout.tsx
- [ ] Deep linking configured for notification taps
- [ ] Badge count management implemented
- [ ] User can configure notification time in settings
- [ ] Timezone handling implemented
- [ ] Tested on physical iOS device (notifications don't work in simulator)
- [ ] Tested with app in foreground, background, and terminated states
- [ ] Verified notifications appear at scheduled times
- [ ] Verified deep linking works from notifications

## Code References

### Main Files
- `utils/notifications.ts` - Notification scheduling and management
- `hooks/useNotifications.ts` - Notification polling and setup
- `app/_layout.tsx` - Permission requests and notification response handling
- `app/notification-settings.tsx` - User notification preferences UI
- `app/(tabs)/confirmations.tsx` - Notification trigger logic

### Key Functions
- `registerForPushNotificationsAsync()` - Request permissions
- `scheduleSeaTimeNotification()` - Schedule immediate sea day alert
- `scheduleDailySeaTimeReviewNotification()` - Schedule daily reminder
- `useNotifications()` - Hook for notification polling

## iOS-Specific Features

### Interruption Levels
The app uses iOS interruption levels for better notification management:
- **Active**: For immediate sea day alerts (requires user attention)
- **Time Sensitive**: For daily review reminders (important but not urgent)

### Notification Subtitles
Sea day alerts include the vessel name as a subtitle for better context.

### Badge Management
- Badge count increments when new sea days are detected
- Badge clears when user reviews entries
- User can manually clear badge in app

## Support

For issues with notifications:
1. Check console logs (search for `[Notifications]`)
2. Verify permissions in iOS Settings
3. Test on physical device (not simulator)
4. Rebuild app if background modes are missing
5. Check EAS build logs for any plugin errors

## Additional Resources

- [Expo Notifications Documentation](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [iOS Notification Best Practices](https://developer.apple.com/design/human-interface-guidelines/notifications)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
