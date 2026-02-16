
# RevenueCat Integration in SeaTime Tracker - Complete Guide

This guide shows exactly how RevenueCat subscription management is integrated into the SeaTime Tracker app, with real code examples and workflows.

---

## 1. Configuration & Setup

### App Configuration (`app.json`)
```json
{
  "expo": {
    "plugins": [
      [
        "./plugins/with-revenuecat",
        {
          "iosApiKey": "appl_YOUR_IOS_KEY",
          "androidApiKey": "goog_YOUR_ANDROID_KEY"
        }
      ]
    ],
    "extra": {
      "revenueCat": {
        "iosApiKey": "appl_YOUR_IOS_KEY",
        "androidApiKey": "goog_YOUR_ANDROID_KEY"
      }
    }
  }
}
```

**What this does:**
- The custom plugin (`plugins/with-revenuecat.js`) injects API keys into native iOS/Android builds
- The `extra` field makes keys available at runtime via `expo-constants`
- Keys should be stored in EAS Secrets, not hardcoded

### Runtime Configuration (`config/revenuecat.ts`)
```typescript
import Constants from 'expo-constants';

const getRevenueCatConfig = () => {
  const extra = Constants.expoConfig?.extra;
  const pluginConfig = Constants.expoConfig?.plugins?.find(
    (plugin: any) => Array.isArray(plugin) && plugin[0] === './plugins/with-revenuecat'
  )?.[1];

  return {
    iosApiKey: pluginConfig?.iosApiKey || extra?.revenueCat?.iosApiKey || 'NOT_SET',
    androidApiKey: pluginConfig?.androidApiKey || extra?.revenueCat?.androidApiKey || 'NOT_SET'
  };
};

export const REVENUECAT_CONFIG = getRevenueCatConfig();
```

**What this does:**
- Reads API keys from both plugin config and `extra` field (fallback)
- Provides diagnostic info for troubleshooting
- Used by `RevenueCatContext` to initialize the SDK

---

## 2. Global Subscription State (`contexts/RevenueCatContext.tsx`)

### Initialization
```typescript
import Purchases from 'react-native-purchases';
import { REVENUECAT_CONFIG } from '../config/revenuecat';

export const RevenueCatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);

  useEffect(() => {
    const setupRevenueCat = async () => {
      if (REVENUECAT_CONFIG.iosApiKey !== 'NOT_SET') {
        Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
        await Purchases.configure({
          apiKey: Platform.select({
            ios: REVENUECAT_CONFIG.iosApiKey,
            android: REVENUECAT_CONFIG.androidApiKey,
          })!,
          appUserID: user?.id // From AuthContext
        });

        // Fetch customer info and offerings
        const info = await Purchases.getCustomerInfo();
        setCustomerInfo(info);

        const offers = await Purchases.getOfferings();
        setOfferings(offers);
      }
    };
    setupRevenueCat();
  }, [user?.id]);

  const isPro = useMemo(
    () => customerInfo?.entitlements.active['SeaTime Tracker Pro']?.isActive || false,
    [customerInfo]
  );

  return (
    <RevenueCatContext.Provider value={{ isPro, customerInfo, offerings, purchasePackage, restorePurchases }}>
      {children}
    </RevenueCatContext.Provider>
  );
};
```

**What this does:**
- Initializes RevenueCat SDK with API keys
- Links RevenueCat customer to authenticated user (`appUserID`)
- Fetches subscription status and available offerings
- Provides `isPro` boolean for easy subscription checks

---

## 3. Subscription Enforcement in SeaTime Tracker

### Frontend Enforcement (`hooks/useSubscriptionEnforcement.ts`)

**Example: Blocking vessel activation for free users**
```typescript
// In app/(tabs)/(home)/index.tsx
import { useSubscriptionEnforcement } from '@/hooks/useSubscriptionEnforcement';

export default function SeaTimeScreen() {
  const { checkAndEnforceSubscription } = useSubscriptionEnforcement();

  const handleActivateVessel = async (vesselId: string, vesselName: string) => {
    // Check subscription before allowing activation
    if (!checkAndEnforceSubscription('vessel activation')) {
      return; // User is shown paywall modal
    }

    // Proceed with activation
    await seaTimeApi.activateVessel(vesselId);
    loadData();
  };

  return (
    <TouchableOpacity onPress={() => handleActivateVessel(vessel.id, vessel.vessel_name)}>
      <Text>Activate Vessel</Text>
    </TouchableOpacity>
  );
}
```

