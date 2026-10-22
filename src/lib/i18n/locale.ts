export type Locale = "it" | "en";

export const LOCALES: Locale[] = ["it", "en"];
export const DEFAULT_LOCALE: Locale = "it";
export const LOCALE_COOKIE = "locale";
/** Un anno, in secondi: durata della preferenza lingua salvata nel cookie. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "it" || value === "en";
}

/**
 * Determina la lingua in base alla localizzazione del browser dell'utente
 * (header Accept-Language), NON in base alla geolocalizzazione/IP: se la
 * lingua preferita del browser è l'italiano usiamo l'italiano, altrimenti
 * l'inglese per tutti gli altri casi.
 */
export function detectLocaleFromAcceptLanguage(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const primary = acceptLanguage.split(",")[0]?.split(";")[0]?.trim().toLowerCase() ?? "";
  return primary.startsWith("it") ? "it" : "en";
}
