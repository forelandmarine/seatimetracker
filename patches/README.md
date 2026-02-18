
# React Native Patches

This directory contains patches applied to `node_modules` packages using `patch-package`.

## Current Status

**No active patches.**

The previous `react-native+0.81.5.patch` for TurboModule diagnostic logging has been removed because:
1. The patch file was malformed (placeholder line numbers instead of actual git diff)
2. It was blocking EAS builds with `patch-package` errors
3. Native crash instrumentation is handled by `plugins/ios-crash-instrumentation.js` instead

## iOS Crash Diagnostics

For iOS crash diagnostics, we use:
- **Native crash handlers** via `plugins/ios-crash-instrumentation.js`
- **NSSetUncaughtExceptionHandler** for Objective-C exceptions
- **RCTSetFatalHandler** for React Native fatal errors
- **RCTSetFatalExceptionHandler** for React Native exceptions

These are injected into `AppDelegate.mm` during prebuild and provide:
- Exception name and reason
- Call stack symbols
- Visible in Xcode device console logs

## How Patches Work

### Automatic Application

Patches are automatically applied when you run:
```bash
npm install
```

This is configured in `package.json`:
```json
{
  "scripts": {
    "postinstall": "patch-package"
  }
}
```

### Creating New Patches

If you need to modify a package:

1. **Make changes** to the file in `node_modules`:
   ```bash
   # Example: Edit a file
   code node_modules/some-package/lib/file.js
   ```

2. **Create patch**:
   ```bash
   npx patch-package some-package
   ```

3. **Commit patch file**:
   ```bash
   git add patches/some-package+1.2.3.patch
   git commit -m "Add patch for some-package"
   ```

4. **Verify patch works**:
   ```bash
   # Clean install
   rm -rf node_modules
   npm install
   
   # Check if patch was applied
   cat node_modules/some-package/lib/file.js
   ```

## Troubleshooting

### Patch Not Applied

**Symptom:** Changes are not present in `node_modules` after `npm install`

**Solutions:**
1. Check `postinstall` script exists in `package.json`
2. Run `npm run postinstall` manually
3. Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`

### Patch Fails to Apply

**Symptom:** Error during `npm install` about patch failing

**Causes:**
- Package version changed (patch is for specific version)
- Package file structure changed
- Patch file is corrupted or malformed

**Solutions:**
1. Check package version matches patch filename
2. Recreate patch from scratch by editing `node_modules` and running `npx patch-package`
3. Update patch for new package version
4. If patch is blocking builds, remove it: `rm patches/package-name+version.patch`

## Best Practices

1. **Document patches** - Always add comments explaining why the patch exists
2. **Keep patches minimal** - Only change what's necessary
3. **Test thoroughly** - Verify patch works in development and production
4. **Plan for removal** - Patches should be temporary until official fix is available
5. **Version control** - Always commit patch files to git
6. **Valid patches only** - Never commit malformed patches with placeholder line numbers

## Maintenance

### When to Update Patches

- Package version is upgraded
- Official fix is released (remove patch)
- Bug is fixed upstream (remove patch)
- New functionality is needed (update patch)

### How to Remove Patches

1. **Delete patch file**:
   ```bash
   rm patches/package-name+version.patch
   ```

2. **Clean install**:
   ```bash
   rm -rf node_modules
   npm install
   ```

## Related Documentation

- **iOS Crash Plugin:** `../plugins/ios-crash-instrumentation.js`
- **Diagnostic Guide:** `../TURBOMODULE_CRASH_DIAGNOSTIC_GUIDE.md`
- **Testing Guide:** `../CRASH_TESTING_GUIDE.md`

## Support

If you have questions about patches:
1. Check this README
2. Review the patch file itself
3. Check `patch-package` documentation: https://github.com/ds300/patch-package

---

**Last Updated:** 2026-02-06  
**Maintained by:** Development Team
