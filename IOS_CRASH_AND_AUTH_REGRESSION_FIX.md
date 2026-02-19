
# iOS Crash & Auth Regression Fix - Implementation Summary

## 🚨 CRITICAL ISSUES ADDRESSED

### 1) AUTH REGRESSION (HTTP 500 on Login)
**Root Cause:** Database schema mismatch - subscription columns (`subscription_status`, `subscription_expires_at`, `subscription_product_id`) were dropped from the `user` table during StoreKit work, but backend queries still expected them.

**Fix Implemented:**
- ✅ **Backend Migration:** Created migration to restore subscription columns to `user` table
- ✅ **Schema Update:** Updated `backend/src/db/auth-schema.ts` to include subscription columns
- ✅ **Non-blocking Subscription:** Ensured subscription status checks never block authentication
- ✅ **Graceful Degradation:** All user queries handle null subscription columns without 500 errors

### 2) iOS CRASH (SIGABRT after Apple Sign-In)
**Root Cause:** TurboModule crash caused by calling `expo-secure-store` (SecureStore/Keychain) before the React Native bridge was fully initialized. The crash occurred in `RCTTurboModule.mm:441` during `performVoidMethodInvocation`.

**Fix Implemented:**
- ✅ **Dynamic Module Loading:** Changed all `expo-secure-store` imports from module-scope to dynamic `await import()` inside functions
- ✅ **Delayed Initialization:** Added 2-second delay before allowing any auth operations to ensure app stability
- ✅ **Strict Argument Validation:** All native calls now validate arguments (no null/undefined) before invocation
- ✅ **Comprehensive Breadcrumb Logging:** Added detailed console logs before every native call
- ✅ **Native Crash Handlers:** Installed `NSSetUncaughtExceptionHandler`, `RCTSetFatalHandler`, and `RCTSetFatalExceptionHandler` via Expo config plugin
- ✅ **Crash Log Persistence:** Native handlers write crash details to `Documents/crash_log.txt` for post-crash retrieval
- ✅ **Try-Catch Wrappers:** All SecureStore operations wrapped in try-catch to prevent crashes

---

## 📋 DETAILED CHANGES

### **Frontend Changes**

#### **1. contexts/AuthContext.tsx**
**Changes:**
- Removed module-scope `import * as SecureStore from 'expo-secure-store'`
- Implemented dynamic import: `const SecureStore = await import('expo-secure-store')`
- Added comprehensive breadcrumb logging before all native calls:
  ```typescript
  console.log('[Auth] ⚠️ BREADCRUMB: About to call SecureStore.setItemAsync');
  console.log('[Auth] ⚠️ NATIVE CALL IMMINENT: SecureStore.setItemAsync');
  console.log('[Auth] Arguments: key =', TOKEN_KEY, ', value length =', token.length);
  ```
- Added strict argument validation before all native calls
- Wrapped all SecureStore operations in try-catch blocks
- Added 2-second app ready delay before allowing auth operations
- Removed automatic auth check on mount (now only checks when explicitly needed)

**Why This Fixes the Crash:**
- Dynamic imports ensure SecureStore is only loaded when needed, after the app is stable
- Breadcrumb logging helps identify exactly which native call causes crashes
- Argument validation prevents passing invalid data to native modules
- Try-catch prevents crashes from propagating to the app

#### **2. utils/seaTimeApi.ts**
**Changes:**
- Removed module-scope `import * as SecureStore from 'expo-secure-store'`
- Implemented dynamic import in `getAuthToken()` function
- Added breadcrumb logging before SecureStore calls

#### **3. utils/biometricAuth.ts**
**Changes:**
- Removed module-scope `import * as SecureStore from 'expo-secure-store'`
- Implemented dynamic import in all functions that use SecureStore
- Added breadcrumb logging before SecureStore calls

