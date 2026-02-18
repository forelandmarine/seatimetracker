
# StoreKit Deployment Guide - Complete Setup

## Overview
SeaTime Tracker uses **native iOS App Store subscriptions** managed directly by Apple. The app uses `expo-store-kit` v0.0.1 for basic StoreKit integration, but primarily directs users to the App Store for subscription management.

## Product Configuration

### App Store Connect Setup
1. **Product ID**: `com.forelandmarine.seatime.monthly`
2. **Type**: Auto-renewable subscription
3. **Price**: £4.99/€5.99 per month
4. **Trial Period**: None
5. **Subscription Group**: Create a new group called "SeaTime Tracker Subscriptions"

### Steps to Configure in App Store Connect:
1. Log in to [App Store Connect](https://appstoreconnect.apple.com)
2. Select your app (SeaTime Tracker)
3. Go to **Features** → **In-App Purchases**
4. Click **+** to create a new subscription
5. Select **Auto-Renewable Subscription**
6. Fill in the details:
   - **Reference Name**: SeaTime Tracker Monthly
   - **Product ID**: `com.forelandmarine.seatime.monthly`
   - **Subscription Group**: Create new group "SeaTime Tracker Subscriptions"
7. Set pricing:
   - **Base Territory**: United Kingdom
   - **Price**: £4.99
   - Add additional territories (e.g., Eurozone at €5.99)
8. Configure subscription duration: **1 month**
9. **Important**: Do NOT enable a free trial
10. Add localized descriptions and screenshots
11. Submit for review

## Backend Configuration

### Environment Variables
The backend needs the Apple App Store Shared Secret for receipt verification:

```bash
APPLE_APP_SECRET=your_shared_secret_here
```

### How to Get the Shared Secret:
1. Go to App Store Connect
2. Select your app
3. Go to **Features** → **In-App Purchases**
4. Click **App-Specific Shared Secret**
5. Generate or view the secret
6. Copy and add to your backend environment variables

### Backend Endpoints
The backend already has these endpoints configured:

- **GET /api/subscription/status** - Check user's subscription status
- **POST /api/subscription/verify** - Verify App Store receipt
- **POST /api/subscription/webhook** - Handle App Store Server Notifications
- **PATCH /api/subscription/pause-tracking** - Pause tracking when subscription expires

## iOS App Configuration

### app.json Updates
The `app.json` has been updated with:

```json
{
  "ios": {
    "bundleIdentifier": "com.forelandmarine.seatimetracker",
    "buildNumber": "1.0.4",
    "appleTeamId": "43GZCFFPR9",
    "entitlements": {
      "com.apple.developer.in-app-payments": [
        "merchant.com.forelandmarine.seatimetracker"
      ]
    }
  }
}
```

### StoreKit Implementation
The app uses a hybrid approach:

1. **Primary Method**: Direct users to App Store for subscription
   - Opens App Store subscription page
   - User completes purchase in App Store
   - User returns to app and checks subscription status

2. **Backend Verification**: Automatic receipt verification
   - iOS automatically sends receipts to the app
   - Backend verifies receipts with Apple servers
   - Subscription status is updated in database

## User Flow

### Subscription Flow:
1. User opens app without subscription → Redirected to paywall
2. User taps "Subscribe Now" → Opens App Store
3. User completes subscription in App Store (£4.99/month)
4. User returns to SeaTime Tracker
5. User taps "Check Subscription Status"
6. Backend verifies subscription with Apple
7. User gains access to app

### Subscription Management:
- Users manage subscriptions via iOS Settings → Apple ID → Subscriptions
- App provides "Manage Subscription" button that opens iOS Settings
- Subscriptions automatically renew monthly
- Users can cancel anytime (access continues until end of billing period)

## Testing

### Sandbox Testing:
1. Create a sandbox test account in App Store Connect:
   - Go to **Users and Access** → **Sandbox Testers**
   - Create a new tester account
2. Sign out of your Apple ID on the test device
3. Build and run the app in development mode
4. When prompted for Apple ID, use the sandbox tester account
5. Complete the subscription purchase (no actual charge)
6. Verify the subscription status in the app

### Production Testing:
1. Submit the app for TestFlight
2. Add internal testers
3. Test the full subscription flow
4. Verify receipt verification works correctly
5. Test subscription renewal and cancellation

## App Store Server Notifications

### Setup Webhook:
1. Go to App Store Connect
2. Select your app
3. Go to **Features** → **App Store Server Notifications**
4. Add your webhook URL: `https://uukpkcag4nsq8q632k643ztvus28frfe.app.specular.dev/api/subscription/webhook`
5. Select notification types:
   - INITIAL_BUY
   - RENEWAL
   - DID_RENEW
   - CANCEL
   - DID_CHANGE_RENEWAL_STATUS

This ensures the backend is notified of subscription changes automatically.

## Deployment Checklist

### Before Submission:
- [ ] Product configured in App Store Connect
- [ ] Shared secret added to backend environment variables
- [ ] App built with correct bundle identifier
- [ ] StoreKit entitlements added to app.json
- [ ] Tested subscription flow in sandbox
- [ ] Webhook URL configured in App Store Connect
- [ ] Privacy policy and terms of service updated
- [ ] App Store screenshots include subscription information

### After Approval:
- [ ] Test production subscription flow
- [ ] Monitor backend logs for receipt verification
- [ ] Verify webhook notifications are received
- [ ] Test subscription renewal
- [ ] Test subscription cancellation
- [ ] Monitor user feedback

## Troubleshooting

### Common Issues:

1. **"Cannot connect to App Store"**
   - Check internet connection
   - Verify bundle identifier matches App Store Connect
   - Ensure product is approved and available

2. **"No active subscription found"**
   - Wait a few moments after purchase (Apple processing time)
   - Tap "Check Subscription Status" again
   - Verify receipt verification is working in backend logs

3. **Receipt verification fails**
   - Check APPLE_APP_SECRET is set correctly
   - Verify using correct environment (sandbox vs production)
   - Check backend logs for detailed error messages

4. **Subscription not renewing**
   - Verify webhook is configured correctly
   - Check App Store Server Notifications are being received
   - Ensure backend is processing renewal notifications

## Support

For issues or questions:
- Email: info@forelandmarine.com
- Check backend logs: `/api/subscription/status` and `/api/subscription/verify`
- Review Apple's [In-App Purchase documentation](https://developer.apple.com/in-app-purchase/)

## Important Notes

1. **expo-store-kit v0.0.1 Limitations**: This is an early version with limited API surface. The app primarily uses App Store links for subscription management.

2. **Receipt Verification**: The backend handles all receipt verification with Apple servers. The app doesn't need to manually fetch or send receipts.

3. **Subscription Status**: The app checks subscription status on launch and when the user taps "Check Subscription Status". The backend maintains the authoritative subscription state.

4. **No Trial Period**: The subscription starts immediately upon purchase with no free trial.

5. **Cancellation**: Users can cancel anytime via iOS Settings. Access continues until the end of the current billing period.

## Next Steps

1. Complete App Store Connect product configuration
2. Add shared secret to backend environment
3. Test in sandbox environment
4. Submit app for review
5. Monitor subscription metrics in App Store Connect
