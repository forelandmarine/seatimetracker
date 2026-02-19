
# Sandbox User for Subscription Testing

## Overview

A sandbox user has been added to allow testing of subscription features without needing to make actual purchases through the App Store or Google Play.

## Quick Setup

1. **Navigate to Admin Tools**
   - Open the app
   - Go to Profile tab
   - Tap "Admin Tools"
   - Tap "Activate Subscriptions"

2. **Activate Sandbox User**
   - Tap the "Activate Sandbox User" button
   - This creates a test account with:
     - Email: `sandbox@seatimetracker.test`
     - Active subscription status
     - Expiration date: 10 years from now

3. **Sign In with Sandbox User**
   - Sign out of your current account
   - On the login screen, use "Forgot Password" to set a password for `sandbox@seatimetracker.test`
   - Sign in with the sandbox credentials

## Features

### Sandbox User Benefits
- ✅ Full access to all subscription features
- ✅ No actual payment required
- ✅ 10-year subscription (effectively permanent for testing)
- ✅ Can be reset/recreated at any time

### Testing Capabilities
With the sandbox user, you can test:
- Vessel tracking activation (unlimited vessels)
- Premium features that require subscription
- Subscription status checks
- Subscription expiration handling (by manually updating the expiration date)

## Custom Subscription Management

The "Activate Subscriptions" screen also allows you to:

1. **Update Any User's Subscription**
   - Enter the user's email
   - Select subscription status (active, inactive, trialing, expired)
   - Set expiration date (in days from now)
   - Optionally set product ID and platform

2. **Test Different Subscription States**
   - Active: Full access to all features
   - Inactive: Limited access, prompts to upgrade
   - Trialing: Trial period active
   - Expired: Subscription has ended

## API Endpoint

The sandbox user feature uses the admin API endpoint:

```
PUT /api/admin/update-subscription
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "subscription_status": "active",
  "subscription_expires_at": "2035-01-01T00:00:00Z",
  "subscription_product_id": "seatime_pro_annual",
  "subscription_platform": "ios"
}
```

**Response:**
```json
{
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "User Name",
    "subscription_status": "active",
    "subscription_expires_at": "2035-01-01T00:00:00.000Z",
    "subscription_product_id": "seatime_pro_annual",
    "subscription_platform": "ios"
  }
}
```

## Security Notes

- This is an **admin-only** feature
- The endpoint does not require authentication (for testing purposes)
- In production, you should add authentication middleware to protect this endpoint
- The sandbox user email domain (`.test`) is reserved for testing

## Troubleshooting

### Sandbox User Not Working
1. Verify the user was created successfully (check the success message)
2. Try signing out and signing in again
3. Check the subscription status in the Profile screen

### Can't Set Password
1. Use the "Forgot Password" flow on the login screen
2. Enter `sandbox@seatimetracker.test`
3. Follow the password reset instructions

### Subscription Not Showing as Active
1. Go back to Admin Tools → Activate Subscriptions
2. Tap "Activate Sandbox User" again to refresh the subscription
3. Sign out and sign in again

## Development Workflow

1. **Initial Setup**: Create sandbox user once
2. **Testing**: Sign in with sandbox user to test subscription features
3. **Reset**: If needed, reactivate the sandbox user to reset subscription
4. **Custom Tests**: Use the custom subscription update form to test specific scenarios

## Next Steps

- Test vessel activation with the sandbox user
- Verify subscription enforcement on premium features
- Test subscription expiration by setting a past date
- Validate subscription status checks across the app
