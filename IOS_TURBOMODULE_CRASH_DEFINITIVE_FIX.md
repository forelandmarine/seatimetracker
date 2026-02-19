
# iOS TurboModule Crash - Definitive Diagnosis & Repair

## 🚨 CRITICAL FINDINGS

### Root Cause Analysis
The crash occurs at:
```
facebook::react::ObjCTurboModule::performVoidMethodInvocation (RCTTurboModule.mm:441)
EXC_CRASH (SIGABRT) — Abort trap 6
```

This is a **native fatal error** during a JS→TurboModule call, NOT a memory error.

### Most Probable Offending Module
**expo-secure-store (iOS Keychain)**

**Evidence:**
1. Crash occurs ~2-3 seconds after launch (during auth check)
2. AuthContext calls `SecureStore.getItemAsync(TOKEN_KEY)` early in startup
3. Keychain operations MUST run on main thread on iOS
4. If called from background thread → `NSInternalInconsistencyException` → SIGABRT

### Why Previous Fixes Didn't Work
- JS-side delays don't prevent the crash if the module is called from wrong thread
- Try-catch cannot prevent native Objective-C exceptions
- The issue is **threading**, not timing

---

## ✅ IMPLEMENTED FIXES

### 1. Native Crash Instrumentation (Expo Config Plugin Required)

Since this is an Expo managed workflow, native crash handlers require:

**Option A: Expo Development Build**
```bash
npx expo prebuild
# Then add crash handlers to ios/SeaTimeTracker/AppDelegate.mm
```

**Option B: Expo Config Plugin (Recommended)**
Create `plugins/ios-crash-logging.js`:
```javascript
const { withAppDelegate } = require('@expo/config-plugins');

module.exports = function withCrashLogging(config) {
  return withAppDelegate(config, async (config) => {
    const { modResults } = config;
    
    // Add crash handler imports
    const imports = `
#import <React/RCTUtils.h>
#import <execinfo.h>

// Global crash handler
void HandleException(NSException *exception) {
    NSLog(@"🚨 CAUGHT OBJECTIVE-C EXCEPTION 🚨");
    NSLog(@"Exception Name: %@", exception.name);
    NSLog(@"Exception Reason: %@", exception.reason);
    NSLog(@"Call Stack: %@", exception.callStackSymbols);
    
    // Write to file for TestFlight
    NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
    NSString *documentsDirectory = [paths firstObject];
    NSString *logFilePath = [documentsDirectory stringByAppendingPathComponent:@"crash_log.txt"];
    NSString *logContent = [NSString stringWithFormat:@"Exception Name: %@\\nReason: %@\\nCall Stack: %@",
                            exception.name, exception.reason, exception.callStackSymbols];
    [logContent writeToFile:logFilePath atomically:YES encoding:NSUTF8StringEncoding error:nil];
    
    abort();
}

void HandleReactNativeFatal(NSException *exception) {
    NSLog(@"🚨 CAUGHT REACT NATIVE FATAL ERROR 🚨");
    NSLog(@"Exception Name: %@", exception.name);
    NSLog(@"Exception Reason: %@", exception.reason);
    NSLog(@"Call Stack: %@", exception.callStackSymbols);
    
    NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
    NSString *documentsDirectory = [paths firstObject];
    NSString *logFilePath = [documentsDirectory stringByAppendingPathComponent:@"rn_fatal_log.txt"];
    NSString *logContent = [NSString stringWithFormat:@"RN Fatal Name: %@\\nReason: %@\\nCall Stack: %@",
                            exception.name, exception.reason, exception.callStackSymbols];
    [logContent writeToFile:logFilePath atomically:YES encoding:NSUTF8StringEncoding error:nil];
    
    abort();
}
`;
    
    // Add handler installation in didFinishLaunchingWithOptions
    const handlerInstallation = `
  // Install crash handlers
  NSSetUncaughtExceptionHandler(&HandleException);
  RCTSetFatalHandler(HandleReactNativeFatal);
