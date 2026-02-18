
# Subscription Enforcement - Quick Reference

## What Changed

✅ **Users without an active subscription cannot access the app**
✅ **Tracking is automatically paused when subscriptions become inactive**
✅ **Subscription status is checked on every app launch**
✅ **Multiple layers of protection ensure compliance**

## User Flow

### New User
1. Sign up → See paywall immediately
2. Subscribe via App Store
3. Return to app → Tap "Check Subscription Status"
4. Access granted

### Existing User (No Subscription)
1. Sign in → See paywall immediately
2. Subscribe via App Store
3. Return to app → Tap "Check Subscription Status"
4. Access granted

### Existing User (Active Subscription)
1. Sign in → Access granted immediately
2. No paywall shown

### Subscription Expires
1. Subscription expires (billing fails, user cancels)
2. Next app launch → See paywall
3. Tracking automatically paused
4. Must resubscribe to regain access

## Technical Details

### Subscription Checks
- **On Authentication**: Subscription status included in auth response
- **On App Launch**: Index route checks subscription before allowing access
- **On Tab Navigation**: Tab layout checks subscription as backup
- **Manual Check**: User can tap "Check Subscription Status" on paywall

### Automatic Actions
- **Tracking Pause**: All vessels deactivated when subscription inactive
- **Task Deletion**: Scheduled AIS checks deleted when subscription inactive
- **Access Denial**: Main app inaccessible without active subscription

### Subscription Status
- **Active**: User can access app and track sea time
- **Inactive**: User sees paywall, cannot access app, tracking paused

## Implementation Layers

1. **Index Route** (`app/index.tsx`):
   - First line of defense
   - Checks subscription after authentication
   - Redirects to paywall if inactive

2. **Tab Layout** (`app/(tabs)/_layout.tsx`):
   - Second line of defense
   - Checks subscription before showing tabs
   - Redirects to paywall if inactive

3. **Subscription Context** (`contexts/SubscriptionContext.tsx`):
   - Manages subscription state
   - Automatically pauses tracking when inactive
   - Provides `hasActiveSubscription` flag

4. **Auth Context** (`contexts/AuthContext.tsx`):
   - User object includes subscription fields
   - Subscription status available immediately after auth

## Backend Integration

### Auth Endpoints (Updated)
- `GET /api/auth/user` - Returns user with subscription status
- `POST /api/auth/sign-in/email` - Returns user with subscription status
- `POST /api/auth/sign-up/email` - Creates user with 'inactive' status
- `POST /api/auth/sign-in/apple` - Returns user with subscription status

### Subscription Endpoints (Existing)
- `GET /api/subscription/status` - Get current subscription status
- `POST /api/subscription/verify` - Verify App Store receipt
- `PATCH /api/subscription/pause-tracking` - Pause tracking (automatic)

## Testing

### Test Cases
1. ✅ New user sign up → See paywall
2. ✅ Existing user without subscription → See paywall
3. ✅ User with active subscription → Access granted
4. ✅ Subscription expires → See paywall, tracking paused
5. ✅ User subscribes → Access granted after status check

### Sandbox Testing
1. Create sandbox test account in App Store Connect
2. Sign out of Apple ID on test device
3. Run app in development mode
4. Sign in with sandbox account when prompted
5. Complete subscription purchase (no actual charge)
6. Verify subscription status in app

## Deployment

### Required Steps
1. Configure product in App Store Connect
   - Product ID: `com.forelandmarine.seatime.monthly`
   - Price: £4.99/€5.99 per month
   - No trial period

2. Set backend environment variable
   - `APPLE_APP_SECRET` - Shared secret from App Store Connect

3. Test in sandbox
   - Create sandbox test account
   - Test full subscription flow
   - Verify receipt verification works

4. Submit for review
   - Include subscription information in listing
   - Add screenshots
   - Update privacy policy

## Troubleshooting

### User Can't Access App
- Check subscription status in backend logs
- Verify receipt verification is working
- Ensure user has active subscription in App Store

### Tracking Not Paused
- Check backend logs for `pauseTracking()` calls
- Verify vessels are deactivated in database
- Ensure scheduled tasks are deleted

### Subscription Status Not Updating
- User should tap "Check Subscription Status" on paywall
- Backend verifies receipt with Apple servers
- Status updated in database

## Support

For issues:
- Email: info@forelandmarine.com
- Check backend logs for detailed error messages
- Review Apple's In-App Purchase documentation

## Summary

The app now has **strict subscription enforcement**:
- ✅ Users without subscriptions cannot access the app
- ✅ Tracking automatically paused when subscriptions inactive
- ✅ Multiple layers of protection
- ✅ Seamless user experience
- ✅ Apple StoreKit compliant
