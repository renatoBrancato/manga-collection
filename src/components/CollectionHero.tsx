import type { ReactNode } from "react";

/**
 * Header condiviso tra la dashboard e la vista pubblica in sola lettura.
 *
 * Entrambe le pagine devono restare allineate graficamente: tenerlo in un
 * unico componente evita che una delle due resti indietro quando l'hero
 * viene aggiornato. Le differenze (azioni, testi, sottotitolo) sono passate
 * come prop invece di essere duplicate nel markup.
 */
export default function CollectionHero({
  eyebrow = "私のコレクション · Manga Collection",
  title,
  highlight,
  description,
  footer,
  actions,
}: {
  eyebrow?: string;
  title: string;
  highlight: string;
  description: string;
  footer?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="relative mb-7 overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/30">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-[center_25%] opacity-60 lg:hidden"
        style={{ backgroundImage: "url('/manga-heroes.gif')" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 hidden w-[72%] bg-contain bg-right bg-no-repeat lg:block"
        style={{ backgroundImage: "url('/manga-heroes-desktop.png')" }}
      />
      <div className="absolute inset-0 bg-slate-950/55 lg:hidden" />
      <div className="absolute inset-0 hidden bg-gradient-to-r from-slate-950 via-slate-950/95 via-38% to-transparent lg:block" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_22%,rgba(99,102,241,0.3),transparent_34%)] lg:w-[58%]" />

      <div className="relative flex min-h-[255px] flex-col justify-between gap-8 p-6 sm:p-8 lg:w-[58%] lg:p-10">
        {actions ? (
          <nav className="flex flex-wrap items-center gap-2.5">{actions}</nav>
        ) : (
          <span aria-hidden="true" />
        )}

        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-indigo-300">
            <span className="h-px w-8 bg-indigo-400" />
            {eyebrow}
          </div>
          <h1 className="max-w-xl text-3xl font-black leading-tight text-white sm:text-4xl">
            {title}
            <span className="block bg-gradient-to-r from-indigo-300 via-violet-200 to-pink-300 bg-clip-text text-transparent">
              {highlight}
            </span>
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-300 sm:text-base">{description}</p>
          {footer && <div className="mt-4 text-xs text-slate-500">{footer}</div>}
        </div>
      </div>
    </header>
  );
}
