
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, useColorScheme } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { colors } from '@/styles/commonStyles';
import { Stack } from 'expo-router';

export default function TestLoginScreen() {
  const { user, signIn, signOut, isAuthenticated } = useAuth();
  const [testResult, setTestResult] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const runLoginTest = async () => {
    setLoading(true);
    setTestResult('Testing login...\n');
    
    try {
      // Test 1: Sign in with test credentials
      setTestResult(prev => prev + '\n✓ Step 1: Attempting sign in with test@seatime.com...');
      await signIn('test@seatime.com', 'testpassword123');
      
      setTestResult(prev => prev + '\n✓ Step 2: Sign in successful!');
      setTestResult(prev => prev + `\n✓ Step 3: User authenticated: ${user?.email || 'checking...'}`);
      setTestResult(prev => prev + `\n✓ Step 4: Auth status: ${isAuthenticated ? 'AUTHENTICATED' : 'NOT AUTHENTICATED'}`);
      
      setTestResult(prev => prev + '\n\n🎉 LOGIN TEST PASSED! Authentication is working correctly.');
    } catch (error: any) {
      setTestResult(prev => prev + `\n\n❌ LOGIN TEST FAILED: ${error.message || 'Unknown error'}`);
      console.error('[TestLogin] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const runSignOutTest = async () => {
    setLoading(true);
    setTestResult('Testing sign out...\n');
    
    try {
      setTestResult(prev => prev + '\n✓ Step 1: Signing out...');
      await signOut();
      
      setTestResult(prev => prev + '\n✓ Step 2: Sign out successful!');
      setTestResult(prev => prev + `\n✓ Step 3: Auth status: ${isAuthenticated ? 'STILL AUTHENTICATED (ERROR)' : 'NOT AUTHENTICATED'}`);
      
      setTestResult(prev => prev + '\n\n🎉 SIGN OUT TEST PASSED!');
    } catch (error: any) {
      setTestResult(prev => prev + `\n\n❌ SIGN OUT TEST FAILED: ${error.message || 'Unknown error'}`);
      console.error('[TestLogin] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(isDark);

  return (
    <>
      <Stack.Screen 
        options={{
          title: 'Login Test',
          headerShown: true,
        }} 
      />
      <ScrollView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Login Test Screen</Text>
          
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>Current Status:</Text>
            <Text style={styles.statusValue}>
              {isAuthenticated ? '✅ AUTHENTICATED' : '❌ NOT AUTHENTICATED'}
            </Text>
            {user && (
              <>
                <Text style={styles.statusLabel}>User Email:</Text>
                <Text style={styles.statusValue}>{user.email}</Text>
                <Text style={styles.statusLabel}>User Name:</Text>
                <Text style={styles.statusValue}>{user.name || 'N/A'}</Text>
              </>
            )}
          </View>

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={runLoginTest}
            disabled={loading || isAuthenticated}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Testing...' : 'Test Login'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={runSignOutTest}
            disabled={loading || !isAuthenticated}
          >
            <Text style={styles.buttonTextSecondary}>
              {loading ? 'Testing...' : 'Test Sign Out'}
            </Text>
          </TouchableOpacity>

          {testResult && (
            <View style={styles.resultCard}>
              <Text style={styles.resultTitle}>Test Results:</Text>
              <Text style={styles.resultText}>{testResult}</Text>
            </View>
          )}

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Test Credentials:</Text>
            <Text style={styles.infoText}>Email: test@seatime.com</Text>
            <Text style={styles.infoText}>Password: testpassword123</Text>
          </View>
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
      padding: 20,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 24,
      textAlign: 'center',
    },
    statusCard: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 20,
      marginBottom: 20,
    },
    statusLabel: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 12,
      marginBottom: 4,
    },
    statusValue: {
      fontSize: 18,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
    },
    button: {
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      marginBottom: 12,
    },
    primaryButton: {
      backgroundColor: colors.primary,
    },
    secondaryButton: {
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderColor: colors.primary,
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: '600',
    },
    buttonTextSecondary: {
      color: colors.primary,
      fontSize: 18,
      fontWeight: '600',
    },
    resultCard: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 20,
      marginTop: 20,
      marginBottom: 20,
    },
    resultTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 12,
    },
    resultText: {
      fontSize: 14,
      color: isDark ? colors.text : colors.textLight,
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      lineHeight: 20,
    },
    infoCard: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      padding: 20,
      marginTop: 20,
    },
    infoTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    infoText: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 4,
    },
  });
}
