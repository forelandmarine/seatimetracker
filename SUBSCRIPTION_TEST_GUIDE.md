
# Subscription Integration - Quick Test Guide

## 🎯 What Was Fixed

The backend now returns subscription fields (`subscription_status`, `subscription_expires_at`, `subscription_product_id`) in ALL auth responses. This fixes the issue where test@seatime.com was incorrectly shown the paywall despite having an active subscription.

## ✅ Quick Test

### 1. Sign In with Test User

**Credentials:**
- Email: `test@seatime.com`
- Password: (Your test password)

### 2. Check Console Logs

Look for these key log messages:

```
✅ SIGN IN SUCCESS
[Auth] Subscription status: active  ← Should be 'active'

✅ SUBSCRIPTION CHECK
[Subscription] User subscription_status: active  ← Should be 'active'
[Subscription] ✅ Subscription is ACTIVE - user has full access

✅ ACCESS GRANTED
[Index] hasActiveSubscription: true  ← Should be true
```

### 3. Expected Result

- ✅ User is redirected to home screen (/(tabs))
- ✅ User does NOT see the paywall
- ✅ User has full access to the app

## ❌ If Paywall Still Appears

### Check These Logs:

1. **Auth Response:**
   ```
   [Auth] Subscription status: ???
   ```
   - If `undefined` or `null` → Backend is not returning the field
   - If `inactive` → User's subscription status needs to be updated in the database

2. **Subscription Context:**
   ```
   [Subscription] User subscription_status: ???
   ```
   - Should match the auth response
   - If different, there's a state management issue

3. **Routing Decision:**
   ```
   [Index] hasActiveSubscription: ???
   ```
   - Should be `true` for active subscriptions
   - If `false`, check the subscription context

## 🔧 Backend Verification

Test the backend directly:

```bash
# Sign in and get token
curl -X POST https://uukpkcag4nsq8q632k643ztvus28frfe.app.specular.dev/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@seatime.com","password":"YOUR_PASSWORD"}'

# Expected response should include:
{
  "user": {
    "email": "test@seatime.com",
    "subscription_status": "active",  ← Must be present
    "subscription_expires_at": "...",
    "subscription_product_id": "..."
  },
  "session": { ... }
}
```

## 📊 Test Scenarios

| Scenario | subscription_status | Expected Behavior |
|----------|-------------------|-------------------|
| test@seatime.com | `active` | ✅ Access granted, no paywall |
| New user | `inactive` | ⚠️ Paywall shown |
| Expired subscription | `inactive` | ⚠️ Paywall shown |

## 🎉 Success Indicators

✅ Console shows "Subscription is ACTIVE"
✅ Console shows "ACCESS GRANTED"
✅ User is redirected to home screen
✅ No paywall appears

## 🐛 Debugging Tips

1. **Clear app cache** - Sometimes old data persists
2. **Sign out and sign in again** - Refreshes auth state
3. **Check backend logs** - Verify subscription fields are being returned
4. **Check database** - Verify user's subscription_status is 'active'

## 📞 Need Help?

If the issue persists:
1. Copy the console logs (especially the "========== SIGN IN SUCCESS ==========" section)
2. Check the backend response directly using curl
3. Verify the database has the correct subscription_status for test@seatime.com

---

**Backend URL:** https://uukpkcag4nsq8q632k643ztvus28frfe.app.specular.dev
**Test User:** test@seatime.com
