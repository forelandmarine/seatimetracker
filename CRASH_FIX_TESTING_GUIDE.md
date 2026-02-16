
# iOS Crash Fix Testing Guide

## 🎯 OBJECTIVE
Verify that the auth regression (HTTP 500) and iOS crash (SIGABRT) fixes are working correctly in TestFlight.

---

## ✅ PRE-DEPLOYMENT CHECKLIST

### **Backend Verification**
- [ ] Backend deployed with subscription column migration
- [ ] Run: `SELECT subscription_status, subscription_expires_at, subscription_product_id FROM "user" LIMIT 1;`
- [ ] Verify columns exist and have default values
- [ ] Check backend logs for any 500 errors: `get_backend_logs()`

### **Frontend Verification**
- [ ] All `expo-secure-store` imports are dynamic (no module-scope imports)
- [ ] Breadcrumb logging present in `AuthContext.tsx`, `auth.tsx`, `storeKit.native.ts`
- [ ] iOS crash instrumentation plugin activated in `app.json`
- [ ] `package.json` has `"postinstall": "patch-package"`
- [ ] Build new iOS app: `npm run build:ios`
- [ ] Upload to TestFlight

---

## 🧪 TEST PLAN

### **Test 1: Email/Password Login (Auth Regression Fix)**

**Objective:** Verify that email/password login no longer returns HTTP 500

**Steps:**
1. Open app on iOS device (TestFlight build)
2. Navigate to Sign In screen
3. Enter valid email and password
4. Tap "Sign In"

**Expected Result:**
- ✅ Login succeeds without HTTP 500 error
- ✅ User is authenticated and redirected to home screen
- ✅ Backend logs show successful login (no 500 errors)

**Console Logs to Check:**
```
[Auth] ========== SIGN IN STARTED ==========
[Auth] Platform: ios
[Auth] Email: user@example.com
[Auth] Sending fetch request...
[Auth] Response received: 200 OK
[Auth] Response data parsed: { hasSession: true, hasUser: true }
[Auth] ⚠️ BREADCRUMB: About to store token
[Auth] ⚠️ BREADCRUMB: About to dynamically import expo-secure-store
[Auth] ✅ expo-secure-store imported successfully
[Auth] ⚠️ BREADCRUMB: About to call SecureStore.setItemAsync
[Auth] ⚠️ NATIVE CALL IMMINENT: SecureStore.setItemAsync
[Auth] ✅ NATIVE CALL SUCCESS: SecureStore.setItemAsync
[Auth] Token stored successfully
[Auth] Setting user state...
[Auth] ========== SIGN IN COMPLETED SUCCESSFULLY ==========
```

**If Test Fails:**
- Check backend logs: `get_backend_logs()`
- Look for 500 errors related to subscription columns
- Verify migration was applied: `SELECT * FROM "user" WHERE email = 'user@example.com';`

---

### **Test 2: Apple Sign-In (iOS Crash Fix)**

**Objective:** Verify that Apple Sign-In no longer causes SIGABRT crash

**Steps:**
1. Open app on iOS device (TestFlight build)
2. Navigate to Sign In screen
3. Tap "Sign in with Apple" button
4. Complete Apple authentication
5. **CRITICAL:** Watch for crash immediately after authentication

**Expected Result:**
- ✅ Apple authentication completes successfully
- ✅ NO CRASH after authentication
- ✅ Token is stored in SecureStore/Keychain
- ✅ User is authenticated and redirected to home screen

