/**
 * Settings — dedicated grouped settings screen.
 *
 * Replaces the kitchen-sink "Account" menu that used to live on the Profile
 * tab. Items are grouped by purpose (Profile, Certificates, Tracking,
 * Preferences, Grow the Crew, Support) so features like Certificates and
 * Manual GPS tracking aren't buried next to "About & Help".
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  Linking,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from 'react-i18next';

const SUPPORT_EMAIL = 'info@forelandmarine.com';

interface RowProps {
  icon: string;
  androidIcon: string;
  label: string;
  onPress: () => void;
  isLast?: boolean;
  destructive?: boolean;
  isDark: boolean;
}

function SettingsRow({ icon, androidIcon, label, onPress, isLast, destructive, isDark }: RowProps) {
  const styles = createStyles(isDark);
  return (
    <TouchableOpacity
      style={[styles.row, isLast && styles.rowLast]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <IconSymbol
        ios_icon_name={icon as any}
        android_material_icon_name={androidIcon as any}
        size={22}
        color={destructive ? colors.error : colors.primary}
        style={styles.rowIcon}
      />
      <Text style={[styles.rowLabel, destructive && { color: colors.error }]}>{label}</Text>
      {!destructive && (
        <IconSymbol
          ios_icon_name="chevron.right"
          android_material_icon_name="arrow-forward"
          size={18}
          color={colors.textSecondary}
        />
      )}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const styles = createStyles(isDark);
  const { signOut } = useAuth();
  const { t } = useTranslation();
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSupport = async () => {
    const subject = 'SeaTime Tracker Support Request';
    const body = 'Hello,\n\nI need assistance with:\n\n';
    const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
      } else {
        Alert.alert('Contact Support', `Please email us at:\n${SUPPORT_EMAIL}`);
      }
    } catch {
      Alert.alert('Contact Support', `Please email us at:\n${SUPPORT_EMAIL}`);
    }
  };

  const confirmSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      setShowSignOutModal(false);
    } catch {
      setShowSignOutModal(false);
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top > 0 ? 0 : 0 }]}>
      <Stack.Screen options={{ title: t('settings.title'), headerBackTitle: t('tabs.profile') }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>{t('settings.profile')}</Text>
        <View style={styles.card}>
          <SettingsRow icon="person.circle" androidIcon="person" label={t('settings.editProfile')} onPress={() => router.push('/user-profile')} isDark={isDark} />
          <SettingsRow icon="signature" androidIcon="draw" label={t('settings.signatureForReports')} onPress={() => router.push('/signature')} isLast isDark={isDark} />
        </View>

        <Text style={styles.sectionTitle}>{t('settings.certificates')}</Text>
        <View style={styles.card}>
          <SettingsRow icon="doc.text.fill" androidIcon="article" label={t('settings.manageCertificates')} onPress={() => router.push('/certificates')} isLast isDark={isDark} />
        </View>

        <Text style={styles.sectionTitle}>{t('settings.tracking')}</Text>
        <View style={styles.card}>
          <SettingsRow icon="clock" androidIcon="schedule" label={t('settings.aisSchedule')} onPress={() => router.push('/scheduled-tasks')} isDark={isDark} />
          <SettingsRow icon="bell" androidIcon="notifications" label={t('settings.notifications')} onPress={() => router.push('/notification-settings')} isLast isDark={isDark} />
        </View>

        <Text style={styles.sectionTitle}>{t('settings.preferences')}</Text>
        <View style={styles.card}>
          <SettingsRow icon="globe" androidIcon="language" label={t('settings.language')} onPress={() => router.push('/language')} isLast isDark={isDark} />
        </View>

        <Text style={styles.sectionTitle}>{t('settings.growTheCrew')}</Text>
        <View style={styles.card}>
          <SettingsRow icon="person.2.fill" androidIcon="people" label={t('settings.referAFriend')} onPress={() => router.push('/refer')} isLast isDark={isDark} />
        </View>

        <Text style={styles.sectionTitle}>{t('settings.support')}</Text>
        <View style={styles.card}>
          <SettingsRow icon="info.circle" androidIcon="info" label={t('settings.aboutAndHelp')} onPress={() => router.push('/about')} isDark={isDark} />
          <SettingsRow icon="envelope" androidIcon="email" label={t('settings.contactSupport')} onPress={handleSupport} isDark={isDark} />
          <SettingsRow icon="rectangle.portrait.and.arrow.right" androidIcon="logout" label={t('settings.signOut')} onPress={() => setShowSignOutModal(true)} destructive
            isLast
            isDark={isDark}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={showSignOutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSignOutModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <Text style={styles.confirmModalTitle}>{t('signOut.title')}</Text>
            <Text style={styles.confirmModalMessage}>
              {t('signOut.confirmation')}
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity
                style={[styles.confirmModalButton, styles.confirmModalCancelButton]}
                onPress={() => setShowSignOutModal(false)}
                disabled={signingOut}
              >
                <Text style={[styles.confirmModalButtonText, { color: isDark ? colors.text : colors.textLight }]}>
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmModalButton, styles.confirmModalConfirmButton]}
                onPress={confirmSignOut}
                disabled={signingOut}
              >
                {signingOut ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={[styles.confirmModalButtonText, { color: '#ffffff' }]}>
                    {t('signOut.title')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 18,
      marginBottom: 8,
      marginLeft: 16,
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    rowIcon: {
      marginRight: 14,
    },
    rowLabel: {
      flex: 1,
      fontSize: 16,
      color: isDark ? colors.text : colors.textLight,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    confirmModalContent: {
      backgroundColor: isDark ? '#1c1c1e' : '#ffffff',
      borderRadius: 16,
      padding: 24,
      width: '100%',
      maxWidth: 340,
    },
    confirmModalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? '#ffffff' : '#000000',
      marginBottom: 12,
      textAlign: 'center',
    },
    confirmModalMessage: {
      fontSize: 15,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 24,
      textAlign: 'center',
      lineHeight: 22,
    },
    confirmModalButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    confirmModalButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
    confirmModalCancelButton: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    confirmModalConfirmButton: {
      backgroundColor: colors.error,
    },
    confirmModalButtonText: {
      fontSize: 16,
      fontWeight: '600',
    },
  });
