
# iOS TurboModule Crash Fix Guide

## Problem Summary

**Crash Signature:**
```
EXC_CRASH (SIGABRT) Abort trap 6
Stack: facebook::react::ObjCTurboModule::performVoidMethodInvocation(...) (RCTTurboModule.mm:441)
```

**When:** Immediately after completing/dismissing Apple "update your Apple ID" prompt during Sign in with Apple flow.

**Root Cause:** A JavaScript → native TurboModule method invocation throws an Objective-C exception, causing React Native to abort with SIGABRT.

---

## Fixes Implemented

### A) Backend Fix - Email/Password 500 Error

**File:** `backend/src/routes/subscription.ts`

**Problem:** 
- `/api/subscription/status` endpoint crashes with `TypeError: Cannot read property 'toISOString' of undefined`
- Database `user` table missing `subscription_expires_at` column
- Code tries to call `.toISOString()` on `undefined` → HTTP 500

**Fix:**
```typescript
// BEFORE (crashes):
expiresAt: expiresAt ? expiresAt.toISOString() : null,

// AFTER (safe):
const subscriptionExpiresAt = (user as any).subscription_expires_at;
let expiresAtISO: string | null = null;
if (subscriptionExpiresAt) {
  try {
    const expiresDate = subscriptionExpiresAt instanceof Date 
      ? subscriptionExpiresAt 
      : new Date(subscriptionExpiresAt);
    
    if (!isNaN(expiresDate.getTime())) {
      expiresAtISO = expiresDate.toISOString();
    }
  } catch (dateError) {
    app.logger.error({ err: dateError }, "Error converting date");
  }
}
```

**Result:** Email/password sign-in no longer returns HTTP 500.

---

### B) iOS Instrumentation - Exception Handlers

**Files Created:**
- `ios/SeaTimeTracker/AppDelegate+ExceptionHandling.h`
- `ios/SeaTimeTracker/AppDelegate+ExceptionHandling.m`

**File Modified:**
- `ios/SeaTimeTracker/AppDelegate.mm`

**What It Does:**
1. **`NSSetUncaughtExceptionHandler`** - Captures Objective-C exceptions BEFORE SIGABRT
2. **`RCTSetFatalHandler`** - Captures React Native fatal errors with full context

**Output:** Detailed logs showing:
- Exception name and reason
- Call stack symbols
- Module name and selector being invoked (if available)
- User info dictionary

**How to Use:**
1. Rebuild iOS app: `npx expo run:ios`
2. Trigger Apple Sign-In crash
3. Check Xcode console for detailed exception logs
4. Look for lines starting with `🚨 CAUGHT OBJECTIVE-C EXCEPTION`

---

### C) Frontend Defensive Coding

**File:** `contexts/AuthContext.tsx` (already has good error handling)

**Key Protections:**
- ✅ Try-catch around all native module calls
- ✅ Timeout protection (10 seconds max for sign-in)
- ✅ Null checks before accessing Apple credential fields
- ✅ Graceful error messages for user

**File:** `app/_layout.tsx`

**Key Protections:**
- ✅ Delayed native module loading (2+ seconds after app mount)
- ✅ Modules loaded in sequence with delays between each
- ✅ Try-catch around all module imports
- ✅ Non-blocking failures (app continues if module fails)

---

## Debugging Workflow

### Step 1: Capture the Exception

1. Install the instrumentation (files above)
2. Rebuild iOS app
3. Trigger the crash (Sign in with Apple → complete prompt)
4. **Check Xcode console immediately** for exception details

### Step 2: Identify the Culprit

Look for these patterns in the exception:

**Pattern 1: UI API on Background Thread**
```
Exception: UIKit must be called from main thread
Module: RCTStoreKit / RCTKeychain / RCTNavigation
```
**Fix:** Wrap native calls in `dispatch_async(dispatch_get_main_queue(), ^{ ... })`

**Pattern 2: Nil to Nonnull Parameter**
```
Exception: NSInvalidArgumentException
Reason: *** -[__NSPlaceholderDictionary initWithObjects:forKeys:count:]: attempt to insert nil object
```
**Fix:** Add nil checks in native module before passing to APIs

**Pattern 3: Promise Contract Violation**
```
Exception: Promise already resolved/rejected
Module: RCTAppleAuthentication
```
**Fix:** Ensure promise is only resolved/rejected once

**Pattern 4: Type Mismatch**
```
Exception: NSInvalidArgumentException
Reason: Expected NSString, got NSNull
```
**Fix:** Add type validation in native module

### Step 3: Apply Targeted Fix

Once you identify the failing module/method from the exception logs:

**Option A: Fix the Native Module**

Example for StoreKit calling UI API on wrong thread:

