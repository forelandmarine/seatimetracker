/**
 * i18next setup for SeaTime Tracker.
 *
 * Supports 15 languages chosen for the global maritime workforce: English,
 * French, Italian, Spanish, German, Portuguese, Dutch, Russian, Ukrainian,
 * Greek, Turkish, Polish, Croatian, Filipino (Tagalog), Indonesian, Chinese.
 *
 * Defaults to device language with English fallback.
 *
 * Adding strings:
 *   1. Add the key to en.json
 *   2. Translate to other locales (or hand-translate)
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
import de from './locales/de.json';
import pt from './locales/pt.json';
import nl from './locales/nl.json';
import ru from './locales/ru.json';
import uk from './locales/uk.json';
import el from './locales/el.json';
import tr from './locales/tr.json';
import hr from './locales/hr.json';
import tl from './locales/tl.json';
import id from './locales/id.json';
import zh from './locales/zh.json';

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  it: { translation: it },
  es: { translation: es },
  de: { translation: de },
  pt: { translation: pt },
  nl: { translation: nl },
  ru: { translation: ru },
  uk: { translation: uk },
  el: { translation: el },
  tr: { translation: tr },
  hr: { translation: hr },
  tl: { translation: tl },
  id: { translation: id },
  zh: { translation: zh },
};

const SUPPORTED_CODES = Object.keys(resources);

// Detect device locale lazily (so import works in environments without expo-localization)
function detectLanguage(): string {
  try {
    // Avoid hard import — expo-localization may not be installed in all environments
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Localization = require('expo-localization');
    const raw = Localization.getLocales()?.[0]?.languageCode || 'en';
    // Map common Filipino tags to 'tl'
    if (raw === 'fil') return SUPPORTED_CODES.includes('tl') ? 'tl' : 'en';
    return SUPPORTED_CODES.includes(raw) ? raw : 'en';
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
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'ru', label: 'Русский' },
  { code: 'uk', label: 'Українська' },
  { code: 'el', label: 'Ελληνικά' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'hr', label: 'Hrvatski' },
  { code: 'tl', label: 'Filipino' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'zh', label: '中文' },
];

export function changeLanguage(lng: string): Promise<void> {
  return new Promise((resolve) => {
    i18n.changeLanguage(lng).then(() => resolve());
  });
}
