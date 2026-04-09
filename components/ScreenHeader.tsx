/**
 * Standardised screen header used by custom-header screens.
 *
 * Replaces ad-hoc Platform.OS padding hacks scattered across the app.
 *
 * Usage:
 * ```tsx
 * <ScreenHeader title="Edit Sea Time" onBack={() => router.back()} />
 *
 * <ScreenHeader
 *   title="Edit Sea Time"
 *   onBack={() => router.back()}
 *   rightAction={
 *     <TouchableOpacity onPress={handleDelete}>
 *       <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" />
 *     </TouchableOpacity>
 *   }
 * />
 * ```
 */

import React, { ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from './IconSymbol';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  rightAction?: ReactNode;
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backLabel,
  rightAction,
}: ScreenHeaderProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const styles = createStyles(isDark);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 4 }]}>
      <View style={styles.row}>
        {onBack ? (
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel={backLabel || 'Back'}
            accessibilityRole="button"
          >
            <IconSymbol
              ios_icon_name="chevron.left"
              android_material_icon_name="arrow-back"
              size={26}
              color={colors.primary}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.backButton} />
        )}

        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
            {title}
          </Text>
          {subtitle && (
            <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
              {subtitle}
            </Text>
          )}
        </View>

        <View style={styles.rightAction}>{rightAction}</View>
      </View>
    </View>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? colors.border : colors.borderLight,
      paddingHorizontal: 12,
      paddingBottom: 12,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 44,
    },
    backButton: {
      width: 44,
      height: 44,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    titleContainer: {
      flex: 1,
      alignItems: 'center',
    },
    title: {
      fontSize: 17,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
    },
    subtitle: {
      fontSize: 12,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 2,
    },
    rightAction: {
      width: 44,
      height: 44,
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
  });
