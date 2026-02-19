
import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { colors } from '@/styles/commonStyles';
import React, { useEffect, useState } from 'react';

export default function Index() {
  // CRITICAL: Call useAuth at the top level - NEVER conditionally
  // This must be called before any early returns or conditions
  const authContext = useAuth();
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  // CRITICAL: Move useEffect to top level - BEFORE any conditional returns
  // React Hooks MUST be called in the same order every render
  useEffect(() => {
    // CRITICAL: Wrap in try-catch to prevent crashes
    try {
      // Only proceed if authContext exists and is not loading
      if (authContext && !authContext.loading) {
        // Add a small delay to prevent flicker
        const timer = setTimeout(() => {
          setInitialCheckDone(true);
        }, 100);
        return () => clearTimeout(timer);
      }
    } catch (error: any) {
      console.error('[Index] Error in auth check effect:', error);
      setInitialCheckDone(true); // Continue anyway
    }
  }, [authContext]);

  // CRITICAL: Defensive check - if auth context is somehow undefined, show error
  if (!authContext) {
    console.error('[Index] CRITICAL: Auth context is undefined');
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Authentication Error</Text>
        <Text style={styles.loadingText}>Please restart the app</Text>
      </View>
    );
  }

  const { user, loading: authLoading } = authContext;

  // Show loading while checking auth
  if (authLoading || !initialCheckDone) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // CRITICAL: Safe authentication check with defensive programming
  let isAuthenticated = false;
  let hasDepartment = false;
  
  try {
    isAuthenticated = Boolean(user);
    
    if (isAuthenticated) {
      console.log('[Index] User authenticated:', user?.email);
      
      // CRITICAL: Safe department check to prevent crashes
      hasDepartment = Boolean(user?.hasDepartment || (user as any)?.department);
      console.log('[Index] Has department:', hasDepartment, 'Department:', (user as any)?.department);
    } else {
      console.log('[Index] User not authenticated');
    }
  } catch (error: any) {
    console.error('[Index] Error during auth/department check:', error);
    // On error, assume not authenticated
    isAuthenticated = false;
    hasDepartment = false;
  }
  
  // Redirect based on auth state
  if (!isAuthenticated) {
    console.log('[Index] Not authenticated, redirecting to /auth');
    return <Redirect href="/auth" />;
  }
  
  if (!hasDepartment) {
    console.log('[Index] No department set, redirecting to /select-pathway');
    return <Redirect href="/select-pathway" />;
  }

  console.log('[Index] Authenticated with department, redirecting to /(tabs)');
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.error,
    marginBottom: 8,
  },
});
