import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  useColorScheme,
  ActivityIndicator,
  Alert,
  Share,
  ScrollView,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { authFetch } from '@/utils/api';
import { redeemReferralCode } from '@/utils/seaTimeApi';
import { useTranslation } from 'react-i18next';

import { error as logError } from '@/utils/log';

interface ReferralInfo {
  code: string;
  count: number;
  shareUrl: string;
  paid_count?: number;
  months_earned?: number;
  months_pending?: number;
  can_redeem?: boolean;
  redeem_days_left?: number;
  referred?: { friend_paid: boolean; reward_status: string } | null;
}

export default function ReferScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const { t } = useTranslation();
  // seatimetracker://refer?code=ABCD2345 opens this screen with the code filled in
  const params = useLocalSearchParams<{ code?: string }>();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [redeemCode, setRedeemCode] = useState(
    typeof params.code === 'string' ? params.code.toUpperCase().slice(0, 12) : ''
  );
  const [redeeming, setRedeeming] = useState(false);

  const refresh = async () => {
    setLoadError(false);
    try {
      const res = await authFetch('/api/referral');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setInfo(await res.json());
    } catch (err) {
      logError('[Refer] Failed to load:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const code = info?.code || '';

  const handleShare = async () => {
    try {
      const message = `${t('refer.shareMessage', { code })}\n\n${info?.shareUrl || ''}`;
      await Share.share({ message, url: info?.shareUrl });
    } catch (err) {
      logError('[Refer] Share failed:', err);
    }
  };

  const handleRedeem = async () => {
    if (!redeemCode.trim()) return;
    setRedeeming(true);
    try {
      await redeemReferralCode(redeemCode);
      Alert.alert(t('refer.codeRedeemed'), t('refer.codeRedeemedMessage'));
      setRedeemCode('');
      refresh();
    } catch (err: any) {
      Alert.alert(t('refer.couldNotRedeem'), err?.message || t('common.retry'));
    } finally {
      setRedeeming(false);
    }
  };

  const steps = [t('refer.step1'), t('refer.step2'), t('refer.step3')];

  return (
    <>
      <Stack.Screen
        options={{
          title: t('refer.title'),
          headerStyle: { backgroundColor: isDark ? colors.background : colors.backgroundLight },
          headerTitleStyle: { color: isDark ? colors.text : colors.textLight },
          headerTintColor: colors.primary,
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <IconSymbol
            ios_icon_name="person.2.fill"
            android_material_icon_name="people"
            size={64}
            color={colors.primary}
          />
          <Text style={styles.title}>{t('refer.heading')}</Text>
          <Text style={styles.subtitle}>{t('refer.subtitle')}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : loadError || !info ? (
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <Text style={[styles.subtitle, { marginBottom: 16 }]}>{t('refer.unableToLoad')}</Text>
            <TouchableOpacity style={styles.shareButton} onPress={refresh}>
              <Text style={styles.shareButtonText}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.codeCard}>
              <Text style={styles.label}>{t('refer.yourCode')}</Text>
              <Text style={styles.code}>{code || '-'}</Text>
              <Text style={styles.statText}>
                {t('refer.stats', { count: info.count ?? 0, paid: info.paid_count ?? 0 })}
              </Text>
              <TouchableOpacity style={styles.shareButton} onPress={handleShare} disabled={!code}>
                <IconSymbol
                  ios_icon_name="square.and.arrow.up"
                  android_material_icon_name="share"
                  size={20}
                  color="#FFFFFF"
                />
                <Text style={styles.shareButtonText}>{t('refer.shareInvite')}</Text>
              </TouchableOpacity>
            </View>

            {((info.months_earned ?? 0) > 0 || (info.months_pending ?? 0) > 0) && (
              <View style={styles.bonusBanner}>
                <IconSymbol
                  ios_icon_name="gift.fill"
                  android_material_icon_name="card-giftcard"
                  size={22}
                  color={colors.success}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bonusTitle}>{t('refer.monthsEarned', { count: info.months_earned ?? 0 })}</Text>
                  {(info.months_pending ?? 0) > 0 && (
                    <Text style={styles.bonusBody}>{t('refer.monthsPending', { count: info.months_pending })}</Text>
                  )}
                </View>
              </View>
            )}

            <View style={styles.stepsCard}>
              <Text style={styles.label}>{t('refer.howItWorks')}</Text>
              {steps.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <Text style={styles.stepNumber}>{i + 1}</Text>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>

            {info.referred && (
              <View style={styles.bonusBanner}>
                <IconSymbol
                  ios_icon_name="checkmark.seal.fill"
                  android_material_icon_name="verified"
                  size={22}
                  color={colors.success}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bonusTitle}>{t('refer.referredTitle')}</Text>
                  <Text style={styles.bonusBody}>
                    {info.referred.reward_status === 'granted' ? t('refer.referredGranted') : t('refer.referredWaiting')}
                  </Text>
                </View>
              </View>
            )}

            {info.can_redeem && (
              <>
                <View style={styles.divider} />
                <View style={styles.redeemCard}>
                  <Text style={styles.label}>{t('refer.gotCode')}</Text>
                  <Text style={[styles.statText, { marginBottom: 12 }]}>
                    {t('refer.redeemDaysLeft', { count: info.redeem_days_left ?? 0 })}
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t('refer.enterCode')}
                    placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                    value={redeemCode}
                    onChangeText={(v) => setRedeemCode(v.toUpperCase())}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={12}
                  />
                  <TouchableOpacity
                    style={[styles.redeemButton, (!redeemCode.trim() || redeeming) && { opacity: 0.5 }]}
                    onPress={handleRedeem}
                    disabled={!redeemCode.trim() || redeeming}
                  >
                    {redeeming ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.redeemButtonText}>{t('refer.redeemCode')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </>
        )}
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
      padding: 24,
      paddingBottom: 60,
    },
    header: {
      alignItems: 'center',
      paddingVertical: 24,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      marginTop: 16,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      textAlign: 'center',
      lineHeight: 20,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    codeCard: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 12,
      padding: 24,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      alignItems: 'center',
      marginTop: 16,
    },
    code: {
      fontSize: 32,
      fontWeight: '700',
      color: colors.primary,
      letterSpacing: 4,
      marginVertical: 12,
      fontFamily: 'monospace',
    },
    statText: {
      fontSize: 13,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 16,
    },
    shareButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 10,
    },
    shareButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '600',
    },
    bonusBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      backgroundColor: colors.success + '15',
      borderRadius: 12,
      borderLeftWidth: 4,
      borderLeftColor: colors.success,
      marginTop: 16,
    },
    bonusTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
    },
    bonusBody: {
      fontSize: 12,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 2,
    },
    stepsCard: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 12,
      padding: 20,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      marginTop: 16,
    },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginTop: 10,
    },
    stepNumber: {
      width: 22,
      height: 22,
      borderRadius: 11,
      overflow: 'hidden',
      backgroundColor: colors.primary,
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: 22,
    },
    stepText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    divider: {
      height: 1,
      backgroundColor: isDark ? colors.border : colors.borderLight,
      marginVertical: 28,
    },
    redeemCard: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 12,
      padding: 20,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    input: {
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
      borderRadius: 8,
      padding: 14,
      fontSize: 16,
      color: isDark ? colors.text : colors.textLight,
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      marginBottom: 12,
      letterSpacing: 2,
      textAlign: 'center',
    },
    redeemButton: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      padding: 14,
      alignItems: 'center',
    },
    redeemButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '600',
    },
  });
