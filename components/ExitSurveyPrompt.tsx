import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { exitSurveyCandidate, type ExitSurveyCandidate, type ExitTrigger } from '@/utils/exitSurvey';
import { getExitSurveyAnswered, submitExitSurvey, type ExitReason } from '@/utils/seaTimeApi';
import { error as logError } from '@/utils/log';

const REASONS: { key: ExitReason; label: string }[] = [
  { key: 'too_expensive', label: 'Too expensive' },
  { key: 'not_at_sea', label: 'Not at sea right now' },
  { key: 'tracking_issues', label: "Tracking didn't work for my vessel" },
  { key: 'missing_feature', label: 'Missing a feature I need' },
  { key: 'hard_to_use', label: 'Hard to use' },
  { key: 'other_app', label: 'Using another app or paper' },
  { key: 'short_term_need', label: 'Only needed it briefly' },
  { key: 'other', label: 'Other' },
];

interface Props {
  /** 'cancelled' on Home (auto-renew off), 'lapsed' on the paywall (plan ended). */
  trigger: ExitTrigger;
  /** Hold the survey back while something else is on screen. */
  enabled: boolean;
  /** Called once it is known there is nothing to ask, or the user has answered. */
  onSettled?: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function intro(c: ExitSurveyCandidate): string {
  const plan = c.isTrial ? 'free trial' : 'subscription';
  if (c.trigger === 'cancelled') {
    const until = c.expiresAt ? ` It stays active until ${formatDate(c.expiresAt)}.` : '';
    return `You've cancelled your ${plan}.${until} What made you decide? Pick any that apply.`;
  }
  return c.isTrial
    ? 'Your free trial has ended. What stopped you subscribing? Pick any that apply.'
    : 'Your subscription has ended. What made you leave? Pick any that apply.';
}

/**
 * Asks once per cancelled (or lapsed) trial or subscription why the user is leaving.
 * Answers and skips are both recorded server side, so the same cancellation is never
 * asked about twice. Hidden if the server does not support the survey yet.
 */
export function ExitSurveyPrompt({ trigger, enabled, onSettled }: Props) {
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const { customerInfo } = useSubscription();
  const [candidate, setCandidate] = useState<ExitSurveyCandidate | null>(null);
  const [picked, setPicked] = useState<ExitReason[]>([]);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [thanks, setThanks] = useState(false);
  const [validation, setValidation] = useState('');

  useEffect(() => {
    if (!enabled) return;
    const c = exitSurveyCandidate(customerInfo, trigger);
    if (!c) {
      onSettled?.();
      return;
    }
    let cancelled = false;
    getExitSurveyAnswered(c.key)
      .then((answered) => {
        if (cancelled) return;
        if (answered) onSettled?.();
        else setCandidate(c);
      })
      .catch(() => {
        if (!cancelled) onSettled?.();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, customerInfo, trigger]);

  const close = () => {
    setCandidate(null);
    setThanks(false);
    onSettled?.();
  };

  const save = async (skipped: boolean) => {
    if (!candidate) return;
    if (!skipped && picked.length === 0 && !comment.trim()) {
      setValidation('Pick a reason or write a comment.');
      return;
    }
    setSaving(true);
    try {
      await submitExitSurvey({
        key: candidate.key,
        trigger: candidate.trigger,
        period_type: candidate.periodType,
        product_id: candidate.productId,
        platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
        reasons: skipped ? [] : picked,
        comment: skipped ? undefined : comment.trim() || undefined,
        skipped,
      });
    } catch (e) {
      logError('[ExitSurveyPrompt] Failed to save answer:', e);
    } finally {
      setSaving(false);
    }
    if (skipped) close();
    else setThanks(true);
  };

  const toggle = (key: ExitReason) => {
    setValidation('');
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  };

  return (
    <Modal visible={enabled && !!candidate} transparent animationType="fade" onRequestClose={() => save(true)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <View style={styles.sheet}>
          {thanks ? (
            <>
              <Text style={styles.title}>Thank you</Text>
              <Text style={styles.body}>
                That helps us make SeaTime Tracker better. Your sea time stays safe in your account if you
                come back.
              </Text>
              <TouchableOpacity style={[styles.button, styles.primary]} onPress={close}>
                <Text style={styles.primaryText}>Close</Text>
              </TouchableOpacity>
            </>
          ) : candidate ? (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.title}>Sorry to see you go</Text>
              <Text style={styles.body}>{intro(candidate)}</Text>
              <View style={styles.chips}>
                {REASONS.map((r) => {
                  const on = picked.includes(r.key);
                  return (
                    <TouchableOpacity
                      key={r.key}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() => toggle(r.key)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.label}>Anything else? (optional)</Text>
              <TextInput
                style={styles.input}
                value={comment}
                onChangeText={(t) => {
                  setValidation('');
                  setComment(t);
                }}
                placeholder="Tell us what would bring you back"
                placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
                multiline
                maxLength={2000}
              />
              {validation ? <Text style={styles.validation}>{validation}</Text> : null}
              <TouchableOpacity style={[styles.button, styles.primary]} onPress={() => save(false)} disabled={saving}>
                {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Submit</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.secondary]} onPress={() => save(true)} disabled={saving}>
                <Text style={styles.secondaryText}>Not now</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      padding: 24,
    },
    sheet: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 16,
      padding: 24,
      maxHeight: '90%',
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    body: {
      fontSize: 15,
      lineHeight: 21,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 16,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 16,
    },
    chip: {
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      borderRadius: 18,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    chipOn: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: {
      fontSize: 14,
      color: isDark ? colors.text : colors.textLight,
    },
    chipTextOn: {
      color: '#FFFFFF',
      fontWeight: '600',
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 6,
    },
    input: {
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
      borderRadius: 10,
      minHeight: 72,
      padding: 10,
      fontSize: 15,
      textAlignVertical: 'top',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    validation: {
      fontSize: 13,
      color: colors.error,
      marginBottom: 8,
    },
    button: {
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 8,
    },
    primary: {
      backgroundColor: colors.primary,
    },
    primaryText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    secondary: {
      borderWidth: 1,
      borderColor: isDark ? colors.border : colors.borderLight,
    },
    secondaryText: {
      color: isDark ? colors.text : colors.textLight,
      fontSize: 16,
      fontWeight: '600',
    },
  });
