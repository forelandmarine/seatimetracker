
# iOS Native Crash Logging Implementation Guide

## Overview
This guide provides the exact code needed to add native crash instrumentation to capture TurboModule SIGABRT crashes in iOS TestFlight builds.

## Problem
When Apple Sign-in completes and triggers a TurboModule call, the app crashes with:
```
EXC_CRASH (SIGABRT) Abort trap 6
facebook::react::ObjCTurboModule::performVoidMethodInvocation (RCTTurboModule.mm:441)
```

The default React Native error handling doesn't capture the Objective-C exception details before the abort, making it impossible to identify which TurboModule method is failing.

## Solution
Install native exception handlers in AppDelegate.mm to log the exception name, reason, and call stack before the app terminates.

---

## Implementation (For EAS Build or Ejected Projects)

### Step 1: Locate AppDelegate.mm

For Expo managed workflow with EAS Build, you need to create a custom build hook or use a config plugin.

For ejected projects:
```
ios/SeaTimeTracker/AppDelegate.mm
```

### Step 2: Add Exception Handler Functions

Add these functions at the top of AppDelegate.mm, before `@implementation AppDelegate`:

```objc
#import <React/RCTLog.h>
#import <React/RCTFatal.h>
#import <React/RCTUtils.h>

// Global exception handler for uncaught Objective-C exceptions
void HandleUncaughtException(NSException *exception) {
  NSLog(@"═══════════════════════════════════════════════════════");
  NSLog(@"🚨 UNCAUGHT OBJECTIVE-C EXCEPTION (Pre-Abort Capture)");
  NSLog(@"═══════════════════════════════════════════════════════");
  NSLog(@"Exception Name: %@", exception.name);
  NSLog(@"Exception Reason: %@", exception.reason);
  NSLog(@"User Info: %@", exception.userInfo);
  NSLog(@"Call Stack Symbols:");
  for (NSString *symbol in [exception callStackSymbols]) {
    NSLog(@"  %@", symbol);
  }
  NSLog(@"Call Stack Return Addresses:");
  for (NSNumber *address in [exception callStackReturnAddresses]) {
    NSLog(@"  0x%lx", (unsigned long)[address unsignedLongValue]);
  }
  NSLog(@"═══════════════════════════════════════════════════════");
  
  // Also write to a file for persistence across crashes
  NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
  NSString *documentsDirectory = [paths firstObject];
  NSString *crashLogPath = [documentsDirectory stringByAppendingPathComponent:@"last_crash.log"];
  
  NSMutableString *crashLog = [NSMutableString string];
  [crashLog appendFormat:@"Crash Time: %@\n", [NSDate date]];
  [crashLog appendFormat:@"Exception Name: %@\n", exception.name];
  [crashLog appendFormat:@"Exception Reason: %@\n", exception.reason];
  [crashLog appendFormat:@"User Info: %@\n", exception.userInfo];
  [crashLog appendString:@"Call Stack:\n"];
  for (NSString *symbol in [exception callStackSymbols]) {
    [crashLog appendFormat:@"  %@\n", symbol];
  }
  
  [crashLog writeToFile:crashLogPath atomically:YES encoding:NSUTF8StringEncoding error:nil];
}

// Custom React Native fatal error handler
void CustomRCTFatalHandler(NSError *error) {
  NSLog(@"═══════════════════════════════════════════════════════");
  NSLog(@"🚨 REACT NATIVE FATAL ERROR (Pre-Abort Capture)");
  NSLog(@"═══════════════════════════════════════════════════════");
  NSLog(@"Error Domain: %@", error.domain);
  NSLog(@"Error Code: %ld", (long)error.code);
  NSLog(@"Error Description: %@", error.localizedDescription);
  NSLog(@"Error Failure Reason: %@", error.localizedFailureReason);
  NSLog(@"Error Recovery Suggestion: %@", error.localizedRecoverySuggestion);
  NSLog(@"User Info: %@", error.userInfo);
  
  // Extract stack trace if available
  NSArray *stackTrace = error.userInfo[@"RCTJSStackTraceKey"];
  if (stackTrace) {
    NSLog(@"JavaScript Stack Trace:");
    for (NSDictionary *frame in stackTrace) {
      NSLog(@"  %@:%@ in %@", frame[@"file"], frame[@"lineNumber"], frame[@"methodName"]);
    }
  }
  
  NSLog(@"═══════════════════════════════════════════════════════");
  
  // Write to crash log file
  NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
  NSString *documentsDirectory = [paths firstObject];
  NSString *crashLogPath = [documentsDirectory stringByAppendingPathComponent:@"last_rn_fatal.log"];
  
  NSMutableString *crashLog = [NSMutableString string];
  [crashLog appendFormat:@"Crash Time: %@\n", [NSDate date]];
  [crashLog appendFormat:@"Error Domain: %@\n", error.domain];
  [crashLog appendFormat:@"Error Code: %ld\n", (long)error.code];
  [crashLog appendFormat:@"Error Description: %@\n", error.localizedDescription];
  [crashLog appendFormat:@"User Info: %@\n", error.userInfo];
  
  [crashLog writeToFile:crashLogPath atomically:YES encoding:NSUTF8StringEncoding error:nil];
  
  // Call the default handler to maintain normal crash behavior
  RCTFatalHandler defaultHandler = RCTGetFatalHandler();
  if (defaultHandler) {
    defaultHandler(error);
  }
}
```

