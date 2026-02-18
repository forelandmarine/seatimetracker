
import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useColorScheme, View, Text } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname } from 'expo-router';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user, loading, triggerRefresh } = useAuth();
  const pathname = usePathname();

  // Trigger refresh when navigating between tabs (simulates back button behavior)
  useEffect(() => {
    console.log('[TabLayout] Navigation detected to:', pathname);
    console.log('[TabLayout] User authenticated:', !!user);
    console.log('[TabLayout] Triggering global refresh');
    triggerRefresh();
  }, [pathname, triggerRefresh, user]);

  // Show loading state while checking auth
  if (loading) {
    console.log('[TabLayout] Showing loading state');
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: isDark ? colors.background : colors.backgroundLight }}>
        <Text style={{ fontSize: 14, color: isDark ? '#999' : '#666' }}>Loading...</Text>
      </View>
    );
  }

  // If no user, show a blank screen - the root layout will handle redirect
  if (!user) {
    console.log('[TabLayout] No user found, showing blank screen (root layout will redirect)');
    return (
      <View style={{ flex: 1, backgroundColor: isDark ? colors.background : colors.backgroundLight }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: isDark ? '#999' : '#666' }}>Redirecting to login...</Text>
        </View>
      </View>
    );
  }

  console.log('[TabLayout] Rendering tabs for user:', user.email);

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
          title: 'Reports',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol
              ios_icon_name="doc.text.fill"
              android_material_icon_name="description"
              size={24}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