**Console Logs to Check:**
```
[AuthScreen] ========== APPLE SIGN IN FLOW STARTED ==========
[AuthScreen] User tapped Sign in with Apple button
[AuthScreen] Platform: ios
[AuthScreen] ⚠️ ABOUT TO CALL NATIVE: AppleAuthentication.isAvailableAsync()
[AuthScreen] ✅ NATIVE CALL SUCCESS: isAvailableAsync returned: true
[AuthScreen] ⚠️ ABOUT TO CALL NATIVE: AppleAuthentication.signInAsync()
[AuthScreen] ✅ NATIVE CALL SUCCESS: signInAsync completed
[AuthScreen] ========== APPLE CREDENTIAL RECEIVED ==========
[AuthScreen] Validating credential object...
[AuthScreen] ✅ VALIDATION SUCCESS: Credential object is valid
[AuthScreen] ========== SENDING TO BACKEND ==========
[Auth] ⚠️ BREADCRUMB: signInWithApple called
[Auth] ========== APPLE SIGN IN STARTED ==========
[Auth] ⚠️ BREADCRUMB: Validating identity token
[Auth] ⚠️ BREADCRUMB: Sending fetch request to backend
[Auth] Response received: 200 OK
[Auth] ⚠️ BREADCRUMB: Response data received
[Auth] ⚠️ BREADCRUMB: Validating response data
[Auth] ✅ VALIDATION SUCCESS: Credential object is valid
[Auth] ⚠️ BREADCRUMB: About to store token in SecureStore/Keychain
[Auth] ⚠️ NATIVE CALL IMMINENT: tokenStorage.setToken
[Auth] ⚠️ BREADCRUMB: About to dynamically import expo-secure-store
[Auth] ✅ expo-secure-store imported successfully
[Auth] ⚠️ BREADCRUMB: About to call SecureStore.setItemAsync
[Auth] ⚠️ NATIVE CALL IMMINENT: SecureStore.setItemAsync
[Auth] ✅ NATIVE CALL SUCCESS: Token stored in SecureStore/Keychain
[Auth] ⚠️ BREADCRUMB: Setting user state
[Auth] ========== APPLE SIGN IN COMPLETED ==========
[AuthScreen] ========== NAVIGATION PHASE ==========
[AuthScreen] ⚠️ ABOUT TO CALL: router.replace (React Navigation)
[AuthScreen] ✅ Navigation completed successfully
[AuthScreen] ========== APPLE SIGN IN FLOW COMPLETED ==========
```

**If Crash Occurs:**
1. **Check Console Logs:** Look for the LAST breadcrumb before crash
   - This tells you exactly which native call caused the crash
   
2. **Check Crash Log File:** On the device, navigate to:
   - Files app → On My iPhone → SeaTime Tracker → Documents → `crash_log.txt`
   - This file contains the native exception details
   
3. **Expected Crash Log Format:**
   ```
   ═══ CRASH AT 2026-02-07 17:30:45 ═══
   Exception: NSInvalidArgumentException
   Reason: attempt to insert nil object from objects[0]
   Stack:
   0   CoreFoundation   __exceptionPreprocess + 242
   1   libobjc.A.dylib  objc_exception_throw + 48
   2   CoreFoundation   -[__NSPlaceholderDictionary initWithObjects:forKeys:count:] + 290
   3   RCTTurboModule   facebook::react::ObjCTurboModule::performVoidMethodInvocation + 441
   ...
   ```

4. **Analyze the Crash:**
   - **Exception Name:** What type of error (e.g., `NSInvalidArgumentException`)
   - **Reason:** Why it crashed (e.g., "nil object", "unrecognized selector")
   - **Stack Trace:** Which module/method caused it (look for `RCTTurboModule`, `SecureStore`, `AppleAuthentication`)

5. **Common Crash Causes:**
   - **Nil/Undefined Arguments:** Passing null/undefined to native module
   - **Wrong Argument Type:** Passing number instead of string, etc.
   - **Module Not Ready:** Calling native module before bridge is initialized
   - **Invalid Key:** Using empty string or null as SecureStore key

---

### **Test 3: Subscription Status Check (Non-Blocking)**

**Objective:** Verify that subscription status check doesn't block authentication

**Steps:**
1. Sign in with email/password or Apple
2. Observe app behavior during subscription check
3. Check console logs

**Expected Result:**
- ✅ Login completes immediately
- ✅ App is usable while subscription check runs in background
- ✅ If subscription check fails, app continues with 'inactive' status
- ✅ No 500 errors from subscription endpoint

