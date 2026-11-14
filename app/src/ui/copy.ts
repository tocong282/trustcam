import { messages } from '../locale';
import { uiCopy, type Copy, type Language } from './theme';

// Existing consent, retention and error messages take precedence over UI defaults.
export const appCopy: Readonly<Record<Language, Copy & typeof messages.en>> = {
  vi: { ...uiCopy.vi, ...messages.vi },
  en: { ...uiCopy.en, ...messages.en },
};
