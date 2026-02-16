
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  useColorScheme,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { BACKEND_URL } from '@/utils/api';
import { IconSymbol } from '@/components/IconSymbol';

type Step = 'email' | 'code' | 'password';

export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetCodeId, setResetCodeId] = useState('');
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const handleRequestCode = async () => {
    console.log('[ForgotPassword] User tapped Request Reset Code button');
    
    if (!email) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    if (!BACKEND_URL) {
      Alert.alert(
        'Backend Not Configured',
        'The app backend is not configured. Please ensure the backend URL is set in app.json.'
      );
      return;
    }

    setLoading(true);
    try {
      console.log('[ForgotPassword] Requesting reset code for:', email);
      
      const response = await fetch(`${BACKEND_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      console.log('[ForgotPassword] Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[ForgotPassword] Request failed:', errorData);
        throw new Error(errorData.error || 'Failed to send reset code');
      }

      const data = await response.json();
      console.log('[ForgotPassword] Reset code sent successfully');
      console.log('[ForgotPassword] Reset code ID:', data.resetCodeId);
      
      // Store the resetCodeId for the next step
      setResetCodeId(data.resetCodeId);

      Alert.alert(
        'Reset Code Sent',
        `A 6-digit reset code has been sent to ${email}. Please check your email and enter the code below.`,
        [{ text: 'OK', onPress: () => setStep('code') }]
      );
    } catch (error: any) {
      console.error('[ForgotPassword] Request code failed:', error);
      
      const errorMessage = error.message || 'Failed to send reset code';
      const userMessage = errorMessage.includes('Email not found')
        ? 'No account found with this email address'
        : errorMessage.includes('Network') || errorMessage.includes('fetch')
        ? 'Cannot connect to server. Please check your internet connection.'
        : errorMessage;
      
      Alert.alert('Error', userMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    console.log('[ForgotPassword] Verifying reset code');
    
    if (!resetCode) {
      Alert.alert('Error', 'Please enter the reset code');
      return;
    }

    if (resetCode.length !== 6) {
      Alert.alert('Error', 'Reset code must be 6 digits');
      return;
    }

    setLoading(true);
    try {
      console.log('[ForgotPassword] Verifying code for resetCodeId:', resetCodeId);
      
      const response = await fetch(`${BACKEND_URL}/api/auth/verify-reset-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resetCodeId,
          code: resetCode,
        }),
      });

      console.log('[ForgotPassword] Verify response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[ForgotPassword] Verification failed:', errorData);
        throw new Error(errorData.error || 'Invalid reset code');
      }

      const data = await response.json();
      console.log('[ForgotPassword] Code verified successfully');

      // Move to password step
      setStep('password');
    } catch (error: any) {
      console.error('[ForgotPassword] Verify code failed:', error);
      
      const errorMessage = error.message || 'Failed to verify code';
      const userMessage = errorMessage.includes('Invalid or expired')
        ? 'The reset code is invalid or has expired. Please request a new code.'
        : errorMessage.includes('Network') || errorMessage.includes('fetch')
        ? 'Cannot connect to server. Please check your internet connection.'
        : errorMessage;
      
      Alert.alert('Error', userMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    console.log('[ForgotPassword] User tapped Reset Password button');
    
    if (!newPassword) {
      Alert.alert('Error', 'Please enter a new password');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      console.log('[ForgotPassword] Resetting password with resetCodeId:', resetCodeId);
      
      const response = await fetch(`${BACKEND_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resetCodeId,
          code: resetCode,
          newPassword,
        }),
      });

      console.log('[ForgotPassword] Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[ForgotPassword] Reset failed:', errorData);
        throw new Error(errorData.error || 'Failed to reset password');
      }

      const data = await response.json();
      console.log('[ForgotPassword] Password reset successful');

      Alert.alert(
        'Success',
        'Your password has been reset successfully. You can now sign in with your new password.',
        [
          {
            text: 'OK',
            onPress: () => {
              console.log('[ForgotPassword] Navigating back to auth screen');
              router.back();
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('[ForgotPassword] Reset password failed:', error);
      
      const errorMessage = error.message || 'Failed to reset password';
      const userMessage = errorMessage.includes('Invalid or expired')
        ? 'The reset code is invalid or has expired. Please request a new code.'
        : errorMessage.includes('Network') || errorMessage.includes('fetch')
        ? 'Cannot connect to server. Please check your internet connection.'
        : errorMessage;
      
      Alert.alert('Error', userMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToEmail = () => {
    console.log('[ForgotPassword] User tapped back to email');
    setStep('email');
    setResetCode('');
    setResetCodeId('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const styles = createStyles(isDark);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen
        options={{
          title: 'Forgot Password',
          headerShown: true,
          headerBackTitle: 'Back',
        }}
      />
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.iconContainer}>
          <IconSymbol
            ios_icon_name="lock.fill"
            android_material_icon_name="lock"
            size={64}
            color={colors.primary}
          />
        </View>

        <Text style={styles.title}>Reset Password</Text>
        
        {step === 'email' && (
          <>
            <Text style={styles.description}>
              Enter your email address and we'll send you a code to reset your password.
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="your.email@example.com"
                placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                editable={!loading}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleRequestCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Send Reset Code</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {step === 'code' && (
          <>
            <Text style={styles.description}>
              Enter the 6-digit code sent to {email}
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Reset Code</Text>
              <TextInput
                style={styles.input}
                placeholder="123456"
                placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                value={resetCode}
                onChangeText={setResetCode}
                keyboardType="number-pad"
                maxLength={6}
                editable={!loading}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleVerifyCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Verify Code</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={handleBackToEmail}
              disabled={loading}
            >
              <Text style={styles.linkText}>Didn't receive code? Try again</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'password' && (
          <>
            <Text style={styles.description}>
              Code verified! Now enter your new password.
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>New Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Minimum 6 characters"
                placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password-new"
                editable={!loading}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Confirm New Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Re-enter your password"
                placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password-new"
                editable={!loading}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleResetPassword}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Reset Password</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => {
            console.log('[ForgotPassword] User tapped Cancel button');
            router.back();
          }}
          disabled={loading}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      padding: 24,
      paddingTop: Platform.OS === 'android' ? 48 : 24,
    },
    iconContainer: {
      alignItems: 'center',
      marginBottom: 24,
      marginTop: 20,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 12,
      textAlign: 'center',
    },
    description: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 32,
      textAlign: 'center',
      lineHeight: 22,
    },
    inputContainer: {
      marginBottom: 20,
    },
    label: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    input: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      borderRadius: 12,
      padding: 16,
      fontSize: 16,
      color: isDark ? colors.text : colors.textLight,
    },
    button: {
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    primaryButton: {
      backgroundColor: colors.primary,
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: '600',
    },
    linkButton: {
      marginTop: 16,
      alignItems: 'center',
    },
    linkText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: '500',
    },
    cancelButton: {
      marginTop: 24,
      alignItems: 'center',
    },
    cancelText: {
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      fontSize: 16,
      fontWeight: '500',
    },
  });
}
