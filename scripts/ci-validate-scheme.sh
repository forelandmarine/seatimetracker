
#!/bin/bash

# CI Script for URL Scheme Validation
# This script can be run in CI/CD pipelines (GitHub Actions, GitLab CI, etc.)
# or manually before building the app.
#
# Usage:
#   chmod +x scripts/ci-validate-scheme.sh
#   ./scripts/ci-validate-scheme.sh
#
# Exit codes:
#   0 - Validation passed
#   1 - Validation failed

set -e

echo ""
echo "🔍 Running URL Scheme Validation..."
echo ""

# Run the Node.js validation script
node scripts/validate-scheme.js

# If we get here, validation passed
echo "✅ Validation complete - ready to build!"
echo ""

exit 0
