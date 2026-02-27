
# URL Scheme Validation Guide

## 🚨 Critical Issue

Your current `app.json` contains **invalid URL schemes** that will cause App Store submission to fail:

```json
{
  "expo": {
    "scheme": "SeaTime Tracker"  // ❌ INVALID - contains spaces
  },
  "scheme": "SeaTime Tracker"  // ❌ INVALID - contains spaces
}
```

## ✅ Quick Fix

**Option 1: No spaces (recommended)**
```json
{
  "expo": {
    "scheme": "seatimetracker"
  }
}
```

**Option 2: With hyphen**
```json
{
  "expo": {
    "scheme": "seatime-tracker"
  }
}
```

**Option 3: Reverse domain notation**
```json
{
  "expo": {
    "scheme": "com.forelandmarine.seatimetracker"
  }
}
```

## 🔍 Validation Script

We've created a validation script that checks your URL scheme **before** building.

### Run Validation

```bash
node scripts/validate-scheme.js
```

### Expected Output (Current - FAIL)

```
🔍 Validating URL Scheme in app.json...

Checking expo.scheme: "SeaTime Tracker"
❌ INVALID

Validation Errors:
  • Scheme contains spaces (not allowed in RFC1738)
  • Scheme contains invalid characters (only A-Z, a-z, 0-9, ., -, + are allowed)

💡 Suggested fix:
   Change "SeaTime Tracker" to "seatimetracker"

═══════════════════════════════════════════════════════
❌ BUILD FAILED: Invalid URL Scheme
═══════════════════════════════════════════════════════
```

### Expected Output (After Fix - PASS)

```
🔍 Validating URL Scheme in app.json...

Checking expo.scheme: "seatimetracker"
✅ VALID

✅ All URL schemes are valid!
```

## 📋 Integration Options

### Option 1: Manual Validation (Immediate Use)

Run before every build:

```bash
# 1. Validate
node scripts/validate-scheme.js

# 2. If validation passes, build
npm run build:ios
```

### Option 2: CI/CD Integration

**GitHub Actions** (already created at `.github/workflows/validate-scheme.yml`):
- Automatically runs on every push/PR
- Blocks merges if validation fails

**GitLab CI** - Add to `.gitlab-ci.yml`:
```yaml
validate-scheme:
  stage: test
  script:
    - node scripts/validate-scheme.js
  only:
    changes:
      - app.json
```

**Bitbucket Pipelines** - Add to `bitbucket-pipelines.yml`:
```yaml
pipelines:
  default:
    - step:
        name: Validate URL Scheme
        script:
          - node scripts/validate-scheme.js
```

### Option 3: Pre-commit Hook

Prevent commits with invalid schemes:

```bash
# Create pre-commit hook
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
node scripts/validate-scheme.js
if [ $? -ne 0 ]; then
  echo "❌ Commit blocked: Fix URL scheme first"
  exit 1
fi
EOF

# Make it executable
chmod +x .git/hooks/pre-commit
```

### Option 4: EAS Build Integration

Add to `eas.json`:

```json
{
  "build": {
    "production": {
      "ios": {
        "prebuildCommand": "node scripts/validate-scheme.js"
      }
    },
    "preview": {
      "ios": {
        "prebuildCommand": "node scripts/validate-scheme.js"
      }
    }
  }
}
```

## 📖 RFC1738 Rules

A valid URL scheme must:

1. ✅ Start with a **letter** (A-Z or a-z)
2. ✅ Only contain: **letters, numbers, `.`, `-`, `+`**
3. ❌ **NO spaces**
4. ❌ **NO underscores** (`_`)
5. ❌ **NO special characters** (`@`, `#`, `$`, etc.)

**Pattern:** `^[A-Za-z][A-Za-z0-9.+-]*$`

## 🎯 Recommended Actions

### Immediate (Before Next Build)

1. **Fix app.json**
   ```bash
   # Edit app.json
   # Change "scheme": "SeaTime Tracker"
   # To:     "scheme": "seatimetracker"
   ```

2. **Validate**
   ```bash
   node scripts/validate-scheme.js
   ```

3. **Build**
   ```bash
   npm run build:ios
   ```

### Long-term (Prevent Future Issues)

1. **Add to CI/CD**
   - GitHub Actions workflow is already created
   - Enable it by pushing to your repository

2. **Add pre-commit hook** (optional)
   ```bash
   chmod +x scripts/ci-validate-scheme.sh
   # Add to .git/hooks/pre-commit
   ```

3. **Document in team workflow**
   - Add validation step to build documentation
   - Train team members on RFC1738 rules

## 🐛 Troubleshooting

### "Validation passed but App Store still rejects"

Check these additional locations:

1. **ios/Info.plist** (if using bare workflow)
   ```xml
   <key>CFBundleURLSchemes</key>
   <array>
     <string>seatimetracker</string> <!-- Must match app.json -->
   </array>
   ```

2. **app.config.js** (if using dynamic config)
   ```javascript
   export default {
     expo: {
       scheme: 'seatimetracker' // Must be valid
     }
   }
   ```

3. **Multiple schemes**
   - If you have multiple URL schemes, ALL must be valid
   - Check for schemes added by plugins

### "Script not found"

Make sure you're in the project root:
```bash
cd /path/to/your/project
node scripts/validate-scheme.js
```

### "Permission denied"

For the bash script:
```bash
chmod +x scripts/ci-validate-scheme.sh
./scripts/ci-validate-scheme.sh
```

## 📚 Additional Resources

- [Expo Linking Guide](https://docs.expo.dev/guides/linking/)
- [RFC1738 Specification](https://www.ietf.org/rfc/rfc1738.txt)
- [Apple URL Scheme Guide](https://developer.apple.com/documentation/xcode/defining-a-custom-url-scheme-for-your-app)
- [Android Deep Linking](https://developer.android.com/training/app-links/deep-linking)

## ✅ Checklist

Before your next build:

- [ ] Run `node scripts/validate-scheme.js`
- [ ] Fix any validation errors in `app.json`
- [ ] Verify the scheme works: `seatimetracker://` (no spaces)
- [ ] Update any documentation referencing the old scheme
- [ ] Test deep linking with the new scheme
- [ ] Integrate validation into CI/CD (optional but recommended)

---

**Need help?** Run the validation script and follow the suggestions in the output.
