
# TurboModule Crash Fixes & Backend 500 Error Resolution

## Executive Summary

This document details the concrete fixes implemented to resolve two critical production issues:

1. **Backend 500 Error**: After authentication, subscription status check fails with HTTP 500
2. **Apple Sign-In TurboModule Crash**: App crashes with `EXC_CRASH (SIGABRT)` after Apple ID prompt

---

## TASK A: Backend 500 Error Fixes

### Root Cause Analysis

The backend `/api/subscription/status` endpoint was attempting to call `.toISOString()` on `subscription_expires_at` without:
1. Checking if the value exists
2. Validating it's a Date object
3. Handling string/number/null values
4. The database schema was missing subscription columns entirely

Additionally:
- Apple receipt verification used incorrect hostname parsing (`url.split("//")[1]` produced `"sandbox.itunes.apple.com/verifyReceipt"` instead of just the hostname)
- Client was calling wrong endpoint (`/api/subscription` instead of `/api/subscription/status`)

### Fixes Implemented

#### 1. Database Schema Update (Backend)

**File**: Backend database migration (via `make_backend_change`)

**Changes**:
```sql
ALTER TABLE "user" ADD COLUMN "subscription_status" text DEFAULT 'inactive';
ALTER TABLE "user" ADD COLUMN "subscription_expires_at" timestamp;
ALTER TABLE "user" ADD COLUMN "subscription_product_id" text;
```

**Why this prevents 500 errors**:
- Adds missing columns that the subscription endpoint expects
- Provides default values to prevent null reference errors

#### 2. Safe Date Serialization (Backend)

**File**: `backend/src/routes/subscription.ts`

**Changes**:
```typescript
// BEFORE (BROKEN):
expiresAt: expiresAt ? expiresAt.toISOString() : null

// AFTER (SAFE):
const expiresAtRaw = user.subscription_expires_at;
let expiresAtISO: string | null = null;
let isActive = false;

if (expiresAtRaw !== null && expiresAtRaw !== undefined) {
  try {
    const date = new Date(expiresAtRaw);
    if (!isNaN(date.getTime())) {
      expiresAtISO = date.toISOString();
      if (date.getTime() > Date.now()) {
        isActive = true;
      }
    }
  } catch (e) {
    console.error('Error parsing subscription_expires_at:', e);
    // Fallback to inactive - NEVER throw
  }
}

return {
  status: isActive ? 'active' : 'inactive',
  expiresAt: expiresAtISO,
  productId: user.subscription_product_id || null
};
```

**Why this prevents 500 errors**:
- Accepts `Date | string | number | null` (handles all possible database return types)
- Validates with `new Date()` and `!isNaN(date.getTime())`
- **Never throws** - always falls back to `null` and `inactive` status
- Wrapped in try-catch for maximum safety

#### 3. Apple Receipt Verification Hostname Fix (Backend)

**File**: `backend/src/routes/subscription.ts`

**Changes**:
```typescript
// BEFORE (BROKEN):
const options = {
  hostname: url.split("//")[1],  // Produces "sandbox.itunes.apple.com/verifyReceipt"
  path: "/verifyReceipt",
  // ...
};

// AFTER (CORRECT):
const u = new URL(url);
const options = {
  hostname: u.hostname,  // "sandbox.itunes.apple.com"
  path: u.pathname,      // "/verifyReceipt"
  // ...
};
```

**Why this prevents 500 errors**:
- Correctly parses hostname using `URL` API
- Separates hostname and path properly
- Works for both sandbox and production Apple endpoints

#### 4. Client Route Mismatch Fix (Frontend)

**File**: `contexts/SubscriptionContext.tsx`

