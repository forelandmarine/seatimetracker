import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

function openHistoryImport(vesselId: string, vesselName?: string) {
  router.push({ pathname: '/history-import', params: { vesselId, vesselName: vesselName ?? '' } } as any);
}

/** After a vessel is added: offer to import its sea time from before tracking started. */
export function promptHistoryImport(vesselId: string, vesselName: string, intro?: string) {
  Alert.alert(
    intro ? 'Vessel added' : 'Import past sea time?',
    `${intro ? intro + '\n\n' : ''}Tracking starts now. We can also look up ${vesselName}'s AIS history and add passages from before today for you to review.`,
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'See what we can find', onPress: () => openHistoryImport(vesselId, vesselName) },
    ]
  );
}

/** Vessel screen entry point for the AIS history import (both platforms). */
export function HistoryImportRow({ vesselId, vesselName }: { vesselId: string; vesselName?: string }) {
  return (
    <TouchableOpacity
      onPress={() => openHistoryImport(vesselId, vesselName)}
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
        ios_icon_name="clock.arrow.circlepath"
        android_material_icon_name="history"
        size={20}
        color={colors.primary}
        style={{ marginRight: 10 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>Import past sea time</Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
          Add passages from this vessel's AIS history before you started tracking
        </Text>
      </View>
      <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron-right" size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}
