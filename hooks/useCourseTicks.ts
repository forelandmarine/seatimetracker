import { useState } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Certificate, createCertificate, deleteCertificate } from '@/utils/certificatesApi';
import { cancelCertificateExpiryReminders } from '@/utils/notifications';
import { certificateTypeFor, isEmptyCertificate } from '@/utils/courseChecklist';
import { error as logError } from '@/utils/log';

/**
 * Tickboxes for courses on the oral checklist and the Certificates screen.
 * A tick saves a certificate with just its type, so the details can be added later.
 * Unticking an empty record deletes it; a record with details asks first.
 */
export function useCourseTicks(onChange: () => Promise<void> | void) {
  const { t } = useTranslation();
  const [savingCode, setSavingCode] = useState<string | null>(null);

  const tick = async (code: string) => {
    setSavingCode(code);
    try {
      await createCertificate({ certificate_type: certificateTypeFor(code), notes: t('certChecker.tickedNote') });
      await onChange();
    } catch (err: any) {
      logError('[CourseTicks] tick failed', err);
      Alert.alert(t('certChecker.saveFailed'), err?.message ?? t('certChecker.tryAgain'));
    } finally {
      setSavingCode(null);
    }
  };

  const remove = async (code: string, cert: Certificate) => {
    setSavingCode(code);
    try {
      await deleteCertificate(cert.id);
      await cancelCertificateExpiryReminders(cert.id);
      await onChange();
    } catch (err: any) {
      logError('[CourseTicks] untick failed', err);
      Alert.alert(t('certChecker.removeFailed'), err?.message ?? t('certChecker.tryAgain'));
    } finally {
      setSavingCode(null);
    }
  };

  const untick = (code: string, name: string, cert: Certificate) => {
    // A record saved under another type (e.g. STCW Basic Safety) can cover several courses.
    const shared = cert.certificate_type !== certificateTypeFor(code);
    if (isEmptyCertificate(cert) && !shared) {
      remove(code, cert);
      return;
    }
    Alert.alert(
      t('certChecker.untickTitle', { name }),
      shared ? t('certChecker.untickSharedBody') : t('certChecker.untickBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('certChecker.untick'), style: 'destructive', onPress: () => remove(code, cert) },
      ],
    );
  };

  return { savingCode, tick, untick };
}