#### **4. plugins/ios-crash-instrumentation.js**
**Already Implemented:**
- Expo config plugin that injects native crash handlers into iOS AppDelegate
- Installs `NSSetUncaughtExceptionHandler` to catch Objective-C exceptions
- Installs `RCTSetFatalHandler` to catch React Native fatal errors
- Installs `RCTSetFatalExceptionHandler` to catch React Native exceptions
- Writes crash details to `Documents/crash_log.txt` for persistence
- Logs exception name, reason, and full call stack

**Activated in app.json:**
```json
"plugins": [
  "./plugins/ios-crash-instrumentation",
  ...
]
```

### **Backend Changes**

#### **1. Database Migration**
**File:** `backend/drizzle/20260207XXXXXX_restore_subscription_columns.sql`
```sql
-- Restore subscription columns to user table
ALTER TABLE "user" ADD COLUMN "subscription_status" TEXT DEFAULT 'inactive';
ALTER TABLE "user" ADD COLUMN "subscription_expires_at" TIMESTAMP;
ALTER TABLE "user" ADD COLUMN "subscription_product_id" TEXT;

-- Add index for performance
CREATE INDEX IF NOT EXISTS "subscription_status_idx" ON "user" ("subscription_status");
```

#### **2. Schema Update**
**File:** `backend/src/db/auth-schema.ts`
```typescript
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  // ... other fields ...
  subscriptionStatus: text('subscription_status').default('inactive'),
  subscriptionExpiresAt: timestamp('subscription_expires_at'),
  subscriptionProductId: text('subscription_product_id'),
});
```

#### **3. Backend Route Updates**
- All user queries now handle null subscription columns gracefully
- `/api/auth/user` endpoint returns user data even if subscription columns are null
- `/api/subscription/status` endpoint returns default 'inactive' status if columns are null
- No 500 errors during login due to missing subscription data

---

## 🔍 HOW TO REPRODUCE & VERIFY FIX

### **Reproduce Auth Regression (Before Fix):**
1. Deploy backend without subscription columns in `user` table
2. Attempt email/password login
3. **Result:** HTTP 500 error because backend queries expect subscription columns

### **Verify Auth Fix (After Fix):**
1. Deploy backend with restored subscription columns
2. Attempt email/password login
3. **Result:** ✅ Login succeeds, user is authenticated
4. Check backend logs: No 500 errors, subscription columns are null or have default values

### **Reproduce iOS Crash (Before Fix):**
1. Build iOS app with module-scope `expo-secure-store` import
2. Launch app on iOS device
3. Sign in with Apple
4. **Result:** Immediate SIGABRT crash in `RCTTurboModule.mm:441`

### **Verify iOS Crash Fix (After Fix):**
1. Build iOS app with dynamic `expo-secure-store` imports
2. Launch app on iOS device
3. Sign in with Apple
4. **Result:** ✅ No crash, user is authenticated successfully
5. Check console logs: Breadcrumb logs show all native calls completed successfully
6. If crash occurs: Check `Documents/crash_log.txt` for detailed crash information

---

## 🛠️ TECHNICAL EXPLANATION

### **Why Dynamic Imports Fix the Crash**

**Problem:**
```typescript
// Module-scope import (BAD)
import * as SecureStore from 'expo-secure-store';

// This causes SecureStore to initialize immediately when the module loads
// If the React Native bridge isn't ready, TurboModule calls will SIGABRT
```

**Solution:**
```typescript
// Dynamic import (GOOD)
const getSecureStore = async () => {
  return await import('expo-secure-store');
};

// Inside function:
const SecureStore = await getSecureStore();
await SecureStore.setItemAsync(key, value);

// SecureStore is only loaded when actually needed, after app is stable
```

### **Why Breadcrumb Logging is Critical**

When a native crash occurs (SIGABRT), JavaScript try-catch blocks cannot catch it. The app terminates immediately. Breadcrumb logging helps identify:
- Which native module was being called
- What arguments were passed
- The exact sequence of operations before the crash

