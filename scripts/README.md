
# URL Scheme Validation Scripts

This directory contains validation scripts to ensure that the `expo.scheme` in `app.json` complies with RFC1738 URL scheme rules, preventing App Store submission failures.

## 📋 Overview

Apple's App Store Connect requires URL schemes to follow RFC1738 standards:
- **Must start with an alphabetic character** (A-Z or a-z)
- **Can only contain**: letters, numbers, period (.), hyphen (-), plus (+)
- **Must NOT contain spaces** or other special characters
- **Pattern**: `^[A-Za-z][A-Za-z0-9.+-]*$`

## 🛠️ Scripts

### 1. `validate-scheme.js` - Build-time Validation

**Purpose**: Validates `app.json` before builds to catch invalid schemes early.

**Usage**:
```bash
# Run manually
npm run validate-scheme

# Automatically runs before builds
npm run build:android
npm run build:ios
npm run build:ios:preview
```

**What it does**:
- Reads `app.json`
- Checks both `expo.scheme` and root-level `scheme`
- Validates against RFC1738 rules
- **Fails the build** if invalid (exit code 1)
- Provides helpful error messages and suggestions

**Example Output** (Invalid):
```
🔍 Validating URL Scheme in app.json...

Checking expo.scheme: "SeaTime Tracker"
❌ INVALID

Validation Errors:
  • Scheme contains spaces (not allowed in RFC1738)

💡 Suggested fix:
   Change "SeaTime Tracker" to "seatimetracker"

═══════════════════════════════════════════════════════
❌ BUILD FAILED: Invalid URL Scheme
═══════════════════════════════════════════════════════
```

**Example Output** (Valid):
```
🔍 Validating URL Scheme in app.json...

Checking expo.scheme: "seatimetracker"
✅ VALID

✅ All URL schemes are valid!
```

### 2. `test-scheme.js` - Interactive Testing Tool

**Purpose**: Test any URL scheme without modifying `app.json`.

**Usage**:
```bash
# Test a scheme
npm run test-scheme "myapp"
npm run test-scheme "SeaTime Tracker"
npm run test-scheme "seatime-tracker"

# Or directly
node scripts/test-scheme.js "your-scheme-here"
```

**Example**:
```bash
$ npm run test-scheme "SeaTime Tracker"

Testing: "SeaTime Tracker"

❌ INVALID

Errors:
  • Contains spaces

💡 Suggested fix: "seatimetracker"
```

## 🚀 Integration

### Automatic Validation

The validation script is automatically integrated into the build process:

**package.json**:
```json
{
  "scripts": {
    "build:android": "npm run validate-scheme && expo prebuild -p android",
    "build:ios": "npm run validate-scheme && eas build --platform ios --profile production",
    "validate-scheme": "node scripts/validate-scheme.js"
  }
}
```

### CI/CD Integration

A GitHub Actions workflow is included at `.github/workflows/validate-scheme.yml`:

```yaml
name: Validate URL Scheme

on:
  push:
    paths:
      - 'app.json'
      - 'app.config.js'
  pull_request:
    paths:
      - 'app.json'
      - 'app.config.js'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: node scripts/validate-scheme.js
```

This ensures that any changes to `app.json` are validated before merging.

## ✅ Valid Scheme Examples

```
✅ "myapp"
✅ "seatimetracker"
✅ "seatime-tracker"
✅ "com.company.app"
✅ "app123"
✅ "my-app.v2"
✅ "app+beta"
```

## ❌ Invalid Scheme Examples

```
❌ "SeaTime Tracker"     (contains spaces)
❌ "my app"              (contains space)
❌ "123app"              (starts with number)
❌ "my_app"              (contains underscore)
❌ "app@company"         (contains @)
❌ "my/app"              (contains /)
```

## 🔧 Fixing Invalid Schemes

If validation fails, follow these steps:

1. **Open `app.json`**
2. **Locate the scheme field(s)**:
   ```json
   {
     "expo": {
       "scheme": "SeaTime Tracker"  ← Invalid
     }
   }
   ```
3. **Replace with a valid scheme**:
   ```json
   {
     "expo": {
       "scheme": "seatimetracker"  ← Valid
     }
   }
   ```
4. **Run validation again**:
   ```bash
   npm run validate-scheme
   ```

## 📚 RFC1738 Reference

