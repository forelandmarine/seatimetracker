
# iOS Crash Fix - Required Manual Steps

## 🚨 CRITICAL ISSUES IDENTIFIED

The app is crashing 1 second after load on iOS because **critical diagnostic instrumentation is NOT active**. The fixes were implemented in previous iterations but are NOT being applied to the actual iOS builds.

## Root Causes

### 1. iOS Crash Instrumentation Plugin NOT Activated ❌
**Problem:** The plugin file exists at `plugins/ios-crash-instrumentation.js` but is **NOT listed in app.json plugins array**.

**Current app.json:**
```json
"plugins": [
  "expo-router",
  "expo-secure-store",
  ["expo-notifications", {...}],
  "expo-apple-authentication"
]
```

**Required fix:**
```json
"plugins": [
  "./plugins/ios-crash-instrumentation",  // ← ADD THIS LINE FIRST
  "expo-router",
  "expo-secure-store",
  ["expo-notifications", {...}],
  "expo-apple-authentication"
]
```

**Impact:** Without this plugin, the native crash handlers (NSSetUncaughtExceptionHandler, RCTSetFatalHandler) are NOT installed in the iOS build. When the app crashes with SIGABRT, there is NO diagnostic information about which TurboModule or method caused the crash.

---

### 2. TurboModule Logging Patch NOT Applied ❌
**Problem:** The patch file exists at `patches/react-native+0.81.5.patch` but there is **NO postinstall script** in package.json to apply it.

**Current package.json:**
```json
"scripts": {
  "dev": "EXPO_NO_TELEMETRY=1 expo start --tunnel",
  "android": "...",
  // NO postinstall script!
}
```

**Required fix:**
```json
"scripts": {
  "postinstall": "patch-package",  // ← ADD THIS LINE
  "dev": "EXPO_NO_TELEMETRY=1 expo start --tunnel",
  "android": "...",
}
```

**Impact:** Without the postinstall script, the patch-package never runs, so the TurboModule invocation logging in `RCTTurboModule.mm` is NOT applied. This means we cannot see which exact TurboModule method is being called before the SIGABRT crash.

---

### 3. Excessive Delays May Cause App to Appear Frozen
**Problem:** The app has extremely long delays (5-12 seconds) for native module loading in `app/_layout.tsx`. While these delays were added to prevent TurboModule crashes, they may be causing the app to appear frozen or unresponsive, which could trigger watchdog timeouts.

**Current delays:**
- App ready flag: 3 seconds
- Initial module loading: 5 seconds
- Notifications: 8 seconds
- Network monitoring: 10 seconds
- Haptics: 12 seconds
- Initial auth check: 4 seconds

**Recommendation:** These delays are excessive. The app should be responsive within 1-2 seconds. The delays may be masking the real issue rather than fixing it.

---

## Required Manual Steps

### Step 1: Activate iOS Crash Instrumentation Plugin

Edit `app.json` and add the plugin to the plugins array:

```json
{
  "expo": {
    "plugins": [
      "./plugins/ios-crash-instrumentation",  // ← ADD THIS FIRST
      "expo-router",
      "expo-secure-store",
      [
        "expo-notifications",
        {
          "icon": "./assets/images/f0500a31-f8b9-4d46-8b57-62c3847deff7.png",
          "color": "#ffffff"
        }
      ],
      "expo-apple-authentication"
    ]
  }
}
```

### Step 2: Enable patch-package Postinstall Script

Edit `package.json` and add the postinstall script:

```json
{
  "scripts": {
    "postinstall": "patch-package",  // ← ADD THIS
    "dev": "EXPO_NO_TELEMETRY=1 expo start --tunnel",
    "android": "EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 expo start --android --offline",
    "ios": "EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 expo start --ios --offline",
    ...
  }
}
```

### Step 3: Run npm install to Apply Patches

After adding the postinstall script, run:

```bash
npm install
```

This will apply the TurboModule logging patch to `node_modules/react-native/ReactCommon/react/nativemodule/core/platform/ios/RCTTurboModule.mm`.

