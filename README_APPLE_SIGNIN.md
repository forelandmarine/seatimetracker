
# Apple Sign-In Setup Guide

## Overview
This app uses Sign in with Apple for iOS authentication. For it to work properly, you need to configure both the Expo app and Apple Developer account.

## ✅ Current Status

**Apple Sign-In is FULLY IMPLEMENTED and CONFIGURED** in the codebase:

- ✅ Backend endpoint ready (`/api/auth/sign-in/apple`)
- ✅ Frontend UI and logic ready (`app/auth.tsx`)
- ✅ Token handling ready (`contexts/AuthContext.tsx`)
- ✅ Session management ready
- ✅ Error handling and logging ready
- ✅ App configuration ready (`app.json`)

**What's needed to test:**
1. Configure Apple Developer Portal (enable Sign in with Apple capability)
2. Build app with EAS Build
3. Install on physical iOS device
4. Test authentication flow

## 🧪 Testing Tool

A test screen is available to verify Apple Sign-In configuration:

**Navigate to:** `/test-apple-signin`

This screen shows:
- Authentication status
- Apple Sign-In availability
- Token storage status
- Backend configuration
- Requirements checklist
- Test buttons for backend connectivity

## Prerequisites
- Apple Developer Account (paid membership required)
- App registered in App Store Connect
- Bundle identifier configured: `com.seatimetracker.app`

## Configuration Steps

### 1. Apple Developer Portal Setup

