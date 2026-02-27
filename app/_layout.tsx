
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { useColorScheme } from 'react-native';
import { BridgeReadyProvider } from '@/contexts/BridgeReadyContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { useNotifications } from '@/hooks/useNotifications';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function RootLayoutContent() {
  const colorScheme = useColorScheme();

  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Set up notifications
  useNotifications();

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
        <Stack.Screen
          name="modal"
          options={{
            presentation: 'modal',
            title: 'Modal',
          }}
        />
        <Stack.Screen
          name="formsheet"
          options={{
            presentation: 'formSheet',
            title: 'Form Sheet',
            sheetGrabberVisible: true,
            sheetAllowedDetents: [0.5, 0.8, 1.0],
            sheetCornerRadius: 20,
          }}
        />
        <Stack.Screen
          name="transparent-modal"
          options={{
            presentation: 'transparentModal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="add-sea-time"
          options={{
            presentation: 'modal',
            title: 'Add Sea Time',
            headerBackTitle: 'Cancel',
          }}
        />
        <Stack.Screen
          name="edit-sea-time"
          options={{
            presentation: 'modal',
            title: 'Edit Sea Time',
            headerBackTitle: 'Cancel',
          }}
        />
        <Stack.Screen
          name="vessel/[id]"
          options={{
            title: 'Vessel Details',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="user-profile"
          options={{
            title: 'Edit Profile',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="scheduled-tasks"
          options={{
            title: 'Scheduled Tasks',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="mca-requirements"
          options={{
            title: 'MCA Requirements',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="select-pathway"
          options={{
            title: 'Select Pathway',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="reports"
          options={{
            title: 'Reports',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="vessel-diagnostic"
          options={{
            title: 'Vessel Diagnostic',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="debug/[vesselId]"
          options={{
            title: 'Debug Logs',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="test-login"
          options={{
            title: 'Test Login',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="test-notifications"
          options={{
            title: 'Test Notifications',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="notification-settings"
          options={{
            title: 'Notification Settings',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="forgot-password"
          options={{
            title: 'Reset Password',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="paywall"
          options={{
            title: 'Upgrade',
            headerBackTitle: 'Back',
          }}
        />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <BridgeReadyProvider>
      <AuthProvider>
        <SubscriptionProvider>
          <RootLayoutContent />
        </SubscriptionProvider>
      </AuthProvider>
    </BridgeReadyProvider>
  );
}
