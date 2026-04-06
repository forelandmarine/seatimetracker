import { StyleSheet, Platform } from 'react-native';
import { colors } from '@/styles/commonStyles';

export function createAuthStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    content: {
      padding: 24,
      paddingTop: Platform.OS === 'android' ? 48 : 24,
    },
    header: {
      alignItems: 'center',
      marginBottom: 40,
      marginTop: 40,
    },
    logo: {
      width: 100,
      height: 100,
    },
    title: {
      fontSize: 32,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginTop: 16,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 18,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    form: {
      width: '100%',
      maxWidth: 400,
      alignSelf: 'center',
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
    switchButton: {
      marginTop: 16,
      alignItems: 'center',
    },
    switchText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: '500',
    },
    forgotPasswordButton: {
      marginTop: 12,
      alignItems: 'center',
    },
    forgotPasswordText: {
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      fontSize: 15,
      fontWeight: '500',
      textDecorationLine: 'underline',
    },
    divider: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 24,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: isDark ? colors.border : colors.borderLight,
    },
    dividerText: {
      marginHorizontal: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      fontSize: 14,
      fontWeight: '500',
    },
    appleButton: {
      width: '100%',
      height: 50,
    },
    googleButton: {
      backgroundColor: isDark ? '#2D2D2D' : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.2)' : '#DADCE0',
    },
    googleButtonIosSpacing: {
      marginTop: 12,
    },
    googleButtonInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    googleIcon: {
      fontSize: 18,
      fontWeight: '700',
      color: '#4285F4',
      marginRight: 10,
      fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    },
    googleButtonText: {
      fontSize: 17,
      fontWeight: '600',
      color: '#3C4043',
    },
    googleButtonTextDark: {
      color: '#FFFFFF',
    },
    biometricButton: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderWidth: 2,
      borderColor: colors.primary,
    },
    biometricButtonText: {
      color: colors.primary,
      fontSize: 18,
      fontWeight: '600',
    },
    checkboxContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderWidth: 2,
      borderColor: isDark ? colors.border : colors.borderLight,
      borderRadius: 6,
      marginRight: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.cardBackground : colors.card,
    },
    checkboxChecked: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    checkmark: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: 'bold',
    },
    checkboxLabel: {
      flex: 1,
      fontSize: 15,
      color: isDark ? colors.text : colors.textLight,
    },
    footer: {
      marginTop: 40,
      alignItems: 'center',
    },
    footerText: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      textAlign: 'center',
      marginBottom: 4,
    },
    warningBanner: {
      backgroundColor: '#FFF3CD',
      borderRadius: 8,
      padding: 12,
      marginTop: 16,
      borderWidth: 1,
      borderColor: '#FFC107',
    },
    warningText: {
      color: '#856404',
      fontSize: 14,
      textAlign: 'center',
      fontWeight: '500',
    },
  });
}
