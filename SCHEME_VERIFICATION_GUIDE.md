
# URL Scheme Verification Guide

## 🎯 Purpose

This guide shows you how to **prove** that the URL scheme fix worked by extracting and inspecting the actual `Info.plist` from a built iOS app.

## 📋 What We're Verifying

We need to confirm that:
1. ✅ The old invalid scheme `"SeaTime Tracker"` (with space) is **gone**
2. ✅ The new valid scheme `"seatimetracker"` is present
3. ✅ The scheme matches RFC1738: `^[A-Za-z][A-Za-z0-9.+-]*$`

## 🔧 Method 1: Pre-Build Verification (Recommended)

**Before building**, verify what will be in the Info.plist:

```bash
node scripts/verify-built-scheme.js
```

This script:
- ✅ Reads your `app.json`
- ✅ Validates the scheme against RFC1738
- ✅ Shows exactly what will appear in the built Info.plist
- ✅ Confirms "SeaTime Tracker" has been replaced

**Expected Output:**

```
═══════════════════════════════════════════════════════
📋 BUILT INFO.PLIST VERIFICATION
═══════════════════════════════════════════════════════

📖 Reading app.json...

📱 App Configuration:
   Name: SeaTime Tracker
   Slug: seatime-tracker
   Scheme: seatimetracker

🔍 Validating URL Scheme...
   ✅ VALID: "seatimetracker" matches RFC1738 pattern

✅ CONFIRMED: Old "SeaTime Tracker" scheme has been replaced

📄 Simulated Info.plist CFBundleURLTypes Section:
═══════════════════════════════════════════════════════

<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>seatimetracker</string>
    </array>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
  </dict>
</array>

═══════════════════════════════════════════════════════

🎯 FINAL VERDICT:
   ✅ URL scheme is VALID and ready for production
   ✅ "SeaTime Tracker" has been successfully replaced
   ✅ The built Info.plist will contain: "seatimetracker"

   You can safely proceed with: eas build --platform ios

═══════════════════════════════════════════════════════
```

## 🔧 Method 2: Post-Build Extraction (Proof)

**After building** an IPA or .app, extract the actual Info.plist:

### Step 1: Build the app

```bash
# Build for iOS
eas build --platform ios --profile preview

# Or use local build
expo prebuild -p ios
```

### Step 2: Download the IPA

After the EAS build completes, download the `.ipa` file from the Expo dashboard.

### Step 3: Extract Info.plist

```bash
# Make the script executable
chmod +x scripts/extract-plist-after-build.sh

# Run the extraction
./scripts/extract-plist-after-build.sh ~/Downloads/SeaTimeTracker.ipa
```

**Expected Output:**

```
═══════════════════════════════════════════════════════
📦 EXTRACT INFO.PLIST FROM BUILT APP
═══════════════════════════════════════════════════════

📱 Detected IPA file
📂 Extracting IPA to: /tmp/tmp.XXXXXX
✅ Found Info.plist

═══════════════════════════════════════════════════════
📋 CFBundleURLTypes Section:
═══════════════════════════════════════════════════════

<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>seatimetracker</string>
    </array>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
  </dict>
</array>

═══════════════════════════════════════════════════════
🔍 Extracted URL Schemes:
═══════════════════════════════════════════════════════

✅ VALID: "seatimetracker"

═══════════════════════════════════════════════════════

✅ Extraction complete
```

## 🔧 Method 3: Manual Extraction (Alternative)

If you prefer to extract manually:

### For .ipa files:

```bash
# 1. Unzip the IPA
unzip SeaTimeTracker.ipa -d extracted

# 2. Find the .app bundle
cd extracted/Payload/*.app

# 3. View Info.plist
plutil -convert xml1 Info.plist -o - | grep -A 10 "CFBundleURLTypes"
```

### For .app bundles (local builds):

```bash
# Navigate to the build output
cd ios/build/Build/Products/Debug-iphonesimulator/SeaTimeTracker.app

# View Info.plist
plutil -convert xml1 Info.plist -o - | grep -A 10 "CFBundleURLTypes"
```

## ✅ Success Criteria

You've successfully fixed the scheme if you see:

1. **In CFBundleURLSchemes array:**
   ```xml
   <string>seatimetracker</string>
   ```
   ✅ No spaces
   ✅ Starts with a letter
   ✅ Only contains alphanumeric characters

2. **NOT present:**
   ```xml
   <string>SeaTime Tracker</string>
   ```
   ❌ This should be completely gone

## 🚨 Failure Indicators

If you see any of these, the fix didn't work:

- ❌ `<string>SeaTime Tracker</string>` (old scheme still present)
- ❌ Any scheme with spaces
- ❌ Any scheme starting with a number or special character

## 🔍 What Each Script Does

### `verify-built-scheme.js`
- **Purpose:** Pre-build validation
- **Input:** Reads `app.json`
- **Output:** Simulates what will be in Info.plist
- **Use case:** Quick check before building (saves 15-30 min build time)

### `extract-plist-after-build.sh`
- **Purpose:** Post-build proof
- **Input:** .ipa or .app file
- **Output:** Actual CFBundleURLTypes from built app
- **Use case:** Final verification after building

## 📊 Current Configuration

Based on your `app.json`:

```json
{
  "expo": {
    "name": "SeaTime Tracker",
    "slug": "seatime-tracker",
    "scheme": "seatimetracker"
  }
}
```

**Expected Result:**
- ✅ Display name: "SeaTime Tracker" (spaces OK in name)
- ✅ Slug: "seatime-tracker" (hyphens OK in slug)
- ✅ URL Scheme: "seatimetracker" (no spaces, RFC1738 compliant)

## 🎯 Next Steps

1. **Run pre-build verification:**
   ```bash
   node scripts/verify-built-scheme.js
   ```

2. **If validation passes, build:**
   ```bash
   eas build --platform ios --profile preview
   ```

3. **After build completes, extract and verify:**
   ```bash
   ./scripts/extract-plist-after-build.sh ~/Downloads/SeaTimeTracker.ipa
   ```

4. **Confirm:**
   - ✅ "seatimetracker" is present
   - ✅ "SeaTime Tracker" is gone
   - ✅ No spaces in the scheme

## 🔗 Related Files

- `app.json` - Source of truth for URL scheme
- `scripts/validate-scheme.js` - Build-time validation
- `scripts/verify-built-scheme.js` - Pre-build verification (this guide)
- `scripts/extract-plist-after-build.sh` - Post-build extraction (this guide)
- `.github/workflows/validate-scheme.yml` - CI/CD validation

## 📚 References

- [RFC1738 URL Scheme Specification](https://www.ietf.org/rfc/rfc1738.txt)
- [Expo Deep Linking Documentation](https://docs.expo.dev/guides/deep-linking/)
- [Apple URL Scheme Documentation](https://developer.apple.com/documentation/xcode/defining-a-custom-url-scheme-for-your-app)
