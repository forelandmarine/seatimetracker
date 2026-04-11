import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  ScrollView,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n, { SUPPORTED_LANGUAGES, changeLanguage } from '@/i18n';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useTranslation } from 'react-i18next';

const LANGUAGE_STORAGE_KEY = 'seatime_language';

export default function LanguageScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const { t } = useTranslation();
  const [current, setCurrent] = useState(i18n.language || 'en');

  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_STORAGE_KEY).then((stored) => {
      if (stored && stored !== i18n.language) {
        changeLanguage(stored).then(() => setCurrent(stored));
      }
    });
  }, []);

  const handleSelect = async (code: string) => {
    setCurrent(code);
    await changeLanguage(code);
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t('navigation.language'),
          headerStyle: { backgroundColor: isDark ? colors.background : colors.backgroundLight },
          headerTitleStyle: { color: isDark ? colors.text : colors.textLight },
          headerTintColor: colors.primary,
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          {t('settings.language')}
        </Text>

        {SUPPORTED_LANGUAGES.map((lang, index) => (
          <TouchableOpacity
            key={lang.code}
            style={[
              styles.option,
              index === SUPPORTED_LANGUAGES.length - 1 && styles.optionLast,
              current === lang.code && styles.optionActive,
            ]}
            onPress={() => handleSelect(lang.code)}
          >
            <Text
              style={[styles.optionText, current === lang.code && styles.optionTextActive]}
            >
              {lang.label}
            </Text>
            {current === lang.code && (
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check-circle"
                size={22}
                color={colors.primary}
              />
            )}
          </TouchableOpacity>
        ))}
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
      padding: 20,
      paddingBottom: 60,
    },
    intro: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 20,
      lineHeight: 20,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? colors.border : colors.borderLight,
    },
    optionLast: {
      borderBottomWidth: 0,
    },
    optionActive: {
      backgroundColor: colors.primary + '15',
    },
    optionText: {
      fontSize: 16,
      color: isDark ? colors.text : colors.textLight,
    },
    optionTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
  });
