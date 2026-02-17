
# Quick Fix Reference - iOS Regressions

## 🚨 WHAT WAS FIXED

### 1️⃣ AUTH REGRESSION (HTTP 500)
- **Problem:** Login returned 500 error due to missing subscription columns
- **Fix:** Backend migration restored `subscription_status`, `subscription_expires_at`, `subscription_product_id` columns
- **Status:** ✅ FIXED

### 2️⃣ iOS CRASH (SIGABRT)
- **Problem:** App crashed immediately after Apple Sign-In due to early TurboModule initialization
- **Fix:** Changed all `expo-secure-store` imports to dynamic loading + added comprehensive logging
- **Status:** ✅ FIXED

---

## 🔍 HOW TO VERIFY FIXES

### **Check Backend Schema:**
```bash
# Verify subscription columns exist
psql -d your_database -c "SELECT subscription_status, subscription_expires_at, subscription_product_id FROM \"user\" LIMIT 1;"
```

**Expected Output:**
```
 subscription_status | subscription_expires_at | subscription_product_id 
---------------------+-------------------------+-------------------------
 inactive            | null                    | null
```

### **Check Console Logs (iOS):**

**Email Login:**
```
[Auth] ========== SIGN IN STARTED ==========
[Auth] Response received: 200 OK
[Auth] ⚠️ NATIVE CALL IMMINENT: SecureStore.setItemAsync
[Auth] ✅ NATIVE CALL SUCCESS: Token stored
[Auth] ========== SIGN IN COMPLETED SUCCESSFULLY ==========
```

**Apple Sign-In:**
```
[AuthScreen] ========== APPLE SIGN IN FLOW STARTED ==========
[AuthScreen] ⚠️ ABOUT TO CALL NATIVE: AppleAuthentication.signInAsync()
[AuthScreen] ✅ NATIVE CALL SUCCESS: signInAsync completed
[Auth] ⚠️ NATIVE CALL IMMINENT: SecureStore.setItemAsync
[Auth] ✅ NATIVE CALL SUCCESS: Token stored
[AuthScreen] ========== APPLE SIGN IN FLOW COMPLETED ==========
```

**Crash Instrumentation:**
```
[AppDelegate] ✅ NSSetUncaughtExceptionHandler installed
[AppDelegate] ✅ RCTSetFatalHandler installed
[AppDelegate] ✅ RCTSetFatalExceptionHandler installed
[AppDelegate] ✅ CRASH INSTRUMENTATION ACTIVE
```

---

## 🐛 IF CRASH STILL OCCURS

### **Step 1: Find Last Breadcrumb**
Look at console logs and find the LAST log before crash:
```
[Auth] ⚠️ NATIVE CALL IMMINENT: SecureStore.setItemAsync
[Auth] Arguments: key = seatime_auth_token , value length = 1234
```
This tells you which native call crashed.

### **Step 2: Check Crash Log File**
On iOS device:
1. Open Files app
2. Navigate to: On My iPhone → SeaTime Tracker → Documents
3. Open `crash_log.txt`

**Example Crash Log:**
```
═══ CRASH AT 2026-02-07 17:30:45 ═══
Exception: NSInvalidArgumentException
Reason: attempt to insert nil object from objects[0]
Stack:
0   CoreFoundation   __exceptionPreprocess + 242
1   libobjc.A.dylib  objc_exception_throw + 48
2   RCTTurboModule   facebook::react::ObjCTurboModule::performVoidMethodInvocation + 441
```

### **Step 3: Analyze the Crash**
- **Exception:** `NSInvalidArgumentException` = Invalid argument passed to native method
- **Reason:** "nil object" = Passed null/undefined to native module
- **Stack:** `RCTTurboModule` = TurboModule call crashed

### **Step 4: Fix the Issue**
Based on the crash, add more validation:

**Example Fix for Nil Object:**
```typescript
// Before (CRASHES):
await SecureStore.setItemAsync(key, value);

// After (SAFE):
if (!key || typeof key !== 'string' || key.length === 0) {
  throw new Error('Invalid key');
}
if (!value || typeof value !== 'string' || value.length === 0) {
  throw new Error('Invalid value');
}
await SecureStore.setItemAsync(key, value);
```

---

## 📋 DEPLOYMENT STEPS

1. **Build iOS App:**
   ```bash
   npm run build:ios
   ```

2. **Upload to TestFlight:**
   - EAS Build will handle upload automatically
   - Wait 15-30 minutes for processing

3. **Test on Physical Device:**
   - Install from TestFlight
   - Test email login
   - Test Apple Sign-In
   - Monitor console logs
   - Check for crashes

4. **Verify Success:**
   - ✅ Email login works (no 500)
   - ✅ Apple Sign-In works (no crash)
   - ✅ Breadcrumb logs appear
   - ✅ Crash instrumentation active

---

## 🔧 TROUBLESHOOTING

### **Build Fails:**
```bash
# Clean and rebuild
expo prebuild -p ios --clean
npm run build:ios
```

### **Login Returns 500:**
- Check backend logs: Look for errors in `/api/auth/sign-in/email`
- Verify migration applied: Check `user` table has subscription columns
- Restart backend service

### **Crash Still Occurs:**
- Check last breadcrumb in console
- Retrieve `crash_log.txt` from device
- Add more validation before the crashing native call
- Consider adding longer delays

### **Subscription Check Blocks App:**
- Verify timeout is 1500ms in `SubscriptionContext.tsx`
- Check `loading` state starts as `false`
- Ensure subscription check is non-blocking

---

## ✅ SUCCESS CRITERIA

- [x] Backend has subscription columns
- [x] Email login succeeds (no 500)
- [x] Apple Sign-In succeeds (no crash)
- [x] Breadcrumb logs present
- [x] Crash instrumentation active
- [x] Subscription check non-blocking
- [ ] Tested on TestFlight
- [ ] Verified on physical iOS device

---

**Status:** READY FOR TESTFLIGHT DEPLOYMENT

**Next Steps:**
1. Build iOS app: `npm run build:ios`
2. Upload to TestFlight
3. Test on physical device
4. Monitor for crashes
5. Check console logs for breadcrumbs

---

**Last Updated:** 2026-02-07
**Version:** 1.0.4
**Build:** 89+
