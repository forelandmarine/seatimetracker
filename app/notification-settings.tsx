
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  useColorScheme,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import * as seaTimeApi from '@/utils/seaTimeApi';
import { scheduleDailySeaTimeReviewNotification, cancelAllNotifications } from '@/utils/notifications';

interface NotificationSchedule {
  id: string;
  notification_type: string;
  scheduled_time: string;
  timezone: string;
  is_active: boolean;
  last_sent: string | null;
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    content: {
      flex: 1,
      padding: 20,
    },
    section: {
      marginBottom: 30,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 15,
    },
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    settingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 15,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    settingRowLast: {
      borderBottomWidth: 0,
    },
    settingLabel: {
      fontSize: 16,
      color: isDark ? colors.text : colors.textLight,
      flex: 1,
    },
    settingDescription: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 5,
    },
    timeButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 8,
    },
    timeButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    infoBox: {
      backgroundColor: isDark ? 'rgba(0, 122, 255, 0.1)' : 'rgba(0, 122, 255, 0.05)',
      borderRadius: 12,
      padding: 15,
      marginTop: 20,
      borderWidth: 1,
      borderColor: 'rgba(0, 122, 255, 0.3)',
    },
    infoText: {
      fontSize: 14,
      color: isDark ? colors.text : colors.textLight,
      lineHeight: 20,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 10,
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    timezoneText: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 5,
    },
  });

export default function NotificationSettingsScreen() {
  const [schedule, setSchedule] = useState<NotificationSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const router = useRouter();

  useEffect(() => {
    loadSchedule();
  }, []);

  const loadSchedule = async () => {
    console.log('[NotificationSettings] Loading notification schedule');
    try {
      const data = await seaTimeApi.getNotificationSchedule();
      console.log('[NotificationSettings] Schedule loaded:', data);
      setSchedule(data);
    } catch (error) {
      console.error('[NotificationSettings] Failed to load schedule:', error);
      Alert.alert('Error', 'Failed to load notification settings');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleNotifications = async (value: boolean) => {
    console.log('[NotificationSettings] Toggling notifications:', value);
    setUpdating(true);
    try {
      // Get device timezone
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      console.log('[NotificationSettings] Device timezone:', timezone);

      const updated = await seaTimeApi.updateNotificationSchedule({
        is_active: value,
        timezone: timezone,
      });
      console.log('[NotificationSettings] Notifications toggled:', updated);
      setSchedule(updated);

      // Update local notifications
      if (value) {
        const scheduledTime = updated.scheduled_time || '18:00';
        await scheduleDailySeaTimeReviewNotification(scheduledTime);
        Alert.alert('Success', 'Daily notifications enabled at ' + scheduledTime);
      } else {
        await cancelAllNotifications();
        Alert.alert('Success', 'Daily notifications disabled');
      }
    } catch (error) {
      console.error('[NotificationSettings] Failed to toggle notifications:', error);
      Alert.alert('Error', 'Failed to update notification settings');
    } finally {
      setUpdating(false);
    }
  };

  const handleChangeTime = () => {
    console.log('[NotificationSettings] User tapped change time');
    
    // Show a list of common times
    const timeOptions = [
      { label: '6:00 AM', value: '06:00' },
      { label: '8:00 AM', value: '08:00' },
      { label: '12:00 PM (Noon)', value: '12:00' },
      { label: '6:00 PM', value: '18:00' },
      { label: '8:00 PM', value: '20:00' },
      { label: '9:00 PM', value: '21:00' },
    ];

    const buttons = timeOptions.map(option => ({
      text: option.label,
      onPress: async () => {
        console.log('[NotificationSettings] Setting new time:', option.value);
        setUpdating(true);
        try {
          // Get device timezone
          const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
          console.log('[NotificationSettings] Device timezone:', timezone);

          const updated = await seaTimeApi.updateNotificationSchedule({
            scheduled_time: option.value,
            timezone: timezone,
          });
          console.log('[NotificationSettings] Time updated:', updated);
          setSchedule(updated);

          // Update local notifications if active
          if (updated.is_active) {
            await scheduleDailySeaTimeReviewNotification(option.value);
          }

          Alert.alert('Success', `Notification time updated to ${option.label}`);
        } catch (error) {
          console.error('[NotificationSettings] Failed to update time:', error);
          Alert.alert('Error', 'Failed to update notification time');
        } finally {
          setUpdating(false);
        }
      },
    }));

    buttons.push({
      text: 'Cancel',
      onPress: () => {},
    });

    Alert.alert(
      'Change Notification Time',
      'Select a time for your daily sea time review notification:',
      buttons as any
    );
  };

  const handleChangeTimezone = () => {
    console.log('[NotificationSettings] User tapped change timezone');
    Alert.alert(
      'Change Timezone',
      'Your timezone is automatically detected from your device. To change it, update your device settings.',
      [{ text: 'OK' }]
    );
  };

  if (loading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: 'Notification Settings',
            headerShown: true,
            headerBackTitle: 'Back',
            headerBackTitleVisible: true,
          }}
        />
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading settings...</Text>
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Notification Settings',
          headerShown: true,
          headerBackTitle: 'Back',
          headerBackTitleVisible: true,
        }}
      />
      <View style={styles.container}>

        <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily Sea Time Review</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Enable Daily Notifications</Text>
                <Text style={styles.settingDescription}>
                  Get reminded to review your sea time entries
                </Text>
              </View>
              <Switch
                value={schedule?.is_active || false}
                onValueChange={handleToggleNotifications}
                disabled={updating}
                trackColor={{ false: '#767577', true: colors.primary }}
                thumbColor={Platform.OS === 'ios' ? '#ffffff' : schedule?.is_active ? '#ffffff' : '#f4f3f4'}
              />
            </View>

            <View style={[styles.settingRow, styles.settingRowLast]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Notification Time</Text>
                <Text style={styles.settingDescription}>
                  {schedule?.scheduled_time || '18:00'} (Local Time)
                </Text>
                {schedule?.timezone && (
                  <Text style={styles.timezoneText}>Timezone: {schedule.timezone}</Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.timeButton}
                onPress={handleChangeTime}
                disabled={updating || !schedule?.is_active}
              >
                <Text style={styles.timeButtonText}>Change</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              💡 You'll receive a daily notification at {schedule?.scheduled_time || '18:00'} to review any pending sea time entries.
              {'\n\n'}
              The notification will only be sent if you have pending entries that need confirmation.
              {'\n\n'}
              {schedule?.last_sent && `Last notification sent: ${new Date(schedule.last_sent).toLocaleString()}`}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About Notifications</Text>
          <View style={styles.card}>
            <Text style={styles.settingDescription}>
              • Notifications are sent locally on your device{'\n'}
              • No personal data is sent to external servers{'\n'}
              • You can disable notifications at any time{'\n'}
              • Notifications require permission from your device settings
            </Text>
          </View>
        </View>
        </ScrollView>
      </View>
    </>
  );
}