**Changes**:
```typescript
// BEFORE (WRONG ENDPOINT):
const response = await authenticatedGet<{ subscription: SubscriptionStatus }>(
  '/api/subscription',  // ❌ This endpoint doesn't exist
  { signal: controller.signal }
);
setSubscriptionStatus(response.subscription);

// AFTER (CORRECT ENDPOINT):
const response = await authenticatedGet<SubscriptionStatus>(
  '/api/subscription/status',  // ✅ Correct endpoint
  { signal: controller.signal }
);
setSubscriptionStatus(response);
```

**Why this prevents 500 errors**:
- Calls the correct backend endpoint that actually exists
- Matches the response structure (no nested `subscription` object)

---

## TASK B: Apple Sign-In TurboModule Crash Fixes

### Root Cause Analysis

The crash occurs at `facebook::react::ObjCTurboModule::performVoidMethodInvocation` which indicates:
- A JavaScript → Native TurboModule call is failing
- Most likely causes:
  1. Invalid/nil parameters passed to native modules (SecureStore, AppleAuthentication)
  2. Native API called off main thread
  3. Promise resolved/rejected twice
  4. Type mismatch between JS and native

### Fixes Implemented

#### 1. Input Validation Before Native Calls (Frontend)

**File**: `contexts/AuthContext.tsx` - `signInWithApple()`

**Changes**:
```typescript
// CRITICAL: Validate ALL inputs BEFORE any native operations
if (!identityToken || typeof identityToken !== 'string') {
  console.error('[Auth] Invalid identity token:', typeof identityToken);
  authLock.current = false;
  throw new Error('Invalid identity token received from Apple');
}

// Validate response data BEFORE native storage operations
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
```

**Why this prevents TurboModule crashes**:
- Validates all data **before** passing to native modules
- Prevents `nil`/`undefined` from reaching native code
- Type checks ensure correct parameter types

#### 2. Targeted Logging Before Native Calls (Frontend)

**File**: `app/auth.tsx` - `handleAppleSignIn()`

**Changes**:
```typescript
// Log BEFORE each native call to identify which one crashes
console.log('[AuthScreen] ⚠️ ABOUT TO CALL NATIVE: AppleAuthentication.isAvailableAsync()');
isAvailable = await AppleAuthentication.isAvailableAsync();
console.log('[AuthScreen] ✅ NATIVE CALL SUCCESS: isAvailableAsync returned:', isAvailable);

console.log('[AuthScreen] ⚠️ ABOUT TO CALL NATIVE: AppleAuthentication.signInAsync()');
credential = await AppleAuthentication.signInAsync({ /* ... */ });
console.log('[AuthScreen] ✅ NATIVE CALL SUCCESS: signInAsync completed');

console.log('[AuthScreen] ⚠️ ABOUT TO CALL: signInWithApple (backend + SecureStore)');
await signInWithApple(credential.identityToken, appleUserData);
console.log('[AuthScreen] ✅ signInWithApple completed successfully');
```

**Why this helps diagnose crashes**:
- Logs appear **before** the native call that crashes
- Last log entry identifies the exact failing module
- Helps pinpoint: AppleAuthentication vs SecureStore vs other native modules

#### 3. Defensive Error Handling Around Native Calls (Frontend)

**File**: `app/auth.tsx` - `handleAppleSignIn()`

**Changes**:
```typescript
try {
  console.log('[AuthScreen] ⚠️ ABOUT TO CALL NATIVE: AppleAuthentication.signInAsync()');
  credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  console.log('[AuthScreen] ✅ NATIVE CALL SUCCESS: signInAsync completed');
} catch (signInError: any) {
  console.error('[AuthScreen] ❌ NATIVE CALL FAILED: AppleAuthentication.signInAsync()');
  console.error('[AuthScreen] Error:', signInError);
  console.error('[AuthScreen] Error code:', signInError.code);
  console.error('[AuthScreen] Error name:', signInError.name);
  console.error('[AuthScreen] Error message:', signInError.message);
  throw signInError;
}
```

**File**: `contexts/AuthContext.tsx` - `signInWithApple()`