**Console Logs to Check:**
```
[Auth] ========== SIGN IN COMPLETED SUCCESSFULLY ==========
[Subscription] ⚠️ BREADCRUMB: useEffect triggered
[Subscription] isAuthenticated: true
[Subscription] User authenticated, scheduling subscription check...
[Subscription] ⚠️ This check is NON-BLOCKING - app will continue even if it fails
[Subscription] Executing delayed subscription check (after 2 seconds)
[Subscription] ⚠️ BREADCRUMB: checkSubscription called
[Subscription] ⚠️ BREADCRUMB: About to call authenticatedGet /api/subscription/status
[Subscription] ✅ API call completed
[Subscription] ✅ Status validated and received: inactive
```

**If Subscription Check Fails:**
- App should continue working normally
- Subscription status should default to 'inactive'
- User should still be able to access all features
- No crash or blocking behavior

---

### **Test 4: Native Crash Instrumentation**

**Objective:** Verify that native crash handlers are installed and working

**Steps:**
1. Build and launch app on iOS device
2. Check console logs during app startup

**Expected Console Logs:**
```
[AppDelegate] Installing crash instrumentation handlers...
[AppDelegate] ✅ NSSetUncaughtExceptionHandler installed
[AppDelegate] ✅ RCTSetFatalHandler installed
[AppDelegate] ✅ RCTSetFatalExceptionHandler installed
[AppDelegate] ═══════════════════════════════════════════════════════════════
[AppDelegate] ✅ CRASH INSTRUMENTATION ACTIVE
[AppDelegate] All fatal exceptions will be logged before SIGABRT
[AppDelegate] ═══════════════════════════════════════════════════════════════
```

**If Logs Missing:**
- Verify `plugins/ios-crash-instrumentation.js` exists
- Verify plugin is in `app.json` plugins array
- Run `expo prebuild -p ios --clean` to regenerate native code
- Rebuild app

---

## 🔍 DEBUGGING GUIDE

### **If Email Login Returns 500:**

1. **Check Backend Logs:**
   ```
   get_backend_logs()
   ```
   Look for errors related to subscription columns

2. **Verify Database Schema:**
   ```sql
   SELECT column_name, data_type, is_nullable 
   FROM information_schema.columns 
   WHERE table_name = 'user' 
   AND column_name LIKE '%subscription%';
   ```
   Should return:
   - `subscription_status` (text, nullable)
   - `subscription_expires_at` (timestamp, nullable)
   - `subscription_product_id` (text, nullable)

3. **Check Migration Applied:**
   ```sql
   SELECT * FROM drizzle.__drizzle_migrations 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```
   Look for migration with "restore_subscription_columns"

### **If Apple Sign-In Crashes:**

1. **Find Last Breadcrumb:**
   - Look at console logs
   - Find the LAST `⚠️ BREADCRUMB:` or `⚠️ NATIVE CALL IMMINENT:` log
   - This is the operation that caused the crash

2. **Check Crash Log File:**
   - On device: Files → On My iPhone → SeaTime Tracker → Documents → `crash_log.txt`
   - Read the exception name and reason
   - Identify which native module crashed

3. **Common Crash Patterns:**
   
   **Pattern 1: SecureStore Crash**
   ```
   Last breadcrumb: [Auth] ⚠️ NATIVE CALL IMMINENT: SecureStore.setItemAsync
   Exception: NSInvalidArgumentException
   Reason: attempt to insert nil object
   ```
   **Fix:** Validate token is not null before calling setItemAsync
   
   **Pattern 2: AppleAuthentication Crash**
   ```
   Last breadcrumb: [AuthScreen] ⚠️ ABOUT TO CALL NATIVE: AppleAuthentication.signInAsync()
   Exception: NSInternalInconsistencyException
   Reason: ASAuthorizationController must be used from main thread
   ```
   **Fix:** Ensure Apple auth is called on main thread
   
   **Pattern 3: StoreKit Crash**
   ```
   Last breadcrumb: [StoreKit] ⚠️ NATIVE CALL IMMINENT: requestSubscription
   Exception: NSInvalidArgumentException
   Reason: Invalid product identifier
   ```
   **Fix:** Verify product ID matches App Store Connect configuration

