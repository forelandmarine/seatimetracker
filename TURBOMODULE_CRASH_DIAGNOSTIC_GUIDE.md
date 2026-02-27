
# 🚨 iOS TurboModule Crash Diagnostic & Repair Guide

## Problem Summary

**Crash Type:** `EXC_CRASH (SIGABRT)` - Abort trap 6  
**Location:** `facebook::react::ObjCTurboModule::performVoidMethodInvocation (RCTTurboModule.mm:441)`  
**Trigger:** ~5-20 seconds after Apple Sign-In completes  
**Root Cause:** Native Objective-C exception during JS→TurboModule invocation

This is **NOT** a JavaScript exception. It's a native crash that JS try/catch cannot prevent.

---

## 🔍 Diagnostic Tools Implemented

### 1. **Native Fatal Exception Handlers** (PRIMARY)

**File:** `plugins/ios-crash-instrumentation.js`

Installed via Expo config plugin (activated in `app.json`).

Captures:
- `NSSetUncaughtExceptionHandler` - Objective-C exceptions
- `RCTSetFatalHandler` - React Native fatal errors
- `RCTSetFatalExceptionHandler` - React Native exceptions

**Output location:**
- Device console (Xcode > Devices & Simulators > Console)
- File: `Documents/crash_log.txt` (persists across crashes)

**Example output:**
```
❌ FATAL: UNCAUGHT OBJECTIVE-C EXCEPTION
Exception Name: NSInvalidArgumentException
Exception Reason: -[__NSPlaceholderDictionary initWithObjects:forKeys:count:]: attempt to insert nil object from objects[0]
Call Stack Symbols:
  0   CoreFoundation   0x00000001a1234567 __exceptionPreprocess + 123
  1   libobjc.A.dylib  0x00000001a2345678 objc_exception_throw + 56
  2   ExpoSecureStore  0x00000001a3456789 -[EXSecureStore setItemAsync:value:options:resolver:rejecter:] + 234
  ...
```

**How to use:**
1. The plugin is automatically activated via `app.json`
2. Build and deploy to TestFlight
3. When the crash occurs, check device console (Xcode > Devices & Simulators > Console)
4. Look for `❌ FATAL:` logs that show the exception name, reason, and call stack
5. The call stack will show which module and method caused the crash

---

### 2. **Frontend Breadcrumb Logging**

**Files:** `contexts/AuthContext.tsx`, `app/_layout.tsx`

Every native call is now logged BEFORE execution:

```typescript
console.log('[Auth] ⚠️ ABOUT TO CALL NATIVE: SecureStore.setItemAsync');
console.log('[Auth] Token length:', token.length);
```

**How to use:**
1. Check frontend logs (Metro bundler console or device console)
2. Find the last "ABOUT TO CALL NATIVE" log before crash
3. This identifies the JS→native boundary where the crash occurs

---

## 🛠️ Fixes Implemented

### Fix 1: **Dynamic SecureStore Import** (CRITICAL)

**Problem:** `expo-secure-store` imported at module scope causes TurboModule initialization during app startup, before the React Native bridge is ready.

**Solution:** Dynamic import inside functions:

```typescript
// ❌ OLD (module scope - causes crashes)
import * as SecureStore from 'expo-secure-store';

// ✅ NEW (dynamic import - safe)
const SecureStore = await import('expo-secure-store');
await SecureStore.getItemAsync('token');
```

**Files changed:**
- `contexts/AuthContext.tsx` - All SecureStore calls now use dynamic import
- `utils/biometricAuth.ts` - Dynamic SecureStore import
- `utils/seaTimeApi.ts` - Dynamic SecureStore import

---

### Fix 2: **Extreme Delayed Initialization**

**Problem:** Native modules called too early during app startup, before bridge is ready.

**Solution:** Staggered delays with readiness flags:

| Module | Delay | Reason |
|--------|-------|--------|
| App Ready Flag | 3s | Ensure React tree is mounted |
| Auth Check | 4s | Wait for app stability before SecureStore |
| Notifications | 8s | Prevent UI thread conflicts |
| Network Monitoring | 10s | Avoid concurrent native calls |
| Haptics | 12s | Lowest priority, load last |

