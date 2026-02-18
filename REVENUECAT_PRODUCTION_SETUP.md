
# RevenueCat Production API Key Setup

## 🚨 CRITICAL: TestFlight Crash Fix

Your app is crashing in TestFlight because it's using **test API keys** (`test_*`) in production builds. Test keys are only valid in development and cause native module crashes in TestFlight and App Store builds.

## ✅ Solution: Add Production API Keys

### Step 1: Get Your Production API Keys

1. Go to [RevenueCat Dashboard](https://app.revenuecat.com/)
2. Select your project: **SeaTime Tracker**
3. Navigate to **Settings** → **API Keys**
4. Copy your **production** API keys:
   - **iOS**: Starts with `appl_` (e.g., `appl_AbCdEfGhIjKlMnOpQrStUvWxYz`)
   - **Android**: Starts with `goog_` (e.g., `goog_AbCdEfGhIjKlMnOpQrStUvWxYz`)

⚠️ **DO NOT use test keys** (starting with `test_`) in production builds!

### Step 2: Update app.json

Replace the placeholder keys in `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "./plugins/with-revenuecat",
        {
          "iosApiKey": "appl_YOUR_ACTUAL_IOS_KEY_HERE",
          "androidApiKey": "goog_YOUR_ACTUAL_ANDROID_KEY_HERE"
        }
      ]
    ],
    "extra": {
      "revenueCat": {
        "iosApiKey": "appl_YOUR_ACTUAL_IOS_KEY_HERE",
        "androidApiKey": "goog_YOUR_ACTUAL_ANDROID_KEY_HERE"
      }
    }
  }
}
```

### Step 3: Rebuild and Submit

After updating the keys:

1. The app will automatically use production keys in TestFlight/App Store builds
2. Development builds will still work (production keys work everywhere)
3. The crash will be fixed

## 🔒 Security

- Production keys are safe to commit (they're public API keys)
- They only allow reading product info and making purchases
- They cannot access customer data or modify your RevenueCat configuration

## 🧪 Testing

### Development (Expo Go / Dev Client)
- Production keys work in development
- You can test with sandbox Apple/Google accounts

### TestFlight
- Production keys are **required**
- Test keys will cause crashes
- Use sandbox Apple accounts for testing

### Production (App Store / Google Play)
- Production keys are **required**
- Real purchases will be processed

## ✅ What's Fixed

The updated code now:

1. **Validates API keys** - Rejects test keys in production builds
2. **Prevents crashes** - Disables RevenueCat if invalid keys detected
3. **Thread-safe initialization** - Wraps all SDK calls to prevent JSI bridge corruption
4. **Clear error messages** - Logs exactly what's wrong if keys are invalid

## 📝 Current Status

- ❌ **Current keys**: `test_gKMHKEpYSkTiLUtgKWHRbAXGcGd` (TEST - causes crashes)
- ✅ **Required keys**: `appl_*` for iOS, `goog_*` for Android (PRODUCTION - works in TestFlight)

## 🆘 Need Help?

If you don't have production API keys:

1. Check your RevenueCat dashboard
2. Ensure you've created a project for SeaTime Tracker
3. Verify you have iOS and Android apps configured
4. Contact RevenueCat support if keys are missing

---

**Next Steps**: Update `app.json` with your production API keys and rebuild for TestFlight.
