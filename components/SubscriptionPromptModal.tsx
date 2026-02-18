
import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  Platform,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useRouter } from 'expo-router';

interface SubscriptionPromptModalProps {
  visible: boolean;
  onClose: () => void;
  featureName?: string;
  message?: string;
}

export function SubscriptionPromptModal({
  visible,
  onClose,
  featureName = 'this feature',
  message,
}: SubscriptionPromptModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const router = useRouter();

  const defaultMessage = `An active subscription is required to use ${featureName}. Subscribe to SeaTime Tracker Pro to unlock unlimited vessel tracking and sea time logging.`;
  const displayMessage = message || defaultMessage;

  const handleSubscribe = () => {
    console.log('[SubscriptionPrompt] User tapped Subscribe button');
    onClose();
    router.push('/paywall');
  };

  const handleCancel = () => {
    console.log('[SubscriptionPrompt] User cancelled subscription prompt');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.modalContent}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <IconSymbol
              ios_icon_name="lock.circle.fill"
              android_material_icon_name="lock"
              size={64}
              color={colors.primary}
            />
          </View>

          {/* Title */}
          <Text style={styles.title}>Subscription Required</Text>

          {/* Message */}
          <Text style={styles.message}>{displayMessage}</Text>

          {/* Benefits List */}
          <View style={styles.benefitsList}>
            <View style={styles.benefitItem}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check-circle"
                size={20}
                color={colors.success}
              />
              <Text style={styles.benefitText}>Unlimited vessel tracking</Text>
            </View>
            <View style={styles.benefitItem}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check-circle"
                size={20}
                color={colors.success}
              />
              <Text style={styles.benefitText}>Automatic sea time logging</Text>
            </View>
            <View style={styles.benefitItem}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check-circle"
                size={20}
                color={colors.success}
              />
              <Text style={styles.benefitText}>MCA-compliant reports</Text>
            </View>
            <View style={styles.benefitItem}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check-circle"
                size={20}
                color={colors.success}
              />
              <Text style={styles.benefitText}>Real-time AIS tracking</Text>
            </View>
          </View>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.subscribeButton}
              onPress={handleSubscribe}
            >
              <Text style={styles.subscribeButtonText}>Subscribe Now</Text>
              <IconSymbol
                ios_icon_name="arrow.right"
                android_material_icon_name="arrow-forward"
                size={18}
                color="#fff"
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
            >
              <Text style={styles.cancelButtonText}>Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(isDark: boolean) {
  return StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    modalContent: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 20,
      padding: 24,
      width: '100%',
      maxWidth: 400,
      alignItems: 'center',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
        },
        android: {
          elevation: 8,
        },
      }),
    },
    iconContainer: {
      marginBottom: 16,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 12,
      textAlign: 'center',
    },
    message: {
      fontSize: 15,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 24,
    },
    benefitsList: {
      width: '100%',
      marginBottom: 24,
      gap: 12,
    },
    benefitItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    benefitText: {
      fontSize: 15,
      color: isDark ? colors.text : colors.textLight,
      fontWeight: '500',
      flex: 1,
    },
    buttonContainer: {
      width: '100%',
      gap: 12,
    },
    subscribeButton: {
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      borderRadius: 12,
      gap: 8,
    },
    subscribeButtonText: {
      color: '#fff',
      fontSize: 17,
      fontWeight: 'bold',
    },
    cancelButton: {
      backgroundColor: 'transparent',
      padding: 12,
      borderRadius: 12,
      alignItems: 'center',
    },
    cancelButtonText: {
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      fontSize: 15,
      fontWeight: '600',
    },
  });
}
