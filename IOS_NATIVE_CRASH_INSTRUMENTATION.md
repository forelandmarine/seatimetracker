
# iOS Native Crash Instrumentation for TurboModule Debugging

## CRITICAL: This guide provides native iOS code to capture TurboModule crashes BEFORE SIGABRT

The app is experiencing `EXC_CRASH (SIGABRT)` crashes at:
```
facebook::react::ObjCTurboModule::performVoidMethodInvocation (RCTTurboModule.mm:441)
```

This crash occurs when a JavaScript → native TurboModule call throws an Objective-C exception during app initialization (~2-3 seconds after launch).

---

## PROBLEM ANALYSIS

Based on the codebase analysis, the **MOST PROBABLE CRASHING MODULE** is:

### **expo-secure-store (Keychain/SecureStore)**

**Why:**
1. **Timing**: The crash occurs 2-3 seconds after launch, which matches when `AuthContext` initializes and calls `checkAuth()` → `tokenStorage.getToken()` → `SecureStore.getItemAsync()`
2. **TurboModule signature**: `SecureStore.getItemAsync()` is a TurboModule method that matches the crash signature
3. **Thread safety**: Keychain operations MUST run on the main thread on iOS. If called from a background thread during initialization, they throw `NSInternalInconsistencyException`
4. **Nil handling**: If the key or options passed to SecureStore are `nil`/`undefined`, the native module will throw an exception
5. **Initialization race**: If SecureStore is called before the React Native bridge is fully ready, it can cause a fatal error

**Evidence from code:**
- `contexts/AuthContext.tsx` calls `SecureStore.getItemAsync(TOKEN_KEY)` immediately on mount
- `app/_layout.tsx` loads native modules during startup
- No explicit main-thread dispatch for SecureStore calls
- No validation that SecureStore is ready before calling

**Other potential modules (less likely):**
- `expo-notifications` - Called during startup, but has error handling
- `expo-apple-authentication` - Only called on user action, not during startup
- `@react-native-community/netinfo` - Has error handling and is non-critical

---

## SOLUTION: Native Crash Instrumentation

### Step 1: Modify AppDelegate.mm

**Location:** `ios/YourAppName/AppDelegate.mm`

Add this code to capture the exception BEFORE the app aborts:

```objc
#import "AppDelegate.h"
#import <React/RCTBundleURLProvider.h>
#import <React/RCTRootView.h>
#import <React/RCTLog.h>

// CRITICAL: Global exception handler to capture TurboModule crashes
void handleUncaughtException(NSException *exception) {
  NSLog(@"========================================");
  NSLog(@"🚨 UNCAUGHT EXCEPTION CAUGHT");
  NSLog(@"========================================");
  NSLog(@"Exception Name: %@", exception.name);
  NSLog(@"Exception Reason: %@", exception.reason);
  NSLog(@"Exception User Info: %@", exception.userInfo);
  NSLog(@"========================================");
  NSLog(@"Call Stack Symbols:");
  for (NSString *symbol in [exception callStackSymbols]) {
    NSLog(@"  %@", symbol);
  }
  NSLog(@"========================================");
  
  // Write to file for persistence across crashes
  NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
  NSString *documentsDirectory = [paths firstObject];
  NSString *crashLogPath = [documentsDirectory stringByAppendingPathComponent:@"crash_log.txt"];
  
  NSString *crashLog = [NSString stringWithFormat:@"CRASH AT: %@\nException: %@\nReason: %@\nStack:\n%@\n\n",
                        [NSDate date],
                        exception.name,
                        exception.reason,
                        [exception.callStackSymbols componentsJoinedByString:@"\n"]];
  
  [crashLog writeToFile:crashLogPath atomically:YES encoding:NSUTF8StringEncoding error:nil];
  NSLog(@"Crash log written to: %@", crashLogPath);
}

// CRITICAL: React Native fatal error handler
void handleReactNativeFatal(NSError *error) {
  NSLog(@"========================================");
  NSLog(@"🚨 REACT NATIVE FATAL ERROR");
  NSLog(@"========================================");
  NSLog(@"Error Domain: %@", error.domain);
  NSLog(@"Error Code: %ld", (long)error.code);
  NSLog(@"Error Description: %@", error.localizedDescription);
  NSLog(@"Error User Info: %@", error.userInfo);
  NSLog(@"========================================");
  
  // Write to file
  NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
  NSString *documentsDirectory = [paths firstObject];
  NSString *crashLogPath = [documentsDirectory stringByAppendingPathComponent:@"rn_fatal_log.txt"];
  
  NSString *crashLog = [NSString stringWithFormat:@"RN FATAL AT: %@\nDomain: %@\nCode: %ld\nDescription: %@\nUserInfo: %@\n\n",
                        [NSDate date],
                        error.domain,
                        (long)error.code,
                        error.localizedDescription,
                        error.userInfo];
  
  [crashLog writeToFile:crashLogPath atomically:YES encoding:NSUTF8StringEncoding error:nil];
  NSLog(@"RN fatal log written to: %@", crashLogPath);
}

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  NSLog(@"========================================");
  NSLog(@"🚀 APP LAUNCH STARTED");
  NSLog(@"========================================");
  
  // CRITICAL: Install exception handlers FIRST, before any other initialization
  NSLog(@"Installing global exception handler...");
  NSSetUncaughtExceptionHandler(&handleUncaughtException);
  
  NSLog(@"Installing React Native fatal handler...");
  RCTSetFatalHandler(^(NSError *error) {
    handleReactNativeFatal(error);
  });
  
  // Check if RCTSetFatalExceptionHandler is available (React Native 0.70+)
  if (@available(iOS 13.0, *)) {
    NSLog(@"Installing React Native fatal exception handler...");
    // Note: This API may not be available in all RN versions
    // If compilation fails, comment out this section
    // RCTSetFatalExceptionHandler(^(NSException *exception) {
    //   handleUncaughtException(exception);
    // });
  }
  
  NSLog(@"Exception handlers installed successfully");
  NSLog(@"========================================");
  
  self.moduleName = @"main";
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
```

