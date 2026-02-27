
# Apple In-App Purchase Compliance Fix

## Issue
Apple rejected the app with Guideline 3.1.1 violation because the app only allows external subscription purchases (via App Store links) but does not offer native in-app purchases.

## Solution Implemented
Implemented **native StoreKit in-app purchases** using `react-native-iap` to comply with Apple's Guideline 3.1.1.

## Changes Made

### 1. Dependencies Added
- **react-native-iap** (v14.7.7) - Native StoreKit integration for iOS in-app purchases

### 2. Updated Files

#### `utils/storeKit.ts` - Complete Rewrite
- **Before**: Only opened App Store links for external purchases
- **After**: Implements native in-app purchase using react-native-iap
- **Key Functions**:
  - `initializeStoreKit()` - Connects to App Store
  - `getProductInfo()` - Fetches real-time pricing in user's local currency
  - `purchaseSubscription()` - Opens native iOS purchase sheet
  - `restorePurchases()` - Restores previous purchases (required by Apple)
  - `completePurchaseFlow()` - Purchase + verify with backend
  - `completeRestoreFlow()` - Restore + verify with backend

#### `app/subscription-paywall.tsx` - Major Update
- **Before**: "Subscribe Now" button opened App Store externally
- **After**: "Subscribe Now" button triggers native in-app purchase
- **New Features**:
  - Displays real-time pricing from App Store in user's local currency
  - Shows pricing card with monthly subscription cost
  - "Restore Purchase" button for users who already subscribed
  - Native iOS purchase sheet appears when user taps "Subscribe Now"
  - Automatic receipt verification with backend after purchase

### 3. Required app.json Changes
**IMPORTANT**: The following changes need to be manually added to `app.json`:

```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.forelandmarine.seatimetracker",
      "appleTeamId": "43GZCFFPR9",
      "buildNumber": "1.0.5",
      "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      },
      "entitlements": {
        "com.apple.developer.in-app-payments": []
      }
    }
  }
}
```

**Changes**:
- Added `"buildNumber": "1.0.5"` (increment for new build)
- Added `"entitlements"` with `"com.apple.developer.in-app-payments": []` (required for StoreKit)

## User Flow (New)

### Subscription Flow:
1. User opens app without subscription → Redirected to paywall
2. User sees pricing card with real-time price (e.g., "£4.99 per month")
3. User taps "Subscribe Now" → **Native iOS purchase sheet appears**
4. User completes purchase using Apple Pay or Apple ID
5. App receives receipt from StoreKit automatically
6. App sends receipt to backend for verification
7. Backend verifies with Apple servers
8. User gains immediate access to app

### Restore Flow:
1. User who previously subscribed taps "Restore Purchase"
2. App fetches previous purchases from StoreKit
3. App verifies receipt with backend
4. User gains access if subscription is still active

## Compliance with Apple Guidelines

### ✅ Guideline 3.1.1 - In-App Purchase
- **Before**: ❌ Only external App Store links (violation)
- **After**: ✅ Native in-app purchase using StoreKit

### ✅ Guideline 3.1.3(b) - Multiplatform Services
- App now offers in-app purchase as primary method
- Users can also manage subscriptions via iOS Settings (standard Apple flow)

### ✅ Required Features
- ✅ Native in-app purchase using StoreKit
- ✅ Real-time pricing from App Store (no hardcoded prices)
- ✅ Restore purchases functionality (required by Apple)
- ✅ Receipt verification with Apple servers
- ✅ Subscription management via iOS Settings

## Backend (No Changes Required)
The backend already supports receipt verification:
- `POST /api/subscription/verify` - Verifies receipts with Apple servers
- Uses `APPLE_APP_SECRET` environment variable
- Returns subscription status and expiration date

## Testing Instructions

### Sandbox Testing:
1. Create a sandbox test account in App Store Connect:
   - Go to **Users and Access** → **Sandbox Testers**
   - Create a new tester account
2. Sign out of your Apple ID on the test device
3. Build and run the app in development mode
4. When prompted for Apple ID, use the sandbox tester account
5. Complete the subscription purchase (no actual charge)
6. Verify the subscription status in the app

### What to Test:
- [ ] Pricing displays correctly in local currency
- [ ] "Subscribe Now" opens native iOS purchase sheet
- [ ] Purchase completes successfully
- [ ] Receipt is verified with backend
- [ ] User gains immediate access after purchase
- [ ] "Restore Purchase" works for existing subscriptions
- [ ] Subscription status persists across app restarts

## App Store Connect Configuration

### Product Configuration (Already Done):
- **Product ID**: `com.forelandmarine.seatime.monthly`
- **Type**: Auto-renewable subscription
- **Price**: £4.99/€5.99 per month
- **Trial Period**: None
- **Subscription Group**: "SeaTime Tracker Subscriptions"

### Shared Secret (Already Configured):
- Backend has `APPLE_APP_SECRET` environment variable
- Used for receipt verification with Apple servers

## Deployment Checklist

### Before Submission:
- [x] Install react-native-iap dependency
- [x] Update utils/storeKit.ts with native in-app purchase
- [x] Update app/subscription-paywall.tsx with native purchase UI
- [ ] **MANUAL**: Add StoreKit entitlements to app.json (see above)
- [ ] **MANUAL**: Increment build number to 1.0.5
- [ ] Test subscription flow in sandbox
- [ ] Test restore purchases in sandbox
- [ ] Verify receipt verification works with backend

### After Approval:
- [ ] Test production subscription flow
- [ ] Monitor backend logs for receipt verification
- [ ] Test subscription renewal
- [ ] Test subscription cancellation
- [ ] Monitor user feedback

## Key Differences from Previous Implementation

| Feature | Before (Rejected) | After (Compliant) |
|---------|------------------|-------------------|
| Purchase Method | External App Store link | Native in-app purchase |
| Pricing Display | "Opens App Store" | Real-time price in local currency |
| Purchase UI | Redirects to App Store | Native iOS purchase sheet |
| User Experience | Leaves app, returns manually | Stays in app, seamless flow |
| Restore Purchases | "Check Subscription Status" | Dedicated "Restore Purchase" button |
| Apple Compliance | ❌ Violates 3.1.1 | ✅ Complies with 3.1.1 |

## Support

For issues or questions:
- Email: info@forelandmarine.com
- Check backend logs: `/api/subscription/status` and `/api/subscription/verify`
- Review Apple's [In-App Purchase documentation](https://developer.apple.com/in-app-purchase/)

## Important Notes

1. **Native In-App Purchase**: The app now uses native StoreKit for purchases, not external links.

2. **Real-Time Pricing**: Pricing is fetched from App Store and displayed in user's local currency.

3. **Receipt Verification**: The backend handles all receipt verification with Apple servers.

4. **Restore Purchases**: Required by Apple for subscription apps. Users can restore previous purchases.

5. **Seamless Experience**: Users never leave the app during the purchase flow.

6. **Compliance**: This implementation fully complies with Apple's Guideline 3.1.1.

## Next Steps

1. **MANUAL ACTION REQUIRED**: Add StoreKit entitlements to app.json (see section 3 above)
2. Build new version (1.0.5) with updated code
3. Test in sandbox environment
4. Submit to App Store for review
5. Respond to Apple's rejection with: "We have implemented native in-app purchases using StoreKit. Users can now subscribe directly within the app using Apple's native payment system."
