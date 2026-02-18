
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  RefreshControl,
  Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import * as seaTimeApi from '@/utils/seaTimeApi';

interface ScheduledTask {
  id: string;
  vessel_id: string;
  vessel_name: string;
  mmsi: string;
  task_type: string;
  interval_hours: number;
  last_run: string | null;
  next_run: string;
  is_active: boolean;
  created_at: string;
}

export default function ScheduledTasksScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);

  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      console.log('Loading scheduled tasks...');
      const data = await seaTimeApi.getScheduledTasks();
      console.log('Scheduled tasks loaded:', data.length);
      setTasks(data);
    } catch (error: any) {
      console.error('Failed to load scheduled tasks:', error);
      Alert.alert('Error', 'Failed to load scheduled tasks: ' + error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    console.log('User refreshing scheduled tasks');
    setRefreshing(true);
    loadTasks();
  };

  const handleToggleTask = async (taskId: string, currentStatus: boolean) => {
    try {
      console.log('Toggling task:', taskId, 'from', currentStatus, 'to', !currentStatus);
      await seaTimeApi.toggleScheduledTask(taskId, !currentStatus);
      const newStatus = !currentStatus;
      const statusText = newStatus ? 'activated' : 'paused';
      Alert.alert(
        'Success',
        `Task ${statusText} successfully`
      );
      loadTasks();
    } catch (error: any) {
      console.error('Failed to toggle task:', error);
      Alert.alert('Error', 'Failed to update task: ' + error.message);
    }
  };



  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const dateText = formatDate(dateString);
    const timeText = formatTime(dateString);
    return `${dateText} ${timeText}`;
  };

  const isTaskOverdue = (nextRunString: string) => {
    const nextRun = new Date(nextRunString);
    const now = new Date();
    return nextRun.getTime() < now.getTime();
  };

  const getTimeUntilNextRun = (nextRunString: string) => {
    const nextRun = new Date(nextRunString);
    const now = new Date();
    const diffMs = nextRun.getTime() - now.getTime();
    
    if (diffMs < 0) {
      const overdueMins = Math.abs(Math.floor(diffMs / (1000 * 60)));
      const overdueHours = Math.floor(overdueMins / 60);
      
      if (overdueHours > 0) {
        return `Overdue by ${overdueHours}h`;
      } else {
        return `Overdue by ${overdueMins}m`;
      }
    }
    
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      const remainingHours = diffHours % 24;
      return `in ${diffDays}d ${remainingHours}h`;
    } else if (diffHours > 0) {
      const remainingMinutes = diffMinutes % 60;
      return `in ${diffHours}h ${remainingMinutes}m`;
    } else {
      return `in ${diffMinutes}m`;
    }
  };

  const textColor = isDark ? colors.text : colors.textLight;
  const secondaryTextColor = isDark ? colors.textSecondary : colors.textSecondaryLight;
  const backgroundColor = isDark ? colors.background : colors.backgroundLight;
  const cardColor = isDark ? colors.cardBackground : colors.card;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Scheduled Tasks',
          headerShown: true,
          headerBackTitle: 'Back',
          headerBackTitleVisible: true,
          headerStyle: {
            backgroundColor: backgroundColor,
          },
          headerTintColor: textColor,
          headerShadowVisible: false,
        }}
      />
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Information Banner */}
          <View style={styles.infoBanner}>
            <IconSymbol
              ios_icon_name="info.circle.fill"
              android_material_icon_name="info"
              size={24}
              color={colors.primary}
              style={styles.infoIcon}
            />
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoTitle}>2-Hour Position Check Intervals</Text>
              <Text style={styles.infoText}>
                These tasks run automatically on our servers every 2 hours, even when your app is closed or your phone is off. 
                The backend continuously monitors vessel positions and creates sea time entries when movement is detected.
              </Text>
            </View>
          </View>



          {/* How It Works Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How It Works</Text>
            <View style={styles.howItWorksContainer}>
              <View style={styles.stepContainer}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>1</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>2-Hour Position Checks</Text>
                  <Text style={styles.stepText}>
                    Server checks vessel position every 2 hours via AIS data
                  </Text>
                </View>
              </View>

              <View style={styles.stepContainer}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>2</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Movement Detection</Text>
                  <Text style={styles.stepText}>
                    Compares current position with position from 2 hours ago
                  </Text>
                </View>
              </View>

              <View style={styles.stepContainer}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>3</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Entry Creation</Text>
                  <Text style={styles.stepText}>
                    Creates pending sea time entries when movement detected
                  </Text>
                </View>
              </View>

              <View style={styles.stepContainer}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>4</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Your Confirmation</Text>
                  <Text style={styles.stepText}>
                    You review and confirm entries in the Confirmations tab
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Active Tasks Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active Scheduled Tasks</Text>
            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading tasks...</Text>
              </View>
            ) : tasks.length === 0 ? (
              <View style={styles.emptyContainer}>
                <IconSymbol
                  ios_icon_name="calendar.badge.clock"
                  android_material_icon_name="schedule"
                  size={48}
                  color={secondaryTextColor}
                />
                <Text style={styles.emptyText}>No scheduled tasks</Text>
                <Text style={styles.emptySubtext}>
                  Activate a vessel to start automatic position tracking
                </Text>
              </View>
            ) : (
              tasks.map((task) => {
                const isActive = task.is_active;
                const isOverdue = isTaskOverdue(task.next_run);
                const statusBgColor = isActive ? 'rgba(0, 200, 83, 0.2)' : 'rgba(255, 179, 0, 0.2)';
                const statusTextColor = isActive ? colors.success : colors.warning;
                const statusText = isActive ? 'Active' : 'Paused';

                return (
                  <View key={task.id} style={styles.taskCard}>
                    <View style={styles.taskHeader}>
                      <View style={styles.taskHeaderLeft}>
                        <Text style={styles.vesselName}>{task.vessel_name}</Text>
                        <Text style={styles.mmsi}>MMSI: {task.mmsi}</Text>
                      </View>
                      <TouchableOpacity
                        style={[
                          styles.statusBadge,
                          { backgroundColor: statusBgColor },
                        ]}
                        onPress={() => handleToggleTask(task.id, task.is_active)}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            { color: statusTextColor },
                          ]}
                        >
                          {statusText}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.taskDetails}>
                      <View style={styles.detailRow}>
                        <IconSymbol
                          ios_icon_name="clock"
                          android_material_icon_name="schedule"
                          size={16}
                          color={secondaryTextColor}
                        />
                        <Text style={styles.detailLabel}>Interval:</Text>
                        <Text style={styles.detailValue}>Every {task.interval_hours} hours</Text>
                      </View>

                      <View style={styles.detailRow}>
                        <IconSymbol
                          ios_icon_name="arrow.clockwise"
                          android_material_icon_name="refresh"
                          size={16}
                          color={secondaryTextColor}
                        />
                        <Text style={styles.detailLabel}>Last Run:</Text>
                        <Text style={styles.detailValue}>{formatDateTime(task.last_run)}</Text>
                      </View>

                      <View style={styles.detailRow}>
                        <IconSymbol
                          ios_icon_name="calendar"
                          android_material_icon_name="event"
                          size={16}
                          color={secondaryTextColor}
                        />
                        <Text style={styles.detailLabel}>Next Run:</Text>
                        <Text style={styles.detailValue}>
                          {formatDateTime(task.next_run)}
                        </Text>
                      </View>

                      {task.is_active && (
                        <View style={[
                          styles.nextRunBanner,
                          isOverdue && styles.nextRunBannerOverdue
                        ]}>
                          {isOverdue && (
                            <IconSymbol
                              ios_icon_name="exclamationmark.triangle.fill"
                              android_material_icon_name="warning"
                              size={16}
                              color={colors.error}
                              style={styles.overdueIcon}
                            />
                          )}
                          <Text style={[
                            styles.nextRunText,
                            isOverdue && styles.nextRunTextOverdue
                          ]}>
                            {isOverdue ? 'Next check ' : 'Next check '}
                            {getTimeUntilNextRun(task.next_run)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Important Notes Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Important Notes</Text>
            <View style={styles.noteContainer}>
              <View style={styles.noteItem}>
                <IconSymbol
                  ios_icon_name="checkmark.circle.fill"
                  android_material_icon_name="check-circle"
                  size={20}
                  color={colors.success}
                  style={styles.noteIcon}
                />
                <Text style={styles.noteText}>
                  Tasks run on our servers, not your device
                </Text>
              </View>
              <View style={styles.noteItem}>
                <IconSymbol
                  ios_icon_name="checkmark.circle.fill"
                  android_material_icon_name="check-circle"
                  size={20}
                  color={colors.success}
                  style={styles.noteIcon}
                />
                <Text style={styles.noteText}>
                  Works even when app is closed or phone is off
                </Text>
              </View>
              <View style={styles.noteItem}>
                <IconSymbol
                  ios_icon_name="checkmark.circle.fill"
                  android_material_icon_name="check-circle"
                  size={20}
                  color={colors.success}
                  style={styles.noteIcon}
                />
                <Text style={styles.noteText}>
                  No battery drain on your device
                </Text>
              </View>
              <View style={styles.noteItem}>
                <IconSymbol
                  ios_icon_name="checkmark.circle.fill"
                  android_material_icon_name="check-circle"
                  size={20}
                  color={colors.success}
                  style={styles.noteIcon}
                />
                <Text style={styles.noteText}>
                  Reliable 24/7 monitoring
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </>
  );
}

function createStyles(isDark: boolean) {
  const textColor = isDark ? colors.text : colors.textLight;
  const secondaryTextColor = isDark ? colors.textSecondary : colors.textSecondaryLight;
  const backgroundColor = isDark ? colors.background : colors.backgroundLight;
  const cardColor = isDark ? colors.cardBackground : colors.card;
  const borderColor = isDark ? colors.border : colors.borderLight;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: backgroundColor,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 32,
    },
    infoBanner: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(0, 122, 255, 0.15)' : 'rgba(0, 122, 255, 0.1)',
      borderRadius: 12,
      padding: 16,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 122, 255, 0.3)' : 'rgba(0, 122, 255, 0.2)',
    },
    infoIcon: {
      marginRight: 12,
      marginTop: 2,
    },
    infoTextContainer: {
      flex: 1,
    },
    infoTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.primary,
      marginBottom: 6,
    },
    infoText: {
      fontSize: 14,
      lineHeight: 20,
      color: textColor,
    },

    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: textColor,
      marginBottom: 12,
    },
    howItWorksContainer: {
      backgroundColor: cardColor,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: borderColor,
    },
    stepContainer: {
      flexDirection: 'row',
      marginBottom: 16,
    },
    stepNumber: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
      flexShrink: 0,
    },
    stepNumberText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    stepContent: {
      flex: 1,
      paddingTop: 2,
    },
    stepTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: textColor,
      marginBottom: 4,
    },
    stepText: {
      fontSize: 13,
      lineHeight: 18,
      color: secondaryTextColor,
    },
    loadingContainer: {
      padding: 40,
      alignItems: 'center',
      backgroundColor: cardColor,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: borderColor,
    },
    loadingText: {
      fontSize: 16,
      color: secondaryTextColor,
    },
    emptyContainer: {
      padding: 40,
      alignItems: 'center',
      backgroundColor: cardColor,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: borderColor,
    },
    emptyText: {
      fontSize: 18,
      fontWeight: '600',
      color: textColor,
      marginTop: 16,
      marginBottom: 8,
    },
    emptySubtext: {
      fontSize: 14,
      color: secondaryTextColor,
      textAlign: 'center',
      paddingHorizontal: 20,
    },
    taskCard: {
      backgroundColor: cardColor,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: borderColor,
    },
    taskHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: borderColor,
    },
    taskHeaderLeft: {
      flex: 1,
      marginRight: 12,
    },
    vesselName: {
      fontSize: 17,
      fontWeight: '600',
      color: textColor,
      marginBottom: 4,
    },
    mmsi: {
      fontSize: 13,
      color: secondaryTextColor,
    },
    statusBadge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      flexShrink: 0,
    },
    statusText: {
      fontSize: 13,
      fontWeight: '600',
    },
    taskDetails: {
      gap: 10,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    detailLabel: {
      fontSize: 14,
      color: secondaryTextColor,
      minWidth: 75,
    },
    detailValue: {
      fontSize: 14,
      fontWeight: '500',
      color: textColor,
      flex: 1,
    },
    nextRunBanner: {
      backgroundColor: isDark ? 'rgba(0, 122, 255, 0.15)' : 'rgba(0, 122, 255, 0.1)',
      borderRadius: 8,
      padding: 10,
      marginTop: 4,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
    },
    nextRunBannerOverdue: {
      backgroundColor: isDark ? 'rgba(255, 59, 48, 0.15)' : 'rgba(255, 59, 48, 0.1)',
    },
    overdueIcon: {
      marginRight: 6,
    },
    nextRunText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
    nextRunTextOverdue: {
      color: colors.error,
    },
    noteContainer: {
      backgroundColor: cardColor,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: borderColor,
    },
    noteItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    noteIcon: {
      marginRight: 12,
      marginTop: 2,
      flexShrink: 0,
    },
    noteText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
      color: textColor,
    },
  });
}
