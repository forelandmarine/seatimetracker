
# Troubleshooting Guide

## Issue: "Non-Interactive Mode" Error

### Symptoms
```
CommandError: Input is required, but 'npx expo' is in non-interactive mode.
Use the EXPO_TOKEN environment variable to authenticate in CI
```

### Solution
✅ **FIXED** - The app now runs with `--offline` flag to bypass authentication.

### If Error Persists

1. **Clear Metro Cache**
   ```bash
   # The dev script already includes --clear flag
   npm run dev
   ```

2. **Check Package.json**
   Ensure scripts have `--offline` flag:
   ```json
   "dev": "expo start --offline"
   ```

3. **Verify Configuration Files**
   - ✅ app.json should NOT have `owner` field
   - ✅ eas.json should NOT have `appleTeamId` in development profile
   - ✅ .expo/settings.json should have `"offline": true`

4. **Check Environment**
   - Ensure you're in the project directory
   - Ensure node_modules are installed
   - Ensure backend is running (if needed)

## Issue: Web Preview Not Loading

### Symptoms
- Blank screen
- Loading forever
- Error 500

### Solutions

1. **Check Backend URL**
   - Verify `extra.backendUrl` in app.json
   - Test backend URL in browser
   - Check backend logs

2. **Clear Browser Cache**
   - Hard refresh (Cmd+Shift+R or Ctrl+Shift+R)
   - Clear localStorage
   - Try incognito mode

3. **Check Console Logs**
   - Open browser DevTools (F12)
   - Look for errors in Console tab
   - Check Network tab for failed requests

4. **Verify SSR Handling**
   - Check app/_layout.tsx for SSR guards
   - Check contexts/AuthContext.tsx for localStorage checks
   - Ensure `typeof window !== 'undefined'` checks are in place

## Issue: Expo Go Not Connecting

### Symptoms
- QR code doesn't work
- "Unable to connect" error
- Timeout errors

### Solutions

1. **Use Offline Mode**
   ```bash
   npm run ios -- --offline
   # or
   npm run android -- --offline
   ```

2. **Check Network**
   - Ensure phone and computer on same network
   - Disable VPN if active
   - Check firewall settings

3. **Try Tunnel Mode**
   If offline mode doesn't work, try tunnel:
   ```bash
   expo start --tunnel
   ```

## Issue: Authentication Not Working

### Symptoms
- Can't sign in
- Token not saving
- Redirects not working

### Solutions

1. **Check Backend**
   - Verify backend URL is correct
   - Test backend endpoints manually
   - Check backend logs for errors

2. **Clear Storage**
   - Web: Clear localStorage
   - iOS: Delete app and reinstall
   - Android: Clear app data

3. **Check Auth Flow**
   - Verify AuthContext is properly initialized
   - Check token storage (SecureStore vs localStorage)
   - Verify API endpoints match backend

## Issue: Hot Reload Not Working

### Symptoms
- Changes don't appear
- Need to manually refresh
- Stale code running

### Solutions

1. **Restart Dev Server**
   ```bash
   npm run dev
   ```

2. **Clear Cache**
   ```bash
   expo start --clear
   ```

3. **Check File Watchers**
   - Ensure files are being saved
   - Check for file system issues
   - Verify Metro bundler is running

## Issue: Build Errors

### Symptoms
- TypeScript errors
- Module not found
- Import errors

### Solutions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Check Imports**
   - Verify file paths are correct
   - Check for typos in import statements
   - Ensure modules are installed

3. **TypeScript Issues**
   - Check tsconfig.json
   - Verify type definitions
   - Run `npx tsc --noEmit` to check types

## Common Error Messages

### "Cannot find module"
- Run `npm install`
- Check import path
- Verify file exists

### "Network request failed"
- Check backend URL
- Verify internet connection
- Check CORS settings

### "Invariant Violation"
- Usually a React error
- Check component code
- Look for hooks violations

### "Unable to resolve module"
- Clear Metro cache: `expo start --clear`
- Delete node_modules and reinstall
- Check babel.config.js

## Getting Help

If none of these solutions work:

1. **Check Logs**
   - Metro bundler logs
   - Backend logs
   - Browser console logs
   - Device logs (Expo Go)

2. **Provide Information**
   - Error message (full text)
   - Steps to reproduce
   - Platform (iOS/Android/Web)
   - Environment (Natively.dev, local, etc.)

3. **Common Fixes**
   - Restart dev server
   - Clear cache
   - Reinstall dependencies
   - Check configuration files

## Prevention

To avoid issues in the future:

1. ✅ Always use `--offline` flag for development
2. ✅ Keep dependencies up to date
3. ✅ Clear cache when switching branches
4. ✅ Verify backend is running before starting app
5. ✅ Check logs regularly for warnings
6. ✅ Test on multiple platforms (iOS, Android, Web)

## Success Checklist

Before reporting an issue, verify:

- [ ] Dependencies installed (`npm install`)
- [ ] Dev server running (`npm run dev`)
- [ ] Backend accessible (check URL in browser)
- [ ] Configuration files correct (app.json, eas.json)
- [ ] Cache cleared (`expo start --clear`)
- [ ] Logs checked (Metro, backend, browser)
- [ ] Platform tested (iOS, Android, or Web)

If all checks pass and issue persists, it's likely a code issue that needs debugging.