### Step 3: Install Handlers in didFinishLaunchingWithOptions

In the `- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions` method, add this code **before** any React Native initialization:

```objc
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  // ═══════════════════════════════════════════════════════
  // CRITICAL: Install crash handlers FIRST, before RN init
  // ═══════════════════════════════════════════════════════
  
  NSLog(@"Installing native crash handlers for TurboModule debugging...");
  
  // Install Objective-C exception handler
  NSSetUncaughtExceptionHandler(&HandleUncaughtException);
  
  // Install React Native fatal error handler
  RCTSetFatalHandler(CustomRCTFatalHandler);
  
  NSLog(@"Native crash handlers installed successfully");
  
  // ═══════════════════════════════════════════════════════
  // Continue with normal React Native initialization
  // ═══════════════════════════════════════════════════════
  
  self.moduleName = @"main";
  self.initialProps = @{};
  
  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}
```

### Step 4: Add Crash Log Retrieval Method

Add this method to AppDelegate to retrieve crash logs on next launch:

```objc
- (void)checkForPreviousCrashLogs {
  NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
  NSString *documentsDirectory = [paths firstObject];
  
  // Check for Objective-C exception crash log
  NSString *crashLogPath = [documentsDirectory stringByAppendingPathComponent:@"last_crash.log"];
  if ([[NSFileManager defaultManager] fileExistsAtPath:crashLogPath]) {
    NSString *crashLog = [NSString stringWithContentsOfFile:crashLogPath encoding:NSUTF8StringEncoding error:nil];
    NSLog(@"═══════════════════════════════════════════════════════");
    NSLog(@"📋 PREVIOUS CRASH LOG FOUND (Objective-C Exception):");
    NSLog(@"═══════════════════════════════════════════════════════");
    NSLog(@"%@", crashLog);
    NSLog(@"═══════════════════════════════════════════════════════");
    
    // Optionally delete the log after reading
    // [[NSFileManager defaultManager] removeItemAtPath:crashLogPath error:nil];
  }
  
  // Check for React Native fatal error log
  NSString *rnFatalLogPath = [documentsDirectory stringByAppendingPathComponent:@"last_rn_fatal.log"];
  if ([[NSFileManager defaultManager] fileExistsAtPath:rnFatalLogPath]) {
    NSString *rnFatalLog = [NSString stringWithContentsOfFile:rnFatalLogPath encoding:NSUTF8StringEncoding error:nil];
    NSLog(@"═══════════════════════════════════════════════════════");
    NSLog(@"📋 PREVIOUS CRASH LOG FOUND (React Native Fatal):");
    NSLog(@"═══════════════════════════════════════════════════════");
    NSLog(@"%@", rnFatalLog);
    NSLog(@"═══════════════════════════════════════════════════════");
    
    // Optionally delete the log after reading
    // [[NSFileManager defaultManager] removeItemAtPath:rnFatalLogPath error:nil];
  }
}
```

Call this method at the end of `didFinishLaunchingWithOptions`:

```objc
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  // ... existing code ...
  
  // Check for previous crash logs
  [self checkForPreviousCrashLogs];
  
  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}
```

---

## For Expo Managed Workflow (Config Plugin Approach)

