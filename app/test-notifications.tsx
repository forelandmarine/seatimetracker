
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  useColorScheme,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import {
  registerForPushNotificationsAsync,
  scheduleSeaTimeNotification,
  scheduleDailySeaTimeReviewNotification,
  cancelAllNotifications,
  getBadgeCount,
  setBadgeCount,
  clearBadge,
} from '@/utils/notifications';

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    content: {
      padding: 20,
    },
    section: {
      marginBottom: 30,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 15,
    },
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 20,
      marginBottom: 15,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    statusLabel: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      flex: 1,
    },
    statusValue: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
    },
    statusSuccess: {
      color: '#4CAF50',
    },
    statusError: {
      color: '#F44336',
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginBottom: 12,
      flexDirection: 'row',
      justifyContent: 'center',
    },
    buttonSecondary: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    },
    buttonDanger: {
      backgroundColor: '#F44336',
    },
    buttonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
      marginLeft: 8,
    },
    buttonTextSecondary: {
      color: isDark ? colors.text : colors.textLight,
    },
    infoBox: {
      backgroundColor: isDark ? 'rgba(0, 122, 255, 0.1)' : 'rgba(0, 122, 255, 0.05)',
      borderRadius: 12,
      padding: 15,
      marginTop: 10,
      borderWidth: 1,
      borderColor: 'rgba(0, 122, 255, 0.3)',
    },
    infoText: {
      fontSize: 14,
      color: isDark ? colors.text : colors.textLight,
      lineHeight: 20,
    },
    warningBox: {
      backgroundColor: isDark ? 'rgba(255, 152, 0, 0.1)' : 'rgba(255, 152, 0, 0.05)',
      borderRadius: 12,
      padding: 15,
      marginTop: 10,
      borderWidth: 1,
      borderColor: 'rgba(255, 152, 0, 0.3)',
    },
    warningText: {
      fontSize: 14,
      color: isDark ? colors.text : colors.textLight,
      lineHeight: 20,
    },
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    loadingText: {
      marginLeft: 10,
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    divider: {
      height: 1,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      marginVertical: 20,
    },
  });

