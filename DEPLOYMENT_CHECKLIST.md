
# 📋 iOS TurboModule Crash Fix - Deployment Checklist

## Pre-Deployment Verification

### 1. Code Changes
- [x] `package.json` - Added `postinstall` script
- [x] `package.json` - Added `patch-package` dependency
- [x] `app.json` - Activated crash instrumentation plugin
- [x] `patches/react-native+0.81.5.patch` - Created TurboModule logging patch
- [x] `contexts/AuthContext.tsx` - Implemented dynamic SecureStore import
- [x] `contexts/AuthContext.tsx` - Added input validation
- [x] `contexts/AuthContext.tsx` - Added concurrency lock
- [x] `contexts/AuthContext.tsx` - Increased delays (4s auth check)
- [x] `app/_layout.tsx` - Implemented staggered native module loading
- [x] `app/_layout.tsx` - Increased delays (3s app ready, 8s notifications, 10s network, 12s haptics)
- [x] `plugins/ios-crash-instrumentation.js` - Verified crash handlers exist

### 2. Documentation
- [x] `TURBOMODULE_CRASH_DIAGNOSTIC_GUIDE.md` - Comprehensive guide created
- [x] `CRASH_DIAGNOSTIC_QUICK_REFERENCE.md` - Quick reference created
- [x] `CRASH_TESTING_GUIDE.md` - Testing procedures created
- [x] `IMPLEMENTATION_SUMMARY.md` - Implementation summary created
- [x] `DEPLOYMENT_CHECKLIST.md` - This checklist created
- [x] `scripts/verify-crash-instrumentation.sh` - Verification script created

### 3. Automated Verification
```bash
# Run verification script
chmod +x scripts/verify-crash-instrumentation.sh
./scripts/verify-crash-instrumentation.sh
```

**Expected:** All checks pass with ✅

---

## Deployment Steps

### Step 1: Clean Environment
```bash
# Remove old builds
rm -rf node_modules
rm -rf ios
rm -rf android
rm -rf .expo

# Clean npm cache
npm cache clean --force
```

### Step 2: Install Dependencies
```bash
# Install with patches
npm install

# Verify patch was applied
echo "Checking if patch was applied..."
if grep -q "TurboModuleInvoke" node_modules/react-native/ReactCommon/react/nativemodule/core/platform/ios/RCTTurboModule.mm; then
  echo "✅ Patch applied successfully"
else
  echo "❌ Patch NOT applied - run 'npm run postinstall' manually"
  exit 1
fi
```

### Step 3: Prebuild
```bash
# Generate native projects with patches
npx expo prebuild --clean --platform ios

# Verify native project includes instrumentation
if [ -d "ios" ]; then
  echo "✅ iOS project generated"
else
  echo "❌ iOS project NOT generated"
  exit 1
fi
```

### Step 4: Build for TestFlight
```bash
# Build for production
eas build --platform ios --profile production

# Note the build number for tracking
echo "Build number: _____________"
```

### Step 5: Upload to TestFlight
- Wait for build to complete
- Build will automatically upload to TestFlight
- Wait for Apple processing (usually 5-10 minutes)
- Add to TestFlight group for testing

---

## Post-Deployment Testing

### Test 1: Verify Instrumentation is Active

**Setup:**
1. Install TestFlight build on physical iPhone
2. Connect iPhone to Mac via USB
3. Open Xcode > Devices and Simulators
4. Select device > Open Console

**Test:**
1. Launch SeaTime Tracker app
2. Check console for: `[AppDelegate] ✅ CRASH INSTRUMENTATION ACTIVE`

**Expected:**
- ✅ Console shows crash instrumentation message
- ✅ Console shows app initialization logs

**If FAIL:**
- Verify plugin is in `app.json` plugins array
- Rebuild with `npx expo prebuild --clean`

---

### Test 2: Verify TurboModule Logging

**Setup:**
1. Device console open (from Test 1)
2. Filter console by: `TurboModuleInvoke`

**Test:**
1. Launch app
2. Navigate through app
3. Check console for `[TurboModuleInvoke]` logs

**Expected:**
- ✅ Console shows `[TurboModuleInvoke]` logs for native calls
- ✅ Logs include module name, method name, argument count

**If FAIL:**
- Verify patch file exists: `ls patches/react-native+0.81.5.patch`
- Verify postinstall ran: `npm run postinstall`
- Check patched file: `grep "TurboModuleInvoke" node_modules/react-native/ReactCommon/react/nativemodule/core/platform/ios/RCTTurboModule.mm`

---

### Test 3: Apple Sign-In Crash Test

**Setup:**
1. Device console open with filter: `TurboModuleInvoke`
2. Fresh app install (delete and reinstall from TestFlight)

**Test:**
1. Launch app
2. Tap "Sign in with Apple"
3. Complete Apple authentication
4. Wait 30 seconds
5. Monitor console output

**Expected (if crash occurs):**
```
[Auth] ========== APPLE SIGN IN STARTED ==========
[Auth] ⚠️ ABOUT TO CALL NATIVE: SecureStore.setItemAsync
[TurboModuleInvoke] Module: <ModuleName>
[TurboModuleInvoke] Method: <MethodName>
[TurboModuleInvoke] Arguments: <Count>
❌ FATAL: UNCAUGHT OBJECTIVE-C EXCEPTION
Exception Name: <ExceptionName>
Exception Reason: <Reason>
```

