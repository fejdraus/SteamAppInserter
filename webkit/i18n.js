import en from "../locales/en.js";
import es from "../locales/es.js";
import fr from "../locales/fr.js";
import ptBR from "../locales/pt-BR.js";
import ru from "../locales/ru.js";
import uk from "../locales/uk.js";

const FALLBACK_LOCALE = "en";

const STATIC_TRANSLATIONS = {
  en,
  es,
  fr,
  "pt-BR": ptBR,
  ru,
  uk,
};

function normaliseLocale(locale) {
  if (!locale || typeof locale !== "string") {
    return FALLBACK_LOCALE;
  }

  const trimmed = locale.trim();
  if (!trimmed) {
    return FALLBACK_LOCALE;
  }

  const lower = trimmed.toLowerCase();
  if (lower === "pt-br" || lower === "pt_br") return "pt-BR";
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("es")) return "es";
  if (lower.startsWith("fr")) return "fr";
  if (lower.startsWith("ru")) return "ru";
  if (lower === "ua" || lower.startsWith("uk")) return "uk";
  if (lower === "ukrainian") return "uk";

  const base = lower.split(/[-_]/)[0];
  const matched = Object.keys(STATIC_TRANSLATIONS).find(
    (code) => code.toLowerCase() === base,
  );
  return matched ?? FALLBACK_LOCALE;
}

class I18n {
  constructor() {
    this.translations = new Map();
    this.currentLocale = FALLBACK_LOCALE;
    this.initialised = false;
    this.initPromise = null;
  }

  async init() {
    if (this.initialised) {
      return;
    }

    if (!this.initPromise) {
      this.initPromise = this.bootstrap();
    }

    await this.initPromise;
    this.initialised = true;
  }

  t(key, vars) {
    const resolved =
      this.lookup(this.currentLocale, key) ??
      this.lookup(FALLBACK_LOCALE, key) ??
      key;

    if (typeof resolved !== "string") {
      return key;
    }

    if (!vars) {
      return resolved;
    }

    return resolved.replace(/\{(.*?)\}/g, (_, token) => {
      const value = vars[token.trim()];
      return value === undefined || value === null ? "" : String(value);
    });
  }

  async bootstrap() {
    const preferred = normaliseLocale(this.detectPreferredLocale());
    this.loadLocale(preferred);

    if (!this.translations.has(preferred) && preferred !== FALLBACK_LOCALE) {
      this.loadLocale(FALLBACK_LOCALE);
      this.currentLocale = FALLBACK_LOCALE;
      return;
    }

    this.currentLocale = preferred;
  }

  detectPreferredLocale() {
    const candidates = [];

    if (typeof window !== "undefined") {
      const steamLanguage =
        window?.g_strLanguage ||
        window?.LocalizationManager?.m_strLanguage ||
        window?.SteamClient?.System?.GetSteamUILanguage?.();
      if (steamLanguage) {
        candidates.push(steamLanguage);
      }
    }

    if (typeof navigator !== "undefined") {
      if (Array.isArray(navigator.languages)) {
        candidates.push(...navigator.languages);
      }
      if (navigator.language) {
        candidates.push(navigator.language);
      }
      if (navigator.userLanguage) {
        candidates.push(navigator.userLanguage);
      }
    }

    const found = candidates.find((locale) => {
      const normalised = normaliseLocale(locale);
      return normalised !== FALLBACK_LOCALE || locale === FALLBACK_LOCALE;
    });

    return found ?? FALLBACK_LOCALE;
  }

  loadLocale(locale) {
    if (this.translations.has(locale)) {
      return;
    }

    const data = STATIC_TRANSLATIONS[locale];
    if (data) {
      this.translations.set(locale, data);
    }
  }

  lookup(locale, key) {
    const translations = this.translations.get(locale);
    if (!translations) {
      return undefined;
    }

    return key.split(".").reduce((value, segment) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value[segment];
      }
      return undefined;
    }, translations);
  }
}

const i18nInstance = new I18n();

export async function initI18n() {
  await i18nInstance.init();
}

export function t(key, vars) {
  return i18nInstance.t(key, vars);
}
