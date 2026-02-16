
# StoreKit Deployment Guide for SeaTime Tracker

This guide covers the complete setup for iOS App Store subscriptions using native StoreKit.

## Overview

SeaTime Tracker uses **native iOS StoreKit** for in-app purchases and subscriptions. The app handles:
- Monthly subscription: £4.99/€5.99 per month
- No free trial period
- Automatic renewal
- Receipt verification with Apple servers
- Backend subscription status management

## Product Configuration

### Product ID
```
com.forelandmarine.seatime.monthly
```

### Product Details
- **Type**: Auto-renewable subscription
- **Duration**: 1 month
- **Price**: £4.99 (UK), €5.99 (EU)
- **Trial Period**: None
- **Renewal**: Automatic

## App Store Connect Setup

### 1. Create In-App Purchase Product

1. Log in to [App Store Connect](https://appstoreconnect.apple.com)
2. Navigate to your app: **SeaTime Tracker**
3. Go to **Features** → **In-App Purchases**
4. Click **+** to create a new in-app purchase
5. Select **Auto-Renewable Subscription**

### 2. Configure Subscription Group

1. Create a new subscription group: **SeaTime Tracker Premium**
2. Add the subscription to this group

### 3. Configure Product Details

**Reference Name**: SeaTime Tracker Monthly Subscription

**Product ID**: `com.forelandmarine.seatime.monthly`

**Subscription Duration**: 1 month

**Subscription Prices**:
- UK (GBP): £4.99
- EU (EUR): €5.99
- US (USD): $5.99 (equivalent)

**Localized Information** (English - UK):
- **Display Name**: SeaTime Tracker Premium
- **Description**: Monthly subscription to SeaTime Tracker. Automatically track your sea time via AIS, generate MCA-compliant reports, and manage multiple vessels.

**Review Information**:
- **Screenshot**: Upload a screenshot of the subscription paywall screen
- **Review Notes**: "This subscription provides access to all premium features including automatic sea time tracking, MCA-compliant report generation, and cloud backup."

### 4. Configure App-Specific Shared Secret

1. In App Store Connect, go to **My Apps** → **SeaTime Tracker**
2. Navigate to **App Information** → **App-Specific Shared Secret**
3. Click **Generate** to create a new shared secret
4. **IMPORTANT**: Copy this secret and add it to your backend environment variables as `APPLE_APP_SECRET`

### 5. Enable Subscription Status URL (Webhook)

1. In App Store Connect, go to **My Apps** → **SeaTime Tracker**
2. Navigate to **App Information** → **Subscription Status URL**
3. Enter your backend webhook URL:
   ```
   https://uukpkcag4nsq8q632k643ztvus28frfe.app.specular.dev/api/subscription/webhook
   ```
4. This allows Apple to notify your backend of subscription changes (renewals, cancellations, etc.)

## Backend Configuration

### Environment Variables

Add the following to your backend environment:

```bash
APPLE_APP_SECRET=your_app_specific_shared_secret_here
```

This secret is used to verify receipts with Apple's servers.

### Endpoints

The backend already has the following endpoints configured:

1. **GET /api/subscription/status**
   - Returns current user's subscription status
   - Response: `{ status: 'active' | 'inactive', expiresAt: string | null, productId: string | null }`

2. **POST /api/subscription/verify**
   - Verifies iOS App Store receipt
   - Body: `{ receiptData: string, productId: string, isSandbox?: boolean }`
   - Response: `{ success: boolean, status: 'active' | 'inactive', expiresAt: string | null }`

3. **POST /api/subscription/webhook**
   - Handles App Store Server Notifications
   - Body: `{ notificationType: string, receiptData: string }`
   - Response: `{ success: boolean }`

4. **PATCH /api/subscription/pause-tracking**
   - Pauses vessel tracking when subscription expires
   - Response: `{ success: boolean, vesselsDeactivated: number }`

## Frontend Implementation

### StoreKit Integration

The app uses `expo-store-kit` for native iOS purchases:

**File**: `utils/storeKit.ts`

Key functions:
- `initializeStoreKit()` - Initialize StoreKit connection
- `getProductInfo()` - Fetch product details from App Store
- `purchaseSubscription()` - Handle subscription purchase
- `restorePurchases()` - Restore previous purchases
- `verifyReceiptWithBackend()` - Verify receipt with backend
- `completePurchaseFlow()` - Complete purchase + verification
- `completeRestoreFlow()` - Complete restore + verification

### Subscription Paywall

**File**: `app/subscription-paywall.tsx`

Features:
- Display subscription features and pricing
- Native iOS purchase flow
- Restore purchases button
- Check subscription status
- Manage subscription (opens iOS Settings)
- Sign out option

### Subscription Context

**File**: `contexts/SubscriptionContext.tsx`

Manages global subscription state:
- `subscriptionStatus` - Current subscription status
- `hasActiveSubscription` - Boolean flag for active subscription
- `checkSubscription()` - Refresh subscription status from backend
- `pauseTracking()` - Pause vessel tracking

## Testing

### Sandbox Testing

1. **Create Sandbox Test Account**:
   - Go to App Store Connect → **Users and Access** → **Sandbox Testers**
   - Create a new sandbox tester account
   - Use a unique email (e.g., `test@seatime.com`)

2. **Configure Device**:
   - On your iOS device, go to **Settings** → **App Store** → **Sandbox Account**
   - Sign in with your sandbox tester account

3. **Test Purchase Flow**:
   - Build and run the app on your device
   - Navigate to the subscription paywall
   - Tap "Subscribe Now"
   - Complete the purchase using your sandbox account
   - Verify the subscription is activated

4. **Test Restore Flow**:
   - Delete and reinstall the app
   - Sign in with the same user account
   - Tap "Restore Purchases"
   - Verify the subscription is restored

### Production Testing

1. **TestFlight**:
   - Upload a build to TestFlight
   - Invite internal testers
   - Test the full purchase flow with real payment methods
   - Verify receipt verification works correctly

2. **App Review**:
   - Submit the app for review with subscription enabled
   - Provide test account credentials in review notes
   - Include screenshots of the subscription paywall

## Deployment Checklist

### Pre-Deployment

- [ ] Product created in App Store Connect with correct ID: `com.forelandmarine.seatime.monthly`
- [ ] Subscription group configured
- [ ] Pricing set for all regions (£4.99/€5.99)
- [ ] Localized information added
- [ ] App-Specific Shared Secret generated and added to backend as `APPLE_APP_SECRET`
- [ ] Subscription Status URL configured in App Store Connect
- [ ] Sandbox testing completed successfully
- [ ] TestFlight testing completed successfully

### Deployment

- [ ] Build app with `eas build --platform ios --profile production`
- [ ] Submit to App Store with `eas submit --platform ios --profile production`
- [ ] Verify subscription product is visible in App Store Connect
- [ ] Monitor backend logs for receipt verification requests
- [ ] Test production purchase flow after app approval

### Post-Deployment

- [ ] Monitor subscription metrics in App Store Connect
- [ ] Check backend logs for any receipt verification errors
- [ ] Verify webhook notifications are being received
- [ ] Test subscription renewal after 1 month
- [ ] Test subscription cancellation flow

## Troubleshooting

### Receipt Verification Fails

**Issue**: Backend returns error when verifying receipt

**Solutions**:
1. Verify `APPLE_APP_SECRET` is correctly set in backend environment
2. Check if using correct environment (sandbox vs production)
3. Verify receipt data is base64-encoded
4. Check backend logs for detailed error messages

### Product Not Found

**Issue**: App cannot fetch product info from App Store

**Solutions**:
1. Verify product ID matches exactly: `com.forelandmarine.seatime.monthly`
2. Ensure product is approved in App Store Connect
3. Wait 24 hours after creating product (App Store propagation delay)
4. Check if app bundle ID matches App Store Connect

### Purchase Fails

**Issue**: User cannot complete purchase

**Solutions**:
1. Verify device can make payments: `StoreKit.canMakePaymentsAsync()`
2. Check if sandbox tester account is signed in (for testing)
3. Verify product is available in user's region
4. Check iOS device restrictions (parental controls)

### Subscription Not Activating

**Issue**: Purchase succeeds but subscription status remains inactive

**Solutions**:
1. Check backend logs for receipt verification errors
2. Verify receipt is being sent to backend correctly
3. Check if subscription expiration date is in the future
4. Manually call `checkSubscription()` to refresh status

## Support

For issues or questions:
- **Email**: support@forelandmarine.com
- **Backend Logs**: Check Specular dashboard for detailed error logs
- **Apple Documentation**: [In-App Purchase Programming Guide](https://developer.apple.com/in-app-purchase/)

## Additional Resources

- [App Store Connect Help](https://help.apple.com/app-store-connect/)
- [StoreKit Documentation](https://developer.apple.com/documentation/storekit)
- [Receipt Validation Guide](https://developer.apple.com/documentation/appstorereceipts/verifying_receipts_with_the_app_store)
- [Subscription Best Practices](https://developer.apple.com/app-store/subscriptions/)
