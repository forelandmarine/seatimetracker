
# 🚨 CRITICAL: URL Scheme Fix Verification

## Current Status: ⚠️ INVALID SCHEME DETECTED

Your `app.json` currently contains **INVALID** URL schemes that will cause App Store rejection:

```json
{
  "expo": {
    "slug": "SeaTime Tracker",    ❌ INVALID (contains spaces)
    "scheme": "SeaTime Tracker"   ❌ INVALID (contains spaces)
  },
  "scheme": "SeaTime Tracker"     ❌ INVALID (contains spaces)
}
```

## ✅ Required Fix

You **MUST** manually edit `app.json` and change these values:

```json
{
  "expo": {
    "name": "SeaTime Tracker",        ✅ OK (display name can have spaces)
    "slug": "seatime-tracker",        ✅ FIXED (no spaces, lowercase, hyphens OK)
    "scheme": "seatimetracker"        ✅ FIXED (no spaces, no hyphens, RFC1738 compliant)
  },
  "scheme": "seatimetracker"          ✅ FIXED (matches expo.scheme)
}
```

### Why These Values?

1. **`name`**: "SeaTime Tracker" ✅
   - This is the **display name** shown to users
   - Spaces are allowed and expected
   - Keep this as-is

2. **`slug`**: "seatime-tracker" ✅
   - Used for Expo project identification
   - Lowercase with hyphens is standard
   - No spaces allowed

3. **`scheme`**: "seatimetracker" ✅
   - Used for deep linking (opening your app from URLs)
   - **MUST** follow RFC1738: `^[A-Za-z][A-Za-z0-9.+-]*$`
   - No spaces, no underscores
   - Starts with a letter
   - Only letters, numbers, dots, hyphens, plus signs

## 🔧 How to Fix (Manual Steps)

1. **Open `app.json` in your editor**

2. **Find and replace these lines:**

   **Line ~3:** Change slug
   ```json
   "slug": "SeaTime Tracker",
   ```
   to:
   ```json
   "slug": "seatime-tracker",
   ```

   **Line ~7:** Change expo.scheme
   ```json
   "scheme": "SeaTime Tracker",
   ```
   to:
   ```json
   "scheme": "seatimetracker",
   ```

   **Last line:** Change root scheme
   ```json
   "scheme": "SeaTime Tracker"
   ```
   to:
   ```json
   "scheme": "seatimetracker"
   ```

3. **Save the file**

4. **Verify the fix:**
   ```bash
   node scripts/verify-built-scheme.js
   ```

## 📋 Verification Steps

### Step 1: Pre-Build Verification (REQUIRED)

Before building, run the verification script:

```bash
node scripts/verify-built-scheme.js
```

**Expected Output (if fixed correctly):**

```
═══════════════════════════════════════════════════════
📋 BUILT INFO.PLIST VERIFICATION
═══════════════════════════════════════════════════════

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

**If you see this, the fix worked! ✅**

### Step 2: Build the App

Once verification passes, build:

```bash
eas build --platform ios --profile production
```

### Step 3: Post-Build Proof (OPTIONAL)

After the build completes, download the IPA and extract the actual Info.plist:

```bash
# Make script executable
chmod +x scripts/extract-plist-after-build.sh

# Extract from downloaded IPA
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

## ✅ Success Criteria

You've successfully fixed the scheme when you see:

1. **In the verification script:**
   - ✅ "seatimetracker" is shown as VALID
   - ✅ No mention of "SeaTime Tracker" (old scheme)
   - ✅ Final verdict says "ready for production"

2. **In the extracted Info.plist (after build):**
   - ✅ `<string>seatimetracker</string>` appears in CFBundleURLSchemes
   - ❌ `<string>SeaTime Tracker</string>` does NOT appear

## 🚨 Failure Indicators

If you see any of these, the fix didn't work:

- ❌ Verification script shows "SeaTime Tracker" as the scheme
- ❌ Verification script shows "INVALID" status
- ❌ Extracted Info.plist contains `<string>SeaTime Tracker</string>`
- ❌ Any scheme with spaces in the plist

## 📊 What Each File Does

### Configuration Files
- **`app.json`** - Source of truth for URL scheme (YOU MUST FIX THIS)
- **`lib/auth.ts`** - Uses the scheme for OAuth redirects (auto-updates from app.json)

### Verification Scripts
- **`scripts/validate-scheme.js`** - Validates syntax (runs before builds)
- **`scripts/verify-built-scheme.js`** - Shows what will be built (run before building)
- **`scripts/extract-plist-after-build.sh`** - Extracts actual plist (run after building)

### Documentation
- **`SCHEME_VERIFICATION_GUIDE.md`** - Detailed verification instructions
- **`SCHEME_VALIDATION.md`** - Validation rules and implementation
- **`SCHEME_FIX_VERIFICATION.md`** - This file (fix instructions)

## 🎯 Quick Reference

### Before Building
```bash
# 1. Fix app.json manually (see above)
# 2. Verify the fix
node scripts/verify-built-scheme.js
# 3. If valid, build
eas build --platform ios
```

### After Building
```bash
# 1. Download IPA from EAS
# 2. Extract and verify
./scripts/extract-plist-after-build.sh ~/Downloads/SeaTimeTracker.ipa
# 3. Confirm "seatimetracker" is present, "SeaTime Tracker" is gone
```

## 🔗 Deep Linking Impact

After fixing the scheme, your app's deep links will change:

**Before (BROKEN):**
```
SeaTime Tracker://auth/callback
```
❌ This doesn't work (spaces in URL)

**After (WORKING):**
```
seatimetracker://auth/callback
```
✅ This works correctly

**Note:** The auth system in `lib/auth.ts` automatically uses the scheme from `app.json`, so no code changes are needed.

## 📚 References

- [RFC1738 URL Scheme Specification](https://www.ietf.org/rfc/rfc1738.txt)
- [Expo Deep Linking Documentation](https://docs.expo.dev/guides/deep-linking/)
- [Apple URL Scheme Documentation](https://developer.apple.com/documentation/xcode/defining-a-custom-url-scheme-for-your-app)
- [App Store Connect Submission Guidelines](https://developer.apple.com/app-store/review/guidelines/)

## ⚠️ CRITICAL REMINDER

**DO NOT BUILD** until you've:
1. ✅ Fixed `app.json` manually
2. ✅ Run `node scripts/verify-built-scheme.js`
3. ✅ Confirmed the output shows "seatimetracker" as VALID

Building with an invalid scheme will result in:
- ❌ App Store rejection
- ❌ Wasted build time (15-30 minutes)
- ❌ Wasted build credits
- ❌ Deep linking won't work

**Fix it first, then build!**
