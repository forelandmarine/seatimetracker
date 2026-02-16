
# StoreKit 2 Integration Guide for SeaTime Tracker

## Overview

This document explains the StoreKit 2 in-app subscription implementation for SeaTime Tracker, following best practices from the RevenueCat StoreKit 2 tutorial and Apple's guidelines.

## Key Improvements Implemented

### 1. **Purchase Listeners (Critical)**
- **Problem**: Previous implementation didn't properly handle async purchase updates
- **Solution**: Implemented `purchaseUpdatedListener` and `purchaseErrorListener`
- **Benefit**: Handles purchases that complete after user leaves the screen, interrupted purchases, and background renewals

```typescript
StoreKitUtils.setupPurchaseListeners(
  // Success callback
  async (purchase) => {
    const result = await StoreKitUtils.processPurchase(purchase);
    if (result.success) {
      // Update UI and grant access
    }
  },
  // Error callback
  (error) => {
    // Handle purchase errors
  }
);
```

### 2. **Transaction Finishing (Critical)**
- **Problem**: Transactions weren't being finished, causing duplicate purchases
- **Solution**: Call `finishTransaction()` after successful verification
- **Benefit**: Tells Apple we've delivered the content, prevents duplicate charges

```typescript
export async function finishTransaction(purchase: Purchase): Promise<void> {
  await RNIap.finishTransaction({
    purchase,
    isConsumable: false, // Subscriptions are NOT consumable
  });
}
```

### 3. **Proper Purchase Flow**
The complete purchase flow now follows StoreKit 2 best practices:

1. **User taps Subscribe** → `purchaseSubscription()` called
2. **Native iOS sheet appears** → User completes purchase with Apple Pay/Apple ID
3. **Purchase listener triggered** → Receives purchase object automatically
4. **Verify receipt** → Send to backend for Apple verification
5. **Finish transaction** → Tell Apple we processed it
6. **Update UI** → Grant access to user

### 4. **Restore Purchases**
Properly implemented restore flow:
- Fetches all available purchases from App Store
- Finds subscription purchase
- Verifies with backend
- Finishes transaction
- Updates subscription status

