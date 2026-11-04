import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useAuth } from '@/contexts/AuthContext';
import { Certificate, listCertificates } from '@/utils/certificatesApi';
import { certificatesNeedingDetails } from '@/utils/courseChecklist';
import { todayIso } from '@/utils/localDate';
import { error as logError } from '@/utils/log';

// Day the banner last appeared (YYYY-MM-DD on the phone's clock), per user.
const SHOWN_KEY = 'certDetailsBanner:lastShown';

/**
 * In-app reminder for ticked certificates that still need a number or dates.
 * Never a push: it only appears when the app opens or comes back to the
 * foreground, at most once a day. Later hides it until the next day.
 */
export function CertificateDetailsBanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const isFocused = useIsFocused();

  const [missing, setMissing] = useState<Certificate[]>([]);
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const focusedRef = useRef(isFocused);
  // True until the first look after the app opens or returns to the foreground.
  const pendingOpenRef = useRef(true);
  const key = user?.id ? `${SHOWN_KEY}:${user.id}` : null;

  useEffect(() => {
    focusedRef.current = isFocused;
  }, [isFocused]);

  const show = (value: boolean) => {
    visibleRef.current = value;
    setVisible(value);
  };

  const check = useCallback(
    async (canShow: boolean) => {
      if (!key) return;
      try {
        const list = certificatesNeedingDetails(await listCertificates());
        setMissing(list);
        if (list.length === 0) {
          show(false);
          return;
        }
        if (!canShow || visibleRef.current) return;
        const today = todayIso();
        if ((await AsyncStorage.getItem(key)) === today) return;
        await AsyncStorage.setItem(key, today);
        show(true);
      } catch (err) {
        logError('[CertDetailsBanner] check failed', err);
      }
    },
    [key],
  );

  // App open: the first time Home is shown. Coming back to Home later only
  // refreshes the count, so the banner goes once the details are added.
  useFocusEffect(
    useCallback(() => {
      const opening = pendingOpenRef.current;
      pendingOpenRef.current = false;
      check(opening);
    }, [check]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (focusedRef.current) check(true);
      else pendingOpenRef.current = true;
    });
    return () => sub.remove();
  }, [check]);

  if (!visible || missing.length === 0) return null;

  const addNow = () => {
    show(false);
    if (missing.length === 1) router.push({ pathname: '/certificate-edit', params: { id: missing[0].id } });
    else router.push('/certificates');
  };

  return (
    <View style={styles.banner}>
      <IconSymbol ios_icon_name="checkmark.seal" android_material_icon_name="verified" size={24} color={colors.warning} />
      <View style={styles.bannerText}>
        <Text style={styles.bannerTitle}>{t('certChecker.bannerTitle', { count: missing.length })}</Text>
        <Text style={styles.bannerBody}>{t('certChecker.bannerBody')}</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primary} onPress={addNow}>
            <Text style={styles.primaryText}>{t('certChecker.addNow')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondary} onPress={() => show(false)}>
            <Text style={styles.secondaryText}>{t('certChecker.later')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderLeftWidth: 4,
      borderLeftColor: colors.warning,
      borderRadius: 16,
      padding: 16,
      marginHorizontal: 16,
      marginBottom: 16,
    },
    bannerText: { flex: 1 },
    bannerTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 4,
    },
    bannerBody: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    actions: { flexDirection: 'row', gap: 12, marginTop: 12 },
    primary: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    primaryText: { fontSize: 15, fontWeight: '600', color: colors.white },
    secondary: { paddingVertical: 8, paddingHorizontal: 12 },
    secondaryText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  });