```objective-c
// BEFORE (crashes):
RCT_EXPORT_METHOD(purchaseProduct:(NSString *)productId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    SKPayment *payment = [SKPayment paymentWithProductIdentifier:productId];
    [[SKPaymentQueue defaultQueue] addPayment:payment]; // ❌ UI API on background thread
}

// AFTER (safe):
RCT_EXPORT_METHOD(purchaseProduct:(NSString *)productId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    @try {
        if (!productId) {
            reject(@"E_INVALID_PARAM", @"Product ID cannot be nil", nil);
            return;
        }
        
        // ✅ Dispatch to main thread
        dispatch_async(dispatch_get_main_queue(), ^{
            @try {
                SKPayment *payment = [SKPayment paymentWithProductIdentifier:productId];
                [[SKPaymentQueue defaultQueue] addPayment:payment];
                resolve(@YES);
            } @catch (NSException *mainThreadException) {
                reject(@"E_PURCHASE_FAILED", mainThreadException.reason, nil);
            }
        });
    } @catch (NSException *exception) {
        reject(@"E_NATIVE_CRASH", exception.reason, nil);
    }
}
```

**Option B: Binary Search to Isolate**

If you can't identify the exact module, use binary search:

1. Comment out half of the post-login operations
2. Test if crash still occurs
3. Narrow down to the specific operation
4. Apply fix to that operation only

---

## Common TurboModule Crash Causes

### 1. StoreKit (Subscription/IAP)

**Symptoms:**
- Crash after Apple sign-in
- Crash when checking subscription status
- Crash when restoring purchases

**Common Issues:**
- `SKPaymentQueue` accessed from background thread
- `SKProductsRequest` delegate methods not on main thread
- Receipt validation blocking main thread

**Fixes:**
- Wrap all StoreKit calls in `dispatch_async(dispatch_get_main_queue(), ^{ ... })`
- Add `@try/@catch` around all StoreKit operations
- Validate receipt asynchronously

### 2. Keychain (Secure Storage)

**Symptoms:**
- Crash when saving credentials
- Crash when reading biometric data

**Common Issues:**
- Keychain access on background thread
- Nil values passed to keychain attributes
- Keychain access group misconfigured

**Fixes:**
- Dispatch keychain operations to main thread
- Add nil checks before keychain operations
- Verify keychain access group in entitlements

### 3. Navigation (React Navigation / Expo Router)

**Symptoms:**
- Crash immediately after sign-in
- Crash when navigating to home screen

**Common Issues:**
- Navigation called before React Native bridge ready
- Multiple navigation calls in quick succession
- Navigation from background thread

**Fixes:**
- Add delay before navigation (100-200ms)
- Use `setTimeout` to ensure state updates complete
- Wrap navigation in try-catch

### 4. Apple Authentication

**Symptoms:**
- Crash after completing Apple ID prompt
- Crash when accessing credential fields

**Common Issues:**
- Accessing `fullName` or `email` when nil
- Passing nil identity token to backend
- Promise resolved multiple times

**Fixes:**
- Check for nil before accessing credential fields
- Validate identity token exists before sending
- Ensure promise only resolved once

---

## Testing Checklist

After applying fixes, test these scenarios:

- [ ] Email/password sign-in (should not return 500)
- [ ] Apple Sign-In with new account (first time)
- [ ] Apple Sign-In with existing account (returning user)
- [ ] Apple Sign-In with "Hide My Email" enabled
- [ ] Apple Sign-In cancellation (should not crash)
- [ ] Sign-out and sign-in again
- [ ] Background app and return during Apple prompt
- [ ] Airplane mode during sign-in (network error handling)

---

## Verification

**Email/Password 500 Fixed:**
```bash
# Check backend logs after sign-in
# Should see: "Subscription status retrieved successfully"
# Should NOT see: "TypeError: Cannot read property 'toISOString' of undefined"
```

**Apple Sign-In Crash Fixed:**
```bash
# Check Xcode console after Apple sign-in
# Should see: "Apple authentication successful"
# Should NOT see: "CAUGHT OBJECTIVE-C EXCEPTION" or "SIGABRT"
```

---

## Next Steps if Crash Persists

1. **Capture Full Exception Details:**
   - Run app in Xcode
   - Trigger crash
   - Copy full exception log from console
   - Look for module name and selector

2. **Disable Modules One by One:**
   - Comment out StoreKit initialization
   - Comment out keychain operations
   - Comment out widget updates
   - Test after each change

3. **Check React Native Version:**
   - Ensure using React Native 0.81.5 (matches package.json)
   - Check if New Architecture is enabled
   - Try disabling New Architecture temporarily for diagnosis

4. **Review Native Dependencies:**
   - Check `ios/Podfile.lock` for version conflicts
   - Run `cd ios && pod install --repo-update`
   - Check for deprecated APIs in native modules

---

## Summary

**Email/Password 500:** ✅ FIXED - Safe date conversion in subscription endpoint

**Apple Sign-In Crash:** 🔧 INSTRUMENTED - Exception handlers will reveal exact cause

**Next Action:** Rebuild iOS app, trigger crash, check Xcode console for detailed exception logs showing the exact failing module/method.

---

## Contact

If crash persists after applying these fixes and reviewing exception logs, provide:
1. Full exception log from Xcode console
2. Module name and selector from exception
3. Steps to reproduce
4. iOS version and device model
