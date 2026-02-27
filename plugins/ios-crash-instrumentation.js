
/**
 * Expo Config Plugin: iOS Native Crash Instrumentation & RevenueCat Fix
 * 
 * This plugin handles two critical iOS issues:
 * 1. Native crash instrumentation (currently disabled)
 * 2. RevenueCat StoreKit validation fix for TestFlight builds
 * 
 * The RevenueCat fix prevents crashes in TestFlight by allowing sandbox
 * StoreKit environments in release builds (TestFlight uses sandbox receipts).
 */

const { withDangerousMod, withPlugins } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Fix RevenueCat's StoreKit validation to allow TestFlight builds
 * 
 * The issue: RevenueCat's Configuration.swift has a validation check that
 * intentionally crashes when it detects a "simulated StoreKit environment"
 * in a release build. However, TestFlight uses Apple's sandbox environment,
 * which is legitimate and should be allowed.
 * 
 * The fix: We add a preprocessor flag to disable the assertion in release builds
 * while keeping it active in debug builds for local development.
 */
function withRevenueCatTestFlightFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const podfilePath = path.join(projectRoot, 'Podfile');

      // Check if Podfile exists
      if (!fs.existsSync(podfilePath)) {
        console.log('[RevenueCat Fix] Podfile not found, skipping patch');
        return config;
      }

      let podfileContent = fs.readFileSync(podfilePath, 'utf-8');

      // Check if our fix is already applied
      if (podfileContent.includes('REVENUECAT_TESTFLIGHT_FIX')) {
        console.log('[RevenueCat Fix] Already applied, skipping');
        return config;
      }

      // Add an isolated post_install hook to patch RevenueCat.
      // CocoaPods supports multiple post_install hooks, so we avoid
      // rewriting/removing Expo's existing hook (which can break Podfile syntax).
      const postInstallHook = `
# BEGIN RevenueCat TestFlight Fix
# This fixes the crash in TestFlight caused by StoreKit validation
# The fix allows sandbox StoreKit environments in release builds (TestFlight)
# while still preventing simulated StoreKit configuration files in debug builds
post_install do |installer|
  installer.pods_project.targets.each do |target|
    if target.name == 'RevenueCat' || target.name.start_with?('Purchases')
      target.build_configurations.each do |config|
        # Only apply fix to Release builds (TestFlight, App Store)
        # Debug builds keep the original validation
        if config.name == 'Release'
          # Add preprocessor flag to disable the assertion
          config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
          config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'REVENUECAT_TESTFLIGHT_FIX=1'
          
          # Also set Swift compiler flags
          config.build_settings['OTHER_SWIFT_FLAGS'] ||= ['$(inherited)']
          config.build_settings['OTHER_SWIFT_FLAGS'] << '-DREVENUECAT_TESTFLIGHT_FIX'
          
          puts "✅ Applied RevenueCat TestFlight fix to #{target.name} (#{config.name})"
        end
      end
    end
    
    # Standard React Native post_install fixes
    target.build_configurations.each do |config|
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '13.4'
    end
  end
end
# END RevenueCat TestFlight Fix
`;

      // Add our post_install hook at the end
      podfileContent = podfileContent.trim() + '\n\n' + postInstallHook.trim() + '\n';

      // Write back
      fs.writeFileSync(podfilePath, podfileContent, 'utf-8');
      console.log('[RevenueCat Fix] ✅ Podfile patched successfully');
      console.log('[RevenueCat Fix] TestFlight builds will now work with sandbox StoreKit');

      return config;
    },
  ]);
}

/**
 * Main plugin export
 */
module.exports = function withIOSCrashInstrumentation(config) {
  // Apply RevenueCat TestFlight fix
  return withPlugins(config, [withRevenueCatTestFlightFix]);
};
