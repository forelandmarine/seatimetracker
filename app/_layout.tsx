
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
import { initSentry } from '@/utils/sentry';
import { useTranslation } from 'react-i18next';
import '@/i18n'; // Initialize i18next

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Initialize Sentry as early as possible. Safe no-op when not configured.
initSentry();

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const { t } = useTranslation();

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
        <Stack.Screen name="auth" options={{ headerShown: false, gestureEnabled: false }} />
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
            presentation: 'card',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="edit-sea-time"
          options={{
            presentation: 'card',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="vessel/[id]"
          options={{
            title: t('navigation.vesselDetails'),
            headerBackTitle: t('common.back'),
          }}
        />
        <Stack.Screen
          name="user-profile"
          options={{
            title: t('navigation.editProfile'),
            headerBackTitle: t('common.back'),
          }}
        />
        <Stack.Screen
          name="scheduled-tasks"
          options={{
            title: t('navigation.aisCheckSchedule'),
            headerBackTitle: t('common.back'),
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            title: t('settings.title'),
            headerBackTitle: t('tabs.profile'),
          }}
        />
        <Stack.Screen
          name="about"
          options={{
            title: t('navigation.about'),
            headerBackTitle: t('common.back'),
          }}
        />
        <Stack.Screen
          name="onboarding"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="certificates"
          options={{
            title: t('certificates.title'),
            headerBackTitle: t('common.back'),
          }}
        />
        <Stack.Screen
          name="certificate-edit"
          options={{
            title: t('certificates.title'),
            headerBackTitle: t('common.back'),
          }}
        />
        <Stack.Screen
          name="manual-tracking"
          options={{
            title: t('navigation.manualTracking'),
            headerBackTitle: t('common.back'),
          }}
        />
        <Stack.Screen
          name="signature"
          options={{
            title: t('navigation.signature'),
            headerBackTitle: t('common.cancel'),
          }}
        />
        <Stack.Screen
          name="refer"
          options={{
            title: t('refer.title'),
            headerBackTitle: t('common.back'),
          }}
        />
        <Stack.Screen
          name="language"
          options={{
            title: t('navigation.language'),
            headerBackTitle: t('common.back'),
          }}
        />
        <Stack.Screen
          name="mca-requirements"
          options={{
            title: t('navigation.mcaRequirements'),
            headerBackTitle: t('common.back'),
          }}
        />
        <Stack.Screen
          name="select-pathway"
          options={{
            title: t('navigation.selectPathway'),
            headerBackVisible: false,
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="reports"
          options={{
            title: t('navigation.reports'),
            headerBackTitle: t('common.back'),
          }}
        />
        <Stack.Screen
          name="notification-settings"
          options={{
            title: t('navigation.notificationSettings'),
            headerBackTitle: t('common.back'),
          }}
        />
        <Stack.Screen
          name="forgot-password"
          options={{
            title: t('navigation.resetPassword'),
            headerBackTitle: t('common.back'),
          }}
        />
        <Stack.Screen
          name="paywall"
          options={{
            title: t('navigation.upgrade'),
            headerBackTitle: t('common.back'),
          }}
        />
        <Stack.Screen
          name="two-factor"
          options={{
            title: t('navigation.verifyIdentity'),
            headerBackTitle: t('common.back'),
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
