import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import * as seaTimeApi from '@/utils/seaTimeApi';
import { error as logError } from '@/utils/log';

/**
 * Settings > Password. Accounts made with Sign in with Apple have no password,
 * so they can't sign in on Android or after losing Apple sign-in; this lets
 * them set one. Email accounts change theirs here (current password needed).
 */
export default function PasswordScreen() {
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const router = useRouter();
  const [status, setStatus] = useState<seaTimeApi.PasswordStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    seaTimeApi
      .getPasswordStatus()
      .then(setStatus)
      .catch((e) => {
        logError('[Password] Failed to load status:', e);
        setLoadFailed(true);
      });
  }, []);

  const handleSave = async () => {
    if (!status) return;
    if (status.hasPassword && !current) {
      Alert.alert('Current password needed', 'Enter your current password.');
      return;
    }
    if (next.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      Alert.alert("Passwords don't match", 'Type the new password the same way twice.');
      return;
    }
    setSaving(true);
    try {
      await seaTimeApi.setPassword(next, status.hasPassword ? current : undefined);
      Alert.alert(
        status.hasPassword ? 'Password changed' : 'Password set',
        `You can now sign in with ${status.email} and this password on any phone, including Android.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e: any) {
      logError('[Password] Save failed:', e);
      Alert.alert('Not saved', e?.message || 'Your password could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!status) {
    return (
      <View style={[styles.container, styles.center]}>
        {loadFailed ? (
          <Text style={styles.description}>Could not load your account. Check your connection and try again.</Text>
        ) : (
          <ActivityIndicator size="large" color={colors.primary} />
        )}
      </View>
    );
  }

  const placeholderColor = isDark ? colors.textSecondary : colors.textSecondaryLight;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>{status.hasPassword ? 'Change password' : 'Set a password'}</Text>
        <Text style={styles.description}>
          {status.hasPassword
            ? 'Choose a new password for signing in with your email.'
            : 'You signed up with Apple. Add a password so you can also sign in with your email, for example on an Android phone or if you change Apple ID. Your sea time stays with your account either way.'}
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Sign-in email</Text>
          <Text style={styles.email} selectable>{status.email}</Text>
          {status.privateRelay && (
            <Text style={styles.note}>
              This is the private address Apple made for you with Hide My Email. Use it exactly as shown when you sign in with email. Password reset codes are forwarded to your own inbox.
            </Text>
          )}
        </View>

        {status.hasPassword && (
          <View style={styles.group}>
            <Text style={styles.label}>Current password</Text>
            <TextInput
              style={styles.input}
              value={current}
              onChangeText={setCurrent}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              placeholderTextColor={placeholderColor}
            />
          </View>
        )}

        <View style={styles.group}>
          <Text style={styles.label}>New password</Text>
          <TextInput
            style={styles.input}
            value={next}
            onChangeText={setNext}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder="At least 8 characters"
            placeholderTextColor={placeholderColor}
          />
        </View>

        <View style={styles.group}>
          <Text style={styles.label}>Confirm new password</Text>
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            placeholderTextColor={placeholderColor}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
        </View>

        <TouchableOpacity style={[styles.button, saving && styles.buttonOff]} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>{status.hasPassword ? 'Change password' : 'Set password'}</Text>
          )}
        </TouchableOpacity>

        {status.hasPassword && (
          <TouchableOpacity
            style={styles.link}
            onPress={() => router.push({ pathname: '/forgot-password', params: { email: status.email } } as any)}
          >
            <Text style={styles.linkText}>Forgotten your current password?</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    center: {
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    content: {
      padding: 20,
    },
    heading: {
      fontSize: 22,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    description: {
      fontSize: 15,
      lineHeight: 21,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 20,
    },
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      marginBottom: 20,
    },
    email: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
    },
    note: {
      fontSize: 13,
      lineHeight: 18,
      marginTop: 8,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    group: {
      marginBottom: 16,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    input: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 8,
      padding: 14,
      fontSize: 16,
      color: isDark ? colors.text : colors.textLight,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    buttonOff: {
      opacity: 0.6,
    },
    buttonText: {
      color: colors.white,
      fontSize: 16,
      fontWeight: '700',
    },
    link: {
      alignItems: 'center',
      paddingVertical: 16,
    },
    linkText: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: '600',
    },
  });
