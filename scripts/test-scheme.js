
#!/usr/bin/env node
/**
 * Quick URL Scheme Tester
 * 
 * Test any URL scheme against RFC1738 rules without modifying app.json
 * 
 * Usage:
 *   node scripts/test-scheme.js "myapp"
 *   node scripts/test-scheme.js "SeaTime Tracker"
 *   node scripts/test-scheme.js "seatime-tracker"
 */

const VALID_SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9.+-]*$/;

function testScheme(scheme) {
  console.log(`\nTesting: "${scheme}"\n`);

  const errors = [];

  if (!scheme) {
    console.log('❌ Empty scheme');
    return;
  }

  // Check for spaces
  if (scheme.includes(' ')) {
    errors.push('Contains spaces');
  }

  // Check if starts with letter
  if (!/^[A-Za-z]/.test(scheme)) {
    errors.push('Does not start with a letter');
  }

  // Check for invalid characters
  const invalidChars = scheme.match(/[^A-Za-z0-9.+-]/g);
  if (invalidChars) {
    errors.push(`Contains invalid characters: ${[...new Set(invalidChars)].join(', ')}`);
  }

  // Overall pattern check
  const isValid = VALID_SCHEME_PATTERN.test(scheme);

  if (isValid) {
    console.log('✅ VALID - This scheme is RFC1738 compliant\n');
  } else {
    console.log('❌ INVALID\n');
    console.log('Errors:');
    errors.forEach(err => console.log(`  • ${err}`));
    
    // Suggest fix
    const suggestion = scheme.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9.+-]/g, '');
    const finalSuggestion = /^[a-z]/.test(suggestion) ? suggestion : 'app' + suggestion;
    console.log(`\n💡 Suggested fix: "${finalSuggestion}"\n`);
  }
}

// Get scheme from command line argument
const testValue = process.argv[2];

if (!testValue) {
  console.log('\nUsage: node scripts/test-scheme.js "your-scheme-here"\n');
  console.log('Examples:');
  console.log('  node scripts/test-scheme.js "myapp"');
  console.log('  node scripts/test-scheme.js "SeaTime Tracker"');
  console.log('  node scripts/test-scheme.js "seatime-tracker"\n');
  process.exit(1);
}

testScheme(testValue);
