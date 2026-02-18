
# Quick Start: URL Scheme Validation

## 🚨 Your Current Problem

Your `app.json` has an invalid URL scheme that will cause App Store rejection:

```json
"scheme": "SeaTime Tracker"  // ❌ Contains spaces - INVALID
```

## ✅ 3-Step Fix

### Step 1: Run Validation
```bash
node scripts/validate-scheme.js
```

You'll see:
```
❌ INVALID
Validation Errors:
  • Scheme contains spaces (not allowed in RFC1738)

💡 Suggested fix: Change "SeaTime Tracker" to "seatimetracker"
```

### Step 2: Fix app.json

Open `app.json` and change:

**Before:**
```json
{
  "expo": {
    "scheme": "SeaTime Tracker"
  },
  "scheme": "SeaTime Tracker"
}
```

**After:**
```json
{
  "expo": {
    "scheme": "seatimetracker"
  }
}
```

**Note:** Remove the root-level `"scheme"` - it's not needed.

### Step 3: Verify Fix
```bash
node scripts/validate-scheme.js
```

You should see:
```
✅ VALID
✅ All URL schemes are valid!
```

## 🎯 Done!

Now you can build without App Store rejection:
```bash
npm run build:ios
```

## 📖 Want More?

- **Full documentation:** See `scripts/README.md`
- **Integration options:** See `SCHEME_VALIDATION.md`
- **Test any scheme:** `node scripts/test-scheme.js "your-scheme"`

## 🔄 Future Builds

Always run validation before building:
```bash
node scripts/validate-scheme.js && npm run build:ios
```

Or set up automatic validation with GitHub Actions (see `SCHEME_VALIDATION.md`).

---

**That's it!** Three steps and you're protected from URL scheme errors. 🎉