Example breadcrumb log:
```
[Auth] ⚠️ BREADCRUMB: signInWithApple called
[Auth] ⚠️ BREADCRUMB: Identity token length: 780
[Auth] ⚠️ BREADCRUMB: Validating identity token
[Auth] ⚠️ BREADCRUMB: Sending fetch request to backend
[Auth] ⚠️ BREADCRUMB: Response data received
[Auth] ⚠️ BREADCRUMB: Validating response data
[Auth] ⚠️ BREADCRUMB: About to store token in SecureStore/Keychain
[Auth] ⚠️ NATIVE CALL IMMINENT: tokenStorage.setToken
[Auth] Token length: 1234
[Auth] ⚠️ BREADCRUMB: About to dynamically import expo-secure-store
[Auth] ✅ expo-secure-store imported successfully
[Auth] ⚠️ BREADCRUMB: About to call SecureStore.setItemAsync
[Auth] ⚠️ NATIVE CALL IMMINENT: SecureStore.setItemAsync
[Auth] Arguments: key = seatime_auth_token , value length = 1234
[Auth] ✅ NATIVE CALL SUCCESS: SecureStore.setItemAsync
```

If a crash occurs, the last breadcrumb shows exactly where it happened.

### **Why Native Crash Handlers are Essential**

Native crash handlers capture the actual Objective-C exception before SIGABRT:
- Exception name (e.g., `NSInvalidArgumentException`)
- Exception reason (e.g., `"attempt to insert nil object"`)
- Full call stack showing the exact line of code

This information is written to `Documents/crash_log.txt` and persists across app restarts, allowing post-crash analysis.

---

## ✅ VERIFICATION CHECKLIST

### **Auth Regression Fix:**
- [ ] Backend migration applied successfully
- [ ] `user` table has `subscription_status`, `subscription_expires_at`, `subscription_product_id` columns
- [ ] Email/password login succeeds without 500 errors
- [ ] User can authenticate even if subscription columns are null
- [ ] Backend logs show no 500 errors during login

### **iOS Crash Fix:**
- [ ] All `expo-secure-store` imports are dynamic (no module-scope imports)
- [ ] Breadcrumb logging appears in console before all native calls
- [ ] iOS crash instrumentation plugin is activated in `app.json`
- [ ] Native crash handlers are installed (check console for "CRASH INSTRUMENTATION ACTIVE")
- [ ] Apple Sign-In completes without SIGABRT crash
- [ ] Token is stored successfully in SecureStore/Keychain
- [ ] User is authenticated and can access protected routes

### **Post-Deployment:**
- [ ] Monitor backend logs for any 500 errors during login
- [ ] Monitor iOS crash reports in TestFlight/App Store Connect
- [ ] Check `Documents/crash_log.txt` on test devices for any crashes
- [ ] Verify breadcrumb logs are present in production builds

---

## 📊 EXPECTED OUTCOMES

### **Before Fix:**
- ❌ Email/password login: HTTP 500 error
- ❌ Apple Sign-In: Immediate SIGABRT crash
- ❌ No crash logs available
- ❌ App unusable on iOS

### **After Fix:**
- ✅ Email/password login: Succeeds, user authenticated
- ✅ Apple Sign-In: Succeeds, no crash, user authenticated
- ✅ Detailed crash logs available if any crash occurs
- ✅ App stable and usable on iOS

---

## 🚀 DEPLOYMENT STEPS

1. **Backend:**
   - Deploy backend with subscription column migration
   - Verify migration applied: `SELECT subscription_status FROM "user" LIMIT 1;`
   - Restart backend service

2. **Frontend:**
   - Build new iOS app with dynamic imports and crash instrumentation
   - Upload to TestFlight
   - Test on physical iOS device (not simulator)

3. **Verification:**
   - Test email/password login
   - Test Apple Sign-In
   - Check console logs for breadcrumbs
   - Check `Documents/crash_log.txt` if any crash occurs

---

## 📞 SUPPORT

If issues persist:
1. Check backend logs: `get_backend_logs()`
2. Check frontend logs: `read_frontend_logs()`
3. Check iOS crash log: `Documents/crash_log.txt` on device
4. Review breadcrumb logs in console
5. Verify all changes were applied correctly

---

**Last Updated:** 2026-02-07
**Version:** 1.0.4
**Build:** 89+
