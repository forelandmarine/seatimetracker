
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  useColorScheme,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import Constants from 'expo-constants';

const BACKEND_URL = Constants.expoConfig?.extra?.backendUrl;

function createStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    scrollContent: {
      padding: 20,
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
    pickerContainer: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      overflow: 'hidden',
    },
    pickerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
    },
    pickerButtonText: {
      fontSize: 16,
      fontWeight: '500',
      color: isDark ? colors.text : colors.textLight,
    },
    pickerOptions: {
      borderTopWidth: 1,
      borderTopColor: isDark ? colors.border : colors.borderLight,
    },
    pickerOption: {
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? colors.border : colors.borderLight,
    },
    pickerOptionText: {
      fontSize: 16,
      color: isDark ? colors.text : colors.textLight,
    },
    pickerOptionSelected: {
      backgroundColor: isDark ? '#2A3F54' : '#E3F2FD',
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 18,
      alignItems: 'center',
      marginBottom: 12,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '700',
    },
    sandboxButton: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 18,
      alignItems: 'center',
      marginBottom: 12,
      borderWidth: 2,
      borderColor: colors.primary,
    },
    sandboxButtonText: {
      color: colors.primary,
      fontSize: 17,
      fontWeight: '700',
    },
    infoBox: {
      backgroundColor: isDark ? '#1A2F3F' : '#E3F2FD',
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    infoText: {
      fontSize: 15,
      color: isDark ? colors.text : colors.textLight,
      lineHeight: 22,
    },
    successBox: {
      backgroundColor: isDark ? '#1B3A2F' : '#E8F5E9',
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: isDark ? colors.success : '#81C784',
    },
    successText: {
      fontSize: 15,
      color: isDark ? '#81C784' : '#2E7D32',
      lineHeight: 22,
      fontWeight: '500',
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 8,
      marginTop: 4,
    },
  });
}

export default function AdminActivateSubscriptionsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState('active');
  const [expiresInDays, setExpiresInDays] = useState('365');
  const [productId, setProductId] = useState('seatime_pro_annual');
  const [platform, setPlatform] = useState('ios');
  const [loading, setLoading] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showPlatformPicker, setShowPlatformPicker] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'trialing', label: 'Trialing' },
    { value: 'expired', label: 'Expired' },
  ];

  const platformOptions = [
    { value: 'ios', label: 'iOS' },
    { value: 'android', label: 'Android' },
    { value: 'web', label: 'Web' },
  ];

  const handleActivateSandboxUser = async () => {
    const sandboxEmail = 'sandbox@seatimetracker.test';
    const sandboxStatus = 'active';
    const sandboxExpiresAt = new Date();
    sandboxExpiresAt.setFullYear(sandboxExpiresAt.getFullYear() + 10);

    setLoading(true);
    setSuccessMessage('');

    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/update-subscription`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: sandboxEmail,
          subscription_status: sandboxStatus,
          subscription_expires_at: sandboxExpiresAt.toISOString(),
          subscription_product_id: 'sandbox_test_subscription',
          subscription_platform: 'ios',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to activate sandbox user');
      }

      const data = await response.json();
      console.log('Sandbox user activated:', data);

      const expiresAtFormatted = new Date(data.user.subscription_expires_at).toLocaleDateString();
      const successMsg = `Sandbox user activated!\n\nEmail: ${sandboxEmail}\nStatus: ${data.user.subscription_status}\nExpires: ${expiresAtFormatted}\n\nYou can now sign in with this account to test subscription features.`;
      
      setSuccessMessage(successMsg);
      Alert.alert('Success', successMsg);
    } catch (error) {
      console.error('Error activating sandbox user:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', `Failed to activate sandbox user: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSubscription = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter an email address');
      return;
    }

    const expiresAt = new Date();
    const daysToAdd = parseInt(expiresInDays) || 365;
    expiresAt.setDate(expiresAt.getDate() + daysToAdd);

    setLoading(true);
    setSuccessMessage('');

    try {
      const response = await fetch(`${BACKEND_URL}/api/admin/update-subscription`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          subscription_status: subscriptionStatus,
          subscription_expires_at: expiresAt.toISOString(),
          subscription_product_id: productId.trim() || undefined,
          subscription_platform: platform,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update subscription');
      }

      const data = await response.json();
      console.log('Subscription updated:', data);

      const expiresAtFormatted = data.user.subscription_expires_at 
        ? new Date(data.user.subscription_expires_at).toLocaleDateString()
        : 'N/A';
      
      const successMsg = `Subscription updated!\n\nEmail: ${data.user.email}\nStatus: ${data.user.subscription_status}\nExpires: ${expiresAtFormatted}`;
      
      setSuccessMessage(successMsg);
      Alert.alert('Success', successMsg);
      
      setEmail('');
    } catch (error) {
      console.error('Error updating subscription:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Error', `Failed to update subscription: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const selectedStatusLabel = statusOptions.find(opt => opt.value === subscriptionStatus)?.label || subscriptionStatus;
  const selectedPlatformLabel = platformOptions.find(opt => opt.value === platform)?.label || platform;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Activate Subscriptions',
          headerStyle: {
            backgroundColor: isDark ? colors.background : colors.backgroundLight,
          },
          headerTintColor: isDark ? colors.text : colors.textLight,
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Subscription Management</Text>
          <Text style={styles.subtitle}>
            Activate sandbox users or update subscription status for testing
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Setup: Sandbox User</Text>
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                Create a test account with an active subscription that expires in 10 years.
                {'\n\n'}
                Email: sandbox@seatimetracker.test
                {'\n'}
                Password: Use "Forgot Password" to set a password
              </Text>
            </View>
            <TouchableOpacity
              style={styles.sandboxButton}
              onPress={handleActivateSandboxUser}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.sandboxButtonText}>Activate Sandbox User</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Custom Subscription Update</Text>
            
            <Text style={styles.label}>User Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter user email address"
              placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
            />

            <Text style={styles.label}>Subscription Status</Text>
            <View style={styles.pickerContainer}>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowStatusPicker(!showStatusPicker)}
                disabled={loading}
              >
                <Text style={styles.pickerButtonText}>{selectedStatusLabel}</Text>
                <IconSymbol
                  ios_icon_name={showStatusPicker ? 'chevron.up' : 'chevron.down'}
                  android_material_icon_name={showStatusPicker ? 'arrow-drop-up' : 'arrow-drop-down'}
                  size={24}
                  color={isDark ? colors.text : colors.textLight}
                />
              </TouchableOpacity>
              {showStatusPicker && (
                <View style={styles.pickerOptions}>
                  {statusOptions.map((option) => {
                    const isSelected = option.value === subscriptionStatus;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.pickerOption,
                          isSelected && styles.pickerOptionSelected,
                        ]}
                        onPress={() => {
                          setSubscriptionStatus(option.value);
                          setShowStatusPicker(false);
                        }}
                      >
                        <Text style={styles.pickerOptionText}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            <Text style={styles.label}>Expires in Days</Text>
            <TextInput
              style={styles.input}
              placeholder="365"
              placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
              value={expiresInDays}
              onChangeText={setExpiresInDays}
              keyboardType="number-pad"
              editable={!loading}
            />

            <Text style={styles.label}>Product ID (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="seatime_pro_annual"
              placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
              value={productId}
              onChangeText={setProductId}
              editable={!loading}
            />

            <Text style={styles.label}>Platform</Text>
            <View style={styles.pickerContainer}>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowPlatformPicker(!showPlatformPicker)}
                disabled={loading}
              >
                <Text style={styles.pickerButtonText}>{selectedPlatformLabel}</Text>
                <IconSymbol
                  ios_icon_name={showPlatformPicker ? 'chevron.up' : 'chevron.down'}
                  android_material_icon_name={showPlatformPicker ? 'arrow-drop-up' : 'arrow-drop-down'}
                  size={24}
                  color={isDark ? colors.text : colors.textLight}
                />
              </TouchableOpacity>
              {showPlatformPicker && (
                <View style={styles.pickerOptions}>
                  {platformOptions.map((option) => {
                    const isSelected = option.value === platform;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.pickerOption,
                          isSelected && styles.pickerOptionSelected,
                        ]}
                        onPress={() => {
                          setPlatform(option.value);
                          setShowPlatformPicker(false);
                        }}
                      >
                        <Text style={styles.pickerOptionText}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleUpdateSubscription}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Update Subscription</Text>
              )}
            </TouchableOpacity>
          </View>

          {successMessage ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>{successMessage}</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
