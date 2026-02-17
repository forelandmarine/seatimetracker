
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
  Modal,
  ScrollView,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { apiPut } from '@/utils/api';

export default function AdminUpdateSubscriptionScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const router = useRouter();

  const [email, setEmail] = useState('test@seatime.com');
  const [subscriptionStatus, setSubscriptionStatus] = useState('active');
  const [loading, setLoading] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [autoExecute, setAutoExecute] = useState(false);

  // Auto-execute on mount if needed
  useEffect(() => {
    if (autoExecute) {
      handleUpdateSubscription();
    }
  }, [autoExecute]);

  const handleUpdateSubscription = async () => {
    console.log('User tapped Update Subscription button');
    console.log('Email:', email);
    console.log('Subscription Status:', subscriptionStatus);

    if (!email || !subscriptionStatus) {
      const errorMsg = 'Please enter both email and subscription status';
      setErrorMessage(errorMsg);
      console.error(errorMsg);
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      console.log('Calling PUT /api/admin/update-subscription');
      const response = await apiPut('/api/admin/update-subscription', {
        email: email.trim(),
        subscription_status: subscriptionStatus,
      });

      console.log('Subscription updated successfully:', response);
      setSuccessModalVisible(true);
    } catch (error: any) {
      console.error('Error updating subscription:', error);
      const errorMsg = error?.message || 'Failed to update subscription';
      setErrorMessage(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSuccessModal = () => {
    setSuccessModalVisible(false);
    router.back();
  };

  const handleQuickUpdate = (targetEmail: string, targetStatus: string) => {
    console.log(`Quick update: ${targetEmail} -> ${targetStatus}`);
    setEmail(targetEmail);
    setSubscriptionStatus(targetStatus);
    // Trigger update after state is set
    setTimeout(() => {
      handleUpdateSubscription();
    }, 100);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Update Subscription',
          headerShown: true,
          headerStyle: { backgroundColor: isDark ? colors.backgroundDark : colors.backgroundLight },
          headerTintColor: isDark ? colors.textDark : colors.textLight,
        }}
      />

      <ScrollView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Admin: Update Subscription</Text>
          <Text style={styles.subtitle}>
            Update subscription status for a user by email
          </Text>

          {/* Quick Actions */}
          <View style={styles.quickActionsContainer}>
            <Text style={styles.quickActionsTitle}>Quick Actions</Text>
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() => handleQuickUpdate('test@seatime.com', 'active')}
              disabled={loading}
            >
              <Text style={styles.quickActionButtonText}>
                ✅ Activate test@seatime.com
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="user@example.com"
              placeholderTextColor={isDark ? colors.textSecondaryDark : colors.textSecondaryLight}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />

            <Text style={styles.label}>Subscription Status</Text>
            <View style={styles.statusButtons}>
              {['active', 'inactive', 'trialing', 'expired'].map((status) => {
                const isSelected = subscriptionStatus === status;
                const statusText = status;
                return (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.statusButton,
                      isSelected && styles.statusButtonSelected,
                    ]}
                    onPress={() => setSubscriptionStatus(status)}
                    disabled={loading}
                  >
                    <Text
                      style={[
                        styles.statusButtonText,
                        isSelected && styles.statusButtonTextSelected,
                      ]}
                    >
                      {statusText}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {errorMessage ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.updateButton, loading && styles.updateButtonDisabled]}
              onPress={handleUpdateSubscription}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.updateButtonText}>Update Subscription</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Instructions */}
          <View style={styles.instructionsContainer}>
            <Text style={styles.instructionsTitle}>Instructions</Text>
            <Text style={styles.instructionsText}>
              1. Enter the user's email address{'\n'}
              2. Select the desired subscription status{'\n'}
              3. Tap "Update Subscription" to apply changes{'\n'}
              {'\n'}
              Or use the Quick Action button above to instantly activate test@seatime.com
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={successModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseSuccessModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>✅ Success</Text>
            <Text style={styles.modalMessage}>
              Subscription status updated to "{subscriptionStatus}" for {email}
            </Text>
            <Text style={styles.modalSubMessage}>
              The user can now access the app with their active subscription.
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={handleCloseSuccessModal}
            >
              <Text style={styles.modalButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

function createStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.backgroundDark : colors.backgroundLight,
    },
    content: {
      padding: 20,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: isDark ? colors.textDark : colors.textLight,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
      marginBottom: 24,
    },
    quickActionsContainer: {
      backgroundColor: isDark ? colors.cardDark : colors.cardLight,
      borderRadius: 12,
      padding: 16,
      marginBottom: 24,
      borderWidth: 2,
      borderColor: colors.primary,
    },
    quickActionsTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? colors.textDark : colors.textLight,
      marginBottom: 12,
    },
    quickActionButton: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 14,
      alignItems: 'center',
    },
    quickActionButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    form: {
      gap: 16,
      marginBottom: 24,
    },
    label: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.textDark : colors.textLight,
      marginBottom: 8,
    },
    input: {
      backgroundColor: isDark ? colors.cardDark : colors.cardLight,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: isDark ? colors.textDark : colors.textLight,
      borderWidth: 1,
      borderColor: isDark ? colors.borderDark : colors.borderLight,
    },
    statusButtons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    statusButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: isDark ? colors.cardDark : colors.cardLight,
      borderWidth: 1,
      borderColor: isDark ? colors.borderDark : colors.borderLight,
    },
    statusButtonSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    statusButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? colors.textDark : colors.textLight,
    },
    statusButtonTextSelected: {
      color: '#fff',
    },
    errorContainer: {
      backgroundColor: '#ff4444',
      borderRadius: 8,
      padding: 12,
    },
    errorText: {
      color: '#fff',
      fontSize: 14,
    },
    updateButton: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    updateButtonDisabled: {
      opacity: 0.6,
    },
    updateButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    instructionsContainer: {
      backgroundColor: isDark ? colors.cardDark : colors.cardLight,
      borderRadius: 12,
      padding: 16,
      marginBottom: 24,
    },
    instructionsTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? colors.textDark : colors.textLight,
      marginBottom: 8,
    },
    instructionsText: {
      fontSize: 14,
      color: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
      lineHeight: 20,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      backgroundColor: isDark ? colors.cardDark : colors.cardLight,
      borderRadius: 12,
      padding: 24,
      width: '80%',
      maxWidth: 400,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: isDark ? colors.textDark : colors.textLight,
      marginBottom: 12,
    },
    modalMessage: {
      fontSize: 16,
      color: isDark ? colors.textDark : colors.textLight,
      marginBottom: 12,
    },
    modalSubMessage: {
      fontSize: 14,
      color: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
      marginBottom: 20,
    },
    modalButton: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 12,
      alignItems: 'center',
    },
    modalButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