**What `checkAndEnforceSubscription` does:**
```typescript
// hooks/useSubscriptionEnforcement.ts
export const useSubscriptionEnforcement = () => {
  const { user } = useAuth(); // Backend subscription status
  const { isPro } = useRevenueCat(); // RevenueCat subscription status
  const router = useRouter();

  const checkAndEnforceSubscription = (feature: string) => {
    if (!user?.hasActiveSubscription && !isPro) {
      Alert.alert(
        'Subscription Required',
        `You need an active subscription to use ${feature}.`,
        [
          { text: 'Upgrade', onPress: () => router.push('/revenuecat-paywall') },
          { text: 'Cancel' }
        ]
      );
      return false;
    }
    return true;
  };

  return { checkAndEnforceSubscription };
};
```

**Result:**
- Free users see a paywall when trying to activate vessels
- Subscribed users proceed normally
- Combines backend (`user.hasActiveSubscription`) and RevenueCat (`isPro`) checks

---

### Backend Enforcement (`backend/src/middleware/subscription.ts`)

**Example: Protecting AIS data endpoints**
```typescript
// backend/src/routes/ais.ts
import { checkSubscription } from '../middleware/subscription.js';

fastify.get('/api/ais/:mmsi', {
  preHandler: [authenticateUser, checkSubscription], // Middleware chain
  handler: async (request, reply) => {
    const { mmsi } = request.params;
    const aisData = await fetchVesselAISData(mmsi);
    return { data: aisData };
  }
});
```

**What `checkSubscription` middleware does:**
```typescript
// backend/src/middleware/subscription.ts
export const checkSubscription = async (request, reply) => {
  const user = request.user; // Set by authenticateUser middleware

  if (!user) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  if (user.subscription_status !== 'active' || new Date(user.subscription_expiration) < new Date()) {
    return reply.status(403).send({ message: 'Active subscription required' });
  }

  // User has active subscription, proceed
};
```

**Result:**
- API returns `403 Forbidden` if subscription is inactive/expired
- Frontend receives error and can show upgrade prompt
- Prevents free users from accessing premium features via API

---

## 4. User Flows in SeaTime Tracker

### Flow 1: Free User Tries to Activate Vessel

1. **User taps "Activate Vessel" button** (`app/(tabs)/(home)/index.tsx`)
2. **Frontend checks subscription** (`useSubscriptionEnforcement`)
   - `user.hasActiveSubscription` = false (from backend)
   - `isPro` = false (from RevenueCat)
3. **Paywall modal appears** with "Upgrade" and "Cancel" buttons
4. **User taps "Upgrade"** → Navigates to `/revenuecat-paywall`
5. **Paywall screen shows packages** (`app/revenuecat-paywall.tsx`)
   - Fetches offerings from RevenueCat
   - Displays monthly/annual plans
6. **User purchases subscription**
   - `purchasePackage()` from `RevenueCatContext`
   - RevenueCat processes payment via App Store/Google Play
7. **Backend webhook receives purchase event** (configured in RevenueCat dashboard)
   - Updates `users` table: `subscription_status = 'active'`, `subscription_expiration = <date>`
8. **Frontend refreshes subscription status**
   - `customerInfo` updates in `RevenueCatContext`
   - `isPro` becomes `true`
9. **User can now activate vessels** ✅

---

### Flow 2: Subscribed User Accesses AIS Data

1. **User taps "Check AIS" button** (`app/vessel/[id].tsx`)
2. **Frontend makes API call** (`utils/seaTimeApi.ts`)
   ```typescript
   const response = await authenticatedGet(`/api/ais/${vessel.mmsi}`);
   ```
3. **Backend receives request** (`backend/src/routes/ais.ts`)
   - `authenticateUser` middleware validates Bearer token
   - `checkSubscription` middleware checks `user.subscription_status`
   - User has `subscription_status = 'active'` ✅
