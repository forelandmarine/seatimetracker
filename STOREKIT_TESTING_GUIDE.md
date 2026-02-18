
# StoreKit Subscription Testing Guide

## 🧪 COMPREHENSIVE TESTING SCENARIOS

This guide provides detailed testing scenarios for the SeaTime Tracker subscription system.

---

## 📱 SANDBOX TESTING (Pre-Production)

### Prerequisites
1. ✅ In-App Purchase product created in App Store Connect
2. ✅ Sandbox test account created
3. ✅ App installed on physical iOS device (sandbox doesn't work in simulator)
4. ✅ Signed out of App Store on device

---

### Test Case 1: New User Subscription Flow

**Objective:** Verify new user can subscribe successfully

**Steps:**
1. Launch app
2. Create new account with email/password
3. Verify redirected to subscription paywall
4. Verify paywall displays:
   - ✅ "Subscription Required" title
   - ✅ Feature list (5 features)
   - ✅ "View in App Store" pricing message
   - ✅ "Subscribe Now" button
   - ✅ "Check Subscription Status" button
   - ✅ "Manage Subscription" button
   - ✅ "How to Subscribe" button
   - ✅ Terms and auto-renewal disclosure
5. Tap "Subscribe Now"
6. Verify App Store opens
7. Sign in with sandbox test account when prompted
8. Complete purchase (no charge in sandbox)
9. Return to app
10. Tap "Check Subscription Status"
11. Verify alert: "Subscription Active"
12. Tap "Continue"
13. Verify redirected to main app (home screen)
14. Verify can add vessels
15. Verify can activate vessels
16. Verify can check AIS data

**Expected Result:** ✅ User successfully subscribes and gains access

**Backend Verification:**
- Check logs for: `POST /api/subscription/verify`
- Verify response: `{ success: true, status: 'active' }`
- Check database: `user.subscription_status = 'active'`

---

### Test Case 2: Subscription Status Check (No Subscription)

**Objective:** Verify correct message when no subscription exists

**Steps:**
1. Launch app with new account
2. On paywall, tap "Check Subscription Status"
3. Verify alert: "No Active Subscription"
4. Verify message includes:
   - "No active subscription was found"
   - "If you just subscribed, please wait a moment"
   - Contact information

**Expected Result:** ✅ Clear message displayed, user remains on paywall

---

### Test Case 3: Subscription Renewal (Sandbox)

**Objective:** Verify subscription auto-renews correctly

**Note:** Sandbox subscriptions renew every 5 minutes (not 1 month)

**Steps:**
1. Complete Test Case 1 (subscribe successfully)
2. Wait 5 minutes
3. Tap "Check Subscription Status"
4. Verify subscription still active
5. Check backend logs for renewal webhook notification

**Expected Result:** ✅ Subscription remains active after renewal

**Backend Verification:**
- Check logs for: `POST /api/subscription/webhook`
- Verify notification type: `DID_RENEW`

---

### Test Case 4: Subscription Cancellation

**Objective:** Verify subscription cancellation flow

**Steps:**
1. Complete Test Case 1 (subscribe successfully)
2. Tap "Manage Subscription"
3. Verify iOS Settings opens to Subscriptions
4. Tap "SeaTime Tracker"
5. Tap "Cancel Subscription"
6. Confirm cancellation
7. Note expiration date
8. Return to app
9. Verify subscription still active (until expiration)
10. Wait for expiration (in sandbox, wait 5 minutes)
11. Reopen app
12. Verify redirected to paywall
13. Verify vessels deactivated
14. Verify scheduled tasks deleted

**Expected Result:** ✅ Subscription cancels, user loses access after expiration

**Backend Verification:**
- Check logs for: `POST /api/subscription/webhook`
- Verify notification type: `CANCEL`
- Check database: `user.subscription_status = 'inactive'`
- Verify: `PATCH /api/subscription/pause-tracking` called
- Verify: `vesselsDeactivated > 0`

---

### Test Case 5: Restore Purchases

**Objective:** Verify user can restore subscription on new device

**Steps:**
1. Complete Test Case 1 on Device A
2. Install app on Device B
3. Sign in with same account
4. Verify redirected to paywall
5. Tap "Check Subscription Status"
6. Verify subscription restored
7. Verify redirected to main app
8. Verify vessels accessible

**Expected Result:** ✅ Subscription restored successfully

---

### Test Case 6: Expired Subscription Resubscription

**Objective:** Verify user can resubscribe after expiration

**Steps:**
1. Complete Test Case 4 (cancel and let expire)
2. On paywall, tap "Subscribe Now"
3. Complete purchase in App Store
4. Return to app
5. Tap "Check Subscription Status"
6. Verify subscription active
7. Verify redirected to main app
8. Verify vessels can be activated again

**Expected Result:** ✅ User successfully resubscribes

---

### Test Case 7: Subscription Enforcement (AIS Checks)

**Objective:** Verify inactive users cannot use AIS features

**Steps:**
1. Create account without subscribing
2. Attempt to add vessel (should work)
3. Attempt to activate vessel
4. Verify error: "Active subscription required"
5. Attempt to check AIS data
6. Verify 403 Forbidden response

**Expected Result:** ✅ AIS features blocked for inactive users

**Backend Verification:**
- Check logs for: `POST /api/ais/check/:vesselId`
- Verify response: `403 Forbidden`
- Verify log message: "AIS check attempted with inactive subscription"

---

### Test Case 8: Multiple Devices

**Objective:** Verify subscription works across multiple devices

**Steps:**
1. Subscribe on Device A
2. Sign in on Device B with same Apple ID
3. Tap "Check Subscription Status"
4. Verify subscription active on Device B
5. Use app features on both devices simultaneously
6. Verify both devices have access

**Expected Result:** ✅ Subscription works on all devices with same Apple ID

---

### Test Case 9: Poor Network Connection

**Objective:** Verify graceful handling of network issues

**Steps:**
1. Enable Airplane Mode
2. Launch app
3. Tap "Check Subscription Status"
4. Verify error message: "Unable to check subscription status. Please check your internet connection"
5. Disable Airplane Mode
6. Tap "Check Subscription Status" again
7. Verify subscription check succeeds

**Expected Result:** ✅ Clear error message, retry works

---

### Test Case 10: App Store Unavailable

**Objective:** Verify fallback when App Store cannot be opened

**Steps:**
1. Restrict App Store access (Screen Time settings)
2. Tap "Subscribe Now"
3. Verify alert with manual instructions:
   - "To subscribe:"
   - "1. Open the App Store"
   - "2. Search for 'SeaTime Tracker'"
   - "3. Tap 'Subscribe'"

**Expected Result:** ✅ Fallback instructions displayed

---

## 🚀 PRODUCTION TESTING (Post-Launch)

### Test Case 11: Real Purchase Flow

**Objective:** Verify real purchase with actual payment

**Steps:**
1. Download app from App Store
2. Create new account
3. Tap "Subscribe Now"
4. Verify App Store opens
5. Verify pricing displays in local currency (e.g., £4.99, €5.99, $5.99)
6. Complete purchase with real Apple ID
7. Verify payment processed
8. Return to app
9. Tap "Check Subscription Status"
10. Verify subscription active
11. Verify access granted

**Expected Result:** ✅ Real purchase succeeds, payment charged

**Important:** Use a real Apple ID you control for testing

---

### Test Case 12: Subscription Management (Production)

**Objective:** Verify subscription management in production

**Steps:**
1. Complete Test Case 11
2. Tap "Manage Subscription"
3. Verify iOS Settings opens
4. Verify "SeaTime Tracker" subscription appears
5. Verify details correct:
   - Price: £4.99/month (or local equivalent)
   - Renewal date shown
   - "Cancel Subscription" option available
6. Verify can change subscription options
7. Return to app
8. Verify subscription still active

**Expected Result:** ✅ Subscription management works correctly

---

### Test Case 13: Real Cancellation and Refund

**Objective:** Verify cancellation and refund process

**Steps:**
1. Complete Test Case 11
2. Cancel subscription in iOS Settings
3. Request refund from Apple (if needed for testing)
4. Wait for cancellation to process
5. Verify webhook notification received
6. Verify subscription status updates to 'inactive'
7. Verify user redirected to paywall
8. Verify vessels deactivated

**Expected Result:** ✅ Cancellation processed correctly

---

### Test Case 14: Subscription Renewal (Production)

**Objective:** Verify monthly renewal works

**Steps:**
1. Complete Test Case 11
2. Wait 1 month for renewal
3. Verify payment processed
4. Verify webhook notification received
5. Verify subscription remains active
6. Verify expiration date updated

**Expected Result:** ✅ Subscription renews automatically

**Note:** This test requires waiting 1 month

---

### Test Case 15: Failed Payment

**Objective:** Verify handling of failed renewal payment

**Steps:**
1. Complete Test Case 11
2. Before renewal date, remove payment method or ensure insufficient funds
3. Wait for renewal attempt
4. Verify webhook notification received (CANCEL or DID_FAIL_TO_RENEW)
5. Verify subscription status updates to 'inactive'
6. Verify user redirected to paywall
7. Add valid payment method
8. Resubscribe
9. Verify subscription active again

**Expected Result:** ✅ Failed payment handled gracefully

---

## 🌍 REGIONAL TESTING

### Test Case 16: Multiple Currencies

**Objective:** Verify pricing displays correctly in different regions

**Regions to Test:**
- 🇬🇧 UK: £4.99
- 🇪🇺 EU: €5.99
- 🇺🇸 US: $5.99
- 🇦🇺 Australia: A$7.99
- 🇨🇦 Canada: C$6.99

**Steps:**
1. Change device region in iOS Settings
2. Launch app
3. Tap "Subscribe Now"
4. Verify pricing displays in local currency
5. Verify currency symbol correct
6. Verify amount correct for region

**Expected Result:** ✅ Pricing displays correctly in all regions

---

## 🔒 SECURITY TESTING

### Test Case 17: Receipt Tampering

**Objective:** Verify backend rejects invalid receipts

**Steps:**
1. Intercept receipt data (use debugging proxy)
2. Modify receipt data
3. Send modified receipt to backend
4. Verify backend rejects receipt
5. Verify error logged
6. Verify subscription status not updated

**Expected Result:** ✅ Invalid receipts rejected

---

### Test Case 18: Unauthorized Access

**Objective:** Verify subscription endpoints require authentication

**Steps:**
1. Attempt to call `/api/subscription/status` without auth token
2. Verify 401 Unauthorized response
3. Attempt to call `/api/subscription/verify` without auth token
4. Verify 401 Unauthorized response
5. Attempt to call `/api/subscription/pause-tracking` without auth token
6. Verify 401 Unauthorized response

**Expected Result:** ✅ All endpoints require authentication

---

## 📊 EDGE CASES

### Test Case 19: Rapid Status Checks

**Objective:** Verify system handles rapid subscription checks

**Steps:**
1. Tap "Check Subscription Status" 10 times rapidly
2. Verify no crashes
3. Verify no duplicate subscriptions created
4. Verify correct status returned

**Expected Result:** ✅ System handles rapid requests gracefully

---

### Test Case 20: App Closed During Purchase

**Objective:** Verify purchase completes even if app closed

**Steps:**
1. Tap "Subscribe Now"
2. In App Store, start purchase
3. Close SeaTime Tracker app (swipe up)
4. Complete purchase in App Store
5. Reopen SeaTime Tracker
6. Tap "Check Subscription Status"
7. Verify subscription active

**Expected Result:** ✅ Purchase completes successfully

---

### Test Case 21: Subscription During Offline Mode

**Objective:** Verify graceful handling when offline

**Steps:**
1. Enable Airplane Mode
2. Tap "Subscribe Now"
3. Verify error: "Cannot open App Store"
4. Disable Airplane Mode
5. Tap "Subscribe Now" again
6. Verify App Store opens

**Expected Result:** ✅ Offline mode handled gracefully

---

## 📝 TEST RESULTS TEMPLATE

Use this template to record test results:

```
Test Case: [Number and Name]
Date: [Date]
Tester: [Name]
Environment: [Sandbox/Production]
Device: [iPhone model, iOS version]

Steps Completed: [Yes/No]
Expected Result: [Pass/Fail]
Actual Result: [Description]

Issues Found:
- [Issue 1]
- [Issue 2]

Screenshots: [Attach if applicable]
Logs: [Attach backend logs if applicable]

Status: ✅ PASS / ❌ FAIL / ⚠️ PARTIAL
```

---

## 🐛 COMMON ISSUES AND SOLUTIONS

### Issue: "Cannot connect to iTunes Store"
**Cause:** Network issue or App Store down  
**Solution:** Check internet connection, try again later

### Issue: "This In-App Purchase has already been bought"
**Cause:** Sandbox account already purchased (sandbox purchases don't expire)  
**Solution:** Create new sandbox test account

### Issue: "Receipt verification failed"
**Cause:** Using production receipt in sandbox or vice versa  
**Solution:** Ensure `isSandbox` parameter matches environment

### Issue: "Subscription not found after purchase"
**Cause:** Receipt not yet processed by Apple  
**Solution:** Wait 1-2 minutes, try "Check Subscription Status" again

### Issue: "Webhook notifications not received"
**Cause:** Webhook URL not configured or incorrect  
**Solution:** Verify webhook URL in App Store Connect

---

## ✅ TESTING COMPLETION CHECKLIST

### Sandbox Testing
- [ ] Test Case 1: New User Subscription Flow
- [ ] Test Case 2: Subscription Status Check (No Subscription)
- [ ] Test Case 3: Subscription Renewal (Sandbox)
- [ ] Test Case 4: Subscription Cancellation
- [ ] Test Case 5: Restore Purchases
- [ ] Test Case 6: Expired Subscription Resubscription
- [ ] Test Case 7: Subscription Enforcement (AIS Checks)
- [ ] Test Case 8: Multiple Devices
- [ ] Test Case 9: Poor Network Connection
- [ ] Test Case 10: App Store Unavailable

### Production Testing
- [ ] Test Case 11: Real Purchase Flow
- [ ] Test Case 12: Subscription Management (Production)
- [ ] Test Case 13: Real Cancellation and Refund
- [ ] Test Case 14: Subscription Renewal (Production) - *Requires 1 month wait*
- [ ] Test Case 15: Failed Payment

### Regional Testing
- [ ] Test Case 16: Multiple Currencies (UK, EU, US, AU, CA)

### Security Testing
- [ ] Test Case 17: Receipt Tampering
- [ ] Test Case 18: Unauthorized Access

### Edge Cases
- [ ] Test Case 19: Rapid Status Checks
- [ ] Test Case 20: App Closed During Purchase
- [ ] Test Case 21: Subscription During Offline Mode

---

## 📞 SUPPORT

**Issues During Testing:**
- Check backend logs: Use Specular dashboard
- Check frontend logs: Use `read_frontend_logs` tool
- Contact: info@forelandmarine.com

**Apple Support:**
- Sandbox Testing: https://developer.apple.com/apple-pay/sandbox-testing/
- StoreKit Testing: https://developer.apple.com/documentation/storekit/in-app_purchase/testing_in-app_purchases

---

**Last Updated:** February 2, 2026  
**Next Review:** After sandbox testing completion
