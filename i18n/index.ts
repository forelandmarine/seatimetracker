/**
 * i18next setup for SeaTime Tracker.
 *
 * 6 languages chosen for the global maritime / yacht crew workforce.
 * Defaults to device language with English fallback.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import fr from './locales/fr.json';
import it from './locales/it.json';
import es from './locales/es.json';
import hr from './locales/hr.json';
import tl from './locales/tl.json';

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  it: { translation: it },
  es: { translation: es },
  hr: { translation: hr },
  tl: { translation: tl },
};

const SUPPORTED_CODES = Object.keys(resources);

function detectLanguage(): string {
  try {
    const Localization = require('expo-localization');
    const raw = Localization.getLocales()?.[0]?.languageCode || 'en';
    if (raw === 'fil') return 'tl';
    return SUPPORTED_CODES.includes(raw) ? raw : 'en';
  } catch {
    return 'en';
  }
}

i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

export default i18n;

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Fran\u00e7ais' },
  { code: 'it', label: 'Italiano' },
  { code: 'es', label: 'Espa\u00f1ol' },
  { code: 'hr', label: 'Hrvatski' },
  { code: 'tl', label: 'Filipino' },
];

export function changeLanguage(lng: string): Promise<void> {
  return new Promise((resolve) => {
    i18n.changeLanguage(lng).then(() => resolve());
  });
}