**Expected (if fix works):**
```
[Auth] ========== APPLE SIGN IN STARTED ==========
[Auth] ⚠️ ABOUT TO CALL NATIVE: SecureStore.setItemAsync
[TurboModuleInvoke] Module: RCTSecureStore
[TurboModuleInvoke] Method: setItemAsync:value:options:resolver:rejecter:
[TurboModuleInvoke] Arguments: 5
[Auth] ✅ NATIVE CALL SUCCESS: Token stored in SecureStore
[Auth] ========== APPLE SIGN IN COMPLETED ==========
```

**Results:**
- [ ] No crash occurred
- [ ] User successfully signed in
- [ ] User navigated to tabs
- [ ] App remained stable for 5+ minutes

**If crash occurs:**
1. Note the LAST `[TurboModuleInvoke]` log before crash
2. Note the exception name and reason
3. Document findings:
   - Crashing module: _______________
   - Crashing method: _______________
   - Exception reason: _______________
4. Apply module-specific fix (see `CRASH_DIAGNOSTIC_QUICK_REFERENCE.md`)
5. Rebuild and retest

---

### Test 4: App Functionality Verification

**Test after successful sign-in:**

- [ ] User profile loads correctly
- [ ] User can add a vessel
- [ ] User can view vessel details
- [ ] User can add sea time entry
- [ ] User can view logbook
- [ ] User can view confirmations
- [ ] User can sign out
- [ ] User can sign back in
- [ ] App remains stable for 10+ minutes

---

## Rollback Plan

If critical issues are discovered:

### Option 1: Disable Crash Instrumentation
```bash
# Remove plugin from app.json
# Edit app.json and remove: "./plugins/ios-crash-instrumentation.js"

# Rebuild
npx expo prebuild --clean
eas build --platform ios --profile production
```

### Option 2: Revert to Previous Build
1. Go to TestFlight
2. Remove current build from testing
3. Re-enable previous stable build

### Option 3: Emergency Hotfix
```bash
# Revert specific changes
git revert <commit-hash>

# Rebuild
npm install
npx expo prebuild --clean
eas build --platform ios --profile production
```

---

## Success Criteria

### Diagnostic Success
- ✅ Device console shows `[TurboModuleInvoke]` logs
- ✅ Device console shows crash instrumentation active message
- ✅ If crash occurs, exact module and method are identified
- ✅ Exception name and reason are captured

### Fix Success
- ✅ No crash after Apple Sign-In in 10 consecutive tests
- ✅ App remains stable for 10+ minutes after sign-in
- ✅ All app features work normally
- ✅ No SIGABRT crashes in TestFlight crash reports

---

## Communication Plan

### Internal Team
- [ ] Notify QA team of new TestFlight build
- [ ] Share testing instructions (`CRASH_TESTING_GUIDE.md`)
- [ ] Set up monitoring schedule (who checks console logs)
- [ ] Establish reporting process for issues

### External (if applicable)
- [ ] Notify beta testers of new build
- [ ] Request feedback on stability
- [ ] Monitor TestFlight crash reports
- [ ] Respond to user feedback within 24 hours

---

## Monitoring Schedule

### First 24 Hours
- Check TestFlight crash reports every 2 hours
- Monitor device console during manual testing
- Respond to any reported issues immediately

### First Week
- Check TestFlight crash reports daily
- Collect user feedback
- Monitor for patterns in crash reports

### Ongoing
- Weekly review of TestFlight crash reports
- Monthly review of stability metrics
- Continuous improvement based on findings

---

## Issue Tracking

### If Crash Occurs
1. **Document:**
   - Build number: _______________
   - Device model: _______________
   - iOS version: _______________
   - Crashing module: _______________
   - Exception reason: _______________

2. **Analyze:**
   - Review console logs
   - Check for patterns
   - Identify root cause

3. **Fix:**
   - Apply module-specific fix
   - Rebuild and test
   - Document fix in changelog

4. **Verify:**
   - Test fix in 10 consecutive runs
   - Confirm no regression
   - Deploy to TestFlight

---

## Sign-Off

### Pre-Deployment
- [ ] All code changes reviewed
- [ ] All documentation complete
- [ ] Verification script passes
- [ ] Build succeeds

**Approved by:** _______________  
**Date:** _______________

### Post-Deployment
- [ ] Instrumentation verified active
- [ ] TurboModule logging verified
- [ ] Crash test completed
- [ ] Functionality verified

**Tested by:** _______________  
**Date:** _______________

### Production Release
- [ ] No crashes in 10 consecutive tests
- [ ] All features working
- [ ] User feedback positive
- [ ] Ready for App Store submission

**Approved by:** _______________  
**Date:** _______________

---

**Deployment Version:** 1.0.4 (Build 84)  
**Deployment Date:** _______________  
**Status:** ⬜ Pending / ⬜ In Progress / ⬜ Complete / ⬜ Rolled Back
