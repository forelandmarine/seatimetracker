
# Quick Start: Deploy to iOS App Store

## TL;DR - Fast Track Deployment

### 1. Install EAS CLI
```bash
npm install -g eas-cli
```

### 2. Login to Expo
```bash
eas login
```

### 3. Update Configuration

Edit `app.json`:
- Replace `"YOUR_EXPO_USERNAME"` with your Expo username

Edit `eas.json`:
- Replace `"YOUR_APPLE_ID_EMAIL@example.com"` with your Apple ID
- Replace `"YOUR_ASC_APP_ID"` with your App Store Connect App ID
- Replace `"YOUR_APPLE_TEAM_ID"` with your Apple Team ID

### 4. Build
```bash
npm run build:ios
```

Wait 15-30 minutes for the build to complete.

### 5. Submit
```bash
npm run submit:ios
```

### 6. Complete App Store Connect

1. Go to https://appstoreconnect.apple.com/
2. Add screenshots, description, and metadata
3. Submit for review

### 7. Wait for Approval

Typically 24-48 hours.

---

**For detailed step-by-step instructions, see [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)**

## What You Need

- ✅ Apple Developer Account ($99/year)
- ✅ Expo Account (free)
- ✅ App Store Connect app record
- ✅ Screenshots of your app
- ✅ App description and metadata

## Configuration Files Updated

- ✅ `app.json` - iOS build settings configured
- ✅ `eas.json` - Build and submit profiles configured
- ✅ `package.json` - Build scripts added

## New Scripts Available

```bash
npm run build:ios          # Build production iOS app
npm run build:ios:preview  # Build preview iOS app
npm run submit:ios         # Submit to App Store
```

## Next Steps

1. **Get Apple Developer Account**: https://developer.apple.com/programs/
2. **Create App in App Store Connect**: https://appstoreconnect.apple.com/
3. **Follow the detailed guide**: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)

## Important Notes

- Your app is already configured for production
- Bundle ID: `com.seatimetracker.app`
- Version: `1.0.0`
- Build Number: `1`
- All required permissions are set
- Privacy declarations are included

## Need Help?

- 📖 Full Guide: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- 🌐 Expo Docs: https://docs.expo.dev/build/introduction/
- 💬 Expo Discord: https://chat.expo.dev/
- 🍎 Apple Support: https://developer.apple.com/support/

---

**Your app is ready for deployment! Follow the steps above to get it on the App Store.** 🚀