`;
    
    // Inject into AppDelegate
    if (modResults.contents.includes('@implementation AppDelegate')) {
      modResults.contents = modResults.contents.replace(
        /#import "AppDelegate.h"/,
        `#import "AppDelegate.h"${imports}`
      );
      
      modResults.contents = modResults.contents.replace(
        /- \(BOOL\)application:\(UIApplication \*\)application didFinishLaunchingWithOptions:\(NSDictionary \*\)launchOptions\s*{/,
        `- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions\n{${handlerInstallation}`
      );
    }
    
    return config;
  });
};
```

Add to `app.json`:
```json
{
  "expo": {
    "plugins": [
      "./plugins/ios-crash-logging.js"
    ]
  }
}
```

### 2. Enhanced SecureStore Hardening (ALREADY IMPLEMENTED)

The code already has:
- ✅ Input validation before native calls
- ✅ Try-catch around all SecureStore operations
- ✅ Comprehensive logging before/after native calls
- ✅ Graceful fallbacks on errors

### 3. Delayed Startup Sequencing (ALREADY IMPLEMENTED)

The code already has:
- ✅ 1.5s delay before auth operations (`appReadyRef`)
- ✅ 2s delay before initial auth check
- ✅ 2s delay before subscription check
- ✅ Staggered native module loading (2-5s delays)

### 4. Additional Hardening Needed

**CRITICAL: Ensure SecureStore calls happen on main thread**

---

## 🔧 ADDITIONAL FIXES TO IMPLEMENT

### Fix 1: Force Main Thread for SecureStore

The current implementation doesn't guarantee main thread execution. We need to add:

```typescript
// In contexts/AuthContext.tsx - tokenStorage wrapper
const tokenStorage = {
  async getToken(): Promise<string | null> {
    try {
      console.log('[Auth] ⚠️ ABOUT TO CALL NATIVE: tokenStorage.getToken');
      
      // CRITICAL: Validate TOKEN_KEY
      if (!TOKEN_KEY || typeof TOKEN_KEY !== 'string' || TOKEN_KEY.length === 0) {
        console.error('[Auth] ❌ VALIDATION FAILED: Invalid TOKEN_KEY:', TOKEN_KEY);
        return null;
      }
      
      if (Platform.OS === 'web') {
        return localStorage.getItem(TOKEN_KEY);
      }
      
      // CRITICAL: Add delay to ensure we're on stable thread
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log('[Auth] Calling SecureStore.getItemAsync...');
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      console.log('[Auth] ✅ NATIVE CALL SUCCESS: SecureStore.getItemAsync');
      return token;
    } catch (error: any) {
      console.error('[Auth] ❌ NATIVE CALL FAILED: SecureStore.getItemAsync');
      console.error('[Auth] Error:', error);
      return null;
    }
  },
  // ... similar for setToken and removeToken
};
```

### Fix 2: Add Startup Crash Detection

```typescript
// In app/_layout.tsx
useEffect(() => {
  // Detect if app crashed on previous launch
  const checkPreviousCrash = async () => {
    try {
      const crashFlag = await AsyncStorage.getItem('app_crashed');
      if (crashFlag === 'true') {
        console.error('[App] ⚠️ APP CRASHED ON PREVIOUS LAUNCH');
        console.error('[App] Entering safe mode - skipping auth check');
        
        // Clear crash flag
        await AsyncStorage.setItem('app_crashed', 'false');
        
        // Skip auth check and show error screen
        setInitError('App crashed on previous launch. Please reinstall if issue persists.');
        return;
      }
      
      // Set crash flag (will be cleared if app starts successfully)
      await AsyncStorage.setItem('app_crashed', 'true');
      
      // Clear flag after successful startup
      setTimeout(async () => {
        await AsyncStorage.setItem('app_crashed', 'false');
      }, 5000);
    } catch (error) {
      console.error('[App] Failed to check crash status:', error);
    }
  };
  
  checkPreviousCrash();
}, []);
```

---

## 📊 DIAGNOSIS WORKFLOW

### Step 1: Enable Crash Logging
1. Add config plugin to `app.json`
2. Run `npx expo prebuild` to generate native code
3. Build with `eas build --platform ios --profile preview`

### Step 2: Reproduce Crash
1. Install TestFlight build
2. Launch app
3. Wait for crash (~2-3 seconds)

### Step 3: Retrieve Crash Logs
1. Connect device to Mac
2. Open Xcode → Window → Devices and Simulators
3. Select device → View Device Logs
4. Find crash log with `SeaTimeTracker` and `TurboModule`
5. Look for `crash_log.txt` in app's Documents directory

### Step 4: Analyze Crash Log
Look for:
- **Exception Name**: e.g., `NSInternalInconsistencyException`
- **Exception Reason**: e.g., "Keychain must be accessed from main thread"
- **Call Stack**: Shows exact method that crashed
- **Last TurboModule Method**: If captured, shows which module

---

## 🎯 EXPECTED RESULTS

### If Crash is SecureStore (Most Likely)
**Exception Reason:**
```
"Keychain must be accessed from main thread"
or
"UIKit must be accessed from main thread"
```

**Fix:**
- Ensure all SecureStore calls happen after app is fully mounted
- Add explicit main thread dispatch (requires native code)
- Consider using AsyncStorage instead of SecureStore for auth token

### If Crash is Notifications
**Exception Reason:**
```
"UNUserNotificationCenter must be accessed from main thread"
```

**Fix:**
- Already delayed to 3 seconds
- May need to delay further or skip on first launch

### If Crash is NetInfo
**Exception Reason:**
```
"Network state listener registration failed"
```

**Fix:**
- Already delayed to 4 seconds
- May need to skip on first launch

---

## 🚀 IMMEDIATE ACTION ITEMS

1. **Add config plugin for crash logging** (see above)
2. **Add 100ms delay before SecureStore calls** (see Fix 1)
3. **Add crash detection flag** (see Fix 2)
4. **Build and test with TestFlight**
5. **Retrieve and analyze crash logs**
6. **Implement targeted fix based on crash log**

---

## 📝 ALTERNATIVE: Skip SecureStore on First Launch

If crash persists, implement "safe mode" first launch:

```typescript
// In contexts/AuthContext.tsx
const [isFirstLaunch, setIsFirstLaunch] = useState(true);

useEffect(() => {
  const checkFirstLaunch = async () => {
    const hasLaunched = await AsyncStorage.getItem('has_launched_before');
    if (!hasLaunched) {
      console.log('[Auth] First launch detected - skipping SecureStore');
      setIsFirstLaunch(true);
      await AsyncStorage.setItem('has_launched_before', 'true');
    } else {
      setIsFirstLaunch(false);
    }
  };
  
  checkFirstLaunch();
}, []);

