import React from 'react';
import { TouchableOpacity, View, Text, Image } from 'react-native';
import { createAuthStyles } from '@/styles/authStyles';

// Google's four-colour "G" (transparent PNG, 144 px), per their sign-in branding guidelines.
const GOOGLE_G = require('@/assets/images/google-g.png');

export default function GoogleSignInButton({ onPress, disabled, isDark }: { onPress: () => void; disabled?: boolean; isDark: boolean }) {
  const styles = createAuthStyles(isDark);
  return (
    <TouchableOpacity
      style={[styles.button, styles.googleButton, { marginTop: 0, height: 50, padding: 0, justifyContent: 'center' }, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
    >
      <View style={styles.googleButtonInner}>
        <Image source={GOOGLE_G} style={{ width: 20, height: 20, marginRight: 12 }} />
        <Text style={[styles.googleButtonText, isDark && styles.googleButtonTextDark]}>Continue with Google</Text>
      </View>
    </TouchableOpacity>
  );
}
