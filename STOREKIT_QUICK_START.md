
# StoreKit Quick Start Guide

## What Changed

SeaTime Tracker now uses **native iOS App Store subscriptions** instead of Superwall. All subscription management is handled directly by Apple through the App Store.

## For Developers

### Key Files Updated:

1. **utils/storeKit.ts** - StoreKit integration utilities
   - Opens App Store for subscription
   - Manages subscription links
   - Handles receipt verification

2. **app/subscription-paywall.tsx** - Subscription paywall UI
   - Shows subscription features and pricing
   - "Subscribe Now" button opens App Store
   - "Check Subscription Status" verifies with backend
   - "Manage Subscription" opens iOS Settings

3. **app.json** - iOS configuration
   - Added StoreKit entitlements
   - Configured bundle identifier
   - Set build numbers

4. **contexts/SubscriptionContext.tsx** - Subscription state management
   - Checks subscription status on app launch
   - Provides `hasActiveSubscription` flag
   - Handles subscription verification

### How It Works:

```
User Flow:
1. User opens app → Checks authentication
2. If authenticated → Checks subscription status
3. If no subscription → Shows paywall
4. User taps "Subscribe Now" → Opens App Store
5. User completes purchase in App Store
6. User returns to app → Taps "Check Subscription Status"
7. Backend verifies with Apple → Updates status
8. User gains access to app
```

### Testing Locally:

1. **Sandbox Testing**:
   ```bash
   # Run the app in development mode
   npm run ios
   
   # Use a sandbox test account (create in App Store Connect)
   # Sign out of your Apple ID on the device
   # When prompted, sign in with sandbox account
   ```

2. **Check Logs**:
   ```bash
   # Frontend logs
   [StoreKit] Opening App Store subscription page
   [SubscriptionPaywall] User tapped Subscribe button
   [SubscriptionPaywall] Checking subscription status
   
   # Backend logs (check backend console)
   Verifying iOS App Store receipt
   Subscription verified and updated successfully
   ```

3. **Verify Backend**:
   - Ensure `APPLE_APP_SECRET` environment variable is set
   - Check backend logs for receipt verification
   - Test `/api/subscription/status` endpoint

### Important Notes:

1. **expo-store-kit v0.0.1**: This is an early version with limited API. The app uses App Store links instead of in-app purchase UI.

2. **No In-App Purchase UI**: Users are directed to the App Store to complete purchases. This is intentional due to expo-store-kit limitations.

3. **Backend Verification**: All receipt verification happens on the backend. The app just checks subscription status.

4. **Subscription Status**: Checked on app launch and when user taps "Check Subscription Status".

## For Users

### How to Subscribe:

1. Open SeaTime Tracker
2. Tap "Subscribe Now"
3. Complete purchase in App Store (£4.99/month)
4. Return to SeaTime Tracker
5. Tap "Check Subscription Status"
6. Start tracking your sea time!

### How to Manage Subscription:

1. Open iOS Settings
2. Tap your name at the top
3. Tap "Subscriptions"
4. Select "SeaTime Tracker"
5. Manage or cancel subscription

Or use the "Manage Subscription" button in the app.

## Deployment

### Before Submitting to App Store:

1. **Configure Product in App Store Connect**:
   - Product ID: `com.forelandmarine.seatime.monthly`
   - Price: £4.99/€5.99 per month
   - No trial period

2. **Set Backend Environment Variable**:
   ```bash
   APPLE_APP_SECRET=your_shared_secret_here
   ```

3. **Test in Sandbox**:
   - Create sandbox test account
   - Test full subscription flow
   - Verify receipt verification works

4. **Submit for Review**:
   - Include subscription information in App Store listing
   - Add screenshots showing subscription features
   - Update privacy policy

### After Approval:

1. Test production subscription flow
2. Monitor backend logs
3. Set up App Store Server Notifications webhook
4. Monitor subscription metrics in App Store Connect

## Troubleshooting

### "Cannot open App Store"
- Check internet connection
- Verify bundle identifier matches App Store Connect
- Ensure product is approved and available

### "No active subscription found"
- Wait a few moments after purchase
- Tap "Check Subscription Status" again
- Check backend logs for verification errors

### Receipt verification fails
- Verify `APPLE_APP_SECRET` is set correctly
- Check backend logs for detailed errors
- Ensure using correct environment (sandbox vs production)

## Support

Need help? Contact info@forelandmarine.com

## References

- [App Store Connect](https://appstoreconnect.apple.com)
- [Apple In-App Purchase Documentation](https://developer.apple.com/in-app-purchase/)
- [expo-store-kit Documentation](https://docs.expo.dev/versions/latest/sdk/store-kit/)
