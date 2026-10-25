import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  Platform,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Linking,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import * as seaTimeApi from '@/utils/seaTimeApi';
import type { PathwayAnswer, PathwayQuota } from '@/utils/seaTimeApi';
import { error as logError } from '@/utils/log';

const SUGGESTIONS = [
  'What do I need for OOW Yachts less than 3000 GT?',
  'Does yard time count as sea service?',
  'How do I get my testimonials signed?',
  'What is a Notice of Eligibility and when do I apply?',
  'Which courses do I need before my oral exam?',
];

const MAX_LENGTH = 500;

interface Turn {
  question: string;
  id?: string;
  answer?: PathwayAnswer;
  error?: string;
  rating?: 1 | -1;
}

type Blocked = { code: seaTimeApi.PathwayLimitError['code']; message: string } | null;

const createStyles = (isDark: boolean) => {
  const text = isDark ? colors.text : colors.textLight;
  const muted = isDark ? colors.textSecondary : colors.textSecondaryLight;
  const card = isDark ? colors.cardBackground : colors.card;
  const border = isDark ? colors.border : colors.borderLight;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? colors.background : colors.backgroundLight },
    scrollContent: { padding: 20, paddingTop: Platform.OS === 'android' ? 48 : 20, paddingBottom: 24 },
    title: { fontSize: 28, fontWeight: 'bold', color: text, marginBottom: 8 },
    subtitle: { fontSize: 15, color: muted, lineHeight: 21, marginBottom: 16 },
    quota: { fontSize: 13, color: muted, marginBottom: 12 },
    sectionLabel: { fontSize: 13, fontWeight: '600', color: muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    chip: {
      backgroundColor: card,
      borderColor: border,
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: 8,
    },
    chipText: { fontSize: 15, color: text },
    questionBubble: {
      alignSelf: 'flex-end',
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingVertical: 10,
      paddingHorizontal: 14,
      maxWidth: '85%',
      marginBottom: 10,
      marginTop: 6,
    },
    questionText: { color: colors.white, fontSize: 15, lineHeight: 21 },
    answerCard: { backgroundColor: card, borderColor: border, borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 12 },
    shortAnswer: { fontSize: 16, color: text, lineHeight: 23, fontWeight: '500' },
    stepRow: { flexDirection: 'row', marginTop: 12 },
    stepNumber: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
      marginTop: 1,
    },
    stepNumberText: { color: colors.white, fontSize: 13, fontWeight: '700' },
    stepBody: { flex: 1 },
    stepTitle: { fontSize: 15, fontWeight: '600', color: text },
    stepDetail: { fontSize: 14, color: muted, lineHeight: 20, marginTop: 2 },
    forYou: {
      marginTop: 14,
      padding: 12,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(0,168,232,0.12)' : 'rgba(0,119,190,0.08)',
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
    },
    forYouLabel: { fontSize: 12, fontWeight: '700', color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    forYouText: { fontSize: 14, color: text, lineHeight: 20 },
    sourcesLabel: { fontSize: 12, fontWeight: '600', color: muted, marginTop: 14, marginBottom: 6 },
    sourceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
    sourceText: { flex: 1, fontSize: 13, color: colors.primary, marginLeft: 6 },
    sourceTextPlain: { flex: 1, fontSize: 13, color: muted, marginLeft: 6 },
    disclaimer: { fontSize: 12, color: muted, marginTop: 12, lineHeight: 17 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
    ratingLabel: { fontSize: 13, color: muted, marginRight: 8 },
    ratingButton: { padding: 6, marginRight: 4 },
    followUps: { marginTop: 4, marginBottom: 8 },
    thinking: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
    thinkingText: { marginLeft: 10, color: muted, fontSize: 14 },
    errorText: { color: colors.error, fontSize: 14, marginBottom: 12 },
    blockedCard: { backgroundColor: card, borderColor: border, borderWidth: 1, borderRadius: 14, padding: 16, marginTop: 8 },
    blockedText: { fontSize: 15, color: text, lineHeight: 21, marginBottom: 12 },
    primaryButton: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
    primaryButtonText: { color: colors.white, fontSize: 16, fontWeight: '600' },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: Platform.OS === 'ios' ? 28 : 12,
      borderTopWidth: 1,
      borderTopColor: border,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      backgroundColor: card,
      borderColor: border,
      borderWidth: 1,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 12,
      fontSize: 16,
      color: text,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
    },
    sendButtonDisabled: { opacity: 0.4 },
  });
};