---

## Step 2: Rebuild and Test

1. **Clean build:**
   ```bash
   cd ios
   rm -rf build
   pod deintegrate
   pod install
   cd ..
   ```

2. **Rebuild for TestFlight:**
   ```bash
   eas build --platform ios --profile production
   ```

3. **Check logs after crash:**
   - The crash log will be written to the app's Documents directory
   - Access via Xcode → Window → Devices and Simulators → Select device → Download Container
   - Or use Console.app to view system logs

---

## Step 3: Interpret the Crash Log

After the next crash, the log will show:

```
🚨 UNCAUGHT EXCEPTION CAUGHT
Exception Name: NSInternalInconsistencyException
Exception Reason: -[SecureStore getItemAsync:options:]: unrecognized selector sent to instance 0x...
```

OR

```
Exception Reason: Keychain operations must be performed on the main thread
```

OR

```
Exception Reason: Invalid argument: key cannot be nil
```

This will tell us EXACTLY which module and method is crashing.

---

## Expected Crash Scenarios

### Scenario 1: SecureStore called off main thread
**Log:** `Keychain operations must be performed on the main thread`
**Fix:** Dispatch SecureStore calls to main thread in `contexts/AuthContext.tsx`

### Scenario 2: SecureStore called with nil key
**Log:** `Invalid argument: key cannot be nil`
**Fix:** Validate TOKEN_KEY is not undefined before calling SecureStore

### Scenario 3: SecureStore called before bridge ready
**Log:** `Bridge not initialized` or `Module not found`
**Fix:** Delay SecureStore calls until after app is fully mounted (already implemented in the fixes below)

---

## IMPORTANT NOTES

1. **Expo Managed Workflow Limitation:**
   - This app uses Expo managed workflow, so direct AppDelegate.mm modification requires:
     - Using `expo prebuild` to generate native code
     - OR creating a config plugin
     - OR ejecting to bare workflow

2. **Alternative: Config Plugin**
   - If you cannot modify AppDelegate.mm directly, create a config plugin:
   ```javascript
   // app.json
   {
     "expo": {
       "plugins": [
         "./plugins/withCrashLogging.js"
       ]
     }
   }
   ```

3. **TestFlight Crash Reports:**
   - Even without custom logging, TestFlight crash reports should now include more detail
   - Check Xcode → Organizer → Crashes after the next crash

---

## VERIFICATION

After implementing the native instrumentation, the next TestFlight crash will provide:

1. **Exception name** (e.g., `NSInternalInconsistencyException`)
2. **Exception reason** (e.g., "Keychain operations must be performed on the main thread")
3. **Call stack** showing the exact module and method
4. **Timestamp** of when the crash occurred

This will allow us to implement a precise fix instead of guessing.

---

## NEXT STEPS

1. Implement the native crash instrumentation above
2. Deploy to TestFlight
3. Reproduce the crash
4. Check the crash log for the exception details
5. Implement the specific fix based on the exception reason
6. Verify the fix in TestFlight

The JavaScript-side fixes below are **preventive measures** that should reduce the crash rate, but the native instrumentation is **critical** for identifying the root cause if crashes persist.
