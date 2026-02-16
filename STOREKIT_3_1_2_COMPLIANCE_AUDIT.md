# StoreKit 3.1.2 Subscription Compliance Audit

Date: 2026-02-07

## Scope
- iOS subscription paywall and purchase flow
- Subscription management UX required by App Store Review Guideline 3.1.2
- Receipt verification wiring between client and backend

## Compliance Checklist

### 1) Native in-app subscription purchase flow
**Status:** ✅ Pass

- Purchase path uses native StoreKit via `react-native-iap` (`requestSubscription`) instead of external payment links.
- Product pricing is loaded from App Store (`getSubscriptions`) with fallback messaging when unavailable.

Files:
- `utils/storeKit.native.ts`
- `app/subscription-paywall.tsx`

### 2) Restore purchases
**Status:** ✅ Pass

- Restore action is exposed in UI and invokes native restore flow (`getAvailablePurchases`).
- Restored purchases are re-verified with backend and surfaced to user with actionable alerts.

Files:
- `app/subscription-paywall.tsx`
- `utils/storeKit.native.ts`

### 3) Manage/cancel subscription link
**Status:** ✅ Pass

- "Manage Subscription" button is present on iOS paywall.
- Flow attempts Apple subscription management URL (`https://apps.apple.com/account/subscriptions`) and falls back to iOS settings.

Files:
- `app/subscription-paywall.tsx`
- `utils/storeKit.native.ts`

### 4) Required legal links and disclosures
**Status:** ✅ Pass

- Privacy Policy, Terms of Service, and Apple Standard EULA links are present and tappable.
- Auto-renewal disclosures are displayed on the paywall.

Files:
- `app/subscription-paywall.tsx`

### 5) Receipt verification payload compatibility
**Status:** ✅ Pass (updated)

- Verification now prioritizes obtaining iOS app receipt via `getReceiptIOS()` for backend `/verifyReceipt` compatibility.
- Falls back to purchase token / legacy receipt fields only when app receipt is unavailable.
- Prevents invalid payload selection from causing verification instability.

Files:
- `utils/storeKit.native.ts`
- `backend/src/routes/subscription.ts`

## Notes
- Backend currently uses Apple `/verifyReceipt` endpoint contract (`receipt-data`) and therefore requires app receipt-compatible payloads.
- For a future StoreKit 2 App Store Server API migration, backend verification can be upgraded to handle signed transaction JWS directly.
