
import { Tabs, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useColorScheme } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';

import { log } from '@/utils/log';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { isSubscribed, isLoading: subscriptionLoading, revenueCatFailed } = useSubscription();

  useEffect(() => {
    if (authLoading || subscriptionLoading) return;

    if (!user) {
      log('[TabLayout] User not authenticated, redirecting to /auth');
      router.replace('/auth');
      return;
    }

    // If RevenueCat failed to load, fail open — do not redirect paying users to paywall
    if (revenueCatFailed) {
      log('[TabLayout] RevenueCat failed to load, failing open (allowing access)');
      return;
    }

    if (!isSubscribed) {
      log('[TabLayout] User not subscribed, redirecting to /paywall');
      router.replace('/paywall');
    }
  }, [user, isSubscribed, authLoading, subscriptionLoading, revenueCatFailed, router]);

  // Show loading spinner while auth/subscription state is being determined
  // to prevent a flash of authenticated content before guards can redirect
  if (authLoading || subscriptionLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: isDark ? '#000000' : '#FFFFFF' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: isDark ? '#98989D' : '#8E8E93',
        tabBarStyle: {
          backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
          height: 85,
          paddingBottom: 25,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          title: 'Sea Time',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              ios_icon_name="sailboat.fill"
              android_material_icon_name="directions-boat"
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="logbook"
        options={{
          title: 'Logbook',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              ios_icon_name="book.closed.fill"
              android_material_icon_name="menu-book"
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="confirmations"
        options={{
          title: 'Review',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              ios_icon_name="checkmark.circle.fill"
              android_material_icon_name="check-circle"
              size={24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              ios_icon_name="person.crop.circle.fill"
              android_material_icon_name="account-circle"
              size={24}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
