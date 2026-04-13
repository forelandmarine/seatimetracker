
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useColorScheme,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import * as seaTimeApi from '@/utils/seaTimeApi';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';

import { log, error as logError } from '@/utils/log';

type Department = 'Deck' | 'Engineering';
type MaritimeAuthority = 'mca' | 'uscg' | 'amsa' | 'mnz';

interface AuthorityOption {
  value: MaritimeAuthority;
  label: string;
  subtitle: string;
  icon_ios: string;
  icon_android: string;
}

function createStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    scrollContent: {
      padding: 24,
      paddingTop: Platform.OS === 'android' ? 64 : 40,
      paddingBottom: 100,
    },
    header: {
      marginBottom: 32,
      alignItems: 'center',
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 12,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      textAlign: 'center',
      lineHeight: 24,
    },
    pathwayCard: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 16,
      padding: 24,
      marginBottom: 16,
      borderWidth: 2,
      borderColor: 'transparent',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    pathwayCardSelected: {
      borderColor: colors.primary,
      backgroundColor: isDark ? colors.cardBackground : colors.card,
    },
    pathwayHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    iconContainer: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary + '20',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    pathwayTitleContainer: {
      flex: 1,
    },
    pathwayTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 4,
    },
    pathwaySubtitle: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    checkmark: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    requirementsList: {
      marginBottom: 12,
    },
    requirementItem: {
      flexDirection: 'row',
      marginBottom: 8,
      paddingLeft: 8,
    },
    bullet: {
      fontSize: 14,
      color: colors.primary,
      marginRight: 8,
      fontWeight: 'bold',
    },
    requirementText: {
      flex: 1,
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      lineHeight: 20,
    },
    infoBox: {
      backgroundColor: colors.primary + '15',
      borderRadius: 12,
      padding: 16,
      marginTop: 24,
      marginBottom: 24,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
    },
    infoText: {
      fontSize: 14,
      color: isDark ? colors.text : colors.textLight,
      lineHeight: 20,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 18,
      alignItems: 'center',
      marginTop: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 4,
    },
    buttonDisabled: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      opacity: 0.5,
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: '600',
    },
    buttonTextDisabled: {
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    loadingText: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 16,
    },
  });
}