1. **Enable Sign in with Apple Capability**
   - Go to [Apple Developer Portal](https://developer.apple.com/account)
   - Navigate to Certificates, Identifiers & Profiles
   - Select your App ID (`com.seatimetracker.app`)
   - Enable "Sign in with Apple" capability
   - Save changes

2. **Create Service ID (for web/testing)**
   - In Identifiers, create a new Service ID
   - Use identifier like: `com.seatimetracker.app.service`
   - Enable "Sign in with Apple"
   - Configure domains and redirect URLs if needed

### 2. App Configuration

The app.json has been updated with:
```json
{
  "ios": {
    "usesAppleSignIn": true,
    "bundleIdentifier": "com.seatimetracker.app"
  },
  "plugins": [
    "expo-apple-authentication"
  ]
}
```

### 3. Build the App

After configuration, rebuild the app:

```bash
# For development build
eas build --profile development --platform ios

# For production build
eas build --profile production --platform ios
```

**Important:** Sign in with Apple only works on:
- Physical iOS devices (iOS 13+)
- Production builds
- TestFlight builds
- Development builds on physical devices

It does NOT work on:
- iOS Simulator
- Expo Go
- Web browsers (requires additional setup)

### 4. Testing

1. Install the build on a physical iOS device
2. Open the test screen: Navigate to `/test-apple-signin` to verify configuration
3. Go to authentication screen: Tap "Go to Authentication Screen"
4. Tap "Sign in with Apple" button
5. You should see the Apple authentication sheet
6. Sign in with your Apple ID
7. The app will receive an identity token and create/sign in the user

### 5. Troubleshooting

**Error: "Sign in with Apple is not available on this device"**
- Make sure you're testing on a physical iOS device (iOS 13+)
- Ensure the device is signed in to iCloud
- Check that the app has the Apple Sign-In capability enabled
- Use the test screen (`/test-apple-signin`) to verify availability

**Error: "Invalid Apple token"**
- Verify the bundle identifier matches in:
  - app.json
  - Apple Developer Portal
  - The actual build
- Ensure the app is properly signed with the correct provisioning profile

**Error: "Apple authentication failed"**
- Check backend logs for detailed error messages
- Verify the backend can decode the JWT identity token
- Ensure the backend endpoint `/api/auth/sign-in/apple` is working
- Use the test screen to test backend connectivity

**Backend not receiving requests**
- Check that `backendUrl` in app.json is correct
- Verify network connectivity
- Use the test screen to test backend connection
- Check backend logs with: `get_backend_logs` tool

### 6. Backend Implementation

The backend endpoint `/api/auth/sign-in/apple` handles:
1. Decoding the JWT identity token
2. Extracting user information (sub, email)
3. Creating or finding existing user account
4. Creating a session token
5. Returning user data and session

**Endpoint Details:**
- **URL**: `POST /api/auth/sign-in/apple`
- **Request Body**: 
  ```json
  {
    "identityToken": "string (required)",
    "user": {
      "name": { "firstName": "string", "lastName": "string" },
      "email": "string"
    }
  }
  ```
- **Response**:
  ```json
  {
    "user": {
      "id": "string",
      "email": "string",
      "name": "string",
      "emailVerified": boolean,
      "image": "string | null",
      "createdAt": "string",
      "updatedAt": "string"
    },
    "session": {
      "id": "string",
      "token": "string",
      "expiresAt": "string"
    },
    "isNewUser": boolean
  }
  ```

### 7. Privacy Requirements

Apple requires apps using Sign in with Apple to:
- Display the button prominently if other social login options are available
- Not require additional account creation after Apple sign-in
- Respect user privacy choices (hide email option)

The app is configured to request:
- Email address (optional - user can hide)
- Full name (optional - only provided on first sign-in)

## 🔍 How It Works

### User Flow
1. User taps "Sign in with Apple" button on iOS device
2. Apple authentication sheet appears
3. User authenticates with Face ID/Touch ID/Apple ID password
4. Apple returns identity token and optional user info (email, name)
5. App sends identity token to backend at `/api/auth/sign-in/apple`
6. Backend:
   - Decodes JWT identity token
   - Extracts Apple user ID (sub) and email
   - Checks if user exists (by Apple account ID)
   - Creates new user if first-time sign-in
   - Creates session token
   - Returns user data and session token
7. Frontend stores session token securely
8. User is redirected to main app

### Expected Logs (Frontend)
```
[AuthScreen] User tapped Sign in with Apple button
[AuthScreen] Checking Apple Authentication availability...
[AuthScreen] Apple Authentication available: true
[AuthScreen] Requesting Apple credentials...
[AuthScreen] Apple credential received: { hasIdentityToken: true, hasEmail: true, ... }
[AuthScreen] Sending Apple credentials to backend...
[Auth] Signing in with Apple
[Auth] Apple sign in response status: 200
[Auth] Apple sign in successful, user: [email]
[AuthScreen] Apple sign in successful, navigating to home
```

### Expected Logs (Backend)
```
Apple Sign-In attempt
Apple token verified: { appleUserId: '...', email: '...' }
Creating new Apple user (or) Existing Apple user
Apple account created (or) Apple authentication successful
Session created
```

## 🔐 Security Features

### Token Handling
- ✅ Identity tokens are validated by decoding JWT
- ✅ Apple user ID (sub) is used as unique identifier
- ✅ Session tokens are randomly generated (32 bytes)
- ✅ Sessions expire after 30 days
- ✅ Tokens stored securely using expo-secure-store (iOS Keychain)

### Privacy
- ✅ Email is optional (user can hide email)
- ✅ Name is only provided on first sign-in
- ✅ User data is sandboxed per user account
- ✅ No cross-user data access

## 📋 Verification Checklist

Use the test screen (`/test-apple-signin`) to verify:
- [ ] Running on iOS device
- [ ] Apple Authentication available
- [ ] Backend URL configured
- [ ] Backend connection working
- [ ] Apple auth endpoint accessible
- [ ] Device signed in to iCloud
- [ ] App built with EAS Build
- [ ] Apple Developer Portal configured

## 🔗 Related Files

- **Frontend**: `app/auth.tsx`, `contexts/AuthContext.tsx`
- **Backend**: `backend/src/routes/auth.ts`
- **Configuration**: `app.json`
- **Test Screen**: `app/test-apple-signin.tsx`
- **Confirmation**: `APPLE_SIGNIN_CONFIRMATION.md`

## 📞 Support

If you encounter issues:
1. Use the test screen (`/test-apple-signin`) to diagnose configuration
2. Check the app logs for detailed error messages
3. Verify Apple Developer Portal configuration
4. Ensure you're testing on a physical device
5. Check backend logs for authentication errors

## Next Steps

1. Configure Apple Developer Portal (enable Sign in with Apple for your App ID)
2. Rebuild the app with: `eas build --profile production --platform ios`
3. Install on physical iOS device
4. Open test screen to verify configuration: `/test-apple-signin`
5. Test Sign in with Apple functionality on auth screen
6. Monitor logs for any issues

The implementation is complete and ready for testing once the Apple Developer Portal is configured and the app is built with EAS Build.