4. **Backend fetches AIS data** from MyShipTracking API
5. **Backend returns data** to frontend
6. **Frontend displays AIS data** (speed, position, heading, etc.)

---

### Flow 3: Subscription Expires

1. **User's subscription expires** (e.g., monthly renewal fails)
2. **RevenueCat webhook notifies backend** → `subscription_status = 'expired'`
3. **User opens app** → `RevenueCatContext` fetches `customerInfo`
   - `isPro` becomes `false`
4. **User tries to activate vessel**
   - `checkAndEnforceSubscription` returns `false`
   - Paywall modal appears: "Your subscription has expired. Renew to continue."
5. **User tries to fetch AIS data via API**
   - Backend `checkSubscription` middleware returns `403 Forbidden`
   - Frontend shows error: "Subscription required to access AIS data"

---

## 5. Key Screens & Components

### Paywall Screen (`app/revenuecat-paywall.tsx`)
```typescript
import { useRevenueCat } from '@/contexts/RevenueCatContext';

export default function PaywallScreen() {
  const { offerings, purchasePackage } = useRevenueCat();

  const handlePurchase = async (pkg: PurchasesPackage) => {
    try {
      await purchasePackage(pkg);
      Alert.alert('Success', 'Subscription activated!');
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Purchase failed');
    }
  };

  return (
    <ScrollView>
      {offerings?.current?.availablePackages.map((pkg) => (
        <TouchableOpacity key={pkg.identifier} onPress={() => handlePurchase(pkg)}>
          <Text>{pkg.product.title}</Text>
          <Text>{pkg.product.priceString}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
```

**What this does:**
- Displays available subscription packages (monthly, annual)
- Handles purchase flow via RevenueCat
- Navigates back after successful purchase

---

### Customer Center (`app/revenuecat-customer-center.tsx`)
```typescript
import { useRevenueCat } from '@/contexts/RevenueCatContext';

export default function CustomerCenterScreen() {
  const { customerInfo, restorePurchases } = useRevenueCat();

  const handleRestore = async () => {
    await restorePurchases();
    Alert.alert('Restored', 'Purchases restored successfully');
  };

  return (
    <View>
      <Text>Subscription Status: {customerInfo?.entitlements.active['SeaTime Tracker Pro']?.isActive ? 'Active' : 'Inactive'}</Text>
      <TouchableOpacity onPress={handleRestore}>
        <Text>Restore Purchases</Text>
      </TouchableOpacity>
    </View>
  );
}
```

**What this does:**
- Shows current subscription status
- Allows users to restore purchases (e.g., after reinstalling app)

---

### Diagnostic Screen (`app/revenuecat-diagnostic.tsx`)
```typescript
import { REVENUECAT_CONFIG } from '@/config/revenuecat';

export default function DiagnosticScreen() {
  return (
    <ScrollView>
      <Text>iOS API Key: {REVENUECAT_CONFIG.iosApiKey === 'NOT_SET' ? '❌ Not Set' : '✅ Set'}</Text>
      <Text>Android API Key: {REVENUECAT_CONFIG.androidApiKey === 'NOT_SET' ? '❌ Not Set' : '✅ Set'}</Text>
      <Text>Plugin Configured: {REVENUECAT_CONFIG.pluginConfigured ? '✅' : '❌'}</Text>
    </ScrollView>
  );
}
```

**What this does:**
- Verifies RevenueCat configuration
- Helps troubleshoot setup issues

---

## 6. Database Schema

### Users Table (Backend)
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  subscription_status TEXT DEFAULT 'inactive', -- 'active', 'inactive', 'expired', 'cancelled'
  subscription_expiration TIMESTAMP,
  revenuecat_customer_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**What this stores:**
- `subscription_status`: Current subscription state (synced from RevenueCat webhooks)
- `subscription_expiration`: When subscription ends
- `revenuecat_customer_id`: Links user to RevenueCat customer

---

## 7. RevenueCat Dashboard Configuration

### Products Setup
1. **Create Product in App Store Connect / Google Play Console**
   - Product ID: `seatime_tracker_pro_monthly`
   - Type: Auto-renewable subscription
   - Price: $9.99/month

