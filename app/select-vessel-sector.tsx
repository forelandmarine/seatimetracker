import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useColorScheme,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import * as seaTimeApi from '@/utils/seaTimeApi';
import { log, error as logError } from '@/utils/log';

type VesselSector = 'yachting' | 'commercial';

interface SectorOption {
  value: VesselSector;
  label: string;
  subtitle: string;
  icon_ios: string;
  icon_android: keyof typeof MaterialIcons.glyphMap;
  bullets: string[];
  comingSoon: boolean;
}

// Commercial is intentionally not selectable yet: the CTV/workboat qualifying-service
// engine is not built, and MCA/TSN acceptance of AIS-derived classification is pending,
// so we show it as "coming soon" rather than let users pick a pathway that does nothing.
const SECTOR_OPTIONS: SectorOption[] = [
  {
    value: 'yachting',
    label: 'Yachting',
    subtitle: 'Private and commercial yachts',
    icon_ios: 'sailboat.fill',
    icon_android: 'sailing',
    bullets: [
      'MCA, USCG, AMSA and Maritime NZ yacht pathways',
      'Sea service counted from your logged voyages',
      'The current, fully supported experience',
    ],
    comingSoon: false,
  },
  {
    value: 'commercial',
    label: 'Commercial',
    subtitle: 'Workboats and CTVs',
    icon_ios: 'ferry.fill',
    icon_android: 'directions-boat',
    bullets: [
      'CTV / workboat certificate pathways',
      'MSN 1837 sea-area and tidal classification',
      'In development — not yet available to select',
    ],
    comingSoon: true,
  },
];

function createStyles(isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    scrollContent: {
      padding: 24,
      paddingTop: Platform.OS === 'android' ? 64 : 40,
      paddingBottom: 100,
    },
    header: {
      marginBottom: 32,
      alignItems: 'center',
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 12,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      textAlign: 'center',
      lineHeight: 24,
    },
    sectorCard: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 16,
      padding: 24,
      marginBottom: 16,
      borderWidth: 2,
      borderColor: 'transparent',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
    },
    sectorCardSelected: {
      borderColor: colors.primary,
    },
    sectorCardDisabled: {
      opacity: 0.6,
    },
    sectorHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    iconContainer: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary + '20',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    sectorTitleContainer: {
      flex: 1,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    sectorTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 4,
      marginRight: 8,
    },
    sectorSubtitle: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    comingSoonBadge: {
      backgroundColor: colors.primary + '20',
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 2,
      marginBottom: 4,
    },
    comingSoonText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    checkmark: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bulletList: {
      marginTop: 4,
    },
    bulletItem: {
      flexDirection: 'row',
      marginBottom: 8,
      paddingLeft: 8,
    },
    bullet: {
      fontSize: 14,
      color: colors.primary,
      marginRight: 8,
      fontWeight: 'bold',
    },
    bulletText: {
      flex: 1,
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      lineHeight: 20,
    },
    infoBox: {
      backgroundColor: colors.primary + '15',
      borderRadius: 12,
      padding: 16,
      marginTop: 8,
      marginBottom: 24,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
    },
    infoText: {
      fontSize: 14,
      color: isDark ? colors.text : colors.textLight,
      lineHeight: 20,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      padding: 18,
      alignItems: 'center',
      marginTop: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 4,
    },
    buttonDisabled: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      opacity: 0.5,
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: '600',
    },
    buttonTextDisabled: {
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    loadingText: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 16,
    },
  });
}

export default function SelectVesselSectorScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const router = useRouter();

  const [selected, setSelected] = useState<VesselSector>('yachting');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Prefill from the stored profile. null is treated as yachting (the default).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const profile = await seaTimeApi.getUserProfile();
        if (active && profile?.vessel_sector === 'commercial') {
          setSelected('commercial');
        }
      } catch (err) {
        logError('[SelectVesselSector] Failed to load profile:', err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleSelect = (option: SectorOption) => {
    if (option.comingSoon) {
      Alert.alert(
        'Coming soon',
        'Commercial (workboat / CTV) pathways are in development and not yet available to select. Yachting is the current, fully supported experience.',
      );
      return;
    }
    setSelected(option.value);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      log('[SelectVesselSector] Saving vessel_sector:', selected);
      await seaTimeApi.updateUserProfile({ vessel_sector: selected });
      // Changing sector is a forward-looking preference; it never alters sea-time
      // entries already logged, so there is nothing to recompute here.
      router.back();
    } catch (err: any) {
      logError('[SelectVesselSector] Failed to save vessel sector:', err);
      Alert.alert('Error', err?.message || 'Failed to save your selection. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Vessel Sector', headerShown: true, headerBackTitle: 'Back' }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Vessel Sector',
          headerShown: true,
          headerBackTitle: 'Back',
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Choose Your Vessel Sector</Text>
          <Text style={styles.subtitle}>
            Tell us whether you work in yachting or commercial. You can change this any time — it never
            affects sea time you have already logged.
          </Text>
        </View>

        {SECTOR_OPTIONS.map((option) => {
          const isSelected = !option.comingSoon && selected === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.sectorCard,
                isSelected && styles.sectorCardSelected,
                option.comingSoon && styles.sectorCardDisabled,
              ]}
              onPress={() => handleSelect(option)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled: option.comingSoon }}
            >
              <View style={styles.sectorHeader}>
                <View style={styles.iconContainer}>
                  <IconSymbol
                    ios_icon_name={option.icon_ios}
                    android_material_icon_name={option.icon_android}
                    size={32}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.sectorTitleContainer}>
                  <View style={styles.titleRow}>
                    <Text style={styles.sectorTitle}>{option.label}</Text>
                    {option.comingSoon && (
                      <View style={styles.comingSoonBadge}>
                        <Text style={styles.comingSoonText}>Coming soon</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.sectorSubtitle}>{option.subtitle}</Text>
                </View>
                {isSelected && (
                  <View style={styles.checkmark}>
                    <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={18} color="#FFFFFF" />
                  </View>
                )}
              </View>

              <View style={styles.bulletList}>
                {option.bullets.map((b, i) => (
                  <View key={i} style={styles.bulletItem}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          );
        })}

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Commercial workboat and CTV pathways are on the way. For now every account uses the yachting
            experience; your choice here is saved to your profile so we can enable commercial features for
            you as soon as they are ready.
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.button, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Save</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}
