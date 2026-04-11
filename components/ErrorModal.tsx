import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, useColorScheme } from 'react-native';
import { colors } from '@/styles/commonStyles';

interface ErrorModalProps {
  visible: boolean;
  title?: string;
  message: string;
  isRetryable?: boolean;
  onDismiss: () => void;
  onRetry?: () => void;
}

export default function ErrorModal({
  visible,
  title,
  message,
  isRetryable = false,
  onDismiss,
  onRetry,
}: ErrorModalProps) {
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);

  const modalTitle = title ?? (isRetryable ? 'Connection Problem' : 'Error');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.content} accessibilityViewIsModal={true}>
          <Text style={styles.title}>{modalTitle}</Text>
          <Text style={styles.message} accessibilityRole="alert">{message}</Text>
          {isRetryable && onRetry ? (
            <View style={styles.buttonRow}>
              <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={onDismiss}>
                <Text style={styles.buttonSecondaryText}>Dismiss</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={onRetry}>
                <Text style={styles.buttonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[styles.button, styles.buttonPrimary, { width: '100%' }]} onPress={onDismiss}>
              <Text style={styles.buttonText}>OK</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(isDark: boolean) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    content: {
      backgroundColor: isDark ? colors.cardBackground : '#FFFFFF',
      borderRadius: 16,
      padding: 24,
      width: '100%',
      maxWidth: 400,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 5,
    },
    title: {
      fontSize: 20,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 12,
      textAlign: 'center',
    },
    message: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 24,
      textAlign: 'center',
      lineHeight: 24,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 12,
    },
    button: {
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      flex: 1,
    },
    buttonPrimary: {
      backgroundColor: colors.primary,
    },
    buttonSecondary: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    buttonSecondaryText: {
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