export default function TestNotificationsScreen() {
  const [permissionStatus, setPermissionStatus] = useState<string>('Unknown');
  const [badgeCount, setBadgeCountState] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState<string[]>([]);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const router = useRouter();

  useEffect(() => {
    checkPermissionStatus();
    checkBadgeCount();
  }, []);

  const checkPermissionStatus = async () => {
    console.log('[TestNotifications] Checking permission status');
    if (Platform.OS === 'web') {
      setPermissionStatus('Not supported on web');
      return;
    }

    try {
      const Notifications = await import('expo-notifications');
      const permissionsResult = await Notifications.getPermissionsAsync();
      const statusText = permissionsResult.status;
      console.log('[TestNotifications] Permission status:', statusText);
      setPermissionStatus(statusText);
    } catch (error) {
      console.error('[TestNotifications] Failed to check permissions:', error);
      setPermissionStatus('Error checking permissions');
    }
  };

  const checkBadgeCount = async () => {
    console.log('[TestNotifications] Checking badge count');
    try {
      const count = await getBadgeCount();
      console.log('[TestNotifications] Badge count:', count);
      setBadgeCountState(count);
    } catch (error) {
      console.error('[TestNotifications] Failed to get badge count:', error);
    }
  };

  const addTestResult = (result: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const resultText = `[${timestamp}] ${result}`;
    console.log('[TestNotifications]', result);
    setTestResults(prev => [resultText, ...prev]);
  };

  const handleRequestPermissions = async () => {
    console.log('[TestNotifications] User tapped Request Permissions');
    setLoading(true);
    addTestResult('Requesting notification permissions...');
    
    try {
      const granted = await registerForPushNotificationsAsync();
      
      if (granted) {
        addTestResult('✅ Permissions granted successfully');
        setPermissionStatus('granted');
        Alert.alert('Success', 'Notification permissions granted!');
      } else {
        addTestResult('❌ Permissions denied or not available');
        setPermissionStatus('denied');
        Alert.alert('Permissions Denied', 'Please enable notifications in your device settings.');
      }
    } catch (error) {
      addTestResult(`❌ Error: ${error}`);
      Alert.alert('Error', 'Failed to request permissions');
    } finally {
      setLoading(false);
      await checkPermissionStatus();
    }
  };

  const handleTestImmediateNotification = async () => {
    console.log('[TestNotifications] User tapped Test Immediate Notification');
    setLoading(true);
    addTestResult('Scheduling immediate test notification...');
    
    try {
      const notificationId = await scheduleSeaTimeNotification(
        'Test Vessel',
        'test-entry-123',
        5.5,
        true
      );
      
      if (notificationId) {
        addTestResult(`✅ Notification scheduled: ${notificationId}`);
        Alert.alert('Success', 'Test notification sent! Check your notification center.');
      } else {
        addTestResult('❌ Failed to schedule notification');
        Alert.alert('Failed', 'Could not schedule notification. Check permissions.');
      }
    } catch (error) {
      addTestResult(`❌ Error: ${error}`);
      Alert.alert('Error', 'Failed to send test notification');
    } finally {
      setLoading(false);
    }
  };

  const handleTestDailyNotification = async () => {
    console.log('[TestNotifications] User tapped Test Daily Notification');
    setLoading(true);
    addTestResult('Setting up daily notification at 18:00...');
    
    try {
      const notificationId = await scheduleDailySeaTimeReviewNotification('18:00');
      
      if (notificationId) {
        addTestResult(`✅ Daily notification scheduled: ${notificationId}`);
        Alert.alert('Success', 'Daily notification set for 6:00 PM every day.');
      } else {
        addTestResult('❌ Failed to schedule daily notification');
        Alert.alert('Failed', 'Could not schedule daily notification.');
      }
    } catch (error) {
      addTestResult(`❌ Error: ${error}`);
      Alert.alert('Error', 'Failed to set up daily notification');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAllNotifications = async () => {
    console.log('[TestNotifications] User tapped Cancel All Notifications');
    setLoading(true);
    addTestResult('Canceling all scheduled notifications...');
    
    try {
      await cancelAllNotifications();
      addTestResult('✅ All notifications canceled');
      Alert.alert('Success', 'All scheduled notifications have been canceled.');
    } catch (error) {
      addTestResult(`❌ Error: ${error}`);
      Alert.alert('Error', 'Failed to cancel notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleSetBadge = async (count: number) => {
    console.log('[TestNotifications] Setting badge to:', count);
    setLoading(true);
    addTestResult(`Setting badge count to ${count}...`);
    
    try {
      await setBadgeCount(count);
      await checkBadgeCount();
      addTestResult(`✅ Badge count set to ${count}`);
    } catch (error) {
      addTestResult(`❌ Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClearBadge = async () => {
    console.log('[TestNotifications] Clearing badge');
    setLoading(true);
    addTestResult('Clearing badge...');
    
    try {
      await clearBadge();
      await checkBadgeCount();
      addTestResult('✅ Badge cleared');
    } catch (error) {
      addTestResult(`❌ Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleViewScheduledNotifications = async () => {
    console.log('[TestNotifications] Viewing scheduled notifications');
    setLoading(true);
    addTestResult('Fetching scheduled notifications...');
    
    try {
      if (Platform.OS === 'web') {
        addTestResult('❌ Not supported on web');
        Alert.alert('Not Supported', 'This feature is not available on web.');
        return;
      }

      const Notifications = await import('expo-notifications');
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      
      addTestResult(`Found ${scheduled.length} scheduled notification(s)`);
      
      if (scheduled.length === 0) {
        Alert.alert('No Scheduled Notifications', 'There are no scheduled notifications.');
      } else {
        const details = scheduled.map((notif, index) => {
          const triggerText = notif.trigger ? JSON.stringify(notif.trigger) : 'Immediate';
          return `${index + 1}. ${notif.content.title}\n   Trigger: ${triggerText}`;
        }).join('\n\n');
        
        Alert.alert('Scheduled Notifications', details);
        addTestResult(`Details: ${details}`);
      }
    } catch (error) {
      addTestResult(`❌ Error: ${error}`);
      Alert.alert('Error', 'Failed to fetch scheduled notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleClearTestResults = () => {
    console.log('[TestNotifications] Clearing test results');
    setTestResults([]);
    addTestResult('Test results cleared');
  };

  const permissionStatusText = permissionStatus;
  const permissionStatusColor = permissionStatus === 'granted' ? styles.statusSuccess : styles.statusError;
  const badgeCountText = badgeCount.toString();

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Test Notifications',
          headerShown: true,
          headerBackTitle: 'Back',
          headerBackTitleVisible: true,
        }}
      />
      <View style={styles.container}>
        <ScrollView style={styles.content}>
          {/* Status Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notification Status</Text>
            <View style={styles.card}>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Platform</Text>
                <Text style={styles.statusValue}>{Platform.OS}</Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Permission Status</Text>
                <Text style={[styles.statusValue, permissionStatusColor]}>
                  {permissionStatusText}
                </Text>
              </View>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Badge Count</Text>
                <Text style={styles.statusValue}>{badgeCountText}</Text>
              </View>
            </View>

            {Platform.OS === 'web' && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  ⚠️ Notifications are not supported on web. Please test on iOS or Android.
                </Text>
              </View>
            )}

            {permissionStatus !== 'granted' && Platform.OS !== 'web' && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  ⚠️ Notification permissions not granted. Tap "Request Permissions" below to enable notifications.
                </Text>
              </View>
            )}
          </View>

          {/* Permission Tests */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Permission Tests</Text>
            
            <TouchableOpacity
              style={styles.button}
              onPress={handleRequestPermissions}
              disabled={loading || Platform.OS === 'web'}
            >
              <IconSymbol
                ios_icon_name="bell.badge.fill"
                android_material_icon_name="notifications"
                size={20}
                color="#ffffff"
              />
              <Text style={styles.buttonText}>Request Permissions</Text>
            </TouchableOpacity>

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                This will request notification permissions from your device. You must grant permissions for notifications to work.
              </Text>
            </View>
          </View>

          {/* Notification Tests */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notification Tests</Text>
            
            <TouchableOpacity
              style={styles.button}
              onPress={handleTestImmediateNotification}
              disabled={loading || Platform.OS === 'web' || permissionStatus !== 'granted'}
            >
              <IconSymbol
                ios_icon_name="bell.fill"
                android_material_icon_name="notifications-active"
                size={20}
                color="#ffffff"
              />
              <Text style={styles.buttonText}>Send Test Notification (Immediate)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.button}
              onPress={handleTestDailyNotification}
              disabled={loading || Platform.OS === 'web' || permissionStatus !== 'granted'}
            >
              <IconSymbol
                ios_icon_name="calendar.badge.clock"
                android_material_icon_name="schedule"
                size={20}
                color="#ffffff"
              />
              <Text style={styles.buttonText}>Schedule Daily Notification (6 PM)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={handleViewScheduledNotifications}
              disabled={loading || Platform.OS === 'web'}
            >
              <IconSymbol
                ios_icon_name="list.bullet"
                android_material_icon_name="list"
                size={20}
                color={isDark ? colors.text : colors.textLight}
              />
              <Text style={[styles.buttonText, styles.buttonTextSecondary]}>
                View Scheduled Notifications
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.buttonDanger]}
              onPress={handleCancelAllNotifications}
              disabled={loading || Platform.OS === 'web'}
            >
              <IconSymbol
                ios_icon_name="bell.slash.fill"
                android_material_icon_name="notifications-off"
                size={20}
                color="#ffffff"
              />
              <Text style={styles.buttonText}>Cancel All Notifications</Text>
            </TouchableOpacity>

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                • Immediate notification appears right away{'\n'}
                • Daily notification is scheduled for 6:00 PM every day{'\n'}
                • View scheduled shows all pending notifications{'\n'}
                • Cancel all removes all scheduled notifications
              </Text>
            </View>
          </View>

          {/* Badge Tests */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Badge Tests</Text>
            
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={() => handleSetBadge(1)}
              disabled={loading || Platform.OS === 'web'}
            >
              <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Set Badge to 1</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={() => handleSetBadge(5)}
              disabled={loading || Platform.OS === 'web'}
            >
              <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Set Badge to 5</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={handleClearBadge}
              disabled={loading || Platform.OS === 'web'}
            >
              <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Clear Badge</Text>
            </TouchableOpacity>

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                Badge count appears as a number on your app icon. Test different values to see how it looks.
              </Text>
            </View>
          </View>

          {/* Test Results */}
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <Text style={styles.sectionTitle}>Test Results</Text>
              {testResults.length > 0 && (
                <TouchableOpacity onPress={handleClearTestResults}>
                  <Text style={{ color: colors.primary, fontSize: 14 }}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            
            {testResults.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.infoText}>
                  No test results yet. Run some tests above to see results here.
                </Text>
              </View>
            ) : (
              <View style={styles.card}>
                {testResults.map((result, index) => (
                  <Text key={index} style={[styles.infoText, { marginBottom: 8 }]}>
                    {result}
                  </Text>
                ))}
              </View>
            )}
          </View>

          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Processing...</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </>
  );
}