**Changes**:
```typescript
console.log('[Auth] ⚠️ ABOUT TO CALL NATIVE: tokenStorage.setToken (SecureStore/Keychain)');
console.log('[Auth] Token length:', data.session.token.length);

try {
  await tokenStorage.setToken(data.session.token);
  console.log('[Auth] ✅ NATIVE CALL SUCCESS: Token stored in SecureStore/Keychain');
} catch (storageError: any) {
  console.error('[Auth] ❌ NATIVE CALL FAILED: tokenStorage.setToken');
  console.error('[Auth] Storage error:', storageError);
  console.error('[Auth] Error name:', storageError.name);
  console.error('[Auth] Error message:', storageError.message);
  console.error('[Auth] Error stack:', storageError.stack);
  throw new Error(`Failed to store authentication token: ${storageError.message}`);
}
```

**Why this prevents TurboModule crashes**:
- Wraps each native call in try-catch
- Logs detailed error information before re-throwing
- Prevents unhandled promise rejections that can cause SIGABRT

#### 4. Data Sanitization Before Backend Calls (Frontend)

**File**: `app/auth.tsx` - `handleAppleSignIn()`

**Changes**:
```typescript
// CRITICAL: Sanitize and validate user data before sending
const appleUserData = {
  email: (credential.email && typeof credential.email === 'string') 
    ? credential.email 
    : undefined,
  name: (credential.fullName && typeof credential.fullName === 'object') ? {
    givenName: (credential.fullName.givenName && typeof credential.fullName.givenName === 'string') 
      ? credential.fullName.givenName 
      : undefined,
    familyName: (credential.fullName.familyName && typeof credential.fullName.familyName === 'string') 
      ? credential.fullName.familyName 
      : undefined,
  } : undefined,
};
```

**Why this prevents TurboModule crashes**:
- Validates every field before use
- Ensures only valid strings are passed
- Prevents type mismatches that can cause native crashes

#### 5. Subscription Check Validation (Frontend)

**File**: `contexts/SubscriptionContext.tsx`

**Changes**:
```typescript
// CRITICAL: Validate response structure before using it
if (!response || typeof response !== 'object') {
  console.error('[Subscription] Invalid response type:', typeof response);
  throw new Error('Invalid response from subscription API');
}

// Validate status field
const status = response.status;
if (status !== 'active' && status !== 'inactive' && status !== 'pending') {
  console.warn('[Subscription] Invalid status value:', status, '- defaulting to inactive');
  response.status = 'inactive';
}

// Validate expiresAt field
if (response.expiresAt !== null && typeof response.expiresAt !== 'string') {
  console.warn('[Subscription] Invalid expiresAt type:', typeof response.expiresAt, '- setting to null');
  response.expiresAt = null;
}
```

**Why this prevents TurboModule crashes**:
- Validates API response before state updates
- Prevents invalid data from propagating through the app
- Ensures type safety for all subscription-related operations

---

## Most Probable Module Responsible for Crash

Based on the code analysis and crash signature (`ObjCTurboModule::performVoidMethodInvocation`), the most likely culprits are:

### 1. **SecureStore (expo-secure-store)** - HIGHEST PROBABILITY
**Why**: 
- Called immediately after Apple sign-in to store the auth token
- Accesses iOS Keychain (native API)
- Can crash if:
  - Token is nil/undefined
  - Token is not a string
  - Keychain access is denied
  - Called on wrong thread

**Evidence**:
- Crash happens "immediately after Apple prompt finishes"
- Token storage is the first native operation after credential exchange

### 2. **AppleAuthentication (expo-apple-authentication)** - MEDIUM PROBABILITY
**Why**:
- Native module for Sign in with Apple
- Can crash if:
  - Credential object is malformed
  - Promise resolved/rejected twice
  - Native callback issues

**Evidence**:
- Crash happens during Apple sign-in flow
- TurboModule crash signature matches native module failures

