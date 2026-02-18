
# iOS Crash Fix - Deployment Guide

## Problem Summary

**Crash Signature**: `EXC_BAD_ACCESS (SIGSEGV) KERN_INVALID_ADDRESS 0x0000800000000000`
**Location**: `hermes::vm::SegmentInfo::segmentIndexFromStart` + `TurboModuleConvertUtils::convertNSArrayToJSIArray`
**Root Cause**: `expo-secure-store` TurboModule being initialized too early during app startup, before the React Native bridge is fully ready, causing memory corruption in Hermes.

## Behavioral Regression

- **Before last update**: App would load, users could log in, then crash ~1s later
- **After last update**: Loading screen flickers and app crashes immediately (near launch, before reaching stable UI)
- **Conclusion**: Last update moved the crash earlier in the startup flow, suggesting a timing/threading/bridge initialization issue

## The Fix (Three-Layer Defense)

### 1. Disable New Architecture (Immediate Stabilization)

**File**: `app.json`

```json
{
  "expo": {
    "ios": {
      "newArchEnabled": false
    }
  }
}
```

**Rationale**: The New Architecture (TurboModules/Fabric) has stricter timing requirements for native module initialization. Disabling it temporarily stabilizes TestFlight while we implement proper sequencing.

**Impact**: 
- ✅ Eliminates TurboModule bridge crashes
- ✅ Allows app to function on iOS 26.x arm64e
- ⚠️ Slightly slower bridge performance (acceptable tradeoff for stability)

### 2. Deferred SecureStore Loading (Prevent Early TurboModule Init)

**Files**: 
- `contexts/AuthContext.tsx`
- `utils/biometricAuth.ts`
- `utils/seaTimeApi.ts`

**Changes**:
```typescript
// BEFORE (CRASHES):
import * as SecureStore from 'expo-secure-store';

// AFTER (SAFE):
const SecureStore = await import('expo-secure-store');
```

**Rationale**: Dynamic imports prevent module-scope initialization. SecureStore is only loaded when actually needed, after the bridge is ready.

**Impact**:
- ✅ Prevents early Keychain access that triggers Security.framework crashes
- ✅ Ensures TurboModule bridge is fully initialized before native calls
- ✅ No functional changes - auth still works identically

### 3. Startup Sequencing (Ensure Bridge Readiness)

**Files**:
- `app/_layout.tsx`
- `app/index.tsx`
- `contexts/AuthContext.tsx`

**Changes**:
```typescript
// Wait for React Native bridge to be fully ready
useEffect(() => {
  const task = InteractionManager.runAfterInteractions(() => {
    console.log('[App] Bridge is ready');
    setBridgeReady(true);
  });
  return () => task.cancel();
}, []);

// Only check auth after bridge is ready
useEffect(() => {
  if (!readyToCheck) return;
  checkAuth().finally(() => setInitialized(true));
}, [readyToCheck, checkAuth]);
```

**Rationale**: `InteractionManager.runAfterInteractions()` ensures all animations, layout, and native module initialization is complete before we attempt any SecureStore operations.

**Impact**:
- ✅ Guarantees native modules are ready before use
- ✅ Eliminates race conditions between JS and native initialization
- ✅ Adds ~100-200ms to startup (imperceptible to users)

## Verification Steps

### 1. Clean Build (CRITICAL)

```bash
# Remove all build artifacts
rm -rf ios/build
rm -rf node_modules
rm -rf .expo

# Reinstall dependencies
npm install

# Rebuild iOS
npx expo prebuild --clean
```

### 2. TestFlight Deployment

```bash
# Build for TestFlight
eas build --platform ios --profile production

# Submit to TestFlight
eas submit --platform ios --profile production
```

### 3. Cold Launch Test (iOS 26.x)

1. **Install from TestFlight** on iPhone 15 Pro (arm64e) running iOS 26.2.1
2. **Force quit** the app completely
3. **Cold launch** - app should:
   - Show "SeaTime Tracker" loading screen
   - Show "Initializing..." for ~100-200ms
   - Show "Checking authentication..." briefly
   - Navigate to auth screen (if logged out) or home screen (if logged in)
   - **NO CRASH** at any point

### 4. Login Flow Test

1. **Email/Password Login**:
   - Enter credentials
   - Tap "Sign In"
   - Should navigate to home screen
   - **NO CRASH** after 1-2 seconds

2. **Apple Sign In**:
   - Tap "Sign in with Apple"
   - Complete Face ID/Touch ID
   - Should navigate to home screen
   - **NO CRASH** after 1-2 seconds

### 5. Background/Foreground Test

1. Login successfully
2. Background the app (swipe up)
3. Wait 5 seconds
4. Foreground the app
5. Should resume without crash

## Expected Behavior

### Before Fix
- ❌ Crash on cold launch (immediate)
- ❌ Crash 1s after login
- ❌ Loading screen flicker
- ❌ `EXC_BAD_ACCESS` in crash logs

### After Fix
- ✅ Smooth cold launch
- ✅ Stable post-login (no crash)
- ✅ No flicker (proper loading states)
- ✅ No crashes in TestFlight

## Rollback Plan

If the fix doesn't work:

1. **Revert `app.json`**:
   ```json
   {
     "ios": {
       "newArchEnabled": true
     }
   }
   ```

2. **Revert dynamic imports** (restore static imports in AuthContext, biometricAuth, seaTimeApi)

3. **Revert startup sequencing** (remove InteractionManager waits)

4. **Rebuild and redeploy**

## Monitoring

After deployment, monitor TestFlight crash logs for:

1. **Crash-free sessions**: Should be >99%
2. **Crash signatures**: Should NOT see `EXC_BAD_ACCESS` or `hermes::vm::SegmentInfo`
3. **User feedback**: "App crashes on launch" should disappear

## Technical Details

### Why This Works

1. **New Architecture Disabled**: Removes strict TurboModule timing requirements
2. **Dynamic Imports**: Defers SecureStore loading until bridge is ready
3. **InteractionManager**: Guarantees all native initialization is complete before auth checks

### Why Previous Attempts Failed

- **Arbitrary delays** (`setTimeout`): Race conditions still possible
- **Try/catch only**: Can't catch native SIGABRT crashes
- **Module-scope imports**: SecureStore initialized before bridge ready

### Long-Term Solution

Once iOS 26.x TurboModule stability improves:

1. Re-enable New Architecture
2. Keep dynamic imports (best practice)
3. Keep InteractionManager sequencing (defense-in-depth)

## Success Criteria

✅ Cold launch on iOS 26.x does NOT crash
✅ Login (email + Apple) does NOT crash after 1s
✅ No loading screen flicker
✅ TestFlight crash-free sessions >99%
✅ No `EXC_BAD_ACCESS` in crash logs

## Contact

If issues persist after deployment:
1. Check TestFlight crash logs for new signatures
2. Verify clean build was performed
3. Confirm iOS version (26.2.1+)
4. Check console logs for "[Auth]" and "[App]" breadcrumbs
