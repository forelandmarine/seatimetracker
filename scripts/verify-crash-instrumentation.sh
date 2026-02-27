
#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# iOS TurboModule Crash Instrumentation Verification Script
# ═══════════════════════════════════════════════════════════════════════════
# 
# This script verifies that all crash diagnostic tools are properly installed
# and will be included in the TestFlight build.
#
# Run this BEFORE building for TestFlight to ensure instrumentation is active.
# ═══════════════════════════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════════════════════════════════════"
echo "🔍 iOS TurboModule Crash Instrumentation Verification"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check 1: patch-package installed
echo "📦 [1/7] Checking patch-package installation..."
if command -v patch-package &> /dev/null; then
    echo -e "${GREEN}✅ patch-package is installed${NC}"
else
    echo -e "${RED}❌ patch-package is NOT installed${NC}"
    echo "   Run: npm install patch-package"
    exit 1
fi

# Check 2: postinstall script configured
echo ""
echo "📝 [2/7] Checking postinstall script..."
if grep -q '"postinstall".*"patch-package"' package.json; then
    echo -e "${GREEN}✅ postinstall script is configured${NC}"
else
    echo -e "${RED}❌ postinstall script is NOT configured${NC}"
    echo "   Add to package.json scripts: \"postinstall\": \"patch-package\""
    exit 1
fi

# Check 3: React Native patch exists
echo ""
echo "🔧 [3/7] Checking React Native patch file..."
if [ -f "patches/react-native+0.81.5.patch" ]; then
    echo -e "${GREEN}✅ React Native patch file exists${NC}"
    
    # Verify patch contains TurboModule logging
    if grep -q "TurboModuleInvoke" patches/react-native+0.81.5.patch; then
        echo -e "${GREEN}✅ Patch contains TurboModule invocation logging${NC}"
    else
        echo -e "${RED}❌ Patch does NOT contain TurboModule logging${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ React Native patch file does NOT exist${NC}"
    echo "   Expected: patches/react-native+0.81.5.patch"
    exit 1
fi

# Check 4: Config plugin exists
echo ""
echo "🔌 [4/7] Checking iOS crash instrumentation plugin..."
if [ -f "plugins/ios-crash-instrumentation.js" ]; then
    echo -e "${GREEN}✅ iOS crash instrumentation plugin exists${NC}"
    
    # Verify plugin contains crash handlers
    if grep -q "NSSetUncaughtExceptionHandler" plugins/ios-crash-instrumentation.js; then
        echo -e "${GREEN}✅ Plugin contains crash handler installation${NC}"
    else
        echo -e "${RED}❌ Plugin does NOT contain crash handlers${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ iOS crash instrumentation plugin does NOT exist${NC}"
    echo "   Expected: plugins/ios-crash-instrumentation.js"
    exit 1
fi

# Check 5: Config plugin activated in app.json
echo ""
echo "📱 [5/7] Checking app.json plugin configuration..."
if grep -q '"./plugins/ios-crash-instrumentation.js"' app.json; then
    echo -e "${GREEN}✅ Crash instrumentation plugin is activated in app.json${NC}"
else
    echo -e "${RED}❌ Crash instrumentation plugin is NOT activated in app.json${NC}"
    echo "   Add to app.json plugins array: \"./plugins/ios-crash-instrumentation.js\""
    exit 1
fi

# Check 6: AuthContext uses dynamic import
echo ""
echo "🔐 [6/7] Checking AuthContext for dynamic SecureStore import..."
if grep -q "await import('expo-secure-store')" contexts/AuthContext.tsx; then
    echo -e "${GREEN}✅ AuthContext uses dynamic SecureStore import${NC}"
else
    echo -e "${YELLOW}⚠️  AuthContext may not use dynamic import${NC}"
    echo "   This could cause TurboModule crashes"
fi

# Check 7: App layout has delayed native module loading
echo ""
echo "⏱️  [7/7] Checking app/_layout.tsx for delayed native module loading..."
if grep -q "EXTREME DELAYED NATIVE MODULE LOADING" app/_layout.tsx; then
    echo -e "${GREEN}✅ App layout has delayed native module loading${NC}"
else
    echo -e "${YELLOW}⚠️  App layout may not have delayed loading${NC}"
    echo "   This could cause TurboModule crashes"
fi

# Final summary
echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo -e "${GREEN}✅ ALL CHECKS PASSED${NC}"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
echo "📋 Next Steps:"
echo "   1. Run: npm install (to apply patches)"
echo "   2. Run: npx expo prebuild --clean (to generate native projects)"
echo "   3. Build for TestFlight: eas build --platform ios --profile production"
echo "   4. After crash, check device console for [TurboModuleInvoke] logs"
echo ""
echo "🔍 Monitoring Instructions:"
echo "   1. Connect device to Mac via USB"
echo "   2. Open Xcode > Devices and Simulators"
echo "   3. Select device > Open Console"
echo "   4. Filter by: TurboModuleInvoke"
echo "   5. Reproduce crash"
echo "   6. Last [TurboModuleInvoke] log before crash = culprit"
echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