From [RFC1738 Section 2.1](https://www.rfc-editor.org/rfc/rfc1738#section-2.1):

> Scheme names consist of a sequence of characters. The lower case letters "a"--"z", digits, and the characters plus ("+"), period ("."), and hyphen ("-") are allowed. For resiliency, programs interpreting URLs should treat upper case letters as equivalent to lower case in scheme names (e.g., allow "HTTP" as well as "http").

## 🐛 Troubleshooting

### Script fails with "app.json not found"
- Ensure you're running the script from the project root directory
- Check that `app.json` exists in the root

### Script passes but App Store still rejects
- Check for multiple scheme definitions (both `expo.scheme` and root `scheme`)
- Verify no other config files (like `app.config.js`) override the scheme
- Ensure the scheme in your built app matches `app.json`

### Need to bypass validation temporarily
```bash
# Run build without validation (not recommended)
expo prebuild -p android
eas build --platform ios --profile production
```

## 📝 Notes

- The validation script is **non-destructive** - it only reads `app.json`, never modifies it
- Both scripts use colored terminal output for better readability
- The scripts are Node.js scripts (no external dependencies required)
- ESLint is configured to ignore these scripts (shebang lines)

## 🔗 Related Files

- `app.json` - Main configuration file containing the scheme
- `.github/workflows/validate-scheme.yml` - CI/CD validation workflow
- `.eslintignore` - Excludes scripts from linting
- `package.json` - Contains npm scripts for validation

### 3. `verify-built-scheme.js` - Pre-Build Verification (NEW)

**Purpose**: Shows exactly what will be in the built Info.plist BEFORE you build.

**Usage**:
```bash
node scripts/verify-built-scheme.js
```

**What it does**:
- Reads your `app.json` configuration
- Validates the URL scheme against RFC1738
- **Simulates the CFBundleURLTypes section** that will appear in Info.plist
- Confirms "SeaTime Tracker" has been replaced with valid scheme
- Shows final verdict: ready to build or needs fixes

**Use this to**:
- Verify the fix worked BEFORE building (saves 15-30 min build time)
- See exactly what will be in the built app
- Confirm old invalid schemes are gone

**Example Output**:
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
  </dict>
</array>

🎯 FINAL VERDICT:
   ✅ URL scheme is VALID and ready for production
   ✅ "SeaTime Tracker" has been successfully replaced
   ✅ The built Info.plist will contain: "seatimetracker"
```

### 4. `extract-plist-after-build.sh` - Post-Build Proof (NEW)

**Purpose**: Extracts and displays the actual Info.plist from a built .ipa or .app.

**Usage**:
```bash
# Make executable
chmod +x scripts/extract-plist-after-build.sh

# Extract from IPA
./scripts/extract-plist-after-build.sh ~/Downloads/SeaTimeTracker.ipa

# Or from .app bundle
./scripts/extract-plist-after-build.sh ios/build/.../SeaTimeTracker.app
```

**What it does**:
- Extracts Info.plist from .ipa or .app bundle
- Displays the CFBundleURLTypes section
- Shows all URL schemes in the built app
- Validates each scheme (highlights invalid ones in red)

**Use this to**:
- **Prove the fix worked** after building
- Extract actual plist data from production builds
- Verify no invalid schemes made it into the build

**Example Output**:
```
═══════════════════════════════════════════════════════
📦 EXTRACT INFO.PLIST FROM BUILT APP
═══════════════════════════════════════════════════════

📱 Detected IPA file
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
  </dict>
</array>

═══════════════════════════════════════════════════════
🔍 Extracted URL Schemes:
═══════════════════════════════════════════════════════

✅ VALID: "seatimetracker"

✅ Extraction complete
```

## 🔄 Complete Verification Workflow

### Before Building (Recommended)
```bash
# 1. Validate scheme syntax
npm run validate-scheme

# 2. Verify what will be built
node scripts/verify-built-scheme.js

# 3. If both pass, build
eas build --platform ios
```

### After Building (Proof)
```bash
# 1. Download the .ipa from EAS

# 2. Extract and verify
./scripts/extract-plist-after-build.sh ~/Downloads/SeaTimeTracker.ipa

# 3. Confirm:
#    ✅ "seatimetracker" is present
#    ✅ "SeaTime Tracker" is gone
```

## 📞 Support

If you encounter issues with the validation scripts:
1. Check the error message - it usually contains the fix
2. Use `test-scheme.js` to test different scheme values
3. Use `verify-built-scheme.js` to see what will be built
4. Use `extract-plist-after-build.sh` to verify actual builds
5. Refer to the RFC1738 rules above
6. Check the App Store Connect error message for specific requirements
7. See `SCHEME_VERIFICATION_GUIDE.md` for detailed verification instructions
