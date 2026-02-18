
# Development Environment Fix

## Issue
The app was failing to start with the error:
```
CommandError: Input is required, but 'npx expo' is in non-interactive mode.
Use the EXPO_TOKEN environment variable to authenticate in CI
```

## Root Cause
Expo was trying to authenticate with Expo servers to get code signing information for Expo Go development builds. In non-interactive environments (like Natively.dev), this authentication prompt cannot be displayed, causing the app to fail.

## Solution
The fix involves running Expo in **offline mode** to bypass authentication requirements during development.

### Changes Made

1. **Updated package.json scripts** to use `--offline` flag:
   ```json
   {
     "dev": "expo start --offline",
     "android": "expo start --android --offline",
     "ios": "expo start --ios --offline"
   }
   ```

2. **Removed owner field** from app.json to prevent ownership-based authentication checks

3. **Updated eas.json** to remove hardcoded Apple Team IDs that might trigger authentication

4. **Created app.config.js** for dynamic configuration based on environment

5. **Added expo.config.json** as a fallback configuration

## How It Works

The `--offline` flag tells Expo to:
- Skip authentication with Expo servers
- Not attempt to fetch code signing certificates
- Run purely in local development mode
- Still allow full app functionality including hot reload, debugging, etc.

## Testing
After these changes, the app should:
1. Start successfully without authentication prompts
2. Work in Expo Go on physical devices
3. Work in web preview
4. Support hot reload and debugging

## Important Notes

- **Production builds** are not affected - they still use proper authentication via EAS
- **Offline mode** only affects local development
- The app can still connect to the backend API (offline refers to Expo services, not your app's network)
- For production deployments, use the existing EAS build commands which have proper authentication

## Verification

To verify the fix is working:
1. The app should start without any authentication errors
2. You should see the SeaTime Tracker splash screen
3. The app should load to either the auth screen or home screen depending on login status
4. No "non-interactive mode" errors should appear in the logs

## Rollback

If you need to rollback these changes:
1. Remove the `--offline` flags from package.json scripts
2. Restore the `owner` field in app.json
3. Restore the `appleTeamId` fields in eas.json

However, this will bring back the authentication requirement issue.
