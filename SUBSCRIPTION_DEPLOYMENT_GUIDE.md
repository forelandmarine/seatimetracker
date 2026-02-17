
# Subscription System Deployment Guide

## Overview
SeaTime Tracker now includes a complete RevenueCat-based subscription system that is Apple App Store compliant. This guide covers deployment and configuration.

## ✅ What's Implemented

### Frontend
- ✅ RevenueCat SDK integration (`react-native-purchases`)
- ✅ `RevenueCatContext` for subscription state management
- ✅ Subscription paywall screen with package selection
- ✅ Purchase and restore functionality
- ✅ Subscription enforcement hook (`useSubscriptionEnforcement`)
- ✅ Automatic redirect to paywall for inactive subscriptions
- ✅ Real-time subscription status updates

### Backend
- ✅ RevenueCat webhook endpoint for subscription events
- ✅ Subscription sync endpoint
- ✅ Subscription status endpoint
- ✅ Automatic vessel deactivation on subscription expiration
- ✅ Middleware for subscription enforcement on protected endpoints
- ✅ Database schema for subscription tracking

### Subscription Enforcement
- ✅ Vessel activation requires active subscription
- ✅ Manual sea time entry requires active subscription
- ✅ Report generation requires active subscription
- ✅ Automatic tracking pause when subscription expires
- ✅ Read-only access to existing data without subscription

## 🚀 Deployment Steps

### Step 1: RevenueCat Setup

1. **Create RevenueCat Account**
   ```
   1. Go to https://www.revenuecat.com/
   2. Sign up (free tier available)
   3. Create new project: "SeaTime Tracker"
   ```

2. **Configure iOS App in RevenueCat**
   ```
   1. Dashboard → Apps → Add App
   2. Platform: iOS
   3. Bundle ID: com.forelandmarine.seatimetracker
   4. App Name: SeaTime Tracker
   5. Upload App Store Connect API Key
   ```

3. **Create Products**
   ```
   1. Dashboard → Products → Create Product
   2. Product ID: seatime_monthly
   3. Type: Subscription
   4. Duration: 1 month
   5. Link to App Store Connect product
   ```

4. **Create Entitlement**
   ```
   1. Dashboard → Entitlements → Create Entitlement
   2. Identifier: premium
   3. Attach products: seatime_monthly
   ```

5. **Get API Keys**
   ```
   1. Dashboard → API Keys
   2. Copy iOS API Key (appl_...)
   3. Copy Secret API Key (sk_...)
   4. Copy Webhook Secret
   ```

### Step 2: App Store Connect Setup

1. **Create In-App Purchase**
   ```
   1. App Store Connect → Your App → In-App Purchases
   2. Click "+" → Auto-Renewable Subscription
   3. Reference Name: SeaTime Tracker Monthly
   4. Product ID: seatime_monthly
   5. Subscription Group: SeaTime Subscriptions
   6. Duration: 1 Month
   7. Price: Set your pricing
   8. Localization: Add descriptions
   9. Review Information: Add screenshot
   10. Submit for Review
   ```

2. **Configure Subscription Group**
   ```
   1. Create subscription group if needed
   2. Add subscription levels (monthly, annual, etc.)
   3. Configure upgrade/downgrade behavior
   ```

### Step 3: Update Configuration Files

1. **Update config/revenuecat.ts**
   ```typescript
   export const REVENUECAT_CONFIG = {
     iosApiKey: 'appl_YOUR_ACTUAL_KEY_HERE', // From RevenueCat dashboard
     androidApiKey: 'goog_YOUR_ACTUAL_KEY_HERE',
     entitlementId: 'premium',
     products: {
       monthly: 'seatime_monthly', // Must match App Store Connect
       annual: 'seatime_annual',
     },
   };
   ```

2. **Update app.json (Optional - for extra security)**
   ```json
   {
     "expo": {
       "extra": {
         "revenueCat": {
           "iosApiKey": "appl_YOUR_ACTUAL_KEY_HERE",
           "androidApiKey": "goog_YOUR_ACTUAL_KEY_HERE"
         }
       }
     }
   }
   ```

### Step 4: Backend Configuration

1. **Add Environment Variables to Specular**
   ```
   REVENUECAT_API_KEY=sk_YOUR_SECRET_KEY_HERE
   REVENUECAT_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET_HERE
   ```

