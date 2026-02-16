
# RevenueCat Integration Fix Guide

## Current Issues Identified

1. ❌ **Malformed app.json** - Duplicate entries and invalid JSON structure
2. ❌ **Placeholder API keys** - Using placeholder values instead of actual RevenueCat keys
3. ❌ **Native files not updated** - Need to run `expo prebuild` after fixing app.json

## Step-by-Step Fix Instructions

### Step 1: Get Your RevenueCat API Keys

1. Go to [RevenueCat Dashboard](https://app.revenuecat.com/)
2. Select your project: **SeaTime Tracker**
3. Navigate to **Settings** → **API Keys**
4. Copy your keys:
   - **iOS Key**: Starts with `appl_` (e.g., `appl_AbCdEfGhIjKlMnOpQrStUvWxYz`)
   - **Android Key**: Starts with `goog_` (e.g., `goog_AbCdEfGhIjKlMnOpQrStUvWxYz`)

### Step 2: Update app.json with Real API Keys

Open `app.json` and replace the placeholder keys in **TWO places**:

#### Location 1: In the `plugins` array
```json
[
  "./plugins/with-revenuecat",
  {
    "iosApiKey": "appl_YOUR_ACTUAL_IOS_KEY",
    "androidApiKey": "goog_YOUR_ACTUAL_ANDROID_KEY"
  }
]
```

#### Location 2: In the `extra` object
```json
"extra": {
  "revenueCat": {
    "iosApiKey": "appl_YOUR_ACTUAL_IOS_KEY",
    "androidApiKey": "goog_YOUR_ACTUAL_ANDROID_KEY"
  }
}
```

**IMPORTANT:** Both locations must have the **same keys**.

### Step 3: Configure Products in RevenueCat Dashboard

1. Go to **Products** in RevenueCat Dashboard
2. Create a product with identifier: `monthly`
3. Create an entitlement with identifier: `SeaTime Tracker Pro`
4. Link the `monthly` product to the `SeaTime Tracker Pro` entitlement

### Step 4: Configure App Store Connect / Google Play Console

#### For iOS (App Store Connect):
1. Go to [App Store Connect](https://appstoreconnect.apple.com/)
2. Select **SeaTime Tracker** app
3. Go to **Features** → **In-App Purchases**
4. Create a new **Auto-Renewable Subscription**:
   - Product ID: `monthly`
   - Reference Name: `SeaTime Tracker Pro Monthly`
   - Subscription Group: Create or select one
   - Price: Set your price
5. Submit for review

#### For Android (Google Play Console):
1. Go to [Google Play Console](https://play.google.com/console/)
2. Select **SeaTime Tracker** app
3. Go to **Monetize** → **Subscriptions**
4. Create a new subscription:
   - Product ID: `monthly`
   - Name: `SeaTime Tracker Pro Monthly`
   - Price: Set your price
5. Activate the subscription

### Step 5: Link Store Products to RevenueCat

1. In RevenueCat Dashboard, go to **Products**
2. For the `monthly` product:
   - Click **Configure**
   - Add **App Store** product ID: `monthly`
   - Add **Google Play** product ID: `monthly`
3. Save changes

### Step 6: Rebuild Native Projects

After updating app.json with real API keys, run:

```bash
# Clean existing native folders
rm -rf ios android

# Regenerate native projects with new configuration
npx expo prebuild --clean

# For iOS, install pods
cd ios && pod install && cd ..
```

### Step 7: Test the Integration

1. **Run the diagnostic screen:**
   - Navigate to `/revenuecat-diagnostic` in your app
   - Verify all checks are green ✅

2. **Test the paywall:**
   - Navigate to `/revenuecat-paywall`
   - Verify products are displayed
   - Test purchase flow (use sandbox account)

3. **Test subscription enforcement:**
   - Try accessing protected features
   - Verify paywall appears for non-subscribers

### Step 8: Test with Sandbox Accounts

#### iOS Sandbox Testing:
1. Go to **Settings** → **App Store** → **Sandbox Account**
2. Sign in with a sandbox test account
3. Make a test purchase in your app
4. Verify subscription activates

#### Android Sandbox Testing:
1. Add test accounts in Google Play Console
2. Install app via internal testing track
3. Make a test purchase
4. Verify subscription activates

## Verification Checklist

- [ ] app.json has valid JSON structure (no duplicates)
- [ ] Real RevenueCat API keys added (not placeholders)
- [ ] Keys added in both `plugins` and `extra` sections
- [ ] Products configured in RevenueCat Dashboard
- [ ] Products created in App Store Connect / Google Play Console
- [ ] Store products linked to RevenueCat
- [ ] `expo prebuild` run successfully
- [ ] Diagnostic screen shows all green checks
- [ ] Paywall displays products correctly
- [ ] Test purchase completes successfully
- [ ] Subscription status updates correctly

## Common Issues & Solutions

### Issue: "Invalid API Key" Error
**Solution:** Verify you copied the correct key from RevenueCat Dashboard. Keys should start with `appl_` (iOS) or `goog_` (Android).

### Issue: "No products available"
**Solution:** 
1. Verify products are configured in RevenueCat Dashboard
2. Verify products exist in App Store Connect / Google Play Console
3. Verify product IDs match exactly (case-sensitive)
4. Wait 24 hours for App Store Connect products to propagate

### Issue: Diagnostic shows "SDK Not Initialized"
**Solution:**
1. Verify app.json has correct structure
2. Run `expo prebuild --clean` to regenerate native files
3. Restart the app completely

### Issue: Purchase fails with "Product not found"
**Solution:**
1. Verify product ID in code matches RevenueCat Dashboard: `monthly`
2. Verify entitlement ID matches: `SeaTime Tracker Pro`
3. Check RevenueCat Dashboard logs for errors

## Testing Subscription Flow

1. **Open app** → Should show free tier
2. **Navigate to protected feature** → Should show paywall
3. **Tap "Subscribe"** → Should show products
4. **Complete purchase** → Should activate subscription
5. **Restart app** → Should maintain Pro status
6. **Check profile** → Should show Pro badge

## Support Resources

- [RevenueCat Documentation](https://docs.revenuecat.com/)
- [RevenueCat Expo Setup Guide](https://docs.revenuecat.com/docs/expo)
- [RevenueCat Dashboard](https://app.revenuecat.com/)
- [App Store Connect](https://appstoreconnect.apple.com/)
- [Google Play Console](https://play.google.com/console/)

## Next Steps After Fix

1. Test thoroughly with sandbox accounts
2. Submit app for review with in-app purchases
3. Monitor RevenueCat Dashboard for purchase events
4. Set up webhooks for subscription events (optional)
5. Configure subscription grace periods and trials (optional)
