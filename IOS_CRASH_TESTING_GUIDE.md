
# iOS TurboModule Crash - Testing & Diagnosis Guide

## 🎯 OBJECTIVE

Identify the exact TurboModule and method causing the SIGABRT crash during app startup.

---

## 📋 PRE-TESTING CHECKLIST

- [ ] Latest code deployed to TestFlight
- [ ] Device connected to Mac with Xcode installed
- [ ] Console app open (Applications → Utilities → Console)
- [ ] TestFlight app installed on device
- [ ] Device logs enabled in Xcode (Window → Devices and Simulators)

---

## 🔬 TESTING PROCEDURE

### Step 1: Clean Install

1. **Delete existing app** from device
2. **Install from TestFlight**
3. **Do NOT launch yet**

### Step 2: Start Log Capture

**Option A: Xcode Device Logs**
1. Connect device to Mac
2. Open Xcode → Window → Devices and Simulators
3. Select your device
4. Click "Open Console" button
5. Filter by "SeaTimeTracker"

**Option B: Console App**
1. Open Console app (Applications → Utilities → Console)
2. Select your device in sidebar
3. Filter by "SeaTimeTracker"
4. Click "Start" to begin streaming

**Option C: Terminal**
```bash
# Stream device logs
xcrun simctl spawn booted log stream --predicate 'processImagePath contains "SeaTimeTracker"' --level debug

# Or for physical device
idevicesyslog | grep SeaTimeTracker
```

### Step 3: Launch App and Capture Crash

1. **Launch app from TestFlight**
2. **Watch console output carefully**
3. **Wait for crash** (~2-3 seconds)
4. **Save all console output** to a file

### Step 4: Retrieve Crash Report

**From Xcode:**
1. Xcode → Window → Devices and Simulators
2. Select device → View Device Logs
3. Find most recent crash with "SeaTimeTracker"
4. Right-click → Export Log
5. Save as `crash_report.txt`

**From Device:**
1. Settings → Privacy & Security → Analytics & Improvements
2. Analytics Data
3. Find "SeaTimeTracker" crash
4. Tap → Share button → Save to Files

**From Mac (if synced):**
```bash
# View crash reports
ls ~/Library/Logs/DiagnosticReports/ | grep SeaTimeTracker

# Open most recent
open ~/Library/Logs/DiagnosticReports/SeaTimeTracker-*.ips
```

---

## 🔍 WHAT TO LOOK FOR IN LOGS

### Critical Log Patterns

**1. SecureStore Crash (Most Likely)**
```
[Auth] ⚠️ ABOUT TO CALL NATIVE: tokenStorage.getToken
[Auth] Calling SecureStore.getItemAsync...
[Auth] ❌ NATIVE CALL FAILED: SecureStore.getItemAsync
Error: NSInternalInconsistencyException
Reason: Keychain must be accessed from main thread
```

**2. Notifications Crash**
```
[App] [2/4] Loading notification modules...
[App] Requesting notification permissions...
Error: NSInternalInconsistencyException
Reason: UNUserNotificationCenter must be accessed from main thread
```

**3. NetInfo Crash**
```
[App] [3/4] Loading network monitoring...
Error: Network state listener registration failed
```

**4. Haptics Crash**
```
[App] [4/4] Loading haptics...
Error: UIImpactFeedbackGenerator must be accessed from main thread
```

### Crash Report Indicators

Look for these sections in the crash report:

**Exception Type:**
```
Exception Type: EXC_CRASH (SIGABRT)
Exception Codes: 0x0000000000000000, 0x0000000000000000
```

**Termination Reason:**
```
Namespace SIGNAL, Code 6
Termination Reason: Namespace SIGNAL, Code 6 Abort trap: 6
```

**Application Specific Information:**
```
*** Terminating app due to uncaught exception 'NSInternalInconsistencyException'
reason: 'Keychain must be accessed from main thread'
```

**Thread 0 Crashed (Main Thread):**
```
0   libsystem_kernel.dylib          0x00000001a1b2c2e8 __pthread_kill + 8
1   libsystem_pthread.dylib         0x00000001a1b63f50 pthread_kill + 288
2   libsystem_c.dylib               0x00000001a1a71c20 abort + 180
3   libc++abi.dylib                 0x00000001a1b1d3a8 __cxa_bad_cast + 0
4   libobjc.A.dylib                 0x00000001a19e8f54 _objc_fatalv + 116
5   SeaTimeTracker                  0x0000000102a3c4d0 facebook::react::ObjCTurboModule::performVoidMethodInvocation + 441
```

---

## 📊 DIAGNOSIS MATRIX

