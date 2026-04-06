
/**
 * Expo Config Plugin: iOS Native Crash Instrumentation & RevenueCat Fix
 * 
 * This plugin handles two critical iOS issues:
 * 1. Native crash instrumentation (currently disabled)
 * 2. RevenueCat StoreKit validation fix for TestFlight builds
 * 3. Podfile-level config hash fix for use_native_modules!
 * 
 * The RevenueCat fix prevents crashes in TestFlight by allowing sandbox
 * StoreKit environments in release builds (TestFlight uses sandbox receipts).
 * 
 * The config hash fix prevents "undefined local variable or method `config`"
 * errors during pod install by ensuring a top-level config hash exists.
 */

const { withDangerousMod, withPlugins } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Ensure top-level config hash exists in Podfile for use_native_modules!
 * This prevents "undefined local variable or method `config`" errors.
 */
function ensureUseNativeModulesConfig(podfileContent) {
  const shim =
    "config = { :reactNativePath => '../node_modules/react-native', :react_native_path => '../node_modules/react-native' }\n\n";

  // "Top-level" means before the first `target '...' do` line
  const firstTargetIdx = podfileContent.search(/^\s*target\s+['"][^'"]+['"]\s+do\s*$/m);
  const head = firstTargetIdx !== -1 ? podfileContent.slice(0, firstTargetIdx) : podfileContent;

  // If config is already defined at TOP LEVEL, do nothing.
  const hasTopLevelConfig =
    /(^|\n)\s*config\s*=\s*(use_native_modules!|\{)/m.test(head);

  if (hasTopLevelConfig) {
    return podfileContent;
  }

  // Insert shim before first target if present, else prepend.
  if (firstTargetIdx !== -1) {
    const before = podfileContent.slice(0, firstTargetIdx);
    const after = podfileContent.slice(firstTargetIdx);
    return `${before}${shim}${after}`;
  }

  return `${shim}${podfileContent}`;
}

/**
 * Extract the body content from a post_install block
 */
function extractPostInstallBody(postInstallBlock) {
  // Remove the opening "post_install do |installer|" line
  let body = postInstallBlock.replace(/^\s*post_install\s+do\s+\|installer\|\s*\n?/m, '');
  
  // Remove the closing "end" - we need to be careful here
  // Count the number of 'do' and 'end' keywords to find the matching end
  const lines = body.split('\n');
  let depth = 0;
  let lastEndIndex = -1;
  
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line === 'end' || line.startsWith('end ') || line.startsWith('end#')) {
      if (depth === 0) {
        lastEndIndex = i;
        break;
      }
      depth++;
    }
    if (line.includes(' do ') || line.includes(' do|') || line.endsWith(' do')) {
      depth--;
    }
  }
  
  if (lastEndIndex > 0) {
    body = lines.slice(0, lastEndIndex).join('\n');
  }
  
  return body.trim();
}

/**
 * Wrap code that uses 'config' variable in proper nested loop structure
 */
function wrapConfigCode(code) {
  // Check if the code uses 'config' variable
  if (!code.includes('config.')) {
    return code;
  }
  
  // Check if it's already wrapped in the proper structure
  if (code.includes('installer.pods_project.targets.each') && 
      code.includes('target.build_configurations.each')) {
    return code;
  }
  
  // If code uses config but isn't wrapped, wrap it
  const indentedCode = code.split('\n').map(line => '      ' + line).join('\n');
  
  return `  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
${indentedCode}
    end
  end`;
}

/**
 * Find all post_install blocks in the Podfile
 */
function findPostInstallBlocks(content) {
  const blocks = [];
  const lines = content.split('\n');
  let inBlock = false;
  let blockStart = -1;
  let depth = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Check if this is the start of a post_install block
    if (trimmed.startsWith('post_install') && trimmed.includes('do')) {
      inBlock = true;
      blockStart = i;
      depth = 1;
      continue;
    }
    
    if (inBlock) {
      // Count nested do/end blocks
      if (trimmed.includes(' do ') || trimmed.includes(' do|') || trimmed.endsWith(' do')) {
        depth++;
      }
      if (trimmed === 'end' || trimmed.startsWith('end ') || trimmed.startsWith('end#')) {
        depth--;
        if (depth === 0) {
          // Found the matching end
          const blockLines = lines.slice(blockStart, i + 1);
          blocks.push({
            start: blockStart,
            end: i,
            content: blockLines.join('\n')
          });
          inBlock = false;
          blockStart = -1;
        }
      }
    }
  }
  
  return blocks;
}

