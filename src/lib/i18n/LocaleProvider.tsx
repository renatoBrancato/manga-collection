"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "./locale";
import { dictionaries, type Dictionary } from "./dictionaries";

interface LocaleContextValue {
  locale: Locale;
  t: Dictionary;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Fornisce lingua e dizionario correnti a tutta l'app lato client. La
 * lingua iniziale arriva dal Server Component radice (cookie o rilevamento
 * da Accept-Language); da qui in poi lo switch aggiorna il cookie e
 * rinfresca i Server Component con `router.refresh()`.
 */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const router = useRouter();
  const [current, setCurrent] = useState<Locale>(locale);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale: current,
      t: dictionaries[current],
      setLocale: (next) => {
        if (next === current) return;
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
        setCurrent(next);
        router.refresh();
      },
    }),
    [current, router]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** Hook per leggere `locale`/`t` e cambiare lingua da un Client Component. */
export function useTranslations(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useTranslations deve essere usato dentro <LocaleProvider>");
  return ctx;
}