| Log Pattern | Module | Root Cause | Fix Priority |
|-------------|--------|------------|--------------|
| "SecureStore.getItemAsync" + "Keychain" | expo-secure-store | Wrong thread | **CRITICAL** |
| "SecureStore.setItemAsync" + "Keychain" | expo-secure-store | Wrong thread | **CRITICAL** |
| "UNUserNotificationCenter" | expo-notifications | Wrong thread | HIGH |
| "Network state listener" | @react-native-community/netinfo | Module init | MEDIUM |
| "UIImpactFeedbackGenerator" | expo-haptics | Wrong thread | LOW |

---

## 🛠️ IMMEDIATE FIXES BASED ON DIAGNOSIS

### If Crash is SecureStore (Most Likely)

**Symptom:**
```
[Auth] ❌ NATIVE CALL FAILED: SecureStore.getItemAsync
Error: NSInternalInconsistencyException
Reason: Keychain must be accessed from main thread
```

**Fix:** Use AsyncStorage instead of SecureStore for auth token

```typescript
// In contexts/AuthContext.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';

const tokenStorage = {
  async getToken(): Promise<string | null> {
    try {
      // Use AsyncStorage instead of SecureStore
      return await AsyncStorage.getItem(TOKEN_KEY);
    } catch (error) {
      console.error('[Auth] Failed to get token:', error);
      return null;
    }
  },
  
  async setToken(token: string): Promise<void> {
    try {
      await AsyncStorage.setItem(TOKEN_KEY, token);
    } catch (error) {
      console.error('[Auth] Failed to set token:', error);
      throw error;
    }
  },
  
  async removeToken(): Promise<void> {
    try {
      await AsyncStorage.removeItem(TOKEN_KEY);
    } catch (error) {
      console.error('[Auth] Failed to remove token:', error);
    }
  },
};
```

**Security Note:** AsyncStorage is less secure than SecureStore, but it's more reliable for startup operations. Consider moving to SecureStore after first successful launch.

### If Crash is Notifications

**Symptom:**
```
[App] [2/4] Loading notification modules...
Error: UNUserNotificationCenter must be accessed from main thread
```

**Fix:** Delay notifications further or skip on first launch

```typescript
// In app/_layout.tsx
setTimeout(async () => {
  try {
    // Only request notifications after app is fully stable
    const { registerForPushNotificationsAsync } = await import('@/utils/notifications');
    await registerForPushNotificationsAsync();
  } catch (error) {
    console.error('[App] Notification setup error (non-blocking):', error);
  }
}, 5000); // Increase to 5 seconds
```

### If Crash is NetInfo

**Symptom:**
```
[App] [3/4] Loading network monitoring...
Error: Network state listener registration failed
```

**Fix:** Skip NetInfo on first launch

```typescript
// In app/_layout.tsx
const [isFirstLaunch, setIsFirstLaunch] = useState(false);

useEffect(() => {
  const checkFirstLaunch = async () => {
    const hasLaunched = await AsyncStorage.getItem('has_launched_before');
    setIsFirstLaunch(!hasLaunched);
    if (!hasLaunched) {
      await AsyncStorage.setItem('has_launched_before', 'true');
    }
  };
  checkFirstLaunch();
}, []);

// Only load NetInfo after first launch
if (!isFirstLaunch) {
  setTimeout(async () => {
    const NetInfo = await import('@react-native-community/netinfo');
    // ... setup
  }, 4000);
}
```

---

## 📤 REPORTING RESULTS

After testing, provide:

1. **Console output** (full log from launch to crash)
2. **Crash report** (.ips or .crash file)
3. **Last log line before crash** (the "ABOUT TO CALL NATIVE" line)
4. **Exception name and reason** (from crash report)
5. **Device model and iOS version**

**Example Report:**
```
Device: iPhone 15 Pro
iOS: 18.2.1
App Version: 1.0.4 (83)

Last Log:
[Auth] ⚠️ ABOUT TO CALL NATIVE: tokenStorage.getToken
[Auth] Calling SecureStore.getItemAsync...

Crash:
Exception: NSInternalInconsistencyException
Reason: Keychain must be accessed from main thread

Module: expo-secure-store
Method: getItemAsync
```

---

## 🔄 ITERATIVE TESTING

After implementing a fix:

1. **Increment build number** in app.json
2. **Build new TestFlight version**
3. **Repeat testing procedure**
4. **Compare logs** to confirm fix

Continue until app launches successfully without crash.

---

## ✅ SUCCESS CRITERIA

App is fixed when:
- [ ] App launches without crash
- [ ] Console shows "✅ App Initialized"
- [ ] Auth check completes successfully
- [ ] User can navigate to tabs
- [ ] No SIGABRT or NSInternalInconsistencyException

---

## 🆘 ESCALATION

If crash persists after all fixes:

1. **Disable SecureStore entirely** (use AsyncStorage)
2. **Skip all native module loading** on first launch
3. **Add "Safe Mode" flag** to bypass auth check
4. **Contact Expo support** with crash logs

---

**Last Updated:** 2025-02-06
**Status:** Ready for testing
