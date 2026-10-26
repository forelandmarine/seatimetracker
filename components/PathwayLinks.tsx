import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

/**
 * Entry points to the oral course checklist and the training provider search,
 * shown under "Ask about your pathway" on Profile and Requirements (both
 * platforms) so they stay at parity.
 */
function LinkRow({
  isDark,
  icon,
  androidIcon,
  title,
  subtitle,
  onPress,
}: {
  isDark: boolean;
  icon: string;
  androidIcon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.button, { borderColor: isDark ? colors.border : colors.borderLight }]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <IconSymbol ios_icon_name={icon as any} android_material_icon_name={androidIcon as any} size={20} color={colors.primary} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: isDark ? colors.text : colors.textLight }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>{subtitle}</Text>
      </View>
      <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={16} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

export function PathwayLinks({ isDark }: { isDark: boolean }) {
  return (
    <>
      <LinkRow
        isDark={isDark}
        icon="checklist"
        androidIcon="checklist"
        title="Before your oral"
        subtitle="Courses you need, and which ones expire"
        onPress={() => router.push('/oral-checklist' as any)}
      />
      <LinkRow
        isDark={isDark}
        icon="mappin.and.ellipse"
        androidIcon="place"
        title="Find a course"
        subtitle="Training providers near you, with dates"
        onPress={() => router.push('/training-providers' as any)}
      />
    </>
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
    marginTop: 12,
    gap: 12,
  },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600' },
  subtitle: { fontSize: 13, marginTop: 2 },
});
