import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

/**
 * Vessel screen entry point for manual phone-GPS tracking (both platforms).
 * Shown only when AIS is missing or more than 6 hours old.
 */
export function ManualGpsRow({
  vesselId,
  aisTimestamp,
  hasAisData,
}: {
  vesselId: string;
  aisTimestamp?: string | null;
  hasAisData: boolean;
}) {
  const aisIsStale = (() => {
    if (!aisTimestamp) return true;
    const ageHours = (Date.now() - new Date(aisTimestamp).getTime()) / (1000 * 60 * 60);
    return !Number.isFinite(ageHours) || ageHours > 6;
  })();
  if (!aisIsStale) return null;

  return (
    <TouchableOpacity
      onPress={() => router.push(`/manual-tracking?vesselId=${vesselId}`)}
      activeOpacity={0.7}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        padding: 12,
        borderRadius: 10,
        backgroundColor: colors.primary + '12',
        borderWidth: 1,
        borderColor: colors.primary + '30',
      }}
    >
      <IconSymbol
        ios_icon_name="location.fill"
        android_material_icon_name="my-location"
        size={20}
        color={colors.primary}
        style={{ marginRight: 10 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>Log voyage with phone GPS</Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
          {hasAisData ? 'AIS data is stale - use phone GPS to log this voyage' : 'No AIS coverage for this vessel'}
        </Text>
      </View>
      <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}