If you're using Expo managed workflow and want to add this without ejecting, you need to create a custom config plugin.

### Create Config Plugin

Create `plugins/withCrashLogging.js`:

```javascript
const { withAppDelegate } = require('@expo/config-plugins');

const CRASH_HANDLER_CODE = `
#import <React/RCTLog.h>
#import <React/RCTFatal.h>
#import <React/RCTUtils.h>

void HandleUncaughtException(NSException *exception) {
  NSLog(@"🚨 UNCAUGHT EXCEPTION: %@ - %@", exception.name, exception.reason);
  NSLog(@"Call Stack: %@", [exception callStackSymbols]);
}

void CustomRCTFatalHandler(NSError *error) {
  NSLog(@"🚨 RN FATAL ERROR: %@ - %@", error.domain, error.localizedDescription);
}
`;

const INSTALL_HANDLERS_CODE = `
  NSSetUncaughtExceptionHandler(&HandleUncaughtException);
  RCTSetFatalHandler(CustomRCTFatalHandler);
  NSLog(@"Native crash handlers installed");
`;

module.exports = function withCrashLogging(config) {
  return withAppDelegate(config, async (config) => {
    const { modResults } = config;
    let contents = modResults.contents;

    // Add handler functions before @implementation
    if (!contents.includes('HandleUncaughtException')) {
      contents = contents.replace(
        /@implementation AppDelegate/,
        `${CRASH_HANDLER_CODE}\n\n@implementation AppDelegate`
      );
    }

    // Install handlers in didFinishLaunchingWithOptions
    if (!contents.includes('NSSetUncaughtExceptionHandler')) {
      contents = contents.replace(
        /- \(BOOL\)application:\(UIApplication \*\)application didFinishLaunchingWithOptions:\(NSDictionary \*\)launchOptions\s*{/,
        `- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions\n{\n${INSTALL_HANDLERS_CODE}\n`
      );
    }

    modResults.contents = contents;
    return config;
  });
};
```

### Add Plugin to app.json

```json
{
  "expo": {
    "plugins": [
      "./plugins/withCrashLogging"
    ]
  }
}
```

---

## Testing the Implementation

### 1. Build with EAS
```bash
eas build --platform ios --profile preview
```

### 2. Install on TestFlight

### 3. Trigger Apple Sign-In
- Open the app
- Tap "Sign in with Apple"
- Complete the Apple authentication flow
- If the crash occurs, the handlers will log the exception details

### 4. Retrieve Crash Logs

**Method A: Xcode Console (if device is connected)**
- Connect device to Mac
- Open Xcode → Window → Devices and Simulators
- Select device → View Device Logs
- Look for logs starting with "🚨 UNCAUGHT EXCEPTION" or "🚨 RN FATAL ERROR"

**Method B: Crash Log Files (persisted to disk)**
- On next app launch, the logs will be printed to console
- Or retrieve via iTunes File Sharing if enabled

**Method C: TestFlight Crash Reports**
- TestFlight → App → Crashes
- Download crash report
- Look for symbolicated stack trace

---

## What These Handlers Capture

### NSSetUncaughtExceptionHandler
Captures:
- Objective-C exceptions (NSException)
- Exception name (e.g., "NSInvalidArgumentException")
- Exception reason (e.g., "Attempt to insert nil object")
- Call stack symbols (method names and addresses)
- User info dictionary

### RCTSetFatalHandler
Captures:
- React Native fatal errors (NSError)
- Error domain (e.g., "RCTFatalErrorDomain")
- Error code
- Localized description
- JavaScript stack trace (if available)
- User info dictionary

---

## Expected Output When Crash Occurs

```
═══════════════════════════════════════════════════════
🚨 UNCAUGHT OBJECTIVE-C EXCEPTION (Pre-Abort Capture)
═══════════════════════════════════════════════════════
Exception Name: NSInvalidArgumentException
Exception Reason: -[RCTModuleData instance]: unrecognized selector sent to instance 0x600001234567
User Info: (null)
Call Stack Symbols:
  0   CoreFoundation    0x00000001a1b2c3d4 __exceptionPreprocess + 236
  1   libobjc.A.dylib   0x00000001a1a2b3c4 objc_exception_throw + 60
  2   SeaTimeTracker    0x0000000102345678 -[RCTTurboModule performVoidMethodInvocation:] + 1234
  3   SeaTimeTracker    0x0000000102345abc -[RCTModuleMethod invokeWithBridge:module:arguments:] + 567
  ...
═══════════════════════════════════════════════════════
```

This output will show:
1. **Which TurboModule** is failing (in the call stack)
2. **Which method** is being invoked
3. **Why it's failing** (the exception reason)

---

## How This Fixes the Problem

### Before (No Instrumentation)
- App crashes with SIGABRT
- Crash report shows generic "abort()" in RCTTurboModule.mm
- No information about which module or method failed
- Cannot identify root cause

### After (With Instrumentation)
- Exception is logged BEFORE abort
- Logs show exact module name (e.g., "RCTSecureStore")
- Logs show exact method name (e.g., "setItemAsync")
- Logs show exact failure reason (e.g., "nil token passed to native")
- Can immediately identify and fix the root cause

---

## Common TurboModule Crash Causes (Based on Logs)

Once you have the logs, look for these patterns:

### 1. Nil/Undefined Arguments
```
Exception Reason: -[RCTSecureStore setItemAsync:value:options:]: nil value passed
```
**Fix:** Add null checks in JavaScript before calling native:
```javascript
if (!token) {
  console.error('Token is null, skipping SecureStore.setItemAsync');
  return;
}
await SecureStore.setItemAsync('token', token);
```

### 2. Wrong Thread
```
Exception Reason: UIKit must be called from main thread
```
**Fix:** Dispatch to main thread in native code or use `dispatch_async(dispatch_get_main_queue(), ^{ ... })`

### 3. Promise Resolved/Rejected Twice
```
Exception Reason: Promise already resolved
```
**Fix:** Ensure promise is only resolved OR rejected once in native code

### 4. Type Mismatch
```
Exception Reason: Expected NSString, got NSNumber
```
**Fix:** Validate types in JavaScript before passing to native

---

## Verification Checklist

- [ ] Handlers installed before React Native initialization
- [ ] Logs appear in Xcode console when crash occurs
- [ ] Crash log files are written to Documents directory
- [ ] Previous crash logs are retrieved on next launch
- [ ] Stack trace includes TurboModule method names
- [ ] Exception reason is captured and logged

---

## Production Considerations

### 1. Disable Verbose Logging in Release
Wrap NSLog statements in `#ifdef DEBUG` to reduce log spam in production:

```objc
#ifdef DEBUG
  NSLog(@"🚨 UNCAUGHT EXCEPTION: %@", exception.name);
#endif
```

### 2. Send Crash Logs to Analytics
Instead of just logging, send crash data to your analytics service:

```objc
// In HandleUncaughtException
[[YourAnalytics shared] logCrash:@{
  @"exception_name": exception.name,
  @"exception_reason": exception.reason,
  @"stack_trace": [exception callStackSymbols]
}];
```

### 3. User Privacy
Ensure crash logs don't contain sensitive user data (tokens, passwords, etc.)

---

## Troubleshooting

### Handlers Not Being Called
- Verify handlers are installed BEFORE React Native initialization
- Check that you're building with the modified AppDelegate.mm
- Ensure you're testing on a real device (simulators may behave differently)

### Logs Not Appearing
- Check Xcode console is connected to device
- Verify NSLog is not disabled in build settings
- Try writing to file instead of console

### Still Getting Generic Crash Reports
- Ensure you're using the EXACT code above
- Verify the handlers are actually installed (add a log statement)
- Check that the crash is actually an Objective-C exception (not a memory crash)

---

## Summary

This implementation provides:
1. **Pre-abort exception capture** - Logs exception details before the app terminates
2. **Persistent crash logs** - Writes crash data to disk for retrieval after restart
3. **Detailed stack traces** - Shows exact TurboModule and method that failed
4. **Root cause identification** - Exception reason reveals why the crash occurred

With these handlers in place, you can:
- Identify which TurboModule call is failing during Apple Sign-in
- See the exact exception reason (nil argument, wrong thread, etc.)
- Fix the root cause instead of guessing
- Prevent future crashes by adding proper guards

**Next Steps:**
1. Add the handlers to AppDelegate.mm
2. Build and deploy to TestFlight
3. Reproduce the Apple Sign-in crash
4. Retrieve the crash logs
5. Identify the failing TurboModule method
6. Add appropriate guards/fixes in JavaScript or native code
