import "server-only";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, detectLocaleFromAcceptLanguage, isLocale, LOCALE_COOKIE, type Locale } from "./locale";
import { dictionaries, type Dictionary } from "./dictionaries";

/**
 * Lingua corrente per i Server Component: preferenza salvata nel cookie se
 * presente, altrimenti rilevata dall'Accept-Language del browser (impostato
 * anche dal middleware alla prima visita).
 */
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const headerStore = await headers();
  return detectLocaleFromAcceptLanguage(headerStore.get("accept-language"));
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

/** Scorciatoia per i Server Component che devono solo leggere i testi tradotti. */
export async function getTranslations(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale) };
}
