
# 🧪 iOS TurboModule Crash Testing Guide

## Overview

This guide explains how to test and verify the TurboModule crash diagnostic and repair implementation.

---

## 🎯 Testing Objectives

1. **Verify instrumentation is active** - Confirm logging appears in device console
2. **Identify the crashing module** - Determine which TurboModule causes SIGABRT
3. **Validate the fix** - Ensure crash no longer occurs after fix is applied

---

## 🛠️ Prerequisites

### Required Tools
- Mac with Xcode installed
- iPhone with iOS 16+ (physical device, not simulator)
- USB cable
- TestFlight access
- Apple Developer account

### Required Setup
```bash
# 1. Install dependencies
npm install

# 2. Verify instrumentation
chmod +x scripts/verify-crash-instrumentation.sh
./scripts/verify-crash-instrumentation.sh

# 3. Build for TestFlight
eas build --platform ios --profile production
```

---

## 📱 Test Procedure

### Phase 1: Baseline Test (Confirm Crash Occurs)

**Goal:** Reproduce the crash and confirm it still happens

1. **Install TestFlight build**
   - Download from TestFlight
   - Install on physical device

2. **Connect device to Mac**
   - Connect via USB
   - Trust computer if prompted

3. **Open device console**
   - Xcode > Window > Devices and Simulators
   - Select your device
   - Click "Open Console" button (bottom right)

4. **Set up console filters**
   - Click filter icon (funnel)
   - Add filter: `TurboModuleInvoke`
   - Add filter: `FATAL`
   - Add filter: `Auth`

5. **Launch app and trigger crash**
   - Open SeaTime Tracker app
   - Tap "Sign in with Apple"
   - Complete Apple authentication
   - Wait 5-20 seconds
   - **Expected:** App crashes with SIGABRT

6. **Capture console output**
   - Before crash, console should show:
     ```
     [AppDelegate] ✅ CRASH INSTRUMENTATION ACTIVE
     [Auth] ========== APPLE SIGN IN STARTED ==========
     [TurboModuleInvoke] Module: <ModuleName>
     [TurboModuleInvoke] Method: <MethodName>
     [TurboModuleInvoke] Arguments: <Count>
     ```
   - **CRITICAL:** Note the LAST `[TurboModuleInvoke]` log before crash
   - This is the crashing module

7. **Document findings**
   - Module name: _______________
   - Method name: _______________
   - Argument count: _______________
   - Exception reason (if shown): _______________

---

### Phase 2: Diagnostic Verification

**Goal:** Confirm all diagnostic tools are working

#### Test 2.1: TurboModule Invocation Logging

**Expected:** Every native call is logged

```
✅ PASS: Console shows [TurboModuleInvoke] logs
❌ FAIL: No [TurboModuleInvoke] logs appear
```

**If FAIL:**
- Verify patch is applied: `ls patches/react-native+0.81.5.patch`
- Verify postinstall ran: `npm install`
- Rebuild: `npx expo prebuild --clean`

#### Test 2.2: Fatal Exception Handlers

**Expected:** Crash logs include exception details

```
✅ PASS: Console shows "❌ FATAL: UNCAUGHT OBJECTIVE-C EXCEPTION"
✅ PASS: Exception name and reason are logged
❌ FAIL: No fatal exception logs appear
```

**If FAIL:**
- Verify plugin is activated: `grep "ios-crash-instrumentation" app.json`
- Rebuild: `npx expo prebuild --clean`

#### Test 2.3: Frontend Breadcrumb Logging

**Expected:** JS logs appear before native calls

```
✅ PASS: Console shows "[Auth] ⚠️ ABOUT TO CALL NATIVE"
✅ PASS: Console shows "[Auth] Platform: ios"
❌ FAIL: No frontend breadcrumb logs appear
```

**If FAIL:**
- Check Metro bundler console (not device console)
- Ensure app is in development mode

---

### Phase 3: Fix Validation

**Goal:** Confirm the crash no longer occurs

1. **Apply the fix** (based on identified module)
   - See `CRASH_DIAGNOSTIC_QUICK_REFERENCE.md` for module-specific fixes
   - Example: If SecureStore is the culprit, the fix is already applied (dynamic import)

2. **Rebuild and deploy**
   ```bash
   npm install
   npx expo prebuild --clean
   eas build --platform ios --profile production
   ```

