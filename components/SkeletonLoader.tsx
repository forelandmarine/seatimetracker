import React, { useEffect, useRef } from 'react';
import { View, Animated, useColorScheme, StyleSheet } from 'react-native';
import { colors } from '@/styles/commonStyles';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
}

function SkeletonItem({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: isDark ? colors.border : colors.borderLight,
          opacity,
        },
        style,
      ]}
    />
  );
}

/** Skeleton card matching the home screen vessel card layout */
export function SkeletonVesselCard() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={[styles.card, {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
    }]}>
      <SkeletonItem width="60%" height={20} borderRadius={6} />
      <SkeletonItem width="40%" height={14} borderRadius={4} style={{ marginTop: 10 }} />
      <SkeletonItem width="100%" height={120} borderRadius={8} style={{ marginTop: 16 }} />
    </View>
  );
}

/** Skeleton card matching profile summary layout */
export function SkeletonProfileCard() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={[styles.card, {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
    }]}>
      <SkeletonItem width="50%" height={16} borderRadius={4} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
        <SkeletonItem width="40%" height={14} borderRadius={4} />
        <SkeletonItem width={40} height={14} borderRadius={4} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
        <SkeletonItem width="35%" height={14} borderRadius={4} />
        <SkeletonItem width={40} height={14} borderRadius={4} />
      </View>
    </View>
  );
}

/** Skeleton for logbook entry cards */
export function SkeletonEntryCard() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={[styles.card, {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
    }]}>
      <SkeletonItem width={90} height={22} borderRadius={6} />
      <SkeletonItem width="70%" height={14} borderRadius={4} style={{ marginTop: 10 }} />
      <SkeletonItem width="45%" height={14} borderRadius={4} style={{ marginTop: 8 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
});

export { SkeletonItem };
