
#!/usr/bin/env node

/**
 * Verification script to show what CFBundleURLSchemes will be in the built Info.plist
 * This simulates what Expo prebuild generates without actually building the app
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function readAppJson() {
  const appJsonPath = path.join(process.cwd(), 'app.json');
  
  if (!fs.existsSync(appJsonPath)) {
    log('❌ ERROR: app.json not found', 'red');
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(appJsonPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    log(`❌ ERROR: Failed to parse app.json: ${error.message}`, 'red');
    process.exit(1);
  }
}

function validateScheme(scheme) {
  // RFC1738 URL scheme validation: ^[A-Za-z][A-Za-z0-9.+-]*$
  const schemeRegex = /^[A-Za-z][A-Za-z0-9.+-]*$/;
  return schemeRegex.test(scheme);
}

function simulateInfoPlist(appJson) {
  const scheme = appJson.expo?.scheme || appJson.scheme;
  const bundleId = appJson.expo?.ios?.bundleIdentifier || `com.${appJson.expo?.slug || 'app'}`;
  
  return {
    CFBundleURLTypes: [
      {
        CFBundleURLSchemes: [scheme],
        CFBundleTypeRole: 'Editor',
      },
    ],
    CFBundleIdentifier: bundleId,
  };
}

function main() {
  log('\n═══════════════════════════════════════════════════════', 'cyan');
  log('📋 BUILT INFO.PLIST VERIFICATION', 'bright');
  log('═══════════════════════════════════════════════════════\n', 'cyan');

  // Read app.json
  log('📖 Reading app.json...', 'blue');
  const appJson = readAppJson();

  // Extract scheme
  const scheme = appJson.expo?.scheme || appJson.scheme;
  const slug = appJson.expo?.slug;
  const name = appJson.expo?.name;

  log(`\n📱 App Configuration:`, 'cyan');
  log(`   Name: ${name}`, 'reset');
  log(`   Slug: ${slug}`, 'reset');
  log(`   Scheme: ${scheme}`, 'reset');

  // Validate scheme
  log(`\n🔍 Validating URL Scheme...`, 'blue');
  const isValid = validateScheme(scheme);

  if (isValid) {
    log(`   ✅ VALID: "${scheme}" matches RFC1738 pattern`, 'green');
  } else {
    log(`   ❌ INVALID: "${scheme}" does NOT match RFC1738 pattern`, 'red');
    log(`   ⚠️  Must match: ^[A-Za-z][A-Za-z0-9.+-]*$`, 'yellow');
    log(`   ⚠️  No spaces, must start with a letter`, 'yellow');
  }

  // Check for old invalid scheme
  const hasSpaces = scheme && scheme.includes(' ');
  const isOldScheme = scheme === 'SeaTime Tracker';

  if (hasSpaces) {
    log(`\n❌ CRITICAL: Scheme contains SPACES - this will cause build failures!`, 'red');
  }

  if (isOldScheme) {
    log(`\n❌ OLD INVALID SCHEME DETECTED: "SeaTime Tracker"`, 'red');
    log(`   This should have been replaced with "seatimetracker" or "seatime-tracker"`, 'yellow');
  } else if (isValid) {
    log(`\n✅ CONFIRMED: Old "SeaTime Tracker" scheme has been replaced`, 'green');
  }

  // Simulate Info.plist output
  log(`\n📄 Simulated Info.plist CFBundleURLTypes Section:`, 'cyan');
  log('═══════════════════════════════════════════════════════', 'cyan');
  
  const plistData = simulateInfoPlist(appJson);
  
  log(`\n<key>CFBundleURLTypes</key>`, 'reset');
  log(`<array>`, 'reset');
  log(`  <dict>`, 'reset');
  log(`    <key>CFBundleURLSchemes</key>`, 'reset');
  log(`    <array>`, 'reset');
  log(`      <string>${scheme}</string>`, isValid ? 'green' : 'red');
  log(`    </array>`, 'reset');
  log(`    <key>CFBundleTypeRole</key>`, 'reset');
  log(`    <string>Editor</string>`, 'reset');
  log(`  </dict>`, 'reset');
  log(`</array>`, 'reset');

  log('\n═══════════════════════════════════════════════════════', 'cyan');

  // Final verdict
  log(`\n🎯 FINAL VERDICT:`, 'bright');
  
  if (isValid && !isOldScheme) {
    log(`   ✅ URL scheme is VALID and ready for production`, 'green');
    log(`   ✅ "SeaTime Tracker" has been successfully replaced`, 'green');
    log(`   ✅ The built Info.plist will contain: "${scheme}"`, 'green');
    log(`\n   You can safely proceed with: eas build --platform ios`, 'cyan');
  } else {
    log(`   ❌ URL scheme is INVALID - build will fail`, 'red');
    log(`   ❌ Fix app.json before building`, 'red');
    log(`\n   Run: npm run validate-scheme`, 'yellow');
  }

  log('\n═══════════════════════════════════════════════════════\n', 'cyan');

  // Exit with appropriate code
  process.exit(isValid ? 0 : 1);
}

main();
