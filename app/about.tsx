import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  Linking,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import Constants from 'expo-constants';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

const APP_VERSION = Constants.expoConfig?.version || '1.0.0';
const APP_BUILD =
  Platform.OS === 'ios'
    ? Constants.expoConfig?.ios?.buildNumber || '1'
    : String(Constants.expoConfig?.android?.versionCode || 1);

const FORELAND_URL = 'https://forelandmarine.com';
const SEATIME_URL = 'https://forelandmarine.com/tools/seatime-tracker';
const LIGHTSHIP_URL = 'https://forelandmarine.com/tools/lightship-ism';
const PRIVACY_URL = 'https://forelandmarine.com/privacy-policy';
const TERMS_URL = 'https://forelandmarine.com/terms';
const SUPPORT_EMAIL = 'info@forelandmarine.com';

export default function AboutScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);

  const openLink = async (url: string) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Cannot open link', url);
      }
    } catch (e) {
      Alert.alert('Cannot open link', url);
    }
  };

  const openSupport = async () => {
    const subject = encodeURIComponent('SeaTime Tracker Support');
    const body = encodeURIComponent(
      `\n\n---\nApp version: ${APP_VERSION} (${APP_BUILD})\nPlatform: ${Platform.OS} ${Platform.Version}\n`
    );
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    try {
      const canOpen = await Linking.canOpenURL(mailto);
      if (canOpen) {
        await Linking.openURL(mailto);
      } else {
        Alert.alert('Contact Support', `Please email us at:\n${SUPPORT_EMAIL}`);
      }
    } catch (e) {
      Alert.alert('Contact Support', `Please email us at:\n${SUPPORT_EMAIL}`);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'About',
          headerStyle: { backgroundColor: isDark ? colors.background : colors.backgroundLight },
          headerTitleStyle: { color: isDark ? colors.text : colors.textLight },
          headerTintColor: colors.primary,
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* App brand block */}
        <View style={styles.brandBlock}>
          <Image
            source={require('@/assets/images/brandmark-design-1024x1024.png')}
            style={styles.appIcon}
            resizeMode="contain"
          />
          <Text style={styles.appName}>SeaTime Tracker</Text>
          <Text style={styles.tagline}>Your sea time, on autopilot.</Text>
          <Text style={styles.version}>
            Version {APP_VERSION} ({APP_BUILD})
          </Text>
        </View>

        {/* Foreland Marine block */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>BUILT BY</Text>
          <TouchableOpacity style={styles.card} onPress={() => openLink(FORELAND_URL)}>
            <View style={styles.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Foreland Marine Consultancy</Text>
                <Text style={styles.cardSubtitle}>
                  Yacht management, refit, new build, and technical consultancy.
                </Text>
              </View>
              <IconSymbol
                ios_icon_name="arrow.up.right.square"
                android_material_icon_name="open-in-new"
                size={22}
                color={colors.primary}
              />
            </View>
          </TouchableOpacity>
        </View>

        {/* Lightship promotion */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>FOR YACHT MANAGERS</Text>
          <TouchableOpacity style={styles.featureCard} onPress={() => openLink(LIGHTSHIP_URL)}>
            <View style={styles.featureCardHeader}>
              <IconSymbol
                ios_icon_name="building.2"
                android_material_icon_name="business"
                size={28}
                color={colors.primary}
              />
              <Text style={styles.featureCardTitle}>Lightship ISM</Text>
            </View>
            <Text style={styles.featureCardBody}>
              Managing an entire fleet? Lightship is our ISM compliance and yacht administration
              platform — incident tracking, audits, certificates, AIS records, and more.
            </Text>
            <View style={styles.featureCardCta}>
              <Text style={styles.featureCardCtaText}>Learn more</Text>
              <IconSymbol
                ios_icon_name="arrow.right"
                android_material_icon_name="arrow-forward"
                size={16}
                color={colors.primary}
              />
            </View>
          </TouchableOpacity>
        </View>

        {/* Help & Support */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>HELP & SUPPORT</Text>

          <TouchableOpacity style={styles.menuItem} onPress={openSupport}>
            <IconSymbol
              ios_icon_name="envelope"
              android_material_icon_name="email"
              size={22}
              color={colors.primary}
              style={styles.menuItemIcon}
            />
            <Text style={styles.menuItemText}>Contact Support</Text>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="arrow-forward"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => openLink(SEATIME_URL)}>
            <IconSymbol
              ios_icon_name="questionmark.circle"
              android_material_icon_name="help"
              size={22}
              color={colors.primary}
              style={styles.menuItemIcon}
            />
            <Text style={styles.menuItemText}>Help & FAQ</Text>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="arrow-forward"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, styles.menuItemLast]}
            onPress={() => openLink(SEATIME_URL)}
          >
            <IconSymbol
              ios_icon_name="globe"
              android_material_icon_name="language"
              size={22}
              color={colors.primary}
              style={styles.menuItemIcon}
            />
            <Text style={styles.menuItemText}>Visit website</Text>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="arrow-forward"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Legal */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>LEGAL</Text>

          <TouchableOpacity style={styles.menuItem} onPress={() => openLink(PRIVACY_URL)}>
            <IconSymbol
              ios_icon_name="lock.shield"
              android_material_icon_name="privacy-tip"
              size={22}
              color={colors.primary}
              style={styles.menuItemIcon}
            />
            <Text style={styles.menuItemText}>Privacy Policy</Text>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="arrow-forward"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, styles.menuItemLast]}
            onPress={() => openLink(TERMS_URL)}
          >
            <IconSymbol
              ios_icon_name="doc.text"
              android_material_icon_name="article"
              size={22}
              color={colors.primary}
              style={styles.menuItemIcon}
            />
            <Text style={styles.menuItemText}>Terms of Service</Text>
            <IconSymbol
              ios_icon_name="chevron.right"
              android_material_icon_name="arrow-forward"
              size={18}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            © {new Date().getFullYear()} Foreland Marine Consultancy Ltd
          </Text>
          <Text style={styles.footerText}>7 Bell Yard, London, WC2A 2JR</Text>
        </View>
      </ScrollView>
    </>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    content: {
      paddingHorizontal: 16,
      paddingVertical: 24,
      paddingBottom: 60,
    },
    brandBlock: {
      alignItems: 'center',
      paddingVertical: 32,
    },
    appIcon: {
      width: 100,
      height: 100,
      borderRadius: 22,
      marginBottom: 16,
    },
    appName: {
      fontSize: 24,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 4,
    },
    tagline: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      fontStyle: 'italic',
      marginBottom: 8,
    },
    version: {
      fontSize: 12,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    section: {
      marginTop: 24,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
      letterSpacing: 1.2,
      marginBottom: 8,
      marginLeft: 4,
    },
    card: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    cardRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 4,
    },
    cardSubtitle: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      lineHeight: 18,
    },
    featureCard: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 12,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.primary,
      borderLeftWidth: 4,
    },
    featureCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8,
    },
    featureCardTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
    },
    featureCardBody: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      lineHeight: 20,
      marginBottom: 12,
    },
    featureCardCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    featureCardCtaText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    },
    menuItemLast: {
      borderBottomWidth: 0,
    },
    menuItemIcon: {
      marginRight: 14,
    },
    menuItemText: {
      flex: 1,
      fontSize: 15,
      color: isDark ? colors.text : colors.textLight,
    },
    footer: {
      alignItems: 'center',
      marginTop: 40,
      paddingVertical: 16,
    },
    footerText: {
      fontSize: 11,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 4,
    },
  });
