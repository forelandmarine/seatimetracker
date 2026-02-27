
#!/usr/bin/env node
/**
 * URL Scheme Validator for app.json
 * 
 * Validates that expo.scheme follows RFC1738 URL scheme rules:
 * - Must start with an alphabetic character
 * - Can only contain alphanumeric characters, periods (.), hyphens (-), or plus signs (+)
 * - Must NOT contain spaces
 * - Pattern: ^[A-Za-z][A-Za-z0-9.+-]*$
 * 
 * This script runs before prebuild to catch invalid schemes early.
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m',
};

// RFC1738 URL scheme validation pattern
const VALID_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9.+-]*$/;

/**
 * Validates a URL scheme against RFC1738 rules
 * @param {string} scheme - The URL scheme to validate
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validateScheme(scheme) {
  const errors = [];

  if (!scheme) {
    errors.push('Scheme is empty or undefined');
    return { valid: false, errors };
  }

  if (typeof scheme !== 'string') {
    errors.push(`Scheme must be a string, got ${typeof scheme}`);
    return { valid: false, errors };
  }

  // Check for spaces
  if (scheme.includes(' ')) {
    errors.push('Scheme contains spaces (not allowed in RFC1738)');
  }

  // Check if it starts with a letter
  if (!/^[A-Za-z]/.test(scheme)) {
    errors.push('Scheme must start with an alphabetic character (A-Z or a-z)');
  }

  // Check against full pattern
  if (!VALID_SCHEME_PATTERN.test(scheme)) {
    errors.push('Scheme contains invalid characters (only A-Z, a-z, 0-9, ., -, + are allowed)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Suggests a valid scheme based on an invalid one
 * @param {string} invalidScheme - The invalid scheme
 * @returns {string} - A suggested valid scheme
 */
function suggestValidScheme(invalidScheme) {
  if (!invalidScheme) return 'myapp';

  // Remove spaces and convert to lowercase
  let suggestion = invalidScheme.toLowerCase().replace(/\s+/g, '');

  // Remove invalid characters (keep only alphanumeric, ., -, +)
  suggestion = suggestion.replace(/[^a-z0-9.+-]/g, '');

  // Ensure it starts with a letter
  if (!/^[a-z]/.test(suggestion)) {
    suggestion = 'app' + suggestion;
  }

  return suggestion || 'myapp';
}

/**
 * Main validation function
 */
function main() {
  console.log(`\n${colors.blue}${colors.bold}🔍 Validating URL Scheme in app.json...${colors.reset}\n`);

  // Read app.json
  const appJsonPath = path.join(process.cwd(), 'app.json');

  if (!fs.existsSync(appJsonPath)) {
    console.error(`${colors.red}${colors.bold}❌ ERROR: app.json not found at ${appJsonPath}${colors.reset}\n`);
    process.exit(1);
  }

  let appJson;
  try {
    const appJsonContent = fs.readFileSync(appJsonPath, 'utf8');
    appJson = JSON.parse(appJsonContent);
  } catch (error) {
    console.error(`${colors.red}${colors.bold}❌ ERROR: Failed to parse app.json${colors.reset}`);
    console.error(`${colors.red}${error.message}${colors.reset}\n`);
    process.exit(1);
  }

  // Check both expo.scheme and root-level scheme
  const schemesToCheck = [];

  if (appJson.expo && appJson.expo.scheme) {
    schemesToCheck.push({ location: 'expo.scheme', value: appJson.expo.scheme });
  }

  if (appJson.scheme) {
    schemesToCheck.push({ location: 'scheme (root level)', value: appJson.scheme });
  }

  if (schemesToCheck.length === 0) {
    console.log(`${colors.yellow}⚠️  WARNING: No URL scheme found in app.json${colors.reset}`);
    console.log(`${colors.yellow}   Consider adding "scheme" to expo configuration${colors.reset}\n`);
    process.exit(0);
  }

  let hasErrors = false;

  // Validate each scheme
  schemesToCheck.forEach(({ location, value }) => {
    console.log(`${colors.bold}Checking ${location}:${colors.reset} "${value}"`);

    const validation = validateScheme(value);

    if (validation.valid) {
      console.log(`${colors.green}✅ VALID${colors.reset}\n`);
    } else {
      hasErrors = true;
      console.log(`${colors.red}${colors.bold}❌ INVALID${colors.reset}\n`);

      console.log(`${colors.red}${colors.bold}Validation Errors:${colors.reset}`);
      validation.errors.forEach((error) => {
        console.log(`${colors.red}  • ${error}${colors.reset}`);
      });

      const suggestion = suggestValidScheme(value);
      console.log(`\n${colors.yellow}${colors.bold}💡 Suggested fix:${colors.reset}`);
      console.log(`${colors.yellow}   Change "${value}" to "${suggestion}"${colors.reset}\n`);
    }
  });

  if (hasErrors) {
    console.log(`${colors.red}${colors.bold}═══════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.red}${colors.bold}❌ BUILD FAILED: Invalid URL Scheme${colors.reset}`);
    console.log(`${colors.red}${colors.bold}═══════════════════════════════════════════════════════${colors.reset}\n`);

    console.log(`${colors.bold}RFC1738 URL Scheme Rules:${colors.reset}`);
    console.log(`  1. Must start with an alphabetic character (A-Z or a-z)`);
    console.log(`  2. Can only contain: letters, numbers, period (.), hyphen (-), plus (+)`);
    console.log(`  3. Must NOT contain spaces`);
    console.log(`  4. Pattern: ^[A-Za-z][A-Za-z0-9.+-]*$\n`);

    console.log(`${colors.bold}How to fix:${colors.reset}`);
    console.log(`  1. Open app.json`);
    console.log(`  2. Update the "scheme" field(s) with a valid value`);
    console.log(`  3. Run this script again to verify\n`);

    console.log(`${colors.bold}Example valid schemes:${colors.reset}`);
    console.log(`  ${colors.green}✅ "myapp"${colors.reset}`);
    console.log(`  ${colors.green}✅ "seatimetracker"${colors.reset}`);
    console.log(`  ${colors.green}✅ "seatime-tracker"${colors.reset}`);
    console.log(`  ${colors.green}✅ "com.company.app"${colors.reset}`);
    console.log(`  ${colors.green}✅ "app123"${colors.reset}\n`);

    console.log(`${colors.bold}Example invalid schemes:${colors.reset}`);
    console.log(`  ${colors.red}❌ "SeaTime Tracker" (contains spaces)${colors.reset}`);
    console.log(`  ${colors.red}❌ "my app" (contains space)${colors.reset}`);
    console.log(`  ${colors.red}❌ "123app" (starts with number)${colors.reset}`);
    console.log(`  ${colors.red}❌ "my_app" (contains underscore)${colors.reset}\n`);

    console.log(`${colors.yellow}${colors.bold}⚠️  This validation prevents App Store submission failures${colors.reset}\n`);

    process.exit(1);
  }

  console.log(`${colors.green}${colors.bold}✅ All URL schemes are valid!${colors.reset}\n`);
  process.exit(0);
}

// Run the validation
main();
