
# iOS TurboModule Crash Instrumentation - Integration Guide

## 🎯 Purpose
This instrumentation will capture the **exact module and method** that causes the SIGABRT crash in TestFlight, allowing us to identify and fix the root cause.

## 📋 Integration Steps

### Step 1: Add Files to Xcode Project

1. Open your project in Xcode: `ios/SeaTimeTracker.xcworkspace`

2. Right-click on the `SeaTimeTracker` folder in the Project Navigator

3. Select **"Add Files to SeaTimeTracker..."**

4. Navigate to and select both files:
   - `ios/SeaTimeTracker/AppDelegate+CrashLogging.h`
   - `ios/SeaTimeTracker/AppDelegate+CrashLogging.m`

5. Ensure **"Copy items if needed"** is checked

6. Click **"Add"**

### Step 2: Modify AppDelegate.mm

Open `ios/SeaTimeTracker/AppDelegate.mm` and add the following:

**At the top of the file (after existing imports):**

```objective-c
#import "AppDelegate+CrashLogging.h"
```

**In the `application:didFinishLaunchingWithOptions:` method, add this as the FIRST line:**

```objective-c
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  // ═══════════════════════════════════════════════════════════════════════════
  // 🚨 CRITICAL: Install crash handlers FIRST
  // ═══════════════════════════════════════════════════════════════════════════
  [self installCrashHandlers];
  
  // ... rest of your existing code ...
}
```

### Step 3: Build and Test

1. Clean build folder: **Product → Clean Build Folder** (Cmd+Shift+K)

2. Build for TestFlight: **Product → Archive**

3. Upload to TestFlight

4. Install and run the app

### Step 4: Retrieve Crash Logs

When the crash occurs, the detailed log will be available in:

**Option A: Xcode Console (if connected)**
- The crash details will be printed to the console with clear markers

**Option B: TestFlight Crash Reports**
- Go to App Store Connect → TestFlight → Crashes
- The crash report will now include the detailed exception information

**Option C: Device Logs**
- Connect the device to Xcode
- Window → Devices and Simulators
- Select your device → View Device Logs
- Look for logs from SeaTimeTracker

## 🔍 What to Look For

The crash log will now include:

```
═══════════════════════════════════════════════════════════════════════════
🚨 UNCAUGHT OBJECTIVE-C EXCEPTION - TURBOMODULE CRASH
═══════════════════════════════════════════════════════════════════════════
Exception Name: NSInternalInconsistencyException
Exception Reason: [Specific reason here]
───────────────────────────────────────────────────────────────────────────
🔍 DIAGNOSIS:
   Suspected Module: RCTSecureStore (or other module)
   Suspected Method: getItemAsync (or other method)
───────────────────────────────────────────────────────────────────────────
```

## 🎯 Expected Results

Based on the code analysis, the crash log will most likely show:

**Most Probable:**
- **Module**: `RCTSecureStore` (expo-secure-store)
- **Reason**: "UIKit/Keychain operations must be performed on main thread"
- **Location**: `AuthContext.checkAuth()` → `tokenStorage.getToken()` → `SecureStore.getItemAsync()`

**Secondary Possibilities:**
- **Module**: `RCTNotifications` (expo-notifications)
- **Reason**: Device registration called too early
- **Location**: `app/_layout.tsx` → `registerForPushNotificationsAsync()`

## 📞 Next Steps

Once you have the crash log:

1. **Share the full crash log** - especially the "DIAGNOSIS" section
2. **Note the timing** - exactly when in the startup sequence it crashes
3. **Check for patterns** - does it crash every time or intermittently?

The JavaScript-side fixes I've implemented should prevent the crash, but this instrumentation will confirm the exact cause if it still occurs.

## ⚠️ Important Notes

- This instrumentation is **production-safe** - it only logs, doesn't change behavior
- The handlers are installed **before** React Native initializes, so they catch early crashes
- The crash log is written to a file that persists across app restarts
- This will work in **TestFlight builds** - you don't need a development build

## 🔧 Troubleshooting

**If the files don't compile:**
- Ensure you're using Objective-C++ (`.mm`) for AppDelegate
- Check that the import path is correct
- Clean and rebuild

**If crash logs don't appear:**
- Check that `installCrashHandlers` is called FIRST in `didFinishLaunchingWithOptions`
- Verify the category files are included in the target
- Check Xcode console output for "Installing crash handlers" message