export default function SelectPathwayScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const router = useRouter();
  const { isSubscribed, isLoading: subscriptionLoading } = useSubscription();
  const auth = useAuth();
  const useAuthRef = React.useRef(auth);
  useAuthRef.current = auth;

  const [selectedAuthority, setSelectedAuthority] = useState<MaritimeAuthority | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [saving, setSaving] = useState(false);

  const authorityOptions: AuthorityOption[] = [
    { value: 'mca', label: 'MCA', subtitle: 'Maritime and Coastguard Agency', icon_ios: 'flag', icon_android: 'flag' },
    { value: 'uscg', label: 'USCG', subtitle: 'United States Coast Guard', icon_ios: 'flag', icon_android: 'flag' },
    { value: 'amsa', label: 'AMSA', subtitle: 'Australian Maritime Safety Authority', icon_ios: 'flag', icon_android: 'flag' },
    { value: 'mnz', label: 'Maritime NZ', subtitle: 'Maritime New Zealand', icon_ios: 'flag', icon_android: 'flag' },
  ];

  // CRITICAL: Check subscription status before allowing pathway selection
  // This ensures users cannot bypass the paywall by directly navigating to this screen
  useEffect(() => {
    log('[SelectPathway] Subscription check - isLoading:', subscriptionLoading, 'isSubscribed:', isSubscribed);
    
    // Wait for subscription check to complete
    if (subscriptionLoading) {
      log('[SelectPathway] Subscription still loading, waiting...');
      return;
    }
    
    // CRITICAL: If not subscribed, redirect to paywall immediately
    // This is a MANDATORY gate - no exceptions
    if (!isSubscribed) {
      log('[SelectPathway] ⚠️⚠️⚠️ USER NOT SUBSCRIBED - BLOCKING ACCESS ⚠️⚠️⚠️');
      log('[SelectPathway] Redirecting to paywall - user must subscribe before selecting pathway');
      router.replace('/paywall');
      return;
    }
    
    log('[SelectPathway] ✅ User is subscribed, allowing pathway selection');
  }, [isSubscribed, subscriptionLoading, router]);

  const handleSelectDepartment = (department: Department) => {
    log('User selected department:', department);
    setSelectedDepartment(department);
  };

  const handleContinue = async () => {
    if (!selectedAuthority) {
      Alert.alert('Selection Required', 'Please select your maritime authority to continue');
      return;
    }
    if (!selectedDepartment) {
      Alert.alert('Selection Required', 'Please select your department to continue');
      return;
    }

    log('User tapped Continue button with authority:', selectedAuthority, 'department:', selectedDepartment);
    setSaving(true);

    try {
      // Convert to lowercase for backend
      const departmentLowercase = selectedDepartment.toLowerCase();
      log('Sending department to backend:', departmentLowercase, 'authority:', selectedAuthority);

      await seaTimeApi.updateUserProfile({ department: departmentLowercase, maritime_authority: selectedAuthority });
      log('Department and authority saved successfully:', departmentLowercase, selectedAuthority);

      // Refresh auth state so the tab layout guard sees the new department
      const { checkAuth } = useAuthRef.current;
      await checkAuth();

      log('Navigating to home screen');
      router.replace('/(tabs)');
    } catch (error: any) {
      logError('Failed to save department:', error);
      Alert.alert('Error', error.message || 'Failed to save your pathway selection. Please try again.');
      setSaving(false);
    }
  };

  // CRITICAL: Show loading while checking subscription
  // This prevents any UI from rendering until subscription is verified
  if (subscriptionLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Verifying subscription...</Text>
      </View>
    );
  }

  // CRITICAL: If not subscribed after loading completes, show nothing
  // The useEffect will redirect to paywall
  if (!isSubscribed) {
    log('[SelectPathway] Not subscribed, blocking UI render');
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Redirecting to subscription...</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Select Your Pathway',
          headerShown: true,
          headerBackTitle: 'Back',
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Choose Your Sea Time Pathway</Text>
          <Text style={styles.subtitle}>
            Select your maritime authority and department. This determines how your sea service is calculated.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Maritime Authority</Text>
        <View style={{ marginBottom: 24 }}>
          {authorityOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.pathwayCard,
                { padding: 16, marginBottom: 10 },
                selectedAuthority === option.value && styles.pathwayCardSelected,
              ]}
              onPress={() => setSelectedAuthority(option.value)}
              activeOpacity={0.7}
            >
              <View style={styles.pathwayHeader}>
                <View style={[styles.iconContainer, { width: 44, height: 44, borderRadius: 22, marginRight: 12 }]}>
                  <IconSymbol
                    ios_icon_name={option.icon_ios}
                    android_material_icon_name={option.icon_android}
                    size={24}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.pathwayTitleContainer}>
                  <Text style={[styles.pathwayTitle, { fontSize: 18, marginBottom: 2 }]}>{option.label}</Text>
                  <Text style={styles.pathwaySubtitle}>{option.subtitle}</Text>
                </View>
                {selectedAuthority === option.value && (
                  <View style={styles.checkmark}>
                    <IconSymbol
                      ios_icon_name="checkmark"
                      android_material_icon_name="check"
                      size={18}
                      color="#FFFFFF"
                    />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Department</Text>
        <TouchableOpacity
          style={[
            styles.pathwayCard,
            selectedDepartment === 'Deck' && styles.pathwayCardSelected,
          ]}
          onPress={() => handleSelectDepartment('Deck')}
          activeOpacity={0.7}
        >
          <View style={styles.pathwayHeader}>
            <View style={styles.iconContainer}>
              <IconSymbol
                ios_icon_name="helm"
                android_material_icon_name="directions-boat"
                size={32}
                color={colors.primary}
              />
            </View>
            <View style={styles.pathwayTitleContainer}>
              <Text style={styles.pathwayTitle}>Deck Department</Text>
              <Text style={styles.pathwaySubtitle}>Navigation & Bridge Operations</Text>
            </View>
            {selectedDepartment === 'Deck' && (
              <View style={styles.checkmark}>
                <IconSymbol
                  ios_icon_name="checkmark"
                  android_material_icon_name="check"
                  size={18}
                  color="#FFFFFF"
                />
              </View>
            )}
          </View>

          <Text style={styles.sectionTitle}>Sea Service Calculation:</Text>
          <View style={styles.requirementsList}>
            <View style={styles.requirementItem}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.requirementText}>
                Actual Days at Sea (propulsion ≥ 4 hours/day)
              </Text>
            </View>
            <View style={styles.requirementItem}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.requirementText}>
                Watchkeeping Service (bridge watch, 4 hours = 1 day)
              </Text>
            </View>
            <View style={styles.requirementItem}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.requirementText}>
                Yard Service (build, refit, or serious repair)
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Suitable for:</Text>
          <View style={styles.requirementsList}>
            <View style={styles.requirementItem}>
              <Text style={styles.bullet}>-</Text>
              <Text style={styles.requirementText}>Deck Officers</Text>
            </View>
            <View style={styles.requirementItem}>
              <Text style={styles.bullet}>-</Text>
              <Text style={styles.requirementText}>OOW 3000 (Yachts) Certificate holders</Text>
            </View>
            <View style={styles.requirementItem}>
              <Text style={styles.bullet}>-</Text>
              <Text style={styles.requirementText}>Navigation and bridge watch roles</Text>
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.pathwayCard,
            selectedDepartment === 'Engineering' && styles.pathwayCardSelected,
          ]}
          onPress={() => handleSelectDepartment('Engineering')}
          activeOpacity={0.7}
        >
          <View style={styles.pathwayHeader}>
            <View style={styles.iconContainer}>
              <IconSymbol
                ios_icon_name="gearshape.2"
                android_material_icon_name="settings"
                size={32}
                color={colors.primary}
              />
            </View>
            <View style={styles.pathwayTitleContainer}>
              <Text style={styles.pathwayTitle}>Engineering Department</Text>
              <Text style={styles.pathwaySubtitle}>Engine Room & Technical Operations</Text>
            </View>
            {selectedDepartment === 'Engineering' && (
              <View style={styles.checkmark}>
                <IconSymbol
                  ios_icon_name="checkmark"
                  android_material_icon_name="check"
                  size={18}
                  color="#FFFFFF"
                />
              </View>
            )}
          </View>

          <Text style={styles.sectionTitle}>Sea Service Calculation:</Text>
          <View style={styles.requirementsList}>
            <View style={styles.requirementItem}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.requirementText}>
                Actual Days at Sea (propulsion ≥ 4 hours/day)
              </Text>
            </View>
            <View style={styles.requirementItem}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.requirementText}>
                Watchkeeping Service (engine room watch underway, 4 hours = 1 day)
              </Text>
            </View>
            <View style={styles.requirementItem}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.requirementText}>
                Additional Watchkeeping (at anchor/moored with generators running)
              </Text>
            </View>
            <View style={styles.requirementItem}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.requirementText}>
                Yard Service (build, refit, or serious repair)
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Suitable for:</Text>
          <View style={styles.requirementsList}>
            <View style={styles.requirementItem}>
              <Text style={styles.bullet}>-</Text>
              <Text style={styles.requirementText}>Engineering Officers</Text>
            </View>
            <View style={styles.requirementItem}>
              <Text style={styles.bullet}>-</Text>
              <Text style={styles.requirementText}>SV Engineer OOW and Chief Engineer roles</Text>
            </View>
            <View style={styles.requirementItem}>
              <Text style={styles.bullet}>-</Text>
              <Text style={styles.requirementText}>Engine room watch and UMS duties</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Your authority and pathway selection determines how your sea time is calculated for testimonials. You can change this later in your profile settings if needed.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, (!selectedDepartment || !selectedAuthority) && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!selectedDepartment || !selectedAuthority || saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={[styles.buttonText, (!selectedDepartment || !selectedAuthority) && styles.buttonTextDisabled]}>
              Continue
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}