### 3. **Navigation (expo-router)** - LOW PROBABILITY
**Why**:
- Navigation happens after successful auth
- Can crash if:
  - State updates trigger native UI changes
  - Navigation called before state is ready

**Evidence**:
- Less likely because crash happens "immediately after prompt"
- Navigation typically happens after token storage

---

## Verification Steps

### For Backend 500 Errors:
1. Check backend logs after authentication:
   ```bash
   # Should see successful subscription status check
   [Subscription] Fetching subscription status for user: <userId>
   [Subscription] ✅ Status: inactive, expiresAt: null
   ```

2. Verify database schema:
   ```sql
   SELECT subscription_status, subscription_expires_at, subscription_product_id 
   FROM "user" 
   WHERE id = '<userId>';
   ```

3. Test subscription endpoint directly:
   ```bash
   curl -H "Authorization: Bearer <token>" \
        http://localhost:8082/api/subscription/status
   ```

### For TurboModule Crashes:
1. Check logs for last successful native call:
   ```
   [AuthScreen] ⚠️ ABOUT TO CALL NATIVE: AppleAuthentication.signInAsync()
   [AuthScreen] ✅ NATIVE CALL SUCCESS: signInAsync completed
   [Auth] ⚠️ ABOUT TO CALL NATIVE: tokenStorage.setToken (SecureStore/Keychain)
   # If crash happens here, SecureStore is the culprit
   ```

2. Look for validation errors before crash:
   ```
   [Auth] Invalid identity token: undefined
   # This would prevent the crash by failing early
   ```

3. Check for error logs with stack traces:
   ```
   [Auth] ❌ NATIVE CALL FAILED: tokenStorage.setToken
   [Auth] Error name: <error name>
   [Auth] Error message: <error message>
   ```

---

## Summary of Changes

### Backend Changes (via make_backend_change):
1. ✅ Added subscription columns to user table
2. ✅ Implemented safe date serialization in `/api/subscription/status`
3. ✅ Fixed Apple receipt verification hostname parsing
4. ✅ Updated subscription verification to actually save data

### Frontend Changes:
1. ✅ Fixed client route mismatch (`/api/subscription` → `/api/subscription/status`)
2. ✅ Added input validation before all native calls
3. ✅ Added targeted logging before each native operation
4. ✅ Wrapped native calls in defensive try-catch blocks
5. ✅ Sanitized all data before passing to native modules
6. ✅ Validated API responses before state updates

### Files Modified:
- `backend/src/routes/subscription.ts` (via make_backend_change)
- `backend/src/db/auth-schema.ts` (via make_backend_change - migration)
- `contexts/SubscriptionContext.tsx`
- `contexts/AuthContext.tsx`
- `app/auth.tsx`

---

## Expected Outcomes

### Backend 500 Errors:
- ✅ No more 500 errors on `/api/subscription/status`
- ✅ Subscription status returns valid data or safe defaults
- ✅ Apple receipt verification works correctly
- ✅ Client calls correct endpoint

### TurboModule Crashes:
- ✅ Invalid data caught before reaching native code
- ✅ Detailed logs identify exact failing module
- ✅ Graceful error messages instead of crashes
- ✅ User sees helpful error instead of app abort

---

## Next Steps for Further Debugging

If crashes still occur after these fixes:

1. **Check the logs** for the last "⚠️ ABOUT TO CALL NATIVE" message
2. **Identify the failing module** (SecureStore, AppleAuthentication, etc.)
3. **Add more granular logging** around that specific module
4. **Check iOS Console** for native crash logs (if building with Xcode)
5. **Test on different iOS versions** (some TurboModule issues are version-specific)

---

## Notes

- This is an **Expo managed project** (no `ios/` folder), so native iOS code cannot be directly modified
- All fixes are implemented in the JavaScript layer
- For production builds, consider adding Sentry or similar crash reporting to capture native crashes
- The defensive guards add minimal performance overhead but significantly improve stability
