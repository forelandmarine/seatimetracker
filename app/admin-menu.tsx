
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

function createStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.backgroundDark : colors.backgroundLight,
    },
    scrollContent: {
      padding: 20,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: isDark ? colors.textDark : colors.textLight,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
      marginBottom: 32,
    },
    menuItem: {
      backgroundColor: isDark ? colors.cardDark : colors.cardLight,
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
      flexDirection: 'row',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    menuItemIcon: {
      marginRight: 16,
    },
    menuItemContent: {
      flex: 1,
    },
    menuItemTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: isDark ? colors.textDark : colors.textLight,
      marginBottom: 4,
    },
    menuItemDescription: {
      fontSize: 14,
      color: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
    },
    menuItemChevron: {
      marginLeft: 8,
    },
  });
}

export default function AdminMenuScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const router = useRouter();

  const menuItems = [
    {
      title: 'Activate Subscriptions',
      description: 'Create sandbox users and manage subscription status',
      icon: 'person',
      route: '/admin-activate-subscriptions',
    },
    {
      title: 'Update Subscription',
      description: 'Update subscription status for specific users',
      icon: 'edit',
      route: '/admin-update-subscription',
    },
    {
      title: 'Verify Sea Time',
      description: 'Check sea time entries for users and vessels',
      icon: 'search',
      route: '/admin-verify',
    },
    {
      title: 'Investigate Entry',
      description: 'Investigate specific sea time entries',
      icon: 'info',
      route: '/admin-investigate-entry',
    },
    {
      title: 'Generate Samples',
      description: 'Generate demo sea time entries for testing',
      icon: 'add',
      route: '/admin-generate-samples',
    },
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Admin Tools',
          headerStyle: {
            backgroundColor: isDark ? colors.backgroundDark : colors.backgroundLight,
          },
          headerTintColor: isDark ? colors.textDark : colors.textLight,
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Admin Tools</Text>
        <Text style={styles.subtitle}>
          Manage subscriptions, verify data, and test features
        </Text>

        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={styles.menuItem}
            onPress={() => router.push(item.route as any)}
          >
            <View style={styles.menuItemIcon}>
              <IconSymbol
                ios_icon_name={item.icon}
                android_material_icon_name={item.icon}
                size={32}
                color={colors.primary}
              />
            </View>
            <View style={styles.menuItemContent}>
              <Text style={styles.menuItemTitle}>{item.title}</Text>
              <Text style={styles.menuItemDescription}>{item.description}</Text>
            </View>
            <View style={styles.menuItemChevron}>
              <IconSymbol
                ios_icon_name="chevron.right"
                android_material_icon_name="arrow-forward"
                size={20}
                color={isDark ? colors.textSecondaryDark : colors.textSecondaryLight}
              />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </>
  );
}
