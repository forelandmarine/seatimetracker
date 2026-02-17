
import "react-native-reanimated";
import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useColorScheme, Platform, View, Text } from "react-native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import {
  DarkTheme,
  DefaultTheme,
  Theme,
  ThemeProvider,
} from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { WidgetProvider } from "@/contexts/WidgetContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { RevenueCatProvider } from "@/contexts/RevenueCatContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { BACKEND_URL } from "@/utils/api";
import { ErrorBoundary } from "@/components/ErrorBoundary";

console.log('[App] ========== APP INITIALIZATION STARTED ==========');
console.log('[App] Platform:', Platform.OS);
console.log('[App] Backend URL:', BACKEND_URL);

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync().catch((err) => {
  console.warn('[App] Could not prevent splash screen auto-hide:', err);
});

export const unstable_settings = {
  initialRouteName: "index",
};

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const [initError, setInitError] = useState<string | null>(null);

  const [loaded, error] = useFonts({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (error) {
      console.error('[App] Font loading error:', error);
      setInitError(`Font loading failed: ${error.message}`);
      if (Platform.OS !== 'web') {
        SplashScreen.hideAsync().catch(() => {});
      }
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      console.log('[App] Fonts loaded, hiding splash screen');
      
      if (Platform.OS !== 'web') {
        // Hide splash screen immediately when fonts are loaded
        SplashScreen.hideAsync().catch((err) => {
          console.warn('[App] Error hiding splash screen:', err);
        });
      }
      
      console.log('[App] ✅ App initialized - Platform:', Platform.OS, 'Backend:', BACKEND_URL ? 'configured' : 'NOT CONFIGURED');
    }
  }, [loaded]);

  // Show error screen if initialization failed
  if (initError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colorScheme === 'dark' ? '#000' : '#fff', padding: 20 }}>
        <Text style={{ fontSize: 18, color: 'red', marginBottom: 10, textAlign: 'center' }}>Initialization Error</Text>
        <Text style={{ fontSize: 14, color: colorScheme === 'dark' ? '#999' : '#666', textAlign: 'center' }}>
          {initError}
        </Text>
        <Text style={{ fontSize: 12, color: colorScheme === 'dark' ? '#666' : '#999', marginTop: 20, textAlign: 'center' }}>
          Please restart the app
        </Text>
      </View>
    );
  }

  // Show loading screen while fonts are loading
  if (!loaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }}>
        <Text style={{ fontSize: 18, color: colorScheme === 'dark' ? '#fff' : '#000', marginBottom: 10 }}>SeaTime Tracker</Text>
        <Text style={{ fontSize: 14, color: colorScheme === 'dark' ? '#999' : '#666' }}>Loading...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colorScheme === 'dark' ? '#000' : '#fff', padding: 20 }}>
        <Text style={{ fontSize: 18, color: 'red', marginBottom: 10, textAlign: 'center' }}>Error Loading App</Text>
        <Text style={{ fontSize: 14, color: colorScheme === 'dark' ? '#999' : '#666', textAlign: 'center' }}>
          {error.message || 'An error occurred while loading the app'}
        </Text>
        <Text style={{ fontSize: 12, color: colorScheme === 'dark' ? '#666' : '#999', marginTop: 20, textAlign: 'center' }}>
          Please restart the app
        </Text>
      </View>
    );
  }

  const CustomDefaultTheme: Theme = {
    ...DefaultTheme,
    dark: false,
    colors: {
      primary: "rgb(0, 122, 255)",
      background: "rgb(242, 242, 247)",
      card: "rgb(255, 255, 255)",
      text: "rgb(0, 0, 0)",
      border: "rgb(216, 216, 220)",
      notification: "rgb(255, 59, 48)",
    },
  };

  const CustomDarkTheme: Theme = {
    ...DarkTheme,
    colors: {
      primary: "rgb(10, 132, 255)",
      background: "rgb(1, 1, 1)",
      card: "rgb(28, 28, 30)",
      text: "rgb(255, 255, 255)",
      border: "rgb(44, 44, 46)",
      notification: "rgb(255, 69, 58)",
    },
  };

  return (
    <SubscriptionProvider>
      <>
      <StatusBar style="auto" animated />
      <ThemeProvider
        value={colorScheme === "dark" ? CustomDarkTheme : CustomDefaultTheme}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }}>
            {/* Index/Root Route */}
            <Stack.Screen 
              name="index" 
              options={{ 
                headerShown: false,
              }} 
            />

            {/* Authentication Screen */}
            <Stack.Screen 
              name="auth" 
              options={{ 
                headerShown: false,
                title: "Sign In",
              }} 
            />

            {/* Forgot Password Screen */}
            <Stack.Screen 
              name="forgot-password" 
              options={{ 
                headerShown: false,
                title: "Reset Password",
              }} 
            />

            {/* Subscription Diagnostic Screen */}
            <Stack.Screen 
              name="subscription-diagnostic" 
              options={{ 
                headerShown: false,
                title: "Subscription Diagnostic",
              }} 
            />

            {/* RevenueCat Paywall Screen */}
            <Stack.Screen 
              name="revenuecat-paywall" 
              options={{ 
                headerShown: false,
                presentation: 'card',
                title: "Subscribe",
              }} 
            />

            {/* RevenueCat Customer Center Screen */}
            <Stack.Screen 
              name="revenuecat-customer-center" 
              options={{ 
                headerShown: false,
                presentation: 'card',
                title: "Subscription",
              }} 
            />

            {/* RevenueCat Diagnostic Screen */}
            <Stack.Screen 
              name="revenuecat-diagnostic" 
              options={{ 
                headerShown: false,
                presentation: 'card',
                title: "RevenueCat Diagnostic",
              }} 
            />

            {/* Main app with tabs */}
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

            {/* Vessel detail screens */}
            <Stack.Screen 
              name="vessel/[id]" 
              options={{ 
                headerShown: false,
                presentation: 'card',
                headerBackTitle: 'Back',
              }} 
            />

            {/* Add Sea Time Entry screen */}
            <Stack.Screen 
              name="add-sea-time" 
              options={{ 
                headerShown: false,
                presentation: 'card',
                headerBackTitle: 'Back',
              }} 
            />

            {/* Edit Sea Time Entry screen */}
            <Stack.Screen 
              name="edit-sea-time" 
              options={{ 
                headerShown: false,
                presentation: 'card',
                headerBackTitle: 'Back',
              }} 
            />

            {/* User profile screen */}
            <Stack.Screen 
              name="user-profile" 
              options={{ 
                presentation: 'card',
                headerBackTitle: 'Back',
              }} 
            />

            {/* MCA Requirements screen */}
            <Stack.Screen 
              name="mca-requirements" 
              options={{ 
                headerShown: false,
                presentation: 'card',
                headerBackTitle: 'Back',
              }} 
            />

            {/* Scheduled tasks screen */}
            <Stack.Screen 
              name="scheduled-tasks" 
              options={{ 
                headerShown: false,
                presentation: 'card',
                headerBackTitle: 'Back',
              }} 
            />

            {/* Notification settings screen */}
            <Stack.Screen 
              name="notification-settings" 
              options={{ 
                headerShown: false,
                presentation: 'card',
                headerBackTitle: 'Back',
              }} 
            />

            {/* Debug logs screen */}
            <Stack.Screen 
              name="debug/[vesselId]" 
              options={{ 
                headerShown: false,
                presentation: 'card',
                headerBackTitle: 'Back',
              }} 
            />

            {/* Reports screen */}
            <Stack.Screen 
              name="reports" 
              options={{ 
                headerShown: false,
                presentation: 'card',
                headerBackTitle: 'Back',
              }} 
            />

            {/* Admin verify screen */}
            <Stack.Screen 
              name="admin-verify" 
              options={{ 
                headerShown: false,
                presentation: 'card',
              }} 
            />

            {/* Admin investigate entry screen */}
            <Stack.Screen 
              name="admin-investigate-entry" 
              options={{ 
                headerShown: false,
                presentation: 'card',
                headerBackTitle: 'Back',
              }} 
            />

            {/* Test login screen */}
            <Stack.Screen 
              name="test-login" 
              options={{ 
                headerShown: false,
                presentation: 'card',
              }} 
            />

            {/* Vessel diagnostic screen */}
            <Stack.Screen 
              name="vessel-diagnostic" 
              options={{ 
                headerShown: false,
                presentation: 'card',
                headerBackTitle: 'Back',
              }} 
            />

            {/* Select pathway screen */}
            <Stack.Screen 
              name="select-pathway" 
              options={{ 
                headerShown: false,
                presentation: 'card',
                headerBackTitle: 'Back',
              }} 
            />

            {/* Admin generate samples screen */}
            <Stack.Screen 
              name="admin-generate-samples" 
              options={{ 
                headerShown: false,
                presentation: 'card',
                headerBackTitle: 'Back',
              }} 
            />

            {/* Admin update subscription screen */}
            <Stack.Screen 
              name="admin-update-subscription" 
              options={{ 
                headerShown: false,
                presentation: 'card',
                headerBackTitle: 'Back',
              }} 
            />

            {/* Admin activate subscriptions screen */}
            <Stack.Screen 
              name="admin-activate-subscriptions" 
              options={{ 
                headerShown: false,
                presentation: 'card',
                headerBackTitle: 'Back',
              }} 
            />

            {/* Modal Demo Screens */}
            <Stack.Screen
              name="modal"
              options={{
                presentation: "modal",
                title: "Standard Modal",
              }}
            />
            <Stack.Screen
              name="formsheet"
              options={{
                presentation: "formSheet",
                title: "Form Sheet Modal",
                sheetGrabberVisible: true,
                sheetAllowedDetents: [0.5, 0.8, 1.0],
                sheetCornerRadius: 20,
              }}
            />
            <Stack.Screen
              name="transparent-modal"
              options={{
                presentation: "transparentModal",
                headerShown: false,
              }}
            />

            {/* 404 Not Found */}
            <Stack.Screen 
              name="+not-found" 
              options={{ 
                headerShown: false,
              }} 
            />
          </Stack>
        </GestureHandlerRootView>
      </ThemeProvider>
    </>
    </SubscriptionProvider>
  );
}

export default function RootLayout() {
  console.log('[App] Root layout mounted');
  
  return (
    <ErrorBoundary>
      <AuthProvider>
        <RevenueCatProvider>
          <WidgetProvider>
            <RootLayoutNav />
          </WidgetProvider>
        </RevenueCatProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
