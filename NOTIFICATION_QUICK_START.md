
# iOS Push Notifications - Quick Start Guide

## ✅ What's Already Configured

Your SeaTime Tracker app is **fully configured** for iOS push notifications! Here's what's already set up:

### 1. Notification Types
- **Sea Day Alerts**: Automatic notifications when 4+ hour sea days are detected
- **Daily Reminders**: Configurable daily notifications to review pending entries (default: 6 PM)

### 2. Configuration
- ✅ `expo-notifications` plugin configured in app.json
- ✅ Background notification support enabled
- ✅ Notification permissions automatically requested
- ✅ Deep linking to Confirmations tab
- ✅ Badge count management
- ✅ iOS-specific features (interruption levels, subtitles)

## 🚀 Deployment Steps

### 1. Build for iOS
```bash
# Production build
eas build --platform ios --profile production

# Or development build for testing
eas build --platform ios --profile preview
```

### 2. Test on Device
**Important**: Notifications don't work in iOS Simulator - you MUST test on a physical device.

1. Install the built app on your iPhone
2. Launch the app
3. Grant notification permissions when prompted
4. Go to Profile → Notification Settings
5. Enable daily notifications
6. Set time to 1-2 minutes from now
7. Wait for notification to appear

### 3. Verify Features
- [ ] Notification appears at scheduled time
- [ ] Tapping notification opens app to Confirmations tab
- [ ] Badge count updates correctly
- [ ] Notifications work when app is closed
- [ ] User can change notification time in settings

## 📱 User Experience

### First Launch
1. User opens app for first time
2. iOS shows permission prompt: "SeaTime Tracker Would Like to Send You Notifications"
3. User taps "Allow"
4. Notifications are now enabled

### Daily Notifications
1. User goes to Profile → Notification Settings
2. Toggles "Enable Daily Notifications" ON
3. Taps "Change" to set preferred time (default 6 PM)
4. Receives daily reminder at chosen time

### Sea Day Alerts
1. App detects vessel movement (4+ hours)
2. Notification appears immediately: "⚓️ Sea Day Detected - tap to review"
3. User taps notification
4. App opens to Confirmations tab showing the new entry

## 🔧 Troubleshooting

### Notifications Not Appearing?

**Check iOS Settings:**
1. Open Settings app
2. Scroll to "SeaTime Tracker"
3. Tap "Notifications"
4. Verify "Allow Notifications" is ON
5. Check that Banners, Sounds, and Badges are enabled

**Check App Settings:**
1. Open SeaTime Tracker
2. Go to Profile tab
3. Tap "Notification Settings"
4. Verify "Enable Daily Notifications" is ON
5. Check the scheduled time is correct

**Still Not Working?**
- Make sure you're testing on a physical device (not simulator)
- Try setting notification time to 1-2 minutes from now
- Check that the app has permission in iOS Settings
- Restart the app and try again

## 📋 What Happens When...

### App is in Foreground
- Notification banner appears at top of screen
- User can tap to go to Confirmations tab
- Badge count updates

### App is in Background
- Notification appears in Notification Center
- Badge count updates on app icon
- User can tap to open app to Confirmations tab

### App is Closed/Terminated
- Notification still appears (thanks to background modes)
- Badge count updates on app icon
- Tapping notification launches app to Confirmations tab

## 🎯 Key Features

### Timezone Support
- Notifications use device local time
- Automatically adjusts for timezone changes
- User's timezone is saved with notification schedule

### Customizable Schedule
- User can choose from preset times (6 AM, 8 AM, 12 PM, 6 PM, 8 PM, 9 PM)
- Or keep default 6 PM time
- Changes take effect immediately

### Smart Notifications
- Only notifies for MCA-compliant sea days (4+ hours)
- Daily reminder only sent if there are pending entries
- Badge count shows number of pending entries

## 📝 Technical Details

### Files Modified
- `app.json` - Added `enableBackgroundRemoteNotifications: true`
- `utils/notifications.ts` - Enhanced iOS-specific notification settings
- No other changes needed - everything else was already configured!

### iOS Capabilities
The app automatically includes:
- Background Modes → Remote notifications
- Notification permissions
- Badge updates
- Sound and banner alerts

## ✨ That's It!

Your app is ready for iOS push notifications. Just build and deploy!

**Next Steps:**
1. Run `eas build --platform ios --profile production`
2. Submit to App Store or TestFlight
3. Test on physical device
4. Users will automatically get notification permissions prompt on first launch

For detailed troubleshooting and technical information, see `IOS_PUSH_NOTIFICATIONS_DEPLOYMENT.md`.