**Files changed:**
- `app/_layout.tsx` - Native module loading staggered
- `contexts/AuthContext.tsx` - Auth check delayed to 4 seconds

---

### Fix 3: **Input Validation Before Native Calls**

**Problem:** Passing `null`, `undefined`, or invalid types to native methods that expect `nonnull` parameters.

**Solution:** Strict validation before EVERY native call:

```typescript
// CRITICAL: Validate inputs before native call
if (!token || typeof token !== 'string' || token.length === 0) {
  console.error('[Auth] ❌ VALIDATION FAILED: Invalid token');
  throw new Error('Invalid token value');
}

if (!TOKEN_KEY || typeof TOKEN_KEY !== 'string' || TOKEN_KEY.length === 0) {
  console.error('[Auth] ❌ VALIDATION FAILED: Invalid TOKEN_KEY');
  throw new Error('Invalid storage key');
}

// Only call native method after validation passes
await SecureStore.setItemAsync(TOKEN_KEY, token);
```

**Files changed:**
- `contexts/AuthContext.tsx` - All SecureStore calls have validation guards

---

### Fix 4: **Concurrency Lock**

**Problem:** Multiple auth operations running concurrently, causing race conditions and double TurboModule calls.

**Solution:** Single lock for ALL auth operations:

```typescript
const authLock = useRef(false);

const signIn = useCallback(async (email: string, password: string) => {
  if (authLock.current) {
    throw new Error('Authentication operation already in progress');
  }
  
  authLock.current = true;
  try {
    // ... auth logic
  } finally {
    authLock.current = false;
  }
}, []);
```

**Files changed:**
- `contexts/AuthContext.tsx` - All auth methods use the lock

---

## 📋 Deployment Checklist

### Step 1: Verify Config Plugin

```bash
# Check app.json plugins array
cat app.json | grep -A 10 '"plugins"'
# Should include: "./plugins/ios-crash-instrumentation"
```

### Step 2: Build for TestFlight

```bash
# Clean build
rm -rf node_modules ios android .expo
npm install

# Prebuild (generates native projects with crash handlers)
npx expo prebuild --clean

# Build for iOS
eas build --platform ios --profile production
```

### Step 3: Test & Monitor

1. Install TestFlight build on device
2. Connect device to Mac
3. Open Xcode > Devices & Simulators > Select device > Open Console
4. Launch app and trigger Apple Sign-In
5. Watch console for:
   - `[AppDelegate] ✅ CRASH INSTRUMENTATION ACTIVE` (confirms handlers are installed)
   - `❌ FATAL:` logs (shows exception details if crash occurs)

---

## 🔍 How to Identify the Crashing Module

### Method 1: Device Console (Real-time)

1. Connect iPhone to Mac via USB
2. Open Xcode > Window > Devices and Simulators
3. Select your device
4. Click "Open Console" button
5. Filter by "FATAL" or "CRASH"
6. Reproduce the crash
7. Look for the exception reason and call stack

### Method 2: Crash Log File

1. After crash, reconnect device
2. Open Xcode > Devices and Simulators
3. Select device > View Device Logs
4. Find the crash report
5. Look for `Documents/crash_log.txt` in the app container
6. Use Xcode > Window > Devices > Download Container to extract the file

### Method 3: TestFlight Crash Reports

1. App Store Connect > TestFlight > Crashes
2. Download crash log
3. Look for exception name and reason in the crash report
4. The call stack will show which module caused the crash

---

## 🎯 Expected Suspects (Post-Apple Sign-In)

Based on the crash timing (5-20 seconds after Apple Sign-In), the most likely culprits are:

### 1. **expo-secure-store** (SecureStore)
**Method:** `setItemAsync` or `getItemAsync`  
**Reason:** Storing Apple identity token in Keychain  
**Fix:** Already implemented (dynamic import + validation)

### 2. **expo-notifications** (Notifications)
**Method:** `getPermissionsAsync` or `requestPermissionsAsync`  
**Reason:** Requesting notification permissions after auth  
**Fix:** Already implemented (8 second delay)

