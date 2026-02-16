
# Apple IAP Compliance - Verification Checklist

## Pre-Submission Checklist

### ✅ Code Changes
- [x] Installed `react-native-iap` dependency
- [x] Updated `utils/storeKit.ts` with native in-app purchase implementation
- [x] Updated `app/subscription-paywall.tsx` with native purchase UI
- [x] Added pricing display that fetches from App Store
- [x] Added "Restore Purchase" button (required by Apple)

### ⚠️ Manual Configuration Required
- [ ] **CRITICAL**: Add StoreKit entitlements to `app.json`:
  ```json
  "entitlements": {
    "com.apple.developer.in-app-payments": []
  }
  ```
- [ ] **CRITICAL**: Increment build number to `"1.0.5"` in `app.json`

### 🧪 Testing Requirements
- [ ] Test in sandbox environment with test account
- [ ] Verify pricing displays correctly in local currency
- [ ] Verify "Subscribe Now" opens native iOS purchase sheet
- [ ] Verify purchase completes successfully
- [ ] Verify receipt is verified with backend
- [ ] Verify user gains immediate access after purchase
- [ ] Verify "Restore Purchase" works for existing subscriptions
- [ ] Verify subscription status persists across app restarts

### 📱 App Store Connect
- [ ] Product configured: `com.forelandmarine.seatime.monthly`
- [ ] Product status: Approved and available
- [ ] Shared secret configured in backend (`APPLE_APP_SECRET`)
- [ ] Sandbox test accounts created

## Compliance Verification

### ✅ Guideline 3.1.1 - In-App Purchase
- [x] App offers native in-app purchase using StoreKit
- [x] Purchase happens within the app (not external link)
- [x] Pricing is fetched from App Store (not hardcoded)
- [x] Receipt verification with Apple servers
- [x] Restore purchases functionality implemented

### ✅ Required Features
- [x] Native purchase UI (iOS purchase sheet)
- [x] Real-time pricing in user's local currency
- [x] Restore purchases button
- [x] Receipt verification
- [x] Subscription management via iOS Settings

### ✅ User Experience
- [x] User never leaves the app during purchase
- [x] Subscription activates immediately after purchase
- [x] Clear pricing information displayed
- [x] Easy restore process for existing subscribers

## Testing Scenarios

### Scenario 1: New Subscription
1. Open app without subscription
2. See paywall with pricing (e.g., "£4.99 per month")
3. Tap "Subscribe Now"
4. Native iOS purchase sheet appears
5. Complete purchase with sandbox account
6. Subscription activates immediately
7. User gains access to app

**Expected Result**: ✅ User can subscribe and access app immediately

### Scenario 2: Restore Purchase
1. User who previously subscribed on another device
2. Open app → See paywall
3. Tap "Restore Purchase"
4. App fetches previous purchases
5. Subscription is restored
6. User gains access to app

**Expected Result**: ✅ User can restore subscription and access app

### Scenario 3: Expired Subscription
1. User with expired subscription
2. Open app → See paywall
3. Pricing displays correctly
4. User can subscribe again

**Expected Result**: ✅ User can resubscribe

### Scenario 4: Active Subscription
1. User with active subscription
2. Open app
3. No paywall shown
4. User has full access

**Expected Result**: ✅ User bypasses paywall and accesses app

## Backend Verification

### Endpoints Working
- [ ] `GET /api/subscription/status` - Returns subscription status
- [ ] `POST /api/subscription/verify` - Verifies receipts with Apple
- [ ] `PATCH /api/subscription/pause-tracking` - Pauses tracking when inactive

### Environment Variables
- [ ] `APPLE_APP_SECRET` is set correctly
- [ ] Backend can reach Apple's verification servers

### Logs to Check
- [ ] Receipt verification logs show successful verification
- [ ] Subscription status updates correctly in database
- [ ] No errors in backend logs during purchase flow

## Submission Response to Apple

When resubmitting, include this message:

---

**Subject**: Re: Guideline 3.1.1 - In-App Purchase Implementation

Dear App Review Team,

Thank you for your feedback regarding Guideline 3.1.1. We have implemented native in-app purchases to comply with Apple's guidelines.

**Changes Made**:
1. Implemented native StoreKit in-app purchases using Apple's payment system
2. Users can now subscribe directly within the app without leaving to external links
3. Real-time pricing is fetched from the App Store and displayed in the user's local currency
4. Added "Restore Purchase" functionality for users who previously subscribed
5. All receipts are verified with Apple's servers for security

**User Flow**:
- Users tap "Subscribe Now" within the app
- Native iOS purchase sheet appears (Apple's standard payment UI)
- Users complete purchase using Apple Pay or their Apple ID
- Subscription activates immediately
- Users gain access to the app without leaving

**Compliance**:
- ✅ Native in-app purchase using StoreKit
- ✅ No external links for subscription purchase
- ✅ Pricing displayed from App Store
- ✅ Receipt verification with Apple servers
- ✅ Restore purchases functionality

The app now fully complies with Guideline 3.1.1 by offering in-app purchases as the primary subscription method.

Please let us know if you need any additional information.

Best regards,
Foreland Marine Team

---

## Post-Approval Checklist

### Monitor
- [ ] Production subscription purchases working
- [ ] Receipt verification succeeding
- [ ] Subscription renewals processing correctly
- [ ] No user complaints about purchase flow

### Metrics to Track
- [ ] Subscription conversion rate
- [ ] Failed purchase rate
- [ ] Restore purchase success rate
- [ ] Receipt verification success rate

## Success Criteria

✅ **App is compliant when**:
1. Users can subscribe using native in-app purchase
2. Purchase happens entirely within the app
3. Pricing is fetched from App Store
4. Restore purchases works correctly
5. Receipt verification succeeds
6. Users gain immediate access after purchase

## Need Help?

- **Full Documentation**: See `APPLE_IAP_COMPLIANCE_FIX.md`
- **Quick Start**: See `QUICK_FIX_GUIDE.md`
- **Support**: info@forelandmarine.com
- **Backend Logs**: Check `/api/subscription/verify` endpoint
