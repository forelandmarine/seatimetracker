/**
 * i18next setup for SeaTime Tracker.
 *
 * Currently supports English (full) and stubs for French, Italian, Spanish.
 * Defaults to device language with English fallback.
 *
 * Adding strings:
 *   1. Add the key to en.json
 *   2. Run translation tooling (or hand-translate) to other locales
 *   3. Use t('key') in components
 *
 * NOTE: Set up only — most screens still use literal strings. Migration to
 * t() will happen incrementally as screens are touched.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import es from './locales/es.json';

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  it: { translation: it },
  es: { translation: es },
};

// Detect device locale lazily (so import works in environments without expo-localization)
function detectLanguage(): string {
  try {
    // Avoid hard import — expo-localization may not be installed in all environments
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Localization = require('expo-localization');
    const locale = Localization.getLocales()?.[0]?.languageCode || 'en';
    return ['en', 'fr', 'it', 'es'].includes(locale) ? locale : 'en';
  } catch {
    return 'en';
  }
}

i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React already escapes
  },
  compatibilityJSON: 'v4',
});

export default i18n;

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'es', label: 'Español' },
];

export function changeLanguage(lng: string): Promise<void> {
  return new Promise((resolve) => {
    i18n.changeLanguage(lng).then(() => resolve());
  });
}
