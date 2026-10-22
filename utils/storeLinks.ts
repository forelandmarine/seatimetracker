import { Linking, Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import { error as logError } from '@/utils/log';

const IOS_APP_ID = '6758010893';
const ANDROID_PACKAGE = 'com.forelandmarine.seatimetracker';

async function openFirst(urls: string[]): Promise<void> {
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return;
    } catch {
      // try the next one
    }
  }
  logError('[storeLinks] Could not open any of', urls);
}

/** The store's write-a-review page. Only from a deliberate tap (Settings), as both stores allow. */
export function openWriteReview(): Promise<void> {
  return Platform.OS === 'ios'
    ? openFirst([
        `itms-apps://apps.apple.com/app/id${IOS_APP_ID}?action=write-review`,
        `https://apps.apple.com/app/id${IOS_APP_ID}?action=write-review`,
      ])
    : openFirst([
        `market://details?id=${ANDROID_PACKAGE}`,
        `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`,
      ]);
}

/** The store's own subscription screen, where the user can change or cancel their plan. */
export async function openManageSubscription(): Promise<void> {
  try {
    await Purchases.showManageSubscriptions();
  } catch (err) {
    logError('[storeLinks] showManageSubscriptions failed, opening store page', err);
    await openFirst(
      Platform.OS === 'ios'
        ? ['https://apps.apple.com/account/subscriptions']
        : [`https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}`]
    );
  }
}