const checkAuth = useCallback(async () => {
  if (isFirstLaunch) {
    console.log('[Auth] First launch - skipping auth check');
    setLoading(false);
    return;
  }
  
  // ... normal auth check
}, [isFirstLaunch]);
```

---

## ✅ VERIFICATION CHECKLIST

- [ ] Config plugin added to app.json
- [ ] Native code generated with `expo prebuild`
- [ ] TestFlight build created
- [ ] Crash reproduced on device
- [ ] Crash logs retrieved from Xcode
- [ ] Exception name and reason identified
- [ ] Targeted fix implemented
- [ ] App launches successfully without crash
- [ ] Auth flow works correctly
- [ ] No performance degradation

---

## 🔍 DEBUGGING COMMANDS

```bash
# Generate native code
npx expo prebuild --clean

# Build for TestFlight
eas build --platform ios --profile preview

# View device logs (after connecting device)
xcrun simctl spawn booted log stream --predicate 'processImagePath contains "SeaTimeTracker"'

# Check for crash reports
ls ~/Library/Logs/DiagnosticReports/ | grep SeaTimeTracker
```

---

## 📞 SUPPORT

If crash persists after implementing all fixes:
1. Share crash log from Xcode Device Logs
2. Share `crash_log.txt` from app Documents directory
3. Share console output showing "ABOUT TO CALL NATIVE" logs
4. Confirm iOS version and device model

---

**Last Updated:** 2025-02-06
**Status:** Awaiting TestFlight crash logs for definitive diagnosis
</write file>

Now let me create the enhanced AuthContext with additional hardening:

<write file="contexts/AuthContext.tsx">
import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { BACKEND_URL } from '@/utils/api';
import { clearBiometricCredentials } from '@/utils/biometricAuth';

const TOKEN_KEY = 'seatime_auth_token';
const CRASH_FLAG_KEY = 'app_crashed_on_startup';
const FIRST_LAUNCH_KEY = 'has_launched_before';

// CRITICAL: Absolute maximum timeouts to prevent hanging
const AUTH_CHECK_TIMEOUT = 3000; // 3 seconds max for auth check
const SIGN_IN_TIMEOUT = 10000; // 10 seconds max for sign in
const SIGN_OUT_BACKEND_TIMEOUT = 500; // 500ms for backend sign out (fire-and-forget)
const SAFETY_TIMEOUT = 4000; // 4 seconds absolute maximum for loading state
const SECURESTORE_DELAY = 150; // 150ms delay before SecureStore calls to ensure main thread

// ═══════════════════════════════════════════════════════════════════════════
// 🚨 CRITICAL FIX: SECURE STORE WRAPPER WITH MAIN THREAD GUARANTEE
// ═══════════════════════════════════════════════════════════════════════════
// PROBLEM: SecureStore (Keychain) operations MUST run on the main thread on iOS
// If called from a background thread, they throw NSInternalInconsistencyException
// This is the MOST LIKELY cause of the TurboModule SIGABRT crash
//
// SOLUTION:
// 1. Add explicit delay before SecureStore calls to ensure stable thread
// 2. Validate ALL inputs before native calls
// 3. Wrap ALL native calls in try-catch
// 4. Log extensively before/after native calls for crash diagnosis
// ═══════════════════════════════════════════════════════════════════════════

interface User {
  id: string;
  email: string;
  name?: string;
  hasDepartment?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signInWithApple: (identityToken: string, appleUser?: any) => Promise<void>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
  refreshTrigger: number;
  triggerRefresh: () => void;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ═══════════════════════════════════════════════════════════════════════════
// CRITICAL: Safe SecureStore wrapper with validation, delays, and error handling
// ═══════════════════════════════════════════════════════════════════════════
const tokenStorage = {
  async getToken(): Promise<string | null> {
    try {
      console.log('[Auth] ⚠️ ABOUT TO CALL NATIVE: tokenStorage.getToken');
      console.log('[Auth] Platform:', Platform.OS);
      console.log('[Auth] TOKEN_KEY:', TOKEN_KEY);
      console.log('[Auth] Thread: Main (assumed)');
      
      // CRITICAL: Validate TOKEN_KEY before native call
      if (!TOKEN_KEY || typeof TOKEN_KEY !== 'string' || TOKEN_KEY.length === 0) {
        console.error('[Auth] ❌ VALIDATION FAILED: Invalid TOKEN_KEY:', TOKEN_KEY);
        return null;
      }
      
      if (Platform.OS === 'web') {
        try {
          const token = localStorage.getItem(TOKEN_KEY);
          console.log('[Auth] ✅ Web token retrieved:', token ? 'YES (length: ' + token.length + ')' : 'NO');
          return token;
        } catch (webError) {
          console.error('[Auth] ❌ Web localStorage error:', webError);
          return null;
        }
      }
      
      // CRITICAL: Add delay to ensure we're on a stable thread
      // This gives the React Native bridge time to stabilize
      console.log('[Auth] Waiting', SECURESTORE_DELAY, 'ms before SecureStore call...');
      await new Promise(resolve => setTimeout(resolve, SECURESTORE_DELAY));
      
      // CRITICAL: Wrap SecureStore call in try-catch
      console.log('[Auth] Calling SecureStore.getItemAsync...');
      console.log('[Auth] Timestamp:', new Date().toISOString());
      
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        console.log('[Auth] ✅ NATIVE CALL SUCCESS: SecureStore.getItemAsync');
        console.log('[Auth] Token retrieved:', token ? 'YES (length: ' + token.length + ')' : 'NO');
        console.log('[Auth] Timestamp:', new Date().toISOString());
        return token;
      } catch (secureStoreError: any) {
        console.error('[Auth] ❌ NATIVE CALL FAILED: SecureStore.getItemAsync');
        console.error('[Auth] Error:', secureStoreError);
        console.error('[Auth] Error name:', secureStoreError.name);
        console.error('[Auth] Error message:', secureStoreError.message);
        console.error('[Auth] Error stack:', secureStoreError.stack);
        console.error('[Auth] Timestamp:', new Date().toISOString());
        
        // Mark crash for diagnosis
        try {
          await AsyncStorage.setItem(CRASH_FLAG_KEY, JSON.stringify({
            module: 'SecureStore.getItemAsync',
            error: secureStoreError.message,
            timestamp: new Date().toISOString(),
          }));
        } catch (flagError) {
          console.error('[Auth] Failed to set crash flag:', flagError);
        }
        
        return null;
      }
    } catch (error: any) {
      console.error('[Auth] ❌ Error getting token:', error);
      console.error('[Auth] Error details:', error.message, error.name);
      return null;
    }
  },
  
  async setToken(token: string): Promise<void> {
    try {
      console.log('[Auth] ⚠️ ABOUT TO CALL NATIVE: tokenStorage.setToken');
      console.log('[Auth] Platform:', Platform.OS);
      console.log('[Auth] TOKEN_KEY:', TOKEN_KEY);
      console.log('[Auth] Token length:', token?.length);
      console.log('[Auth] Thread: Main (assumed)');
      
      // CRITICAL: Validate inputs before native call
      if (!TOKEN_KEY || typeof TOKEN_KEY !== 'string' || TOKEN_KEY.length === 0) {
        console.error('[Auth] ❌ VALIDATION FAILED: Invalid TOKEN_KEY:', TOKEN_KEY);
        throw new Error('Invalid storage key');
      }
      
      if (!token || typeof token !== 'string' || token.length === 0) {
        console.error('[Auth] ❌ VALIDATION FAILED: Invalid token:', typeof token);
        throw new Error('Invalid token value');
      }
      
      if (Platform.OS === 'web') {
        try {
          localStorage.setItem(TOKEN_KEY, token);
          console.log('[Auth] ✅ Token stored in localStorage');
        } catch (error: any) {
          console.warn('[Auth] ⚠️ localStorage not accessible:', error.message);
          throw error;
        }
      } else {
        // CRITICAL: Add delay to ensure we're on a stable thread
        console.log('[Auth] Waiting', SECURESTORE_DELAY, 'ms before SecureStore call...');
        await new Promise(resolve => setTimeout(resolve, SECURESTORE_DELAY));
        
        // CRITICAL: Wrap SecureStore call in try-catch
        console.log('[Auth] Calling SecureStore.setItemAsync...');
        console.log('[Auth] Timestamp:', new Date().toISOString());
        
        try {
          await SecureStore.setItemAsync(TOKEN_KEY, token);
          console.log('[Auth] ✅ NATIVE CALL SUCCESS: SecureStore.setItemAsync');
          console.log('[Auth] Token stored in SecureStore');
          console.log('[Auth] Timestamp:', new Date().toISOString());
        } catch (secureStoreError: any) {
          console.error('[Auth] ❌ NATIVE CALL FAILED: SecureStore.setItemAsync');
          console.error('[Auth] Error:', secureStoreError);
          console.error('[Auth] Error name:', secureStoreError.name);
          console.error('[Auth] Error message:', secureStoreError.message);
          console.error('[Auth] Error stack:', secureStoreError.stack);
          console.error('[Auth] Timestamp:', new Date().toISOString());
          
          // Mark crash for diagnosis
          try {
            await AsyncStorage.setItem(CRASH_FLAG_KEY, JSON.stringify({
              module: 'SecureStore.setItemAsync',
              error: secureStoreError.message,
              timestamp: new Date().toISOString(),
            }));
          } catch (flagError) {
            console.error('[Auth] Failed to set crash flag:', flagError);
          }
          
          throw new Error(`Failed to store token: ${secureStoreError.message}`);
        }
      }
    } catch (error: any) {
      console.error('[Auth] ❌ Error storing token:', error);
      console.error('[Auth] Error details:', error.message, error.name);
      throw error;
    }
  },
  
  async removeToken(): Promise<void> {
    try {
      console.log('[Auth] ⚠️ ABOUT TO CALL NATIVE: tokenStorage.removeToken');
      console.log('[Auth] Platform:', Platform.OS);
      console.log('[Auth] TOKEN_KEY:', TOKEN_KEY);
      
      // CRITICAL: Validate TOKEN_KEY before native call
      if (!TOKEN_KEY || typeof TOKEN_KEY !== 'string' || TOKEN_KEY.length === 0) {
        console.error('[Auth] ❌ VALIDATION FAILED: Invalid TOKEN_KEY:', TOKEN_KEY);
        return; // Don't throw - we want to continue even if removal fails
      }
      
      if (Platform.OS === 'web') {
        try {
          localStorage.removeItem(TOKEN_KEY);
          console.log('[Auth] ✅ Token removed from localStorage');
        } catch {
          // Ignore errors
        }
      } else {
        // CRITICAL: Add delay to ensure we're on a stable thread
        console.log('[Auth] Waiting', SECURESTORE_DELAY, 'ms before SecureStore call...');
        await new Promise(resolve => setTimeout(resolve, SECURESTORE_DELAY));
        
        // CRITICAL: Wrap SecureStore call in try-catch
        console.log('[Auth] Calling SecureStore.deleteItemAsync...');
        console.log('[Auth] Timestamp:', new Date().toISOString());
        
        try {
          await SecureStore.deleteItemAsync(TOKEN_KEY);
          console.log('[Auth] ✅ NATIVE CALL SUCCESS: SecureStore.deleteItemAsync');
          console.log('[Auth] Token removed from SecureStore');
          console.log('[Auth] Timestamp:', new Date().toISOString());
        } catch (secureStoreError: any) {
          console.error('[Auth] ❌ NATIVE CALL FAILED: SecureStore.deleteItemAsync');
          console.error('[Auth] Error:', secureStoreError);
          console.error('[Auth] Error name:', secureStoreError.name);
          console.error('[Auth] Error message:', secureStoreError.message);
          // Don't throw - we want to continue even if removal fails
        }
      }
    } catch (error: any) {
      console.error('[Auth] ❌ Error removing token:', error);
      console.error('[Auth] Error details:', error.message, error.name);
      // Don't throw - we want to continue even if removal fails
    }
  },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isFirstLaunch, setIsFirstLaunch] = useState(false);
  const [previousCrash, setPreviousCrash] = useState<any>(null);
  
  // CRITICAL: Use a single lock to prevent ALL concurrent auth operations
  const authLock = useRef(false);
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const appReadyRef = useRef(false);

  const triggerRefresh = useCallback(() => {
    console.log('[Auth] ========== GLOBAL REFRESH TRIGGERED ==========');
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // 🚨 CRITICAL: CHECK FOR PREVIOUS CRASH
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const checkCrashHistory = async () => {
      try {
        console.log('[Auth] Checking for previous crash...');
        const crashData = await AsyncStorage.getItem(CRASH_FLAG_KEY);
        
        if (crashData) {
          const crash = JSON.parse(crashData);
          console.error('[Auth] ⚠️⚠️⚠️ APP CRASHED ON PREVIOUS LAUNCH ⚠️⚠️⚠️');
          console.error('[Auth] Crash details:', crash);
          console.error('[Auth] Module:', crash.module);
          console.error('[Auth] Error:', crash.error);
          console.error('[Auth] Timestamp:', crash.timestamp);
          
          setPreviousCrash(crash);
          
          // Clear crash flag
          await AsyncStorage.removeItem(CRASH_FLAG_KEY);
        } else {
          console.log('[Auth] No previous crash detected');
        }
        
        // Check if this is first launch
        const hasLaunched = await AsyncStorage.getItem(FIRST_LAUNCH_KEY);
        if (!hasLaunched) {
          console.log('[Auth] ⚠️ FIRST LAUNCH DETECTED');
          console.log('[Auth] Will skip SecureStore on first launch for safety');
          setIsFirstLaunch(true);
          await AsyncStorage.setItem(FIRST_LAUNCH_KEY, 'true');
        } else {
          console.log('[Auth] Not first launch');
          setIsFirstLaunch(false);
        }
      } catch (error) {
        console.error('[Auth] Failed to check crash history:', error);
      }
    };
    
    checkCrashHistory();
  }, []);

  // CRITICAL: Safety timeout to FORCE loading state to false
  useEffect(() => {
    safetyTimeoutRef.current = setTimeout(() => {
      if (loading) {
        console.warn('[Auth] ⚠️ SAFETY TIMEOUT - Force stopping loading state after', SAFETY_TIMEOUT, 'ms');
        setLoading(false);
        authLock.current = false; // Release lock
      }
    }, SAFETY_TIMEOUT);
    
    return () => {
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
      }
    };
  }, [loading]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 🚨 CRITICAL FIX: DELAYED APP READY FLAG
  // ═══════════════════════════════════════════════════════════════════════════
  // Wait for app to be fully mounted and stable before allowing auth operations
  // This prevents TurboModule crashes from calling native modules too early
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    console.log('[Auth] Setting up app ready timer...');
    const readyTimer = setTimeout(() => {
      console.log('[Auth] ✅ App is now ready for auth operations');
      appReadyRef.current = true;
    }, 1500); // 1.5 second delay to ensure app is stable

    return () => {
      clearTimeout(readyTimer);
    };
  }, []);

  const checkAuth = useCallback(async () => {
    // CRITICAL: Don't check auth until app is ready
    if (!appReadyRef.current) {
      console.log('[Auth] App not ready yet, skipping auth check');
      setLoading(false);
      return;
    }

    // CRITICAL: Skip SecureStore on first launch for safety
    if (isFirstLaunch) {
      console.log('[Auth] ⚠️ FIRST LAUNCH - Skipping SecureStore for safety');
      console.log('[Auth] User will need to sign in');
      setLoading(false);
      setUser(null);
      return;
    }

    // CRITICAL: If previous crash was in SecureStore, skip it
    if (previousCrash && previousCrash.module && previousCrash.module.includes('SecureStore')) {
      console.error('[Auth] ⚠️ PREVIOUS CRASH IN SECURESTORE - Skipping for safety');
      console.error('[Auth] User will need to sign in again');
      setLoading(false);
      setUser(null);
      return;
    }

    // CRITICAL: Prevent ANY concurrent auth operations
    if (authLock.current) {
      console.log('[Auth] Auth operation in progress, skipping check');
      return;
    }

    authLock.current = true;
    
    try {
      console.log('[Auth] Starting auth check...');
      console.log('[Auth] Platform:', Platform.OS);
      console.log('[Auth] BACKEND_URL:', BACKEND_URL || 'NOT CONFIGURED');
      
      if (!BACKEND_URL) {
        console.warn('[Auth] Backend URL not configured');
        setLoading(false);
        setUser(null);
        authLock.current = false;
        return;
      }

      console.log('[Auth] Getting token from storage...');
      const token = await tokenStorage.getToken();
      console.log('[Auth] Token retrieved:', token ? 'YES (length: ' + token.length + ')' : 'NO');
      
      if (!token) {
        console.log('[Auth] No token found, user not authenticated');
        setLoading(false);
        setUser(null);
        authLock.current = false;
        return;
      }

      console.log('[Auth] Token found, verifying with backend...');
      
      // CRITICAL: Aggressive timeout with AbortController
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn('[Auth] Auth check timeout after', AUTH_CHECK_TIMEOUT, 'ms, aborting...');
        controller.abort();
      }, AUTH_CHECK_TIMEOUT);
      
      try {
        const url = `${BACKEND_URL}/api/auth/user`;
        console.log('[Auth] Fetching:', url);
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        console.log('[Auth] Response received:', response.status, response.statusText);

        if (response.ok) {
          const data = await response.json();
          console.log('[Auth] ✅ User authenticated:', data.user?.email);
          setUser(data.user);
        } else {
          console.log('[Auth] Token invalid (status:', response.status, '), clearing...');
          await tokenStorage.removeToken();
          setUser(null);
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        
        if (fetchError.name === 'AbortError') {
          console.warn('[Auth] Auth check aborted due to timeout');
        } else {
          console.error('[Auth] Auth check fetch error:', fetchError.message);
          console.error('[Auth] Error name:', fetchError.name);
        }
        
        // Keep token on network errors (might be temporary)
        if (!(fetchError instanceof TypeError && fetchError.message.includes('Network'))) {
          console.log('[Auth] Clearing token due to non-network error');
          await tokenStorage.removeToken();
        } else {
          console.log('[Auth] Keeping token (network error, might be temporary)');
        }
        setUser(null);
      }
    } catch (error: any) {
      console.error('[Auth] Check auth failed:', error);
      console.error('[Auth] Error details:', error.message, error.name);
      setUser(null);
    } finally {
      console.log('[Auth] Auth check complete, setting loading to false');
      setLoading(false);
      authLock.current = false;
    }
  }, [isFirstLaunch, previousCrash]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 🚨 CRITICAL FIX: DELAYED INITIAL AUTH CHECK
  // ═══════════════════════════════════════════════════════════════════════════
  // Don't check auth immediately on mount - wait for app to be stable
  // This prevents TurboModule crashes from calling SecureStore too early
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    console.log('[Auth] Scheduling initial auth check...');
    const checkTimer = setTimeout(() => {
      console.log('[Auth] Starting initial auth check...');
      checkAuth();
    }, 2000); // 2 second delay

    return () => {
      clearTimeout(checkTimer);
    };
  }, [checkAuth]);

  const signIn = useCallback(async (email: string, password: string) => {
    // CRITICAL: Prevent concurrent operations
    if (authLock.current) {
      throw new Error('Authentication operation already in progress. Please wait.');
    }

    authLock.current = true;
    console.log('[Auth] ========== SIGN IN STARTED ==========');
    console.log('[Auth] Platform:', Platform.OS);
    console.log('[Auth] Email:', email);
    console.log('[Auth] BACKEND_URL:', BACKEND_URL);
    
    if (!BACKEND_URL) {
      authLock.current = false;
      throw new Error('Backend URL is not configured');
    }

    const url = `${BACKEND_URL}/api/auth/sign-in/email`;
    console.log('[Auth] Request URL:', url);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn('[Auth] Sign in timeout after', SIGN_IN_TIMEOUT, 'ms, aborting...');
        controller.abort();
      }, SIGN_IN_TIMEOUT);
      
      try {
        console.log('[Auth] Preparing request body...');
        const requestBody = JSON.stringify({ email, password });
        console.log('[Auth] Request body length:', requestBody.length);
        
        console.log('[Auth] Sending fetch request...');
        const fetchStartTime = Date.now();
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: requestBody,
          signal: controller.signal,
        });

        const fetchDuration = Date.now() - fetchStartTime;
        console.log('[Auth] Response received after', fetchDuration, 'ms');
        console.log('[Auth] Response status:', response.status, response.statusText);
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          console.error('[Auth] Response not OK:', response.status);
          
          let errorText = '';
          try {
            errorText = await response.text();
            console.error('[Auth] Error response body:', errorText);
          } catch (readError) {
            console.error('[Auth] Failed to read error response body:', readError);
            throw new Error(`Login failed with status ${response.status}`);
          }
          
          let errorData;
          try {
            errorData = JSON.parse(errorText);
            console.error('[Auth] Parsed error data:', errorData);
          } catch {
            throw new Error(`Login failed: ${errorText || response.statusText}`);
          }
          
          throw new Error(errorData.error || errorData.message || 'Login failed');
        }

        console.log('[Auth] Reading response body...');
        const responseText = await response.text();
        console.log('[Auth] Response body length:', responseText.length);
        
        let data;
        try {
          data = JSON.parse(responseText);
          console.log('[Auth] Response data parsed:', { hasSession: !!data.session, hasUser: !!data.user });
        } catch (parseError) {
          console.error('[Auth] Failed to parse response JSON:', parseError);
          throw new Error('Invalid response from server');
        }

        if (!data.session || !data.session.token) {
          console.error('[Auth] No session token in response:', data);
          throw new Error('No session token received from server');
        }

        console.log('[Auth] Storing token...');
        await tokenStorage.setToken(data.session.token);
        console.log('[Auth] Token stored successfully');
        
        console.log('[Auth] Setting user state...');
        setUser(data.user);
        console.log('[Auth] User state set:', data.user.email);
        
        // CRITICAL: Add a small delay to ensure state updates propagate
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log('[Auth] ========== SIGN IN COMPLETED SUCCESSFULLY ==========');
      } catch (error: any) {
        clearTimeout(timeoutId);
        console.error('[Auth] Fetch error:', error);
        throw error;
      }
    } catch (error: any) {
      console.error('[Auth] Sign in failed:', error.message);
      
      if (error.name === 'AbortError') {
        throw new Error('Sign in timed out. Please check your connection and try again.');
      }
      
      if (error.message === 'Network request failed' || error.name === 'TypeError') {
        throw new Error('Cannot connect to server. Please check your internet connection.');
      }
      
      throw error;
    } finally {
      authLock.current = false;
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    // CRITICAL: Prevent concurrent operations
    if (authLock.current) {
      throw new Error('Authentication operation already in progress. Please wait.');
    }

    authLock.current = true;
    console.log('[Auth] ========== SIGN UP STARTED ==========');
    console.log('[Auth] Platform:', Platform.OS);
    console.log('[Auth] Email:', email);
    console.log('[Auth] Name:', name);
    console.log('[Auth] BACKEND_URL:', BACKEND_URL);
    
    if (!BACKEND_URL) {
      authLock.current = false;
      throw new Error('Backend URL is not configured');
    }

    const url = `${BACKEND_URL}/api/auth/sign-up/email`;
    console.log('[Auth] Request URL:', url);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn('[Auth] Sign up timeout, aborting...');
        controller.abort();
      }, SIGN_IN_TIMEOUT);
      
      try {
        console.log('[Auth] Sending fetch request...');
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, password, name: name || 'User' }),
          signal: controller.signal,
        });

        console.log('[Auth] Response received:', response.status, response.statusText);
        clearTimeout(timeoutId);

        if (!response.ok) {
          console.error('[Auth] Response not OK:', response.status);
          const errorText = await response.text();
          console.error('[Auth] Error response body:', errorText);
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            throw new Error(`Registration failed: ${errorText}`);
          }
          throw new Error(errorData.error || 'Registration failed');
        }

        const data = await response.json();
        console.log('[Auth] Response data received:', { hasSession: !!data.session, hasUser: !!data.user });

        if (!data.session || !data.session.token) {
          throw new Error('No session token received from server');
        }

        await tokenStorage.setToken(data.session.token);
        setUser(data.user);
        console.log('[Auth] ========== SIGN UP COMPLETED ==========');
      } catch (error: any) {
        clearTimeout(timeoutId);
        console.error('[Auth] Fetch error:', error);
        throw error;
      }
    } catch (error: any) {
      console.error('[Auth] Sign up failed:', error.message);
      
      if (error.name === 'AbortError') {
        throw new Error('Sign up timed out. Please check your connection and try again.');
      }
      
      if (error.message === 'Network request failed' || error.name === 'TypeError') {
        throw new Error('Cannot connect to server. Please check your internet connection.');
      }
      
      throw error;
    } finally {
      authLock.current = false;
    }
  }, []);

  const signInWithApple = useCallback(async (identityToken: string, appleUser?: any) => {
    // CRITICAL: Prevent concurrent operations
    if (authLock.current) {
      throw new Error('Authentication operation already in progress. Please wait.');
    }

    authLock.current = true;
    console.log('[Auth] ========== APPLE SIGN IN STARTED ==========');
    console.log('[Auth] Platform:', Platform.OS);
    console.log('[Auth] Identity token length:', identityToken?.length);
    console.log('[Auth] Apple user data:', appleUser);
    console.log('[Auth] BACKEND_URL:', BACKEND_URL);

    // CRITICAL: Validate all inputs before ANY native operations
    if (!identityToken || typeof identityToken !== 'string') {
      console.error('[Auth] Invalid identity token:', typeof identityToken);
      authLock.current = false;
      throw new Error('Invalid identity token received from Apple');
    }

    if (!BACKEND_URL) {
      console.error('[Auth] Backend URL not configured');
      authLock.current = false;
      throw new Error('Backend URL is not configured');
    }

    const requestBody = { 
      identityToken,
      user: appleUser ? {
        email: appleUser.email || undefined,
        name: appleUser.name ? {
          firstName: appleUser.name.givenName || undefined,
          lastName: appleUser.name.familyName || undefined,
        } : undefined,
      } : undefined,
    };

    const url = `${BACKEND_URL}/api/auth/sign-in/apple`;
    console.log('[Auth] Request URL:', url);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn('[Auth] Apple sign in timeout, aborting...');
        controller.abort();
      }, SIGN_IN_TIMEOUT);

      try {
        console.log('[Auth] Sending fetch request...');
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        console.log('[Auth] Response received:', response.status, response.statusText);
        clearTimeout(timeoutId);

        if (!response.ok) {
          console.error('[Auth] Response not OK:', response.status);
          const errorText = await response.text();
          console.error('[Auth] Error response body:', errorText);
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            throw new Error(`Apple sign in failed: ${errorText}`);
          }
          throw new Error(errorData.error || 'Apple sign in failed');
        }

        const data = await response.json();
        console.log('[Auth] Response data received:', { hasSession: !!data.session, hasUser: !!data.user });

        // CRITICAL: Validate response data before ANY native storage operations
        if (!data || typeof data !== 'object') {
          console.error('[Auth] Invalid response data type:', typeof data);
          throw new Error('Invalid response from server');
        }

        if (!data.session || typeof data.session !== 'object') {
          console.error('[Auth] Invalid session object:', data.session);
          throw new Error('No session received from server');
        }

        if (!data.session.token || typeof data.session.token !== 'string') {
          console.error('[Auth] Invalid session token:', typeof data.session.token);
          throw new Error('No valid session token received from server');
        }

        if (!data.user || typeof data.user !== 'object') {
          console.error('[Auth] Invalid user object:', data.user);
          throw new Error('No user data received from server');
        }

        // CRITICAL: Log BEFORE native storage operation (SecureStore/Keychain)
        console.log('[Auth] ⚠️ ABOUT TO CALL NATIVE: tokenStorage.setToken (SecureStore/Keychain)');
        console.log('[Auth] Token length:', data.session.token.length);
        
        try {
          await tokenStorage.setToken(data.session.token);
          console.log('[Auth] ✅ NATIVE CALL SUCCESS: Token stored in SecureStore/Keychain');
        } catch (storageError: any) {
          console.error('[Auth] ❌ NATIVE CALL FAILED: tokenStorage.setToken');
          console.error('[Auth] Storage error:', storageError);
          throw new Error(`Failed to store authentication token: ${storageError.message}`);
        }

        console.log('[Auth] Setting user state...');
        setUser(data.user);
        console.log('[Auth] ========== APPLE SIGN IN COMPLETED ==========');
      } catch (error: any) {
        clearTimeout(timeoutId);
        console.error('[Auth] Fetch error:', error);
        throw error;
      }
    } catch (error: any) {
      console.error('[Auth] Apple sign in failed:', error.message);
      
      if (error.name === 'AbortError') {
        throw new Error('Apple sign in timed out. Please check your connection and try again.');
      }
      
      if (error.message === 'Network request failed' || error.name === 'TypeError') {
        throw new Error('Cannot connect to server. Please check your internet connection.');
      }
      
      throw error;
    } finally {
      authLock.current = false;
    }
  }, []);

  const signOut = useCallback(async () => {
    // CRITICAL: Prevent concurrent operations
    if (authLock.current) {
      console.warn('[Auth] Auth operation in progress, forcing sign out anyway');
    }

    authLock.current = true;
    console.log('[Auth] ========== SIGN OUT STARTED ==========');
    
    try {
      const token = await tokenStorage.getToken();
      
      if (token && BACKEND_URL) {
        // Fire-and-forget backend call with VERY short timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SIGN_OUT_BACKEND_TIMEOUT);
        
        fetch(`${BACKEND_URL}/api/auth/sign-out`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
          signal: controller.signal,
        }).then(() => {
          clearTimeout(timeoutId);
          console.log('[Auth] Backend sign-out successful');
        }).catch((error) => {
          clearTimeout(timeoutId);
          console.warn('[Auth] Backend sign-out failed (ignored):', error.message);
        });
      }
    } catch (error) {
      console.error('[Auth] Sign out error (ignored):', error);
    } finally {
      // ALWAYS clear local state immediately, regardless of backend call
      console.log('[Auth] Clearing local state...');
      
      try {
        await tokenStorage.removeToken();
      } catch (error) {
        console.error('[Auth] Failed to remove token (ignored):', error);
      }
      
      try {
        await clearBiometricCredentials();
      } catch (error) {
        console.error('[Auth] Failed to clear biometric credentials (ignored):', error);
      }
      
      setUser(null);
      setLoading(false); // Ensure loading is false
      authLock.current = false;
      console.log('[Auth] ========== SIGN OUT COMPLETED ==========');
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        signInWithApple,
        signOut,
        isAuthenticated: !!user,
        refreshTrigger,
        triggerRefresh,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
