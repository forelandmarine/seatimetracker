
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  useColorScheme,
  Platform,
} from 'react-native';
import { Stack } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { BACKEND_URL } from '@/utils/api';

export default function TestLoginScreen() {
  const [email, setEmail] = useState('test@seatime.com');
  const [password, setPassword] = useState('testpassword123');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const testBackendConnection = async () => {
    setLoading(true);
    setResult('Testing backend connection...\n');
    
    try {
      // Test 1: Check if backend URL is configured
      setResult(prev => prev + `\n✓ Backend URL: ${BACKEND_URL || 'NOT CONFIGURED'}\n`);
      
      if (!BACKEND_URL) {
        setResult(prev => prev + '\n❌ Backend URL is not configured!\n');
        setLoading(false);
        return;
      }

      // Test 2: Try to reach the health endpoint
      setResult(prev => prev + '\nTesting health endpoint...\n');
      const healthResponse = await fetch(`${BACKEND_URL}/health`, {
        method: 'GET',
      });
      
      setResult(prev => prev + `✓ Health check status: ${healthResponse.status}\n`);
      
      if (healthResponse.ok) {
        const healthData = await healthResponse.text();
        setResult(prev => prev + `✓ Health response: ${healthData}\n`);
      }

      // Test 3: Try to sign in
      setResult(prev => prev + '\nAttempting sign in...\n');
      setResult(prev => prev + `Email: ${email}\n`);
      setResult(prev => prev + `Password: ${password.replace(/./g, '*')}\n`);
      setResult(prev => prev + `URL: ${BACKEND_URL}/api/auth/sign-in/email\n`);
      
      const signInResponse = await fetch(`${BACKEND_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      setResult(prev => prev + `\n✓ Sign in response status: ${signInResponse.status}\n`);
      setResult(prev => prev + `✓ Response headers: ${JSON.stringify(Object.fromEntries(signInResponse.headers.entries()), null, 2)}\n`);

      const responseText = await signInResponse.text();
      setResult(prev => prev + `\n✓ Response body (first 500 chars):\n${responseText.substring(0, 500)}\n`);

      if (signInResponse.ok) {
        try {
          const data = JSON.parse(responseText);
          setResult(prev => prev + `\n✅ SUCCESS! Received session token: ${data.session?.token?.substring(0, 20)}...\n`);
        } catch (parseError) {
          setResult(prev => prev + `\n⚠️ Response OK but couldn't parse JSON\n`);
        }
      } else {
        setResult(prev => prev + `\n❌ Sign in failed with status ${signInResponse.status}\n`);
      }

    } catch (error: any) {
      setResult(prev => prev + `\n❌ ERROR: ${error.message}\n`);
      setResult(prev => prev + `Error type: ${error.constructor.name}\n`);
      setResult(prev => prev + `Error stack: ${error.stack}\n`);
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(isDark);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Test Login',
          headerShown: true,
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Backend Connection Test</Text>
        <Text style={styles.subtitle}>
          This screen tests the connection to the backend and attempts a sign-in.
        </Text>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="test@seatime.com"
              placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="testpassword123"
              placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={testBackendConnection}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Test Connection & Sign In</Text>
            )}
          </TouchableOpacity>

          {result ? (
            <View style={styles.resultContainer}>
              <Text style={styles.resultTitle}>Test Results:</Text>
              <ScrollView style={styles.resultScroll}>
                <Text style={styles.resultText}>{result}</Text>
              </ScrollView>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}

function createStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    content: {
      padding: 24,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 24,
      lineHeight: 24,
    },
    form: {
      width: '100%',
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
    resultContainer: {
      marginTop: 24,
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    resultTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 12,
    },
    resultScroll: {
      maxHeight: 400,
    },
    resultText: {
      fontSize: 14,
      color: isDark ? colors.text : colors.textLight,
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      lineHeight: 20,
    },
  });
}
