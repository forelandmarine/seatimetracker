
# Apple StoreKit Compliance - Guideline 3.1.1

## Issue from Apple App Review

**Guideline 3.1.1 - Business - Payments - In-App Purchase**

Apple rejected the app because it was accessing paid digital content (subscriptions) purchased outside the app, but that content wasn't available to purchase using in-app purchase within the app.

## Solution Implemented

We have implemented **NATIVE in-app purchases** using `react-native-iap` to comply with Apple's Guideline 3.1.1.

### Key Changes

1. **Native StoreKit Integration**
   - Installed `react-native-iap` package
   - Implemented native purchase flow in `utils/storeKit.native.ts`
   - Users can now purchase subscriptions WITHIN the app using the native iOS payment sheet

2. **Updated Subscription Paywall**
   - Changed from external App Store links to native in-app purchases
   - Users tap "Subscribe Now" → Native iOS payment sheet appears
   - Purchase completes within the app (no external navigation)
   - Receipt verification happens automatically with backend

3. **App Configuration**
   - Added StoreKit entitlement to `app.json`:
     ```json
     "ios": {
       "entitlements": {
         "com.apple.developer.in-app-payments": []
       }
     }
     ```
   - Incremented build number to 1.0.5

4. **Performance Optimization**
   - StoreKit initialization has 2-second timeout (prevents blocking)
   - Product info fetch has 2-second timeout
   - Does NOT block app authentication or navigation
   - User can still purchase even if price fetch times out

## How It Works

### Purchase Flow

1. **User taps "Subscribe Now"**
   - App calls `StoreKitUtils.completePurchaseFlow()`
   - Native iOS payment sheet appears

2. **User completes purchase**
   - Uses Apple Pay or Apple ID
   - Purchase happens within the app (NOT external)
   - StoreKit provides receipt automatically

3. **Receipt verification**
   - App sends receipt to backend: `POST /api/subscription/verify`
   - Backend verifies with Apple servers using `APPLE_APP_SECRET`
   - Backend updates user subscription status

4. **Access granted**
   - App checks subscription status
   - User is redirected to main app

### Restore Purchases Flow

1. **User taps "Restore Purchases"**
   - App calls `StoreKitUtils.completeRestoreFlow()`
   - Retrieves previous purchases from StoreKit

2. **Receipt verification**
   - Same as purchase flow
   - Backend verifies and updates status

3. **Access granted**
   - User is redirected to main app

## Technical Implementation

### Files Modified

1. **`app/subscription-paywall.tsx`**
   - Changed `handleSubscribe()` to use native purchase flow
   - Added `handleRestorePurchases()` function
   - Updated UI text to reflect native purchases
   - Removed "Check Subscription Status" button (no longer needed)

2. **`utils/storeKit.native.ts`**
   - Implements native StoreKit integration using `react-native-iap`
   - Functions:
     - `initializeStoreKit()` - Initialize connection to App Store
     - `getProductInfo()` - Fetch pricing in user's local currency
     - `purchaseSubscription()` - Open native payment sheet
     - `restorePurchases()` - Restore previous purchases
     - `verifyReceiptWithBackend()` - Verify receipt with backend
     - `completePurchaseFlow()` - Complete purchase + verification
     - `completeRestoreFlow()` - Complete restore + verification

3. **`utils/storeKit.ts`**
   - Web/fallback version (no changes to functionality)
   - Maintains compatibility for web preview

4. **`app.json`**
   - Added StoreKit entitlement
   - Incremented build number to 1.0.5

### Backend Integration

The backend already has the necessary endpoints:

- `POST /api/subscription/verify` - Verify iOS App Store receipt
  - Accepts: `{ receiptData, productId, isSandbox }`
  - Verifies with Apple servers using `APPLE_APP_SECRET`
  - Updates user subscription status
  - Returns: `{ success, status, expiresAt }`

- `GET /api/subscription/status` - Get current subscription status
  - Returns: `{ status, expiresAt, productId }`

## Product Configuration

### App Store Connect

- **Product ID**: `com.forelandmarine.seatimetracker.monthly`
- **Type**: Auto-renewable subscription
- **Duration**: 1 month
- **Price**: Set in App Store Connect (fetched dynamically by app)

### Environment Variables

Backend requires:
- `APPLE_APP_SECRET` - Shared secret from App Store Connect for receipt verification

## Testing

### Sandbox Testing

1. Create a sandbox test account in App Store Connect
2. Sign out of production Apple ID on test device
3. Run the app in development mode
4. Tap "Subscribe Now"
5. Sign in with sandbox test account when prompted
6. Complete purchase (no actual charge)
7. Verify subscription is active

### Production Testing

1. Submit build to TestFlight
2. Install via TestFlight
3. Test purchase flow with real Apple ID
4. Verify receipt verification works
5. Test restore purchases

## Compliance Checklist

✅ **In-app purchase available within the app**
- Users can purchase subscriptions using native iOS payment sheet
- No external links required for purchase

✅ **Pricing displayed in user's local currency**
- Fetched from App Store in real-time
- Never hardcoded

✅ **Receipt verification**
- Backend verifies with Apple servers
- Subscription status updated automatically

✅ **Restore purchases**
- Users can restore previous purchases
- Required by Apple for subscription apps

✅ **Subscription management**
- Users can manage subscriptions in iOS Settings
- Link provided in app

✅ **Performance**
- StoreKit initialization does not block app loading
- 2-second timeouts prevent hanging
- User experience remains fast

## What Changed from Previous Implementation

### Before (Non-Compliant)
- Used external App Store links
- Users had to leave the app to subscribe
- Required "Check Subscription Status" button after subscribing
- Violated Guideline 3.1.1

### After (Compliant)
- Uses native in-app purchases
- Users complete purchase within the app
- Automatic receipt verification
- Complies with Guideline 3.1.1

## Next Steps for Deployment

1. **Update App Store Connect**
   - Ensure product `com.forelandmarine.seatimetracker.monthly` is configured
   - Set pricing for all regions
   - Add subscription description

2. **Configure Backend**
   - Set `APPLE_APP_SECRET` environment variable
   - Verify receipt verification endpoint works

3. **Build and Submit**
   - Run `eas build --platform ios --profile production`
   - Submit to App Store Review
   - Reference this compliance fix in review notes

4. **Review Notes for Apple**
   ```
   We have implemented native in-app purchases using StoreKit to comply with Guideline 3.1.1.
   
   Users can now purchase subscriptions directly within the app using the native iOS payment sheet.
   
   To test:
   1. Launch the app
   2. Sign in or create an account
   3. Tap "Subscribe Now" on the subscription screen
   4. Complete purchase using sandbox test account
   5. Subscription is verified and access is granted immediately
   
   Product ID: com.forelandmarine.seatimetracker.monthly
   ```

## Support

If you encounter issues:
- Check backend logs for receipt verification errors
- Verify `APPLE_APP_SECRET` is set correctly
- Ensure product is configured in App Store Connect
- Test with sandbox account first

For questions, contact: info@forelandmarine.com
