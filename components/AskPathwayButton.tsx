import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

/**
 * Entry point to the pathway assistant. Shared by the iOS and Android profile
 * screens and the requirements screen so they stay at parity. Only MCA has a
 * library so far, so other authorities get nothing rather than MCA answers.
 */
export function AskPathwayButton({ authority, isDark }: { authority: string | null | undefined; isDark: boolean }) {
  if (authority && authority !== 'mca') return null;
  return (
    <TouchableOpacity
      style={[styles.button, { borderColor: isDark ? colors.border : colors.borderLight }]}
      onPress={() => router.push('/pathway-assistant')}
      accessibilityRole="button"
    >
      <IconSymbol ios_icon_name="questionmark.bubble" android_material_icon_name="question-answer" size={20} color={colors.primary} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: isDark ? colors.text : colors.textLight }]}>Ask about your pathway</Text>
        <Text style={[styles.subtitle, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
          Plain answers from official MCA guidance
        </Text>
      </View>
      <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 16,
    gap: 12,
  },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600' },
  subtitle: { fontSize: 13, marginTop: 2 },
});
