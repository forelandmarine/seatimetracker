
const { withInfoPlist, withAndroidManifest } = require('@expo/config-plugins');

/**
 * Custom Expo config plugin for RevenueCat
 * Injects API keys into native project files for iOS and Android
 */
const withRevenueCat = (config, { iosApiKey, androidApiKey } = {}) => {
  console.log('🔧 [RevenueCat Plugin] Configuring RevenueCat...');
  console.log(`📱 iOS API Key: ${iosApiKey ? `${iosApiKey.substring(0, 10)}...` : 'NOT PROVIDED'}`);
  console.log(`🤖 Android API Key: ${androidApiKey ? `${androidApiKey.substring(0, 10)}...` : 'NOT PROVIDED'}`);

  // iOS Configuration - Add API key to Info.plist
  config = withInfoPlist(config, (config) => {
    console.log('📝 [RevenueCat Plugin] Configuring iOS Info.plist...');
    
    if (iosApiKey) {
      config.modResults.RevenueCatAPIKey = iosApiKey;
      console.log('✅ [RevenueCat Plugin] iOS API key added to Info.plist');
    } else {
      console.warn('⚠️ [RevenueCat Plugin] iOS API key not provided');
    }

    // Add SKAdNetwork identifiers for attribution
    const skAdNetworkIds = [
      'cstr6suwn9.skadnetwork',
      '4fzdc2evr5.skadnetwork',
      '4pfyvq9l8r.skadnetwork',
      'v72qych5uu.skadnetwork',
      'ludvb6z3bs.skadnetwork',
      'cp8zw746q7.skadnetwork',
      'c6k4g5qg8m.skadnetwork',
      'wg4vff78zm.skadnetwork',
      'g28c52eehv.skadnetwork',
      'hs6bdukanm.skadnetwork',
      '22mmun2rn5.skadnetwork',
      '4468km3ulz.skadnetwork',
      '2u9pt9hc89.skadnetwork',
      '8s468mfl3y.skadnetwork',
      'av6w8kgt66.skadnetwork',
      'klf5c3l5u5.skadnetwork',
      'ppxm28t8ap.skadnetwork',
      '424m5254lk.skadnetwork',
      'uw77j35x4d.skadnetwork',
      '578prtvx9j.skadnetwork',
      'e5fvkxwrpn.skadnetwork',
      '8c4e2ghe7u.skadnetwork',
      'zq492l623r.skadnetwork',
      '3qcr597p9d.skadnetwork'
    ];

    if (!config.modResults.SKAdNetworkItems) {
      config.modResults.SKAdNetworkItems = [];
    }

    skAdNetworkIds.forEach(id => {
      const exists = config.modResults.SKAdNetworkItems.some(
        item => item.SKAdNetworkIdentifier === id
      );
      if (!exists) {
        config.modResults.SKAdNetworkItems.push({
          SKAdNetworkIdentifier: id
        });
      }
    });

    console.log(`✅ [RevenueCat Plugin] Added ${skAdNetworkIds.length} SKAdNetwork identifiers`);

    return config;
  });

  // Android Configuration - Add API key to AndroidManifest.xml
  config = withAndroidManifest(config, (config) => {
    console.log('📝 [RevenueCat Plugin] Configuring Android Manifest...');
    
    const mainApplication = config.modResults.manifest.application[0];

    if (androidApiKey) {
      // Add RevenueCat API key as meta-data
      if (!mainApplication['meta-data']) {
        mainApplication['meta-data'] = [];
      }

      // Remove existing RevenueCat key if present
      mainApplication['meta-data'] = mainApplication['meta-data'].filter(
        item => item.$['android:name'] !== 'com.revenuecat.purchases.api_key'
      );

      // Add new key
      mainApplication['meta-data'].push({
        $: {
          'android:name': 'com.revenuecat.purchases.api_key',
          'android:value': androidApiKey
        }
      });

      console.log('✅ [RevenueCat Plugin] Android API key added to AndroidManifest.xml');
    } else {
      console.warn('⚠️ [RevenueCat Plugin] Android API key not provided');
    }

    // Add billing permission for in-app purchases
    if (!config.modResults.manifest['uses-permission']) {
      config.modResults.manifest['uses-permission'] = [];
    }

    const billingPermission = 'com.android.vending.BILLING';
    const hasPermission = config.modResults.manifest['uses-permission'].some(
      perm => perm.$['android:name'] === billingPermission
    );

    if (!hasPermission) {
      config.modResults.manifest['uses-permission'].push({
        $: {
          'android:name': billingPermission
        }
      });
      console.log('✅ [RevenueCat Plugin] Added BILLING permission to AndroidManifest.xml');
    }

    return config;
  });

  console.log('✅ [RevenueCat Plugin] Configuration complete!');
  return config;
};

module.exports = withRevenueCat;
