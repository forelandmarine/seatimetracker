/**
 * Unified modal for error / success / confirm dialogs.
 *
 * Replaces 3+ duplicated modal implementations across the app
 * (add-sea-time, edit-sea-time, user-profile, profile, forgot-password).
 *
 * Usage:
 * ```tsx
 * const [feedback, setFeedback] = useState<FeedbackState>({ visible: false });
 *
 * setFeedback({
 *   visible: true,
 *   type: 'success',
 *   title: 'Saved',
 *   message: 'Your changes have been saved.',
 *   onConfirm: () => router.back(),
 * });
 *
 * setFeedback({
 *   visible: true,
 *   type: 'confirm',
 *   title: 'Delete entry?',
 *   message: 'This cannot be undone.',
 *   confirmLabel: 'Delete',
 *   onConfirm: handleDelete,
 * });
 *
 * <FeedbackModal {...feedback} onClose={() => setFeedback({ visible: false })} />
 * ```
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { colors } from '@/styles/commonStyles';

export type FeedbackType = 'error' | 'success' | 'info' | 'confirm';

export interface FeedbackState {
  visible: boolean;
  type?: FeedbackType;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  loading?: boolean;
}

interface FeedbackModalProps extends FeedbackState {
  onClose: () => void;
}

export function FeedbackModal({
  visible,
  type = 'info',
  title = '',
  message = '',
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  loading,
  onClose,
}: FeedbackModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);

  const titleColor =
    type === 'success'
      ? colors.success
      : type === 'error'
        ? colors.error
        : isDark
          ? colors.text
          : colors.textLight;

  const primaryButtonColor =
    type === 'success'
      ? colors.success
      : type === 'error' || (type === 'confirm' && !confirmLabel)
        ? colors.error
        : type === 'confirm'
          ? colors.error
          : colors.primary;

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    if (type !== 'confirm') {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          {type === 'confirm' ? (
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={onClose}
                disabled={loading}
              >
                <Text style={styles.buttonSecondaryText}>{cancelLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: primaryButtonColor }]}
                onPress={handleConfirm}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonPrimaryText}>
                    {confirmLabel || 'Confirm'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.button, styles.buttonFull, { backgroundColor: primaryButtonColor }]}
              onPress={handleConfirm}
            >
              <Text style={styles.buttonPrimaryText}>OK</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(4, 13, 26, 0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 16,
      padding: 24,
      width: '100%',
      maxWidth: 400,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: 12,
    },
    message: {
      fontSize: 15,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 24,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 12,
    },
    button: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonFull: {
      width: '100%',
    },
    buttonSecondary: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    buttonPrimaryText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    buttonSecondaryText: {
      color: isDark ? colors.text : colors.textLight,
      fontSize: 16,
      fontWeight: '600',
    },
  });