/**
 * "Explain training pathways": plain-language questions answered from the MCA
 * guidance library, personalised with the user's logged service where it matters.
 * Shared by iOS and Android; trial users get 5 questions, subscribers a daily cap.
 */
export default function PathwayAssistantScreen() {
  const isDark = useColorScheme() === 'dark';
  const styles = useMemo(() => createStyles(isDark), [isDark]);
  const scrollRef = useRef<ScrollView>(null);

  const [quota, setQuota] = useState<PathwayQuota | null>(null);
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [asking, setAsking] = useState(false);
  const [blocked, setBlocked] = useState<Blocked>(null);

  useEffect(() => {
    seaTimeApi
      .getPathwayQuota()
      .then((q) => {
        setQuota(q);
        if (!q.allowed) {
          setBlocked(
            q.period === 'trial'
              ? { code: 'trial_limit_reached', message: `You've used your ${q.limit} trial questions. Subscribe to keep asking.` }
              : q.period === 'day'
                ? { code: 'daily_limit_reached', message: "You've reached today's question limit. Try again tomorrow." }
                : { code: 'subscription_required', message: 'Pathway answers are part of a SeaTime subscription.' },
          );
        }
      })
      .catch((e) => logError('[PathwayAssistant] quota failed', e?.message || e));
  }, []);

  const ask = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (question.length < 3 || asking || blocked) return;
      setInput('');
      setAsking(true);
      setTurns((t) => [...t, { question }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);

      try {
        const result = await seaTimeApi.askPathwayQuestion(question, conversationId);
        setConversationId(result.conversation_id);
        setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, id: result.id, answer: result.answer } : turn)));
        setQuota((q) => (q ? { ...q, remaining: result.remaining, used: q.used + 1, allowed: result.remaining > 0 } : q));
      } catch (e: any) {
        if (e instanceof seaTimeApi.PathwayLimitError) {
          setBlocked({ code: e.code, message: e.message });
          setTurns((t) => t.slice(0, -1));
        } else {
          logError('[PathwayAssistant] ask failed', e?.message || e);
          setTurns((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, error: e?.message || 'Something went wrong. Please try again.' } : turn)));
        }
      } finally {
        setAsking(false);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      }
    },
    [asking, blocked, conversationId],
  );

  const rate = useCallback(async (index: number, rating: 1 | -1) => {
    const turn = turns[index];
    if (!turn?.id || turn.rating) return;
    setTurns((t) => t.map((x, i) => (i === index ? { ...x, rating } : x)));
    try {
      await seaTimeApi.ratePathwayAnswer(turn.id, rating);
    } catch (e: any) {
      logError('[PathwayAssistant] rating failed', e?.message || e);
    }
  }, [turns]);

  const openSource = useCallback(async (url: string | null) => {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch (e: any) {
      logError('[PathwayAssistant] open source failed', e?.message || e);
    }
  }, []);

  const startOver = useCallback(() => {
    setTurns([]);
    setConversationId(undefined);
  }, []);

  // Trial users always see what is left; subscribers only once the daily cap is close.
  const quotaLine =
    quota?.period === 'trial'
      ? `${quota.remaining} of ${quota.limit} trial questions left`
      : quota?.period === 'day' && quota.remaining <= 5
        ? `${quota.remaining} questions left today`
        : null;

  const lastAnswer = [...turns].reverse().find((t) => t.answer)?.answer;
  const canSend = input.trim().length >= 3 && !asking && !blocked;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Ask about training',
          headerShown: true,
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: isDark ? colors.background : colors.backgroundLight },
          headerTintColor: isDark ? colors.text : colors.textLight,
          headerShadowVisible: false,
          headerRight: () =>
            turns.length > 0 ? (
              <TouchableOpacity onPress={startOver} accessibilityLabel="Start a new question">
                <Text style={{ color: colors.primary, fontSize: 16 }}>New</Text>
              </TouchableOpacity>
            ) : null,
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {turns.length === 0 && (
            <>
              <Text style={styles.title}>Explain my pathway</Text>
              <Text style={styles.subtitle}>
                Ask anything about MCA certificates, courses and sea time in plain words. Answers come from official MCA
                guidance and use your logged sea time where it helps.
              </Text>
              {quotaLine && <Text style={styles.quota}>{quotaLine}</Text>}
              {!blocked && (
                <>
                  <Text style={styles.sectionLabel}>Try asking</Text>
                  {SUGGESTIONS.map((s) => (
                    <TouchableOpacity key={s} style={styles.chip} onPress={() => ask(s)}>
                      <Text style={styles.chipText}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </>
          )}

          {turns.map((turn, index) => (
            <View key={index}>
              <View style={styles.questionBubble}>
                <Text style={styles.questionText}>{turn.question}</Text>
              </View>
              {turn.error && <Text style={styles.errorText}>{turn.error}</Text>}
              {turn.answer && (
                <View style={styles.answerCard}>
                  <Text style={styles.shortAnswer}>{turn.answer.short_answer}</Text>

                  {turn.answer.steps.map((step, i) => (
                    <View key={i} style={styles.stepRow}>
                      <View style={styles.stepNumber}>
                        <Text style={styles.stepNumberText}>{i + 1}</Text>
                      </View>
                      <View style={styles.stepBody}>
                        <Text style={styles.stepTitle}>{step.title}</Text>
                        <Text style={styles.stepDetail}>{step.detail}</Text>
                      </View>
                    </View>
                  ))}

                  {turn.answer.applies_to_you && (
                    <View style={styles.forYou}>
                      <Text style={styles.forYouLabel}>How this applies to you</Text>
                      <Text style={styles.forYouText}>{turn.answer.applies_to_you}</Text>
                    </View>
                  )}

                  {turn.answer.sources.length > 0 && (
                    <>
                      <Text style={styles.sourcesLabel}>Sources</Text>
                      {turn.answer.sources.map((s) => {
                        // Section paths from converted PDFs can be noisy, so the document title is shown on its own.
                        const label = s.title;
                        const tappable = !!s.url;
                        return (
                          <TouchableOpacity key={s.id} style={styles.sourceRow} disabled={!tappable} onPress={() => openSource(s.url)}>
                            <IconSymbol
                              ios_icon_name={s.source_type === 'official' ? 'checkmark.seal' : 'doc.text'}
                              android_material_icon_name={s.source_type === 'official' ? 'verified' : 'description'}
                              size={14}
                              color={tappable ? colors.primary : colors.textSecondary}
                            />
                            <Text style={tappable ? styles.sourceText : styles.sourceTextPlain} numberOfLines={2}>
                              {s.source_type === 'app_rules' ? `SeaTime requirement table: ${s.section ?? s.title}` : label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </>
                  )}

                  <Text style={styles.disclaimer}>
                    Guidance only, based on published MCA documents. The MCA makes the final decision, so confirm before you apply.
                  </Text>

                  <View style={styles.ratingRow}>
                    <Text style={styles.ratingLabel}>{turn.rating ? 'Thanks for the feedback' : 'Was this helpful?'}</Text>
                    {!turn.rating && (
                      <>
                        <TouchableOpacity style={styles.ratingButton} onPress={() => rate(index, 1)} accessibilityLabel="Helpful">
                          <IconSymbol ios_icon_name="hand.thumbsup" android_material_icon_name="thumb-up" size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.ratingButton} onPress={() => rate(index, -1)} accessibilityLabel="Not helpful">
                          <IconSymbol ios_icon_name="hand.thumbsdown" android_material_icon_name="thumb-down" size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              )}
            </View>
          ))}

          {asking && (
            <View style={styles.thinking}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.thinkingText}>Reading MCA guidance...</Text>
            </View>
          )}

          {!asking && !blocked && lastAnswer && lastAnswer.follow_ups.length > 0 && (
            <View style={styles.followUps}>
              {lastAnswer.follow_ups.map((f) => (
                <TouchableOpacity key={f} style={styles.chip} onPress={() => ask(f)}>
                  <Text style={styles.chipText}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {turns.length > 0 && quotaLine && <Text style={styles.quota}>{quotaLine}</Text>}

          {blocked && (
            <View style={styles.blockedCard}>
              <Text style={styles.blockedText}>{blocked.message}</Text>
              {(blocked.code === 'trial_limit_reached' || blocked.code === 'subscription_required') && (
                <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/paywall')}>
                  <Text style={styles.primaryButtonText}>See plans</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>

        {!blocked && (
          <View style={styles.inputBar}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder={turns.length ? 'Ask a follow-up' : 'Ask about your pathway'}
              placeholderTextColor={isDark ? colors.textSecondary : colors.textSecondaryLight}
              multiline
              maxLength={MAX_LENGTH}
              editable={!asking}
              returnKeyType="send"
              blurOnSubmit
              onSubmitEditing={() => ask(input)}
            />
            <TouchableOpacity
              style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
              disabled={!canSend}
              onPress={() => ask(input)}
              accessibilityLabel="Ask"
            >
              <IconSymbol ios_icon_name="arrow.up" android_material_icon_name="arrow-upward" size={20} color={colors.white} />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </>
  );
}