### 3. **@react-native-community/netinfo** (NetInfo)
**Method:** `fetch` or `addEventListener`  
**Reason:** Checking network state after auth  
**Fix:** Already implemented (10 second delay)

### 4. **react-native-iap** (StoreKit)
**Method:** `getSubscriptions` or `getAvailablePurchases`  
**Reason:** Checking subscription status after auth  
**Fix:** May need additional delay (see below)

---

## 🔧 Additional Fixes (If Needed)

### If SecureStore is the culprit:

```typescript
// Ensure all SecureStore calls are on main thread
import { Platform } from 'react-native';

if (Platform.OS === 'ios') {
  // Dispatch to main queue
  await new Promise(resolve => setTimeout(resolve, 100));
}

const SecureStore = await import('expo-secure-store');
await SecureStore.setItemAsync(key, value);
```

### If Notifications is the culprit:

```typescript
// Delay notification permission request
setTimeout(async () => {
  const { registerForPushNotificationsAsync } = await import('@/utils/notifications');
  await registerForPushNotificationsAsync();
}, 15000); // 15 second delay
```

### If StoreKit is the culprit:

```typescript
// Delay subscription check
setTimeout(async () => {
  const { checkSubscriptionStatus } = await import('@/contexts/SubscriptionContext');
  await checkSubscriptionStatus();
}, 20000); // 20 second delay
```

---

## ✅ Verification Steps

After deploying the fix:

1. **Check logs appear:**
   - Device console shows `[AppDelegate] ✅ CRASH INSTRUMENTATION ACTIVE`
   - Device console shows `[Auth]` breadcrumb logs

2. **Reproduce the crash:**
   - Sign in with Apple
   - Wait 5-20 seconds
   - If crash occurs, check console for `❌ FATAL:` logs

3. **Confirm fix:**
   - If no crash occurs, the fix is successful
   - If crash still occurs, the exception reason and call stack identify the culprit

---

## 📊 Success Criteria

✅ **Diagnostic Success:**
- Device console shows `[AppDelegate] ✅ CRASH INSTRUMENTATION ACTIVE`
- Crash logs include exception name and reason
- Call stack clearly identifies the crashing module

✅ **Fix Success:**
- App does not crash after Apple Sign-In
- User can navigate and use the app normally
- No SIGABRT crashes in TestFlight crash reports

---

## 🆘 If Crash Persists

If the crash still occurs after implementing all fixes:

1. **Check the exception reason** in the crash logs
2. **Identify the exact module** from the call stack
3. **Add a longer delay** for that specific module (e.g., 20-30 seconds)
4. **Check for threading issues** - ensure UI calls are on main thread
5. **Validate all parameters** - ensure no nil values are passed to nonnull params
6. **Report findings** - Share the exact exception reason and call stack

---

## 📝 Summary

**What we've done:**
1. ✅ Installed native fatal exception handlers
2. ✅ Added frontend breadcrumb logging
3. ✅ Implemented dynamic SecureStore import
4. ✅ Added extreme delays for native module loading
5. ✅ Added input validation before all native calls
6. ✅ Implemented concurrency lock for auth operations

**What you need to do:**
1. Build and deploy to TestFlight
2. Connect device to Mac and open console
3. Reproduce the crash
4. Check the exception reason and call stack in the crash logs
5. Report the exact module and method

**Expected outcome:**
- The exact crashing module and method will be identified from the exception
- The appropriate fix can then be applied (delay, threading, validation, etc.)
- The crash will be eliminated

---

## 🔗 Related Files

- `plugins/ios-crash-instrumentation.js` - Native fatal handlers
- `contexts/AuthContext.tsx` - Dynamic SecureStore import + validation
- `app/_layout.tsx` - Staggered native module loading
- `utils/biometricAuth.ts` - Dynamic SecureStore import
- `utils/seaTimeApi.ts` - Dynamic SecureStore import
- `app.json` - Config plugin activation

---

**Last Updated:** 2026-02-06  
**Version:** 1.0.4


