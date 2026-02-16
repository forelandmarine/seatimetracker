
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { apiPut } from '@/utils/api';

function createStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 24,
      lineHeight: 22,
    },
    section: {
      marginBottom: 32,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 16,
    },
    quickActionsContainer: {
      backgroundColor: isDark ? '#1A2F3F' : '#E3F2FD',
      borderRadius: 12,
      padding: 16,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    quickActionsTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 12,
    },
    quickActionButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 18,
      alignItems: 'center',
    },
    quickActionButtonText: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '700',
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 8,
      marginTop: 4,
    },
    input: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 16,
      fontSize: 16,
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    statusButtonsContainer: {
      marginBottom: 12,
    },
    statusButtons: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    statusButton: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    statusButtonSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    statusButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
    },
    statusButtonTextSelected: {
      color: '#FFFFFF',
    },
    errorContainer: {
      backgroundColor: colors.error,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    errorText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '500',
    },
    updateButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 18,
      alignItems: 'center',
      marginTop: 8,
    },
    updateButtonDisabled: {
      opacity: 0.5,
    },
    updateButtonText: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '700',
    },
    instructionsContainer: {
      backgroundColor: isDark ? '#1A2F3F' : '#E3F2FD',
      borderRadius: 12,
      padding: 16,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    instructionsTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    instructionsText: {
      fontSize: 15,
      color: isDark ? colors.text : colors.textLight,
      lineHeight: 22,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContent: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 24,
      width: '80%',
      maxWidth: 400,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 12,
    },
    modalMessage: {
      fontSize: 16,
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 12,
      lineHeight: 22,
    },
    modalSubMessage: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 20,
      lineHeight: 20,
    },
    modalButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
    },
    modalButtonText: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '700',
    },
  });
}

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
    setTimeout(() => {
      handleUpdateSubscription();
    }, 100);
  };

  const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'trialing', label: 'Trialing' },
    { value: 'expired', label: 'Expired' },
  ];

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Update Subscription',
          headerShown: true,
          headerStyle: { 
            backgroundColor: isDark ? colors.background : colors.backgroundLight 
          },
          headerTintColor: isDark ? colors.text : colors.textLight,
        }}
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView 
          style={styles.container} 
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={styles.title}>Update Subscription</Text>
          <Text style={styles.subtitle}>
            Update subscription status for a user by email
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.quickActionsContainer}>
              <Text style={styles.quickActionsTitle}>Test Account Activation</Text>
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => handleQuickUpdate('test@seatime.com', 'active')}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.quickActionButtonText}>
                    ✅ Activate test@seatime.com
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Custom Update</Text>

            <Text style={styles.label}>User Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="user@example.com"
              placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />

            <Text style={styles.label}>Subscription Status</Text>
            <View style={styles.statusButtonsContainer}>
              <View style={styles.statusButtons}>
                {statusOptions.map((option) => {
                  const isSelected = subscriptionStatus === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.statusButton,
                        isSelected && styles.statusButtonSelected,
                      ]}
                      onPress={() => setSubscriptionStatus(option.value)}
                      disabled={loading}
                    >
                      <Text
                        style={[
                          styles.statusButtonText,
                          isSelected && styles.statusButtonTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.updateButtonText}>Update Subscription</Text>
              )}
            </TouchableOpacity>
          </View>

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
        </ScrollView>
      </KeyboardAvoidingView>

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
