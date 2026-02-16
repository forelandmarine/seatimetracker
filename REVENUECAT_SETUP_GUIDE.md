
# RevenueCat Integration Guide for SeaTime Tracker

This guide provides complete step-by-step instructions for integrating RevenueCat into the SeaTime Tracker app.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [RevenueCat Dashboard Setup](#revenuecat-dashboard-setup)
6. [App Store Connect Setup](#app-store-connect-setup)
7. [Google Play Console Setup](#google-play-console-setup)
8. [Testing](#testing)
9. [Troubleshooting](#troubleshooting)

## Overview

The SeaTime Tracker app uses RevenueCat for subscription management with the following features:

- **Entitlement**: "SeaTime Tracker Pro"
- **Products**: Monthly subscription (`monthly`)
- **Platforms**: iOS and Android
- **Features**:
  - Native paywall UI
  - Customer center for subscription management
  - Restore purchases
  - Real-time entitlement checking

## Prerequisites

Before you begin, ensure you have:

1. A RevenueCat account (free tier available)
2. An Apple Developer account (for iOS)
3. A Google Play Developer account (for Android)
4. Expo CLI installed
5. EAS CLI installed (`npm install -g eas-cli`)

## Installation

The RevenueCat SDK packages are already installed in the project:

```json
{
  "react-native-purchases": "^9.7.6",
  "react-native-purchases-ui": "^9.7.6"
}
```

If you need to reinstall them:

```bash
npx expo install react-native-purchases react-native-purchases-ui
```

## Configuration

### 1. Get Your API Keys

1. Log in to [RevenueCat Dashboard](https://app.revenuecat.com)
2. Navigate to your project
3. Go to **Settings** → **API Keys**
4. Copy your:
   - **iOS API Key** (starts with `appl_`)
   - **Android API Key** (starts with `goog_`)

### 2. Configure app.json

Add your API keys to `app.json`:

```json
{
  "expo": {
    "extra": {
      "revenueCat": {
        "iosApiKey": "appl_YOUR_IOS_KEY_HERE",
        "androidApiKey": "goog_YOUR_ANDROID_KEY_HERE"
      }
    }
  }
}
```

**For testing**, you can use the test key:
```json
{
  "expo": {
    "extra": {
      "revenueCat": {
        "iosApiKey": "test_gKMHKEpYSkTiLUtgKWHRbAXGcGd",
        "androidApiKey": "test_gKMHKEpYSkTiLUtgKWHRbAXGcGd"
      }
    }
  }
}
```

### 3. Verify Configuration

Run the diagnostic screen to verify your setup:

```bash
npx expo start
```

Navigate to: **Profile** → **Settings** → **RevenueCat Diagnostic**

The diagnostic screen will show:
- ✅ Configuration Valid
- ✅ iOS API Key Configured
- ✅ Android API Key Configured
- ✅ SDK Initialized

## RevenueCat Dashboard Setup

### 1. Create a Project

1. Log in to [RevenueCat Dashboard](https://app.revenuecat.com)
2. Click **Create New Project**
3. Enter project name: "SeaTime Tracker"
4. Select platforms: iOS and Android

### 2. Configure iOS App

1. Go to **Project Settings** → **Apps**
2. Click **Add App** → **iOS**
3. Enter:
   - **App Name**: SeaTime Tracker
   - **Bundle ID**: `com.forelandmarine.seatimetracker`
   - **App Store Connect Shared Secret**: (from App Store Connect)
4. Click **Save**

### 3. Configure Android App

1. Go to **Project Settings** → **Apps**
2. Click **Add App** → **Android**
3. Enter:
   - **App Name**: SeaTime Tracker
   - **Package Name**: `com.forelandmarine.seatimetracker`
   - **Service Account JSON**: (from Google Play Console)
4. Click **Save**

### 4. Create Products

1. Go to **Products** → **Add Product**
2. Create monthly subscription:
   - **Product ID**: `monthly`
   - **Type**: Subscription
   - **Duration**: 1 month
3. Click **Save**

### 5. Create Entitlement

1. Go to **Entitlements** → **Add Entitlement**
2. Enter:
   - **Identifier**: `SeaTime Tracker Pro`
   - **Description**: Full access to SeaTime Tracker features
3. Attach the `monthly` product to this entitlement
4. Click **Save**

### 6. Create Offering

1. Go to **Offerings** → **Add Offering**
2. Enter:
   - **Identifier**: `default`
   - **Description**: Default offering
3. Add the `monthly` product as a package
4. Set as **Current Offering**
5. Click **Save**

## App Store Connect Setup

### 1. Create In-App Purchase

1. Log in to [App Store Connect](https://appstoreconnect.apple.com)
2. Go to **My Apps** → **SeaTime Tracker**
3. Click **In-App Purchases** → **+**
4. Select **Auto-Renewable Subscription**
5. Enter:
   - **Reference Name**: SeaTime Tracker Pro Monthly
   - **Product ID**: `monthly` (must match RevenueCat)
   - **Subscription Group**: Create new group "SeaTime Tracker Pro"
6. Configure pricing:
   - **Duration**: 1 month
   - **Price**: Set your price (e.g., $9.99/month)
7. Add localized descriptions
8. Click **Save**

### 2. Get Shared Secret

1. In App Store Connect, go to **My Apps** → **SeaTime Tracker**
2. Click **App Information**
3. Scroll to **App-Specific Shared Secret**
4. Click **Generate** (if not already generated)
5. Copy the shared secret
6. Add it to RevenueCat Dashboard (iOS App settings)

### 3. Create Sandbox Testers

1. Go to **Users and Access** → **Sandbox Testers**
2. Click **+** to add testers
3. Use these accounts for testing purchases

## Google Play Console Setup

### 1. Create Subscription

1. Log in to [Google Play Console](https://play.google.com/console)
2. Go to **All apps** → **SeaTime Tracker**
3. Click **Monetize** → **Subscriptions** → **Create subscription**
4. Enter:
   - **Product ID**: `monthly` (must match RevenueCat)
   - **Name**: SeaTime Tracker Pro Monthly
   - **Description**: Full access to SeaTime Tracker features
5. Configure pricing:
   - **Billing period**: 1 month
   - **Price**: Set your price (e.g., $9.99/month)
6. Click **Save**

### 2. Set Up Service Account

1. Go to **Setup** → **API access**
2. Click **Create new service account**
3. Follow the link to Google Cloud Console
4. Create a service account with **Pub/Sub Admin** role
5. Create a JSON key for the service account
6. Download the JSON key
7. Upload it to RevenueCat Dashboard (Android App settings)

### 3. Add License Testers

1. Go to **Setup** → **License testing**
2. Add email addresses for testers
3. These accounts can make test purchases

## Testing

### 1. Test on iOS Simulator

```bash
npx expo start --ios
```

**Note**: In-app purchases don't work in the iOS Simulator. You must test on a physical device.

### 2. Test on iOS Device

1. Build a development client:
   ```bash
   eas build --profile development --platform ios
   ```

2. Install on your device

3. Sign in with a sandbox tester account

4. Navigate to the paywall and test purchasing

### 3. Test on Android

```bash
npx expo start --android
```

1. Build a development client:
   ```bash
   eas build --profile development --platform android
   ```

2. Install on your device

3. Sign in with a license tester account

4. Navigate to the paywall and test purchasing

### 4. Test Restore Purchases

1. Make a purchase
2. Uninstall the app
3. Reinstall the app
4. Navigate to **Customer Center**
5. Tap **Restore Purchases**
6. Verify your subscription is restored

### 5. Verify Entitlements

1. Make a purchase
2. Check the diagnostic screen:
   - Navigate to **Profile** → **RevenueCat Diagnostic**
   - Verify **Status** shows "Pro"
   - Verify **Customer Info** is "Loaded"

## Troubleshooting

### SDK Not Initializing

**Problem**: SDK shows "Not Initialized" in diagnostic screen

**Solutions**:
1. Verify API keys are correct in `app.json`
2. Check that you're using the correct key for your platform
3. Ensure you've run `npx expo prebuild` after adding keys
4. Check console logs for initialization errors

### No Offerings Available

**Problem**: Paywall shows "Unable to load subscription options"

**Solutions**:
1. Verify you've created an offering in RevenueCat Dashboard
2. Ensure the offering is set as "Current"
3. Check that products are attached to the offering
4. Verify products exist in App Store Connect / Google Play Console
5. Wait a few minutes for RevenueCat to sync with stores

### Purchase Fails

**Problem**: Purchase button doesn't work or shows an error

**Solutions**:
1. Verify you're testing on a physical device (not simulator)
2. Ensure you're signed in with a sandbox/test account
3. Check that product IDs match exactly between:
   - RevenueCat Dashboard
   - App Store Connect / Google Play Console
   - Your app code
4. Verify the subscription is approved in the store

### Restore Purchases Doesn't Work

**Problem**: "No purchases found" when restoring

**Solutions**:
1. Verify you made a purchase with the same Apple ID / Google account
2. Check that the purchase was successful (check email receipt)
3. Ensure you're using the same app bundle ID
4. Try signing out and back in to the store

### Entitlement Not Granted

**Problem**: Purchase succeeds but user doesn't get Pro access

**Solutions**:
1. Verify entitlement ID matches exactly: "SeaTime Tracker Pro"
2. Check that the product is attached to the entitlement in RevenueCat
3. Refresh customer info in the diagnostic screen
4. Check RevenueCat Dashboard → Customers to see if purchase is recorded

## Support

For additional help:

- **RevenueCat Documentation**: https://www.revenuecat.com/docs
- **RevenueCat Community**: https://community.revenuecat.com
- **App Support**: info@forelandmarine.com

## Next Steps

After completing this setup:

1. ✅ Test purchases thoroughly on both platforms
2. ✅ Verify entitlements are granted correctly
3. ✅ Test restore purchases flow
4. ✅ Submit app for review with in-app purchases configured
5. ✅ Monitor RevenueCat Dashboard for subscription analytics

## Production Checklist

Before going live:

- [ ] Replace test API keys with production keys
- [ ] Verify all products are approved in stores
- [ ] Test on multiple devices
- [ ] Verify restore purchases works
- [ ] Test subscription renewal
- [ ] Set up webhooks for backend sync (optional)
- [ ] Configure subscription notifications
- [ ] Add privacy policy and terms of service links
- [ ] Test cancellation flow
- [ ] Verify analytics are tracking correctly

---

**Last Updated**: February 2026
**Version**: 1.0.0
