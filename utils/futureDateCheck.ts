import { Alert } from 'react-native';

/** Allowance for clock drift before a time counts as "in the future". */
const SLACK_MS = 15 * 60 * 1000;

const formatDate = (d: Date): string =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * If an entry starts or ends in the future, ask the user to confirm before
 * saving. The entry is still allowed; this never blocks it.
 *
 * Returns true when the pop-up was shown (the caller should stop and wait for
 * `onSaveAnyway`), or false when the dates are fine and the caller can save.
 */
export function confirmFutureDates(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
  onSaveAnyway: () => void
): boolean {
  const limit = Date.now() + SLACK_MS;
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;

  const startInFuture = !!startDate && startDate.getTime() > limit;
  const endInFuture = !!endDate && endDate.getTime() > limit;
  if (!startInFuture && !endInFuture) return false;

  const lead = startInFuture
    ? `This entry starts on ${formatDate(startDate!)}`
    : `This entry ends on ${formatDate(endDate!)}`;

  Alert.alert(
    'Date in the future',
    `${lead}, which is in the future. Sea time normally counts once it has happened. Save it anyway?`,
    [
      { text: 'Check dates', style: 'cancel' },
      { text: 'Save anyway', onPress: onSaveAnyway },
    ]
  );
  return true;
}