2. **Configure Webhook in RevenueCat**
   ```
   1. Dashboard → Integrations → Webhooks
   2. Add Webhook URL: https://uukpkcag4nsq8q632k643ztvus28frfe.app.specular.dev/api/subscription/revenuecat/webhook
   3. Select events: All subscription events
   4. Save
   ```

### Step 5: Testing

1. **Sandbox Testing**
   ```
   1. App Store Connect → Users and Access → Sandbox Testers
   2. Create sandbox tester account
   3. Sign out of App Store on test device
   4. Run app, attempt purchase
   5. Sign in with sandbox tester
   6. Complete test purchase (no charge)
   7. Verify in RevenueCat dashboard
   ```

2. **Verify Subscription Flow**
   ```
   1. New user signs up → Sees paywall
   2. User purchases → Gets access
   3. User can activate vessels
   4. User can create sea time entries
   5. User can generate reports
   ```

3. **Verify Expiration Flow**
   ```
   1. In RevenueCat dashboard, manually expire subscription
   2. App should detect expiration
   3. Vessels should be deactivated
   4. User redirected to paywall
   5. Premium features blocked
   ```

### Step 6: Production Deployment

1. **Build for TestFlight**
   ```bash
   eas build --platform ios --profile production
   ```

2. **Upload to TestFlight**
   ```bash
   eas submit --platform ios --profile production
   ```

3. **Internal Testing**
   ```
   1. Invite internal testers
   2. Test full subscription flow
   3. Test restore purchases
   4. Test subscription expiration
   5. Verify webhook events
   ```

4. **Submit for Review**
   ```
   1. Ensure in-app purchase is approved
   2. Add subscription screenshots
   3. Add subscription description
   4. Submit app for review
   ```

## 🔒 Security Considerations

1. **API Keys**
   - Never commit API keys to git
   - Use environment variables for backend keys
   - Use app.json extra for frontend keys (obfuscated in build)

2. **Webhook Security**
   - Webhook secret validates requests from RevenueCat
   - Backend verifies signature on all webhook events

3. **Receipt Validation**
   - RevenueCat handles all receipt validation
   - No need to implement custom validation

## 📊 Monitoring

1. **RevenueCat Dashboard**
   - Monitor active subscriptions
   - Track revenue
   - View customer details
   - Check webhook events

2. **Backend Logs**
   - Monitor subscription sync events
   - Check webhook processing
   - Track subscription status changes

3. **App Analytics**
   - Track paywall views
   - Monitor purchase conversion
   - Track subscription retention

## 🐛 Troubleshooting

### Subscription Not Detected
```
1. Check RevenueCat dashboard for customer
2. Verify API keys are correct
3. Check backend logs for webhook events
4. Try "Restore Purchases" in app
5. Check subscription expiration date
```

### Webhook Not Firing
```
1. Verify webhook URL is correct
2. Check webhook secret matches
3. Test webhook in RevenueCat dashboard
4. Check backend logs for errors
5. Verify backend is accessible
```

### Sandbox Purchases Not Working
```
1. Ensure signed out of App Store
2. Use valid sandbox tester account
3. Check App Store Connect for sandbox tester status
4. Try deleting and reinstalling app
5. Check RevenueCat sandbox mode
```

### Vessels Not Deactivating
```
1. Check subscription status in backend
2. Verify webhook is processing correctly
3. Check backend logs for deactivation events
4. Manually trigger sync via app
```

## 📞 Support

**RevenueCat Support:**
- Docs: https://docs.revenuecat.com/
- Community: https://community.revenuecat.com/
- Email: support@revenuecat.com

**SeaTime Tracker Support:**
- Email: info@forelandmarine.com

## ✅ Pre-Launch Checklist

- [ ] RevenueCat account created and configured
- [ ] iOS app added to RevenueCat
- [ ] Products created in RevenueCat
- [ ] Entitlements configured
- [ ] API keys obtained and configured
- [ ] In-app purchases created in App Store Connect
- [ ] Subscription group configured
- [ ] Webhook configured and tested
- [ ] Backend environment variables set
- [ ] Sandbox testing completed
- [ ] TestFlight testing completed
- [ ] Privacy policy updated with subscription terms
- [ ] Terms of service updated
- [ ] App Store screenshots include subscription info
- [ ] App Store description mentions subscription
- [ ] Subscription pricing clearly displayed

## 🎉 Launch

Once all checklist items are complete:
1. Submit app for App Store review
2. Monitor RevenueCat dashboard for first purchases
3. Check backend logs for webhook events
4. Respond to any App Store review feedback
5. Celebrate your launch! 🚀
