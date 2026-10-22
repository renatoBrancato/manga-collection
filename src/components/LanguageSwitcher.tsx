"use client";

import { useTranslations } from "@/lib/i18n/LocaleProvider";

/** Selettore di lingua IT/EN, persistito in cookie e condiviso da tutta l'app. */
export default function LanguageSwitcher() {
  const { locale, setLocale } = useTranslations();

  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-white/10 text-xs font-semibold" role="group" aria-label="Lingua / Language">
      <button
        type="button"
        onClick={() => setLocale("it")}
        aria-pressed={locale === "it"}
        className={`px-2.5 py-1.5 transition ${locale === "it" ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}
      >
        IT
      </button>
      <button
        type="button"
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        className={`px-2.5 py-1.5 transition ${locale === "en" ? "bg-white/15 text-white" : "text-slate-400 hover:text-white"}`}
      >
        EN
      </button>
    </div>
  );
}
