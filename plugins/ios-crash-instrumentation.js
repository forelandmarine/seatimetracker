
/**
 * Expo Config Plugin: iOS Native Crash Instrumentation
 * 
 * SIMPLIFIED VERSION - Currently disabled to prevent startup crashes
 * This plugin was designed to inject native crash handlers into AppDelegate.m
 * to capture Objective-C exceptions before SIGABRT crashes.
 * 
 * Status: DISABLED (returns config unchanged)
 * Reason: Temporary measure to stabilize TestFlight builds while investigating
 *         TurboModule/New Architecture crashes.
 */
module.exports = function withIOSCrashInstrumentation(config) {
  // This plugin is currently disabled as per the latest architectural decision
  // to temporarily disable New Architecture for stability.
  // It returns the config unchanged, effectively not applying any native crash instrumentation.
  // The original intent was to inject native crash handlers (NSSetUncaughtExceptionHandler,
  // RCTSetFatalHandler, RCTSetFatalExceptionHandler) into the AppDelegate.m
  // to capture Objective-C exceptions and log them to console and a file.
  // This functionality is currently bypassed.
  return config;
};
