import { LOCALES, resolveLocale, translate, type Locale } from "../../shared/translations";
export { LOCALES };
const STORAGE_KEY = "mcdash.language";

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "de") return saved;
  } catch { /* Storage may be disabled. */ }
  return resolveLocale(typeof navigator === "undefined" ? "en" : navigator.language);
}

class Language {
  locale = $state<Locale>(initialLocale());
  set(value: string): void {
    this.locale = resolveLocale(value);
    try { localStorage.setItem(STORAGE_KEY, this.locale); } catch { /* optional persistence */ }
  }
}
export const language = new Language();
export function t(key: string | null | undefined, params: Record<string, string | number> = {}): string {
  return translate(language.locale, key ?? "", params);
}
export function intlLocale(): string { return language.locale === "de" ? "de-DE" : "en-GB"; }
