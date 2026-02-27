# iOS Crash Regression Analysis (Baseline: 2026-02-05)

## Goal
Identify significant post-StoreKit changes (after 2026-02-05) that could explain the new iOS crash occurring ~1 second after launch.

## Baseline Reference
- Stable pre-regression window identified around commit history on **2026-02-05** (before the Feb 7 TurboModule hardening wave).

## Significant Changes Found After Baseline

### 1) Deterministic startup native-module imports in `app/_layout.tsx`
**Risk level:** High

Post-baseline code introduced an eager startup scheduler that performs dynamic imports of native modules shortly after launch:
- `react-native-edge-to-edge`
- notifications module wiring
- `@react-native-community/netinfo`
- `expo-haptics`

When this scheduler starts at ~1s, any native module instability appears as a deterministic "crash at 1 second" symptom.

### 2) Auth startup timing changed to very early native access
**Risk level:** High

Post-baseline auth changes moved readiness/auth-check timing aggressively earlier in some iterations.
Auth checks touch storage/native paths quickly, which can amplify launch-time race conditions.

### 3) Multiple rapid iterations on startup + TurboModule behavior (Feb 7)
**Risk level:** Medium-High

The commit history shows many same-day iterations changing startup behavior, module loading order, instrumentation, and StoreKit flow. This increases regression probability from interaction effects even when individual changes appear safe.

## Corrective Action Applied in This Patch

1. **Removed eager startup native module loading from `app/_layout.tsx`.**
   - Native modules now load on-demand from feature paths instead of forced import near app launch.
   - This directly removes the deterministic 1-second crash trigger window.

2. **Restored conservative auth startup delays in `AuthContext`.**
   - App-ready timer restored to 3s.
   - Initial auth check restored to 4s.
   - This avoids early native/storage calls during fragile startup.

3. **Kept crash instrumentation activation + patch pipeline fixes.**
   - Plugin activation and `postinstall` patch workflow remain enabled for diagnostic visibility.

## Expected Outcome
- App should no longer hit the deterministic ~1s crash window caused by forced startup module imports.
- If crashes persist, instrumentation should now provide clearer TurboModule call context for targeted fixes.