### 5. **Error Handling**
Comprehensive error handling for all scenarios:
- User cancellation (don't show error)
- Network failures (show retry option)
- Invalid receipts (show contact support)
- Timeout errors (fail gracefully)

### 6. **iOS Entitlements**
Added critical entitlement to `app.json`:

```json
"ios": {
  "entitlements": {
    "com.apple.developer.in-app-payments": []
  }
}
```

This is **REQUIRED** for StoreKit to work. Without it, purchases will fail silently.

## Architecture

### Frontend (`utils/storeKit.native.ts`)
- Handles all StoreKit communication
- Manages purchase listeners
- Processes transactions
- Communicates with backend for verification

### Backend (`backend/src/routes/subscription.ts`)
- Verifies receipts with Apple servers
- Updates user subscription status
- Handles webhook notifications from Apple
- Manages subscription expiration

### UI (`app/subscription-paywall.tsx`)
- Displays subscription information
- Shows real-time pricing from App Store
- Handles purchase button taps
- Manages loading states
- Shows success/error messages

## Testing Checklist

### Sandbox Testing (Development)
1. **Setup**:
   - Create sandbox test account in App Store Connect
   - Sign out of real Apple ID on device
   - Sign in with sandbox account when prompted during purchase

2. **Test Scenarios**:
   - [ ] Fresh purchase (new user)
   - [ ] Restore purchases (existing subscription)
   - [ ] User cancellation (tap Cancel in payment sheet)
   - [ ] Interrupted purchase (close app during purchase)
   - [ ] Network failure (turn off WiFi during verification)
   - [ ] Expired subscription (wait for sandbox expiration)

3. **Verification**:
   - [ ] Receipt sent to backend
   - [ ] Backend verifies with Apple sandbox
   - [ ] User subscription status updated
   - [ ] Transaction finished properly
   - [ ] UI updates to show active subscription

### Production Testing
1. **TestFlight**:
   - [ ] Upload build to TestFlight
   - [ ] Test with real Apple ID (will be charged)
   - [ ] Verify production receipt verification works
   - [ ] Test restore purchases
   - [ ] Test subscription management in iOS Settings

2. **App Store Review**:
   - [ ] Provide test account credentials
   - [ ] Ensure "Restore Purchases" button is visible
   - [ ] Verify subscription management link works
   - [ ] Test all purchase flows

## Common Issues & Solutions

### Issue: "No products found"
**Cause**: Product not configured in App Store Connect or wrong product ID
**Solution**: 
1. Verify product ID matches: `com.forelandmarine.seatime.monthly`
2. Check product is "Ready to Submit" in App Store Connect
3. Wait 24 hours after creating product
4. Ensure app bundle ID matches

### Issue: "Purchase failed" with no error
**Cause**: Missing entitlements in app.json
**Solution**: Add `com.apple.developer.in-app-payments` entitlement and rebuild

### Issue: Duplicate purchases
**Cause**: Not finishing transactions
**Solution**: Ensure `finishTransaction()` is called after verification

### Issue: Purchases not restoring
**Cause**: Using different Apple ID or sandbox vs production mismatch
**Solution**: 
1. Verify same Apple ID used for purchase
2. Check sandbox vs production environment
3. Ensure receipt verification uses correct Apple endpoint

## Backend Configuration

### Required Environment Variables
```bash
APPLE_APP_SECRET=your_app_shared_secret_from_app_store_connect
```

Get this from:
1. App Store Connect
2. My Apps → Your App
3. App Information → App-Specific Shared Secret
4. Generate if not exists

### Receipt Verification Endpoints
- **Sandbox**: `https://sandbox.itunes.apple.com/verifyReceipt`
- **Production**: `https://buy.itunes.apple.com/verifyReceipt`

The backend automatically uses sandbox in development (`__DEV__`) and production in release builds.

## Compliance Checklist

### Apple Guideline 3.1.1 Compliance
- [x] Uses native in-app purchases (not external links)
- [x] Purchases happen within the app
- [x] Pricing fetched from App Store (not hardcoded)
- [x] "Restore Purchases" button visible
- [x] Link to manage subscription in iOS Settings
- [x] Proper transaction finishing
- [x] Receipt verification with Apple servers

### StoreKit 2 Best Practices
- [x] Purchase listeners for async updates
- [x] Proper transaction finishing
- [x] Error handling for all scenarios
- [x] Timeout handling for network issues
- [x] User-friendly error messages
- [x] Loading states for all async operations
- [x] Restore purchases functionality
- [x] Subscription management link

## Performance Optimizations

1. **Non-blocking initialization**: StoreKit initializes only when needed (on paywall screen)
2. **Timeout handling**: 2-3 second timeouts prevent UI hangs
3. **Async listeners**: Purchase updates handled asynchronously
4. **Graceful degradation**: App continues if StoreKit unavailable
5. **Efficient verification**: Backend caches verification results

## Monitoring & Analytics

### Key Metrics to Track
1. **Purchase funnel**:
   - Paywall views
   - Subscribe button taps
   - Purchase sheet appearances
   - Successful purchases
   - Failed purchases (with error codes)

2. **Subscription health**:
   - Active subscriptions
   - Churn rate
   - Restore success rate
   - Receipt verification failures

3. **Performance**:
   - StoreKit initialization time
   - Product fetch time
   - Receipt verification time
   - Transaction finish time

### Logging
All StoreKit operations are logged with `[StoreKit]` prefix:
- Initialization status
- Product fetch results
- Purchase attempts
- Verification results
- Transaction finishing
- Error details

Check logs with:
```bash
# iOS Simulator
xcrun simctl spawn booted log stream --predicate 'eventMessage contains "StoreKit"'

# Physical device (via Xcode)
# Window → Devices and Simulators → Select device → View Device Logs
```

## Next Steps

1. **Test thoroughly** in sandbox environment
2. **Submit for review** with test account
3. **Monitor** purchase metrics after launch
4. **Iterate** based on user feedback
5. **Add analytics** for purchase funnel optimization

## Support

For issues or questions:
- **Email**: info@forelandmarine.com
- **Documentation**: This file
- **Apple Support**: https://developer.apple.com/support/

## References

- [RevenueCat StoreKit 2 Tutorial](https://www.revenuecat.com/blog/engineering/ios-in-app-subscription-tutorial-with-storekit-2-and-swift/)
- [Apple StoreKit Documentation](https://developer.apple.com/documentation/storekit)
- [react-native-iap Documentation](https://github.com/dooboolab-community/react-native-iap)
- [App Store Review Guidelines 3.1.1](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase)
