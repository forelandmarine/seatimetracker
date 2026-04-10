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
import { Stack, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { authFetch } from '@/utils/api';

import { error as logError } from '@/utils/log';

export default function ReferScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);

  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [count, setCount] = useState(0);
  const [shareUrl, setShareUrl] = useState('');
  const [bonusDays, setBonusDays] = useState(0);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const refresh = async () => {
    try {
      const [refRes, creditsRes] = await Promise.all([
        authFetch('/api/referral'),
        authFetch('/api/referral/credits'),
      ]);
      const data = await refRes.json();
      const credits = await creditsRes.json();
      setCode(data.code || '');
      setCount(data.count || 0);
      setShareUrl(data.shareUrl || '');
      setBonusDays(credits.bonus_days || 0);
    } catch (err) {
      logError('[Refer] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `I'm using SeaTime Tracker to log my sea time automatically via AIS. Try it free using my code: ${code}\n\n${shareUrl}`,
        url: shareUrl,
      });
    } catch (err) {
      logError('[Refer] Share failed:', err);
    }
  };

  const handleRedeem = async () => {
    if (!redeemCode.trim()) return;
    setRedeeming(true);
    try {
      const res = await authFetch('/api/referral/redeem', {
        method: 'POST',
        body: { code: redeemCode.trim() },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to redeem');
      }
      Alert.alert('Code redeemed', 'Thanks — you both got 30 free days. The bonus is applied to your next subscription renewal.');
      setRedeemCode('');
      refresh();
    } catch (err: any) {
      Alert.alert('Could not redeem', err?.message || 'Please check the code and try again.');
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Refer a captain',
          headerStyle: { backgroundColor: isDark ? colors.background : colors.backgroundLight },
          headerTitleStyle: { color: isDark ? colors.text : colors.textLight },
          headerTintColor: colors.primary,
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <IconSymbol
            ios_icon_name="person.2.fill"
            android_material_icon_name="people"
            size={64}
            color={colors.primary}
          />
          <Text style={styles.title}>Invite a fellow captain</Text>
          <Text style={styles.subtitle}>
            Share SeaTime Tracker with crew you've worked with. When they sign up using your code,
            you'll both get a bonus.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={styles.codeCard}>
              <Text style={styles.label}>Your referral code</Text>
              <Text style={styles.code}>{code || '—'}</Text>
              <Text style={styles.statText}>
                {count} captain{count === 1 ? '' : 's'} referred so far
              </Text>
              <TouchableOpacity style={styles.shareButton} onPress={handleShare} disabled={!code}>
                <IconSymbol
                  ios_icon_name="square.and.arrow.up"
                  android_material_icon_name="share"
                  size={20}
                  color="#FFFFFF"
                />
                <Text style={styles.shareButtonText}>Share invite</Text>
              </TouchableOpacity>
            </View>

            {bonusDays > 0 && (
              <View style={styles.bonusBanner}>
                <IconSymbol
                  ios_icon_name="gift.fill"
                  android_material_icon_name="card-giftcard"
                  size={22}
                  color={colors.success}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bonusTitle}>{bonusDays} bonus days</Text>
                  <Text style={styles.bonusBody}>
                    Applied automatically to your next subscription renewal.
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.divider} />

            <View style={styles.redeemCard}>
              <Text style={styles.label}>Got a code from a captain?</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter referral code"
                placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                value={redeemCode}
                onChangeText={(t) => setRedeemCode(t.toUpperCase())}
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
                  <Text style={styles.redeemButtonText}>Redeem code</Text>
                )}
              </TouchableOpacity>
            </View>
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
