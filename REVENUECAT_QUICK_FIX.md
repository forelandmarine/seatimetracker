
# RevenueCat Quick Fix Checklist

## 🚨 Critical Fixes Applied

✅ **Fixed app.json** - Removed duplicate entries and corrected JSON structure
✅ **Prepared API key placeholders** - Ready for your actual keys

## 🔑 What You Need to Do NOW

### 1. Get Your API Keys (5 minutes)
```
1. Go to: https://app.revenuecat.com/
2. Select: SeaTime Tracker project
3. Go to: Settings → API Keys
4. Copy:
   - iOS Key (starts with appl_)
   - Android Key (starts with goog_)
```

### 2. Update app.json (2 minutes)
Replace `appl_YOUR_IOS_API_KEY_HERE` and `goog_YOUR_ANDROID_API_KEY_HERE` in **TWO places**:

**Line ~30 (plugins section):**
```json
[
  "./plugins/with-revenuecat",
  {
    "iosApiKey": "appl_PASTE_YOUR_REAL_KEY",
    "androidApiKey": "goog_PASTE_YOUR_REAL_KEY"
  }
]
```

**Line ~50 (extra section):**
```json
"revenueCat": {
  "iosApiKey": "appl_PASTE_YOUR_REAL_KEY",
  "androidApiKey": "goog_PASTE_YOUR_REAL_KEY"
}
```

### 3. Rebuild Native Projects (5 minutes)
```bash
# Clean and rebuild
rm -rf ios android
npx expo prebuild --clean

# For iOS
cd ios && pod install && cd ..
```

### 4. Test (2 minutes)
1. Run app: `npm run ios` or `npm run android`
2. Navigate to: `/revenuecat-diagnostic`
3. Verify: All checks should be ✅ green

## 📋 Product Configuration Checklist

### In RevenueCat Dashboard:
- [ ] Product ID: `monthly` exists
- [ ] Entitlement ID: `SeaTime Tracker Pro` exists
- [ ] Product linked to entitlement

### In App Store Connect (iOS):
- [ ] Subscription created with ID: `monthly`
- [ ] Subscription group configured
- [ ] Price set

### In Google Play Console (Android):
- [ ] Subscription created with ID: `monthly`
- [ ] Price set
- [ ] Subscription activated

### Link Stores to RevenueCat:
- [ ] App Store product ID added to RevenueCat
- [ ] Google Play product ID added to RevenueCat

## 🧪 Quick Test Commands

```bash
# Test diagnostic screen
# Navigate to /revenuecat-diagnostic in app

# Test paywall
# Navigate to /revenuecat-paywall in app

# Check logs
# Look for "[RevenueCat]" prefix in console
```

## ⚠️ Common Mistakes to Avoid

1. ❌ Don't use test keys in production
2. ❌ Don't forget to update BOTH locations in app.json
3. ❌ Don't skip `expo prebuild` after changing keys
4. ❌ Don't use different product IDs in different places
5. ❌ Don't forget to link store products to RevenueCat

## ✅ Success Indicators

When everything works, you should see:
- ✅ Diagnostic screen: All green checks
- ✅ Paywall: Products displayed with prices
- ✅ Purchase: Completes successfully
- ✅ Profile: Shows "Pro" badge after purchase
- ✅ Console: No "[RevenueCat]" errors

## 🆘 If Still Broken

1. Check console logs for "[RevenueCat]" errors
2. Verify API keys are correct (no typos)
3. Verify product IDs match exactly: `monthly`
4. Verify entitlement ID matches: `SeaTime Tracker Pro`
5. Wait 24 hours for App Store products to propagate
6. Try on a real device (not simulator)

## 📞 Need Help?

- RevenueCat Docs: https://docs.revenuecat.com/
- RevenueCat Support: support@revenuecat.com
- Check RevenueCat Dashboard logs for errors