### Step 4: Rebuild iOS App with Instrumentation

After making the above changes, rebuild the iOS app:

```bash
# For local development
npx expo prebuild -p ios --clean

# For TestFlight
eas build --platform ios --profile production
```

### Step 5: Test and Capture Crash Logs

1. Install the new build on a device or TestFlight
2. Launch the app
3. If it crashes, immediately connect the device to Xcode
4. Open **Xcode → Window → Devices and Simulators**
5. Select your device
6. Click **View Device Logs**
7. Look for logs containing:
   - `[TurboModuleInvoke]` - Shows which module/method was called before crash
   - `FATAL: UNCAUGHT OBJECTIVE-C EXCEPTION` - Shows the actual exception reason
   - `crash_log.txt` - Check the app's Documents directory for persistent crash logs

---

## What to Look For in Crash Logs

Once instrumentation is active, you'll see logs like this BEFORE the crash:

```
═══════════════════════════════════════════════════════════════════════════
[TurboModuleInvoke] Module: RCTSecureStore
[TurboModuleInvoke] Method: setItemAsync:value:options:
[TurboModuleInvoke] Arguments: 3
═══════════════════════════════════════════════════════════════════════════
❌ FATAL: UNCAUGHT OBJECTIVE-C EXCEPTION
═══════════════════════════════════════════════════════════════════════════
Exception Name: NSInvalidArgumentException
Exception Reason: -[__NSCFString length]: unrecognized selector sent to instance 0x...
Call Stack Symbols:
  0   CoreFoundation    0x00000001a1b2c3d4 __exceptionPreprocess + 220
  1   libobjc.A.dylib   0x00000001a0d4c0e4 objc_exception_throw + 60
  ...
```

This will tell you:
1. **Which TurboModule** is crashing (e.g., RCTSecureStore, RCTNotifications)
2. **Which method** is being called (e.g., setItemAsync, getItemAsync)
3. **The actual exception reason** (e.g., nil value passed to nonnull parameter)

---

## Current State of Fixes

### ✅ Implemented (but NOT active):
- iOS crash instrumentation plugin exists
- TurboModule logging patch exists
- Dynamic SecureStore imports in AuthContext, biometricAuth.ts, seaTimeApi.ts
- Extensive logging and error handling
- Delayed native module loading

### ❌ NOT Active (requires manual steps):
- iOS crash instrumentation plugin NOT in app.json
- patch-package postinstall script NOT in package.json
- Patches NOT applied to node_modules
- Instrumentation NOT included in iOS builds

---

## Alternative Approach: Reduce Delays

If the crash persists even after enabling instrumentation, consider reducing the excessive delays in `app/_layout.tsx`:

**Current:**
- App ready: 3 seconds
- Module loading: 5-12 seconds
- Auth check: 4 seconds

**Recommended:**
- App ready: 500ms
- Module loading: 1-2 seconds
- Auth check: 1 second

The current delays are so long that they may be causing watchdog timeouts or making the app appear frozen, which could trigger system-level termination.

---

## Next Steps

1. **Manually add the plugin to app.json** (Step 1 above)
2. **Manually add postinstall script to package.json** (Step 2 above)
3. **Run `npm install`** to apply patches (Step 3 above)
4. **Rebuild the iOS app** with instrumentation (Step 4 above)
5. **Test and capture crash logs** (Step 5 above)
6. **Share the crash logs** showing the TurboModule invocation before the crash

Once we have the actual crash logs with instrumentation active, we can identify the exact TurboModule and method causing the SIGABRT and implement a targeted fix.

---

## Why This Matters

Without the instrumentation active, we are **flying blind**. The crash could be caused by:
- expo-secure-store (Keychain access)
- expo-notifications (Push notification registration)
- expo-network (Network state monitoring)
- expo-haptics (Haptic feedback)
- Any other native module

The instrumentation will tell us **exactly** which module and method is failing, allowing us to fix the root cause instead of adding more delays.