3. **Install new TestFlight build**
   - Download from TestFlight
   - Install on device

4. **Repeat crash test**
   - Connect device to Mac
   - Open console
   - Launch app
   - Sign in with Apple
   - Wait 30 seconds
   - **Expected:** No crash occurs

5. **Verify app functionality**
   - ✅ User can sign in successfully
   - ✅ User can navigate to tabs
   - ✅ User can view profile
   - ✅ User can add vessels
   - ✅ App remains stable for 5+ minutes

---

## 📊 Test Results Template

### Test Run Information
- **Date:** _______________
- **Build Number:** _______________
- **iOS Version:** _______________
- **Device Model:** _______________
- **Tester:** _______________

### Phase 1: Baseline Test
- [ ] Crash reproduced
- [ ] Console logs captured
- [ ] Crashing module identified: _______________
- [ ] Exception reason captured: _______________

### Phase 2: Diagnostic Verification
- [ ] TurboModule invocation logging works
- [ ] Fatal exception handlers work
- [ ] Frontend breadcrumb logging works

### Phase 3: Fix Validation
- [ ] Fix applied for module: _______________
- [ ] New build deployed
- [ ] Crash no longer occurs
- [ ] App functionality verified

### Notes
_______________________________________________
_______________________________________________
_______________________________________________

---

## 🔍 Common Issues & Solutions

### Issue 1: No [TurboModuleInvoke] logs appear

**Cause:** Patch not applied or build not using patched React Native

**Solution:**
```bash
# Verify patch exists
ls patches/react-native+0.81.5.patch

# Reinstall dependencies
rm -rf node_modules
npm install

# Verify postinstall ran
npm run postinstall

# Clean rebuild
npx expo prebuild --clean
```

### Issue 2: Console shows "patch-package: ERROR"

**Cause:** Patch file doesn't match React Native version

**Solution:**
```bash
# Check React Native version
cat package.json | grep '"react-native"'

# Ensure patch file name matches version
# Example: react-native+0.81.5.patch for RN 0.81.5
```

### Issue 3: Crash still occurs after fix

**Cause:** Wrong module identified or fix not applied correctly

**Solution:**
1. Re-check device console for LAST `[TurboModuleInvoke]` log
2. Verify the identified module matches the fix applied
3. Increase delay for the identified module (e.g., 20-30 seconds)
4. Check for multiple modules being called simultaneously

### Issue 4: App crashes before any logs appear

**Cause:** Crash occurs during app initialization, before logging is set up

**Solution:**
1. Check if crash occurs in `AppDelegate` initialization
2. Verify config plugin is activated in `app.json`
3. Check Xcode crash logs for stack trace
4. May need to add logging earlier in native code

---

## 📈 Success Metrics

### Diagnostic Success
- ✅ 100% of TurboModule calls are logged
- ✅ Exception name and reason are captured
- ✅ Crashing module is identified within 1 test run

### Fix Success
- ✅ 0 crashes after Apple Sign-In in 10 consecutive tests
- ✅ App remains stable for 10+ minutes after sign-in
- ✅ All app features work normally

---

## 🆘 Escalation Path

If crash persists after all fixes:

1. **Gather data:**
   - Last 10 `[TurboModuleInvoke]` logs before crash
   - Full exception reason and stack trace
   - Device model and iOS version
   - Build number and React Native version

2. **Check for patterns:**
   - Does crash occur on all devices or specific models?
   - Does crash occur immediately or after delay?
   - Does crash occur on first sign-in or subsequent sign-ins?

3. **Try alternative fixes:**
   - Increase all delays by 2x (e.g., 8s → 16s)
   - Disable specific native modules temporarily
   - Test with different Apple ID

4. **Report findings:**
   - Share console logs
   - Share crash reports
   - Share test results template

---

## 📚 Related Documentation

- **Full Diagnostic Guide:** `TURBOMODULE_CRASH_DIAGNOSTIC_GUIDE.md`
- **Quick Reference:** `CRASH_DIAGNOSTIC_QUICK_REFERENCE.md`
- **Verification Script:** `scripts/verify-crash-instrumentation.sh`
- **Patch File:** `patches/react-native+0.81.5.patch`
- **Config Plugin:** `plugins/ios-crash-instrumentation.js`

---

**Last Updated:** 2026-02-06  
**Version:** 1.0.4 (Build 84)
