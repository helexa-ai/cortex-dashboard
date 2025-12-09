import i18n, { type Resource } from "i18next";
import { initReactI18next } from "react-i18next";
import {
  SUPPORTED_LANGUAGES,
  normalizeLocaleToLanguage,
  isRtlLanguage,
} from "./languages";
import type { LanguageCode } from "./languages";

// Core languages
import enCommon from "./resources/en/common.json";

/**
 * Application translation resources, split by language and namespace.
 *
 * - `common`: shared UI elements (navigation, theme toggle, etc.)
 * - `home`:   marketing / narrative copy on the landing page
 * - `chat`:   copy for the chat workspace
 */
const resources: Resource = {
  en: {
    common: enCommon,
  },
};

// Determine initial language from browser, normalised to language-only.
const browserLang: LanguageCode =
  typeof navigator !== "undefined"
    ? normalizeLocaleToLanguage(navigator.language)
    : "en";

// Keep document direction (ltr/rtl) in sync with the active language.
if (typeof document !== "undefined") {
  document.documentElement.dir = isRtlLanguage(browserLang) ? "rtl" : "ltr";
}

/**
 * Initialize i18next with React bindings.
 *
 * This module is imported once in src/main.tsx before any React
 * rendering so that `useTranslation` is ready everywhere.
 */
i18n.use(initReactI18next).init({
  resources,
  lng: browserLang,
  fallbackLng: "en",
  supportedLngs: SUPPORTED_LANGUAGES,
  ns: ["common"],
  defaultNS: "common",
  // Because we control the keys and interpolate only simple values.
  interpolation: {
    escapeValue: false,
  },
  // For now we stay language-only; we already normalise the browser locale.
  load: "languageOnly",
  // Be explicit about react options for clarity.
  react: {
    useSuspense: false,
  },
});

// Ensure that when the language changes at runtime, document direction
// tracks the new language's natural writing direction.
i18n.on("languageChanged", (lng) => {
  if (typeof document === "undefined") return;
  const lang = normalizeLocaleToLanguage(lng);
  document.documentElement.dir = isRtlLanguage(lang) ? "rtl" : "ltr";
});

export default i18n;
