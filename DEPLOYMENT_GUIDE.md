
# 🚀 SeaTime Tracker - iOS App Store Deployment Guide

This guide will walk you through deploying your SeaTime Tracker app to the iOS App Store.

## Prerequisites

Before you begin, ensure you have:

1. **Apple Developer Account** ($99/year)
   - Sign up at: https://developer.apple.com/programs/

2. **Expo Account** (Free)
   - Sign up at: https://expo.dev/signup

3. **EAS CLI Installed**
   ```bash
   npm install -g eas-cli
   ```

## Step 1: Configure Your Apple Developer Account

### 1.1 Create App Store Connect Record

1. Go to [App Store Connect](https://appstoreconnect.apple.com/)
2. Click **"My Apps"** → **"+"** → **"New App"**
3. Fill in the details:
   - **Platform**: iOS
   - **Name**: SeaTime Tracker
   - **Primary Language**: English
   - **Bundle ID**: Select `com.seatimetracker.app` (or create it if it doesn't exist)
   - **SKU**: `seatime-tracker-001` (any unique identifier)
   - **User Access**: Full Access

4. **Note down your App ID** (found in App Information) - you'll need this later

### 1.2 Get Your Apple Team ID

1. Go to [Apple Developer Membership](https://developer.apple.com/account/#/membership/)
2. Find your **Team ID** (10-character code like `ABC123XYZ4`)
3. Note this down - you'll need it for eas.json

## Step 2: Configure EAS (Expo Application Services)

### 2.1 Login to Expo

```bash
eas login
```

Enter your Expo credentials.

### 2.2 Configure Your Project

```bash
eas build:configure
```

This will create/update your `eas.json` file.

### 2.3 Update Configuration Files

Edit `app.json` and replace:
- `"owner": "YOUR_EXPO_USERNAME"` with your actual Expo username
- `"YOUR_EAS_PROJECT_ID"` will be auto-generated when you run your first build

Edit `eas.json` and replace:
- `"YOUR_APPLE_ID_EMAIL@example.com"` with your Apple ID email
- `"YOUR_ASC_APP_ID"` with the App ID from Step 1.1
- `"YOUR_APPLE_TEAM_ID"` with your Team ID from Step 1.2

## Step 3: Prepare App Store Listing

Before building, prepare your App Store listing content:

### 3.1 App Information

- **App Name**: SeaTime Tracker
- **Subtitle**: Track your maritime sea time automatically
- **Category**: Primary: Productivity, Secondary: Navigation
- **Content Rights**: You own the rights to this app

### 3.2 App Description

```
SeaTime Tracker automatically records your days at sea by monitoring vessel movements through AIS data. Perfect for maritime professionals who need to maintain accurate sea service records for MCA testimonials.

KEY FEATURES:
• Automatic sea time tracking via AIS data
• User-defined vessel monitoring (MMSI)
• Smart confirmation system for sea time entries
• MCA-compliant PDF and CSV reports
• Vessel particulars management
• Logbook with detailed sea time records
• Professional report generation for sea service testimonials

IDEAL FOR:
• Yacht crew members
• Maritime professionals
• Anyone needing MCA sea service documentation

Track your sea time effortlessly and generate professional reports for your maritime career advancement.
```

### 3.3 Screenshots Required

You need to provide screenshots for:
- **6.7" Display** (iPhone 15 Pro Max): At least 3 screenshots
- **6.5" Display** (iPhone 11 Pro Max): At least 3 screenshots
- **5.5" Display** (iPhone 8 Plus): At least 3 screenshots
- **iPad Pro (12.9")**: At least 3 screenshots (if supporting iPad)

**How to capture screenshots:**
1. Run your app on iOS Simulator
2. Use `Cmd + S` to save screenshots
3. Or use `xcrun simctl io booted screenshot screenshot.png`

### 3.4 App Privacy Information

You'll need to declare:
- **Location Data**: Used for tracking vessel movements
- **User Content**: Sea time entries and vessel information
- **Contact Info**: Email for user profiles

## Step 4: Build Your App

### 4.1 Create Production Build

```bash
npm run build:ios
```

Or directly:
```bash
eas build --platform ios --profile production
```

This will:
- Upload your code to EAS servers
- Build your app in the cloud
- Generate an `.ipa` file for App Store submission

**Note**: The first build takes 15-30 minutes. Subsequent builds are faster.

### 4.2 Monitor Build Progress

You can monitor your build at:
- Command line (shows progress)
- Expo dashboard: https://expo.dev/accounts/[your-username]/projects/seatime-tracker/builds

## Step 5: Submit to App Store

### 5.1 Automatic Submission (Recommended)

Once your build completes successfully:

```bash
npm run submit:ios
```

Or:
```bash
eas submit --platform ios --profile production
```

This will automatically upload your `.ipa` to App Store Connect.

### 5.2 Manual Submission (Alternative)

1. Download the `.ipa` file from your EAS build
2. Use **Transporter** app (available on Mac App Store)
3. Drag and drop your `.ipa` file
4. Click **"Deliver"**

## Step 6: Complete App Store Connect Setup

### 6.1 Add App Information

1. Go to [App Store Connect](https://appstoreconnect.apple.com/)
2. Select your app
3. Go to **"App Information"** tab
4. Fill in:
   - Privacy Policy URL (if you have one)
   - Category
   - Content Rights

### 6.2 Add Pricing and Availability

1. Go to **"Pricing and Availability"** tab
2. Set price: **Free** (or your preferred price)
3. Select availability: **All countries** (or specific regions)

### 6.3 Prepare for Submission

1. Go to **"1.0 Prepare for Submission"**
2. Upload screenshots (from Step 3.3)
3. Add app description (from Step 3.2)
4. Add keywords: `sea time, maritime, yacht crew, MCA, vessel tracking, logbook`
5. Add support URL: Your website or support email
6. Add marketing URL (optional)

### 6.4 Select Build

1. In the **"Build"** section, click **"+"**
2. Select the build you just uploaded
3. Click **"Done"**

### 6.5 App Privacy

1. Click **"Edit"** next to App Privacy
2. Answer questions about data collection:
   - **Location**: Yes (for vessel tracking)
   - **Contact Info**: Yes (for user profiles)
   - **User Content**: Yes (sea time entries)
3. For each data type, specify:
   - Used for app functionality
   - Not used for tracking
   - Not linked to user identity (if applicable)

### 6.6 Export Compliance

1. Answer: **"No"** to "Does your app use encryption?"
   - (Already declared in app.json with `ITSAppUsesNonExemptEncryption: false`)

## Step 7: Submit for Review

1. Review all information
2. Click **"Add for Review"**
3. Click **"Submit to App Review"**

**Review Timeline**: Typically 24-48 hours, but can take up to 7 days.

## Step 8: After Submission

### 8.1 Monitor Review Status

Check your App Store Connect dashboard for:
- **Waiting for Review**: Your app is in the queue
- **In Review**: Apple is reviewing your app
- **Pending Developer Release**: Approved! You can release it
- **Ready for Sale**: Your app is live!

### 8.2 Respond to Rejections (if any)

If rejected, Apple will provide reasons. Common issues:
- Missing functionality
- Privacy policy issues
- Incomplete metadata
- Crashes or bugs

Fix the issues and resubmit.

## Step 9: Release Your App

Once approved:
1. Go to App Store Connect
2. Click **"Release This Version"**
3. Your app will be live within a few hours!

## Updating Your App

For future updates:

1. Update version in `app.json`:
   ```json
   "version": "1.0.1"
   ```

2. Build new version:
   ```bash
   npm run build:ios
   ```

3. Submit new version:
   ```bash
   npm run submit:ios
   ```

4. Update App Store Connect with new version info
5. Submit for review

## Troubleshooting

### Build Fails

- Check your `app.json` and `eas.json` for syntax errors
- Ensure all dependencies are compatible with Expo 54
- Check EAS build logs for specific errors

### Submission Fails

- Verify your Apple Developer account is active
- Check that your Bundle ID matches in both Apple Developer and app.json
- Ensure your Apple ID credentials in eas.json are correct

### App Rejected

- Read Apple's rejection message carefully
- Common issues: missing privacy policy, incomplete functionality, crashes
- Fix issues and resubmit

## Useful Commands

```bash
# Login to EAS
eas login

# Check build status
eas build:list

# View build logs
eas build:view [BUILD_ID]

# Cancel a build
eas build:cancel

# Check submission status
eas submit:list

# Update credentials
eas credentials
```

## Resources

- [Expo EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [Expo EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [App Store Connect Help](https://help.apple.com/app-store-connect/)
- [Apple Developer Documentation](https://developer.apple.com/documentation/)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

## Support

If you encounter issues:
1. Check Expo documentation: https://docs.expo.dev/
2. Expo Discord: https://chat.expo.dev/
3. Stack Overflow: Tag questions with `expo` and `eas`

---

**Good luck with your App Store submission! 🚀**

Your SeaTime Tracker app is ready to help maritime professionals track their sea time efficiently.