2. **Add Product to RevenueCat Dashboard**
   - Navigate to Products → Add Product
   - Enter Product ID: `seatime_tracker_pro_monthly`
   - Link to App Store/Google Play product

3. **Create Entitlement**
   - Name: `SeaTime Tracker Pro`
   - Attach product: `seatime_tracker_pro_monthly`

4. **Create Offering**
   - Name: `default`
   - Add package: Monthly ($9.99)

### Webhook Setup
1. **Navigate to Integrations → Webhooks**
2. **Add webhook URL**: `https://your-backend.com/api/webhooks/revenuecat`
3. **Select events**:
   - `INITIAL_PURCHASE`
   - `RENEWAL`
   - `CANCELLATION`
   - `EXPIRATION`
4. **Backend handles webhook** (`backend/src/routes/subscription.ts`):
   ```typescript
   fastify.post('/api/webhooks/revenuecat', async (request, reply) => {
     const { event } = request.body;

     if (event.type === 'INITIAL_PURCHASE' || event.type === 'RENEWAL') {
       await db.update(users)
         .set({
           subscription_status: 'active',
           subscription_expiration: new Date(event.expiration_date)
         })
         .where(eq(users.revenuecat_customer_id, event.app_user_id));
     }

     if (event.type === 'EXPIRATION' || event.type === 'CANCELLATION') {
       await db.update(users)
         .set({ subscription_status: 'expired' })
         .where(eq(users.revenuecat_customer_id, event.app_user_id));
     }

     return { received: true };
   });
   ```

---

## 8. Testing Subscription Flow

### Sandbox Testing (iOS)
1. **Create Sandbox Tester** in App Store Connect
   - Email: `test@example.com`
   - Password: `TestPassword123`
2. **Sign out of App Store** on device (Settings → App Store → Sign Out)
3. **Run app** → Tap "Upgrade" → Sign in with sandbox account
4. **Purchase subscription** → Verify `isPro` becomes `true`
5. **Check backend** → Verify `subscription_status = 'active'` in database

### Production Testing
1. **Use TestFlight** for beta testing
2. **Create real subscription** with real payment method
3. **Verify webhook** receives events in backend logs
4. **Test expiration** by canceling subscription and waiting for expiration date

---

## 9. Common Issues & Solutions

### Issue: `isPro` is always `false`
**Cause:** Entitlement name mismatch
**Solution:** Verify entitlement name in RevenueCat dashboard matches `'SeaTime Tracker Pro'` in code

### Issue: API returns `403 Forbidden` for subscribed users
**Cause:** Backend `subscription_status` not synced from RevenueCat
**Solution:** Check webhook is configured and backend is receiving events

### Issue: Question marks in iOS configuration
**Cause:** API keys not set in `app.json` or plugin not configured
**Solution:** Run diagnostic screen (`/revenuecat-diagnostic`) to verify configuration

---

## 10. Summary

**RevenueCat in SeaTime Tracker provides:**
1. **Subscription Management**: Users can purchase/restore subscriptions via App Store/Google Play
2. **Frontend Enforcement**: `useSubscriptionEnforcement` blocks premium features for free users
3. **Backend Enforcement**: `checkSubscription` middleware protects API endpoints
4. **Webhook Sync**: RevenueCat webhooks keep backend database in sync with subscription status
5. **User Experience**: Seamless paywall flow with native payment UI

**Key Files:**
- `config/revenuecat.ts` - Configuration
- `contexts/RevenueCatContext.tsx` - Global subscription state
- `hooks/useSubscriptionEnforcement.ts` - Frontend enforcement
- `backend/src/middleware/subscription.ts` - Backend enforcement
- `app/revenuecat-paywall.tsx` - Purchase UI
- `app/revenuecat-customer-center.tsx` - Manage subscriptions

**Next Steps:**
1. Set up products in App Store Connect / Google Play Console
2. Configure RevenueCat dashboard with products, entitlements, offerings
3. Add webhook URL to RevenueCat dashboard
4. Test subscription flow in sandbox environment
5. Deploy to production via TestFlight / Google Play Internal Testing
