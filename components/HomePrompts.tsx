import React, { useEffect, useState } from 'react';
import { MarketingConsentPrompt } from '@/components/MarketingConsentPrompt';
import { ExitSurveyPrompt } from '@/components/ExitSurveyPrompt';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { proPurchasedAt } from '@/utils/exitSurvey';
import { maybeRequestReview } from '@/utils/reviewPrompt';

/** Let Home settle before the native review sheet can appear. */
const REVIEW_DELAY_MS = 2500;

interface Props {
  /** False while Home is loading or another modal (e.g. Add Vessel) is open. */
  enabled: boolean;
}

/**
 * The Home screen's one-at-a-time questions, so two modals never stack:
 * marketing email consent (never asked) -> exit survey (cancelled) -> store review (due).
 */
export function HomePrompts({ enabled }: Props) {
  const { user } = useAuth();
  const { customerInfo, isSubscribed } = useSubscription();
  const [step, setStep] = useState<'consent' | 'exit' | 'review'>('consent');

  useEffect(() => {
    if (!enabled || step !== 'review' || !user?.id || !isSubscribed) return;
    const timer = setTimeout(() => {
      maybeRequestReview(user.id, proPurchasedAt(customerInfo));
    }, REVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [enabled, step, user?.id, isSubscribed, customerInfo]);

  return (
    <>
      <MarketingConsentPrompt enabled={enabled && step === 'consent'} onSettled={() => setStep('exit')} />
      <ExitSurveyPrompt trigger="cancelled" enabled={enabled && step === 'exit'} onSettled={() => setStep('review')} />
    </>
  );
}