### **If Subscription Check Blocks App:**

1. **Check Console Logs:**
   ```
   [Subscription] Check already in progress, skipping
   [Subscription] Check timeout after 1500 ms, aborting...
   ```

2. **Verify Timeout Logic:**
   - Subscription check should timeout after 1.5 seconds
   - App should continue with 'inactive' status
   - No infinite loading states

3. **Check Backend Response:**
   - `/api/subscription/status` should return within 1.5 seconds
   - If slow, optimize backend query
   - If failing, ensure graceful degradation

---

## 📊 SUCCESS CRITERIA

### **Auth Regression Fix:**
- ✅ Email/password login succeeds (no 500 error)
- ✅ Backend logs show no 500 errors during login
- ✅ User can authenticate and access protected routes
- ✅ Subscription columns exist in database

### **iOS Crash Fix:**
- ✅ Apple Sign-In completes without SIGABRT crash
- ✅ Token is stored successfully in SecureStore/Keychain
- ✅ User is authenticated and can access app
- ✅ Breadcrumb logs show all native calls completed successfully
- ✅ Native crash handlers are installed (check console logs)

### **Non-Blocking Subscription:**
- ✅ Login succeeds even if subscription check fails
- ✅ App is usable while subscription check runs
- ✅ Subscription check times out after 1.5 seconds
- ✅ App defaults to 'inactive' status on error

---

## 🚀 DEPLOYMENT STEPS

1. **Deploy Backend:**
   ```bash
   # Backend should auto-deploy with migration
   # Verify migration applied
   ```

2. **Build iOS App:**
   ```bash
   npm run build:ios
   ```

3. **Upload to TestFlight:**
   ```bash
   # EAS Build will handle upload
   # Wait for processing (15-30 minutes)
   ```

4. **Test on Physical Device:**
   - Install from TestFlight
   - Test email login
   - Test Apple Sign-In
   - Monitor console logs
   - Check for crashes

5. **Verify Crash Instrumentation:**
   - Check console for "CRASH INSTRUMENTATION ACTIVE" message
   - If crash occurs, retrieve `crash_log.txt` from device

---

## 📞 TROUBLESHOOTING

### **Build Fails:**
- Check `patch-package` is in `package.json` scripts
- Verify `plugins/ios-crash-instrumentation.js` exists
- Run `expo prebuild -p ios --clean`
- Delete `ios/` folder and rebuild

### **Login Still Returns 500:**
- Check backend logs for exact error
- Verify migration was applied to production database
- Check if backend is using correct database connection
- Verify auth endpoint is not querying subscription columns incorrectly

### **Crash Still Occurs:**
- Retrieve `crash_log.txt` from device
- Check last breadcrumb in console logs
- Identify which native module crashed
- Add more validation before that native call
- Consider adding delays before native calls

### **Subscription Check Blocks App:**
- Verify timeout is set to 1500ms
- Check if `checkInProgress` ref is working
- Ensure `loading` state starts as `false`
- Add more aggressive timeout

---

## 📝 REPORTING RESULTS

After testing, report:

1. **Email Login Test:**
   - ✅ Success / ❌ Failed
   - Backend response status: 200 / 500
   - Error message (if any)

2. **Apple Sign-In Test:**
   - ✅ Success / ❌ Crashed
   - Last breadcrumb before crash (if crashed)
   - Crash log excerpt (if available)

3. **Subscription Check Test:**
   - ✅ Non-blocking / ❌ Blocks app
   - Time to complete: X seconds
   - Final status: active / inactive

4. **Crash Instrumentation:**
   - ✅ Installed / ❌ Not installed
   - Console logs present: Yes / No

---

**Last Updated:** 2026-02-07
**Version:** 1.0.4
**Build:** 89+
