import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaritimeAuthority } from '@/constants/mcaRequirements';
import { warn } from '@/utils/log';

/**
 * Whether the user holds the record of training their authority reduces sea
 * service for: an AMSA task book, or a Maritime NZ training record book or
 * cadet programme.
 *
 * It matters because it roughly halves most AMSA requirements and changes which
 * route an MNZ applicant is on, so measuring a holder against the longer figure
 * tells them they are further from the certificate than they are.
 *
 * The profile API carries this as `has_record_book`. Until that column is live
 * the value is kept on the device, so the setting works now and follows the
 * user to a new device once the server field is deployed. A server value always
 * wins over the local copy.
 */

const STORAGE_KEY = 'seatime.has_record_book';

/** Authorities where the setting means anything. */
export const authorityUsesRecordBook = (
  authority: MaritimeAuthority | null | undefined,
): boolean => authority === 'amsa' || authority === 'mnz';

export async function getRecordBookFlag(serverValue?: boolean | null): Promise<boolean> {
  if (typeof serverValue === 'boolean') return serverValue;
  try {
    return (await AsyncStorage.getItem(STORAGE_KEY)) === 'true';
  } catch (e) {
    warn('[recordBook] could not read the stored flag', e);
    return false;
  }
}

export async function setRecordBookFlag(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
  } catch (e) {
    warn('[recordBook] could not store the flag', e);
  }
}