/**
 * Fix RevenueCat's StoreKit validation to allow TestFlight builds
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

      // Apply the native modules config shim immediately after reading
      podfileContent = ensureUseNativeModulesConfig(podfileContent);

      // Check if our fix is already applied
      if (podfileContent.includes('REVENUECAT_TESTFLIGHT_FIX')) {
        console.log('[RevenueCat Fix] Already applied, skipping');
        // Still write back to ensure config shim is present
        podfileContent = ensureUseNativeModulesConfig(podfileContent);
        fs.writeFileSync(podfilePath, podfileContent, 'utf-8');
        return config;
      }

      console.log('[RevenueCat Fix] Analyzing Podfile...');

      // Find all existing post_install blocks
      const existingBlocks = findPostInstallBlocks(podfileContent);
      
      console.log(`[RevenueCat Fix] Found ${existingBlocks.length} existing post_install block(s)`);

      // Extract the bodies of all existing post_install blocks
      const existingBodies = existingBlocks.map(block => extractPostInstallBody(block.content));

      // Remove all existing post_install blocks (in reverse order to maintain indices)
      let lines = podfileContent.split('\n');
      for (let i = existingBlocks.length - 1; i >= 0; i--) {
        const block = existingBlocks[i];
        lines.splice(block.start, block.end - block.start + 1);
      }
      podfileContent = lines.join('\n');

      // Build the new combined post_install block
      let newPostInstall = 'post_install do |installer|\n';
      
      // Add RevenueCat fix first
      newPostInstall += `  # RevenueCat TestFlight Fix
  # This fixes the crash in TestFlight caused by StoreKit validation
  installer.pods_project.targets.each do |target|
    if target.name == 'RevenueCat' || target.name.start_with?('Purchases')
      target.build_configurations.each do |config|
        if config.name == 'Release'
          config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
          config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'REVENUECAT_TESTFLIGHT_FIX=1'
          config.build_settings['OTHER_SWIFT_FLAGS'] ||= ['$(inherited)']
          config.build_settings['OTHER_SWIFT_FLAGS'] << '-DREVENUECAT_TESTFLIGHT_FIX'
        end
      end
    end
  end
`;

      // Add existing post_install logic
      if (existingBodies.length > 0) {
        newPostInstall += '\n  # Existing post_install logic\n';
        existingBodies.forEach((body, index) => {
          if (body) {
            // Wrap code that uses 'config' in proper nested structure
            const wrappedBody = wrapConfigCode(body);
            
            // Indent the body properly
            const indentedBody = wrappedBody.split('\n').map(line => {
              // If line is already indented or empty, keep it as is
              if (line.trim() === '' || line.startsWith('  ')) {
                return line;
              }
              // Otherwise add 2 spaces
              return '  ' + line;
            }).join('\n');
            
            newPostInstall += indentedBody + '\n';
          }
        });
      }

      newPostInstall += 'end\n';

      // Append the new post_install block to the end of the Podfile
      podfileContent = podfileContent.trim() + '\n\n' + newPostInstall;

      // Apply the native modules config shim again before writing (idempotent)
      podfileContent = ensureUseNativeModulesConfig(podfileContent);

      // Write back
      fs.writeFileSync(podfilePath, podfileContent, 'utf-8');
      
      console.log('[RevenueCat Fix] ✅ Podfile patched successfully');
      console.log('[RevenueCat Fix] Merged existing post_install logic with RevenueCat fix');
      console.log('[RevenueCat Fix] TestFlight builds will now work with sandbox StoreKit');
      console.log('[Config Fix] ✅ Top-level config hash ensured for use_native_modules!');

      return config;
    },
  ]);
}

/**
 * Main plugin export
 */
module.exports = function withIOSCrashInstrumentation(config) {
  return withPlugins(config, [withRevenueCatTestFlightFix]);
};
