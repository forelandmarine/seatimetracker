
# iOS TestFlight Crash Fix - RevenueCat API Key Issue

## Problem Summary
The app was crashing immediately on launch in TestFlight (build 1.0.4/105) with:
- **Exception:** `EXC_BREAKPOINT (SIGTRAP)` - "Trace/BPT trap: 5"
- **Location:** `Configuration.swift:493` in `checkForSimulatedStoreAPIKeyInRelease()`
- **Cause:** RevenueCat SDK detected a test/simulated API key (`test_gKMHKEpYSkTiLUtgKWHRbAXGcGd`) in a Release build and deliberately crashed with `fatalError()`

## Root Cause
TestFlight builds are compiled as **Release** configuration, but the app was configured with a **test store API key**. RevenueCat's native SDK has a safety check that prevents test keys from being used in production/release builds to avoid accidental App Store submissions with test credentials.

## Solution
Replaced the test API key with the **production iOS API key** in all configuration locations:

### Files Updated:
1. **app.json** - Updated both locations:
   - `plugins.with-revenuecat.iosApiKey`: `appl_JGAVizuUPjFzvacGxciCepqaqAJ`
   - `extra.revenueCat.iosApiKey`: `appl_JGAVizuUPjFzvacGxciCepqaqAJ`

2. **contexts/SubscriptionContext.tsx** - Enhanced logging for debugging

3. **config/revenuecat.ts** - Added validation for test vs production keys

## Key Changes

### Before (Causing Crash):
```json
{
  "plugins": [
    ["./plugins/with-revenuecat", {
      "iosApiKey": "test_gKMHKEpYSkTiLUtgKWHRbAXGcGd"  // ❌ Test key in Release build
    }]
  ],
  "extra": {
    "revenueCat": {
      "iosApiKey": "test_gKMHKEpYSkTiLUtgKWHRbAXGcGd"  // ❌ Test key
    }
  }
}
```

### After (Fixed):
```json
{
  "plugins": [
    ["./plugins/with-revenuecat", {
      "iosApiKey": "appl_JGAVizuUPjFzvacGxciCepqaqAJ"  // ✅ Production key
    }]
  ],
  "extra": {
    "revenueCat": {
      "iosApiKey": "appl_JGAVizuUPjFzvacGxciCepqaqAJ"  // ✅ Production key
    }
  }
}
```

## How RevenueCat API Keys Work

### Key Prefixes:
- **`test_`** - Test/Sandbox keys (Expo Go, development, simulator)
  - ❌ **BLOCKED** in Release/TestFlight/App Store builds
  - ✅ **ALLOWED** in Debug builds and Expo Go
  
- **`appl_`** - Production iOS keys
  - ✅ **ALLOWED** in all builds (Debug, Release, TestFlight, App Store)
  - Works with both sandbox and production App Store environments
  
- **`goog_`** - Production Android keys
  - ✅ **ALLOWED** in all builds

### Why the Crash Happened:
1. TestFlight builds use **Release** configuration (same as App Store)
2. RevenueCat SDK checks if running in Release mode
3. If Release mode + test key detected → `fatalError()` crash
4. This is intentional to prevent accidentally shipping test keys to production

## Next Steps

### For Next Build:
1. **Rebuild the app** with the updated configuration:
   ```bash
   npx expo prebuild --clean
   eas build --platform ios --profile production
   ```

2. **Verify the fix** in TestFlight:
   - App should launch successfully
   - Check logs for: `[RevenueCat] API Key prefix: appl_JGAViz...`
   - Subscription features should work normally

### For Development:
- **Local development** can continue using test keys in Expo Go
- **TestFlight/App Store** must use production keys (`appl_` prefix)
- The plugin automatically injects the correct key based on build type

## Testing Checklist
- [ ] App launches successfully in TestFlight
- [ ] No crash on startup
- [ ] Paywall screen displays correctly
- [ ] Subscription purchases work
- [ ] Restore purchases works
- [ ] Check logs for RevenueCat initialization success

## Additional Notes
- The production key `appl_JGAVizuUPjFzvacGxciCepqaqAJ` works in both:
  - **Sandbox environment** (TestFlight, development)
  - **Production environment** (App Store)
- No need for separate keys for TestFlight vs App Store
- The key is safely embedded in the native app bundle (Info.plist)

## Verification
After deploying the new build to TestFlight:
1. Install the app from TestFlight
2. Launch the app
3. App should start normally without crashing
4. Navigate to the paywall to verify subscription features work
5. Check device logs for successful RevenueCat initialization

## References
- RevenueCat Documentation: https://www.revenuecat.com/docs/getting-started
- API Key Management: https://www.revenuecat.com/docs/authentication
- TestFlight Best Practices: https://www.revenuecat.com/docs/ios-app-store
