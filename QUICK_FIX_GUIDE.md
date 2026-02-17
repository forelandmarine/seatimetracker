
# Quick Fix Guide - Apple IAP Compliance

## What Changed?
The app now uses **native in-app purchases** instead of external App Store links.

## What You Need to Do

### 1. Update app.json (REQUIRED)
Open `app.json` and update the iOS section:

```json
"ios": {
  "supportsTablet": true,
  "bundleIdentifier": "com.forelandmarine.seatimetracker",
  "appleTeamId": "43GZCFFPR9",
  "buildNumber": "1.0.5",  // ← ADD THIS (increment from 1.0.4)
  "infoPlist": {
    "ITSAppUsesNonExemptEncryption": false
  },
  "entitlements": {  // ← ADD THIS ENTIRE SECTION
    "com.apple.developer.in-app-payments": []
  }
}
```

### 2. Test the Changes

#### Install Dependencies (Already Done):
```bash
npm install react-native-iap
```

#### Run the App:
```bash
npm run ios
```

#### Test Flow:
1. Open app → Should show paywall
2. Check that pricing displays (e.g., "£4.99 per month")
3. Tap "Subscribe Now" → Native iOS purchase sheet should appear
4. Use sandbox test account to complete purchase
5. Verify subscription activates immediately

### 3. Build and Submit

#### Build for TestFlight:
```bash
eas build --platform ios --profile production
```

#### Submit to App Store:
```bash
eas submit --platform ios --profile production
```

#### Response to Apple:
When resubmitting, include this message:

> "We have implemented native in-app purchases using StoreKit to comply with Guideline 3.1.1. Users can now subscribe directly within the app using Apple's native payment system. The subscription is processed through StoreKit, and receipts are verified with Apple's servers. Users can also restore previous purchases using the 'Restore Purchase' button."

## What's Different for Users?

### Before (Rejected):
1. Tap "Subscribe Now"
2. App opens Safari/App Store
3. User subscribes externally
4. User returns to app manually
5. User taps "Check Subscription Status"

### After (Compliant):
1. Tap "Subscribe Now"
2. Native iOS purchase sheet appears **in the app**
3. User completes purchase with Apple Pay/Apple ID
4. Subscription activates **immediately**
5. User gains access **automatically**

## Files Changed
- ✅ `utils/storeKit.ts` - Complete rewrite with native IAP
- ✅ `app/subscription-paywall.tsx` - Updated UI with native purchase
- ⚠️ `app.json` - **YOU MUST UPDATE THIS MANUALLY** (see above)

## Troubleshooting

### "No products found"
- Ensure product is configured in App Store Connect
- Product ID: `com.forelandmarine.seatime.monthly`
- Product must be approved and available

### "Purchase failed"
- Check you're using a sandbox test account
- Sign out of your Apple ID on device
- Use sandbox tester credentials when prompted

### "Receipt verification failed"
- Check backend has `APPLE_APP_SECRET` environment variable
- Verify backend is running and accessible
- Check backend logs for detailed error

## Need Help?
- Check `APPLE_IAP_COMPLIANCE_FIX.md` for full details
- Email: info@forelandmarine.com
- Review backend logs: `/api/subscription/verify`
