import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Dela_Gothic_One } from "next/font/google";
import GoogleLoginButton from "@/components/landing/GoogleLoginButton";
import { createClient } from "@/lib/supabase/server";

const DONATE_URL = process.env.NEXT_PUBLIC_DONATE_URL || "https://paypal.me/AkatsukiBank";

// Font "da copertina": supporta sia il latino sia kana/kanji.
const display = Dela_Gothic_One({ weight: "400", subsets: ["latin"], preload: false });

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  const { error, reason } = await searchParams;
  const authFailed = error === "auth_failed";
  const reasonText = typeof reason === "string" ? reason : null;

  return (
    <main className="manga-paper relative min-h-screen overflow-x-hidden">
      {/* Testata della rivista */}
      <div className="border-b-4 border-[#111] bg-[#111] text-[#f3eee2]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.25em] sm:px-6">
          <span className={display.className}>週刊 マンガコレクション</span>
          <span className="hidden sm:inline">N.1 · edizione speciale · prezzo: gratis</span>
          <span className="rounded-sm bg-[#e60012] px-2 py-0.5 text-white">新連載</span>
        </div>
      </div>

      {authFailed && (
        <div className="mx-auto mt-4 max-w-6xl px-4 sm:px-6">
          <div role="alert" className="border-[3px] border-[#111] bg-[#ffe600] px-4 py-3 text-sm font-bold shadow-[4px_4px_0_#111]">
            ⚠️ Accesso non riuscito{reasonText ? `: ${reasonText}` : ""}. Riprova.
          </div>
        </div>
      )}

      {/* HERO: la prima tavola */}
      <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-10 pt-10 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-16">
        <span
          aria-hidden="true"
          className={`${display.className} manga-vertical pointer-events-none absolute right-1 top-6 hidden text-sm tracking-[0.4em] text-[#111]/40 xl:block`}
        >
          君のコレクションには価値がある
        </span>

        <div className="manga-rise relative z-10">
          <p className="mb-4 inline-flex items-center gap-2 border-2 border-[#111] bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.2em]">
            <span className="text-[#e60012]">第1話</span> Capitolo 1
          </p>
          <h1 className={`${display.className} text-[2.6rem] leading-[1.02] sm:text-6xl lg:text-7xl`}>
            La tua
            <br />
            collezione
            <br />
            <span className="relative inline-block">
              <span className="relative z-10 text-[#e60012]">vale.</span>
              <span aria-hidden="true" className="absolute -bottom-1 left-0 right-0 h-4 -rotate-1 bg-[#ffe600]" />
            </span>
          </h1>
          <p className="mt-6 max-w-lg text-base font-medium leading-relaxed text-[#111]/80 sm:text-lg">
            Tankōbon, zashi di Shōnen Jump, prime stampe con OBI, pezzi gradati. Fotografali:{" "}
            <strong className="text-[#111]">Koma</strong> li riconosce, li cataloga e ti dice quanto valgono,
            sulle vendite reali in Giappone.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-5">
            <GoogleLoginButton label="Inizia la tua saga" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#111]/60">
              Gratis · nessuna carta · 10 secondi
            </span>
          </div>
        </div>

        <HeroBook />
      </section>

      {/* Nastro scorrevole */}
      <div className="relative -rotate-1 border-y-4 border-[#111] bg-[#e60012] py-2 text-white">
        <div className="overflow-hidden">
        <div className="manga-marquee flex w-max gap-10 whitespace-nowrap text-sm font-black uppercase tracking-[0.2em]">
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={i} aria-hidden={i > 0} className="flex shrink-0 gap-10 pr-10">
              <span>📸 Scatta</span>
              <span className={display.className}>ドン！</span>
              <span>💴 Valuta</span>
              <span className={display.className}>ゴゴゴ</span>
              <span>📈 Segui il valore</span>
              <span className={display.className}>バーン！</span>
              <span>🏷️ Metti in vendita</span>
              <span className={display.className}>ドドド</span>
              <span>🔗 Condividi</span>
            </span>
          ))}
        </div>
        </div>
      </div>

      {/* LA TAVOLA: funzionalità come vignette, lette da destra a sinistra */}
      <section className="mx-auto max-w-6xl px-4 pb-6 pt-16 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <h2 className={`${display.className} text-3xl sm:text-4xl`}>Come funziona</h2>
          <p className="text-xs font-bold uppercase tracking-widest text-[#111]/60">
            <span className="hidden md:inline">← si legge da destra a sinistra, come un vero manga</span>
            <span className="md:hidden">↓ una vignetta alla volta</span>
          </p>
        </div>

        <div dir="rtl" className="grid gap-4 border-4 border-[#111] bg-[#111] p-4 md:grid-cols-6">
          <Koma n={1} title="Scatta" sfx="カシャッ" className="md:col-span-4 md:row-span-2" tone>
            <p>
              Una o più foto: copertina, dorso, colophon. Koma legge serie, numero, lingua, editore,
              prima stampa, OBI, sigillato e condizione.
            </p>
            <ScanDemo />
          </Koma>

          <Koma n={2} title="Valuta" sfx="ズキューン" className="md:col-span-2">
            <p>
              Vendite concluse in Giappone tramite <b>West Blue</b>. Per edizioni italiane, francesi e
              zashi recenti, gli annunci <b>eBay</b> del mercato giusto.
            </p>
            <PriceTag />
          </Koma>

          <Koma n={3} title="Segui il valore" className="md:col-span-2">
            <p>Ogni rivalutazione finisce nello storico: vedi la collezione salire (o scendere).</p>
            <Sparkline />
          </Koma>

          <Koma n={4} title="Parla con Koma" className="md:col-span-3">
            <ChatDemo />
          </Koma>

          <Koma n={5} title="Mostrala. Vendila." sfx="バーン" className="md:col-span-3" tone>
            <p>
              Un link pubblico in sola lettura per amici e acquirenti. Tagga i pezzi{" "}
              <span className="inline-block -rotate-3 bg-[#e60012] px-1.5 text-xs font-black text-white">IN VENDITA</span>{" "}
              e filtrali in un attimo.
            </p>
          </Koma>

          <Koma n={6} title="Anche da ChatGPT" className="md:col-span-6">
            <div className="flex flex-wrap items-center justify-between gap-4" dir="ltr">
              <p className="max-w-2xl">
                Colleghi il connettore <b>MCP</b> a ChatGPT e scansioni i volumi direttamente dalla chat che
                usi già. Finiscono tutti nella stessa collezione.
              </p>
              <code className="border-2 border-[#111] bg-[#111] px-3 py-1.5 font-mono text-xs text-[#ffe600]">
                /api/mcp · Bearer ••••••
              </code>
            </div>
          </Koma>
        </div>
      </section>

      {/* Ultima vignetta: つづく */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6">
        <div className="relative overflow-hidden border-4 border-[#111] bg-white px-6 py-12 text-center shadow-[10px_10px_0_#111] sm:px-12">
          <div aria-hidden="true" className="manga-speedlines absolute -inset-[40%] opacity-[0.12]" />
          <div className="relative">
            <p className={`${display.className} text-5xl text-[#e60012] sm:text-7xl`}>つづく…</p>
            <p className="mt-3 text-sm font-bold uppercase tracking-[0.3em] text-[#111]/60">
              Il prossimo capitolo lo scrivi tu
            </p>
            <div className="mt-8 flex justify-center">
              <GoogleLoginButton label="Apri la tua collezione" variant="paper" />
            </div>
          </div>
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 text-xs font-bold uppercase tracking-wider text-[#111]/60">
          <span className={display.className}>マンガコレクション · Manga Collection</span>
          <a
            href={DONATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="border-2 border-[#111] bg-[#ffe600] px-3 py-1 text-[#111] shadow-[3px_3px_0_#111] transition hover:-translate-y-0.5"
          >
            ☕ Offri un caffè all&apos;autore
          </a>
        </footer>
      </section>
    </main>
  );
}

/** Vignetta: bordo a inchiostro, numero di lettura, onomatopea opzionale. */
function Koma({
  n,
  title,
  sfx,
  tone = false,
  className = "",
  children,
}: {
  n: number;
  title: string;
  sfx?: string;
  tone?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <article
      dir="ltr"
      className={`manga-rise group relative overflow-hidden bg-white p-5 text-[15px] leading-relaxed transition-transform duration-200 hover:-rotate-[0.6deg] hover:scale-[1.01] sm:p-6 ${sfx ? "pb-16 sm:pb-16" : ""} ${className}`}
      style={{ animationDelay: `${n * 80}ms` }}
    >
      {tone && <div aria-hidden="true" className="manga-tone absolute -right-10 -top-10 h-44 w-44 rounded-full opacity-[0.12]" />}
      <div className="relative">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#111] text-xs font-black text-white">
            {n}
          </span>
          <h3 className="text-xl font-black uppercase tracking-tight">{title}</h3>
        </div>
        {children}
      </div>
      {sfx && (
        <span
          aria-hidden="true"
          className="manga-sfx pointer-events-none absolute bottom-3 right-4 font-black text-[#e60012] opacity-90 [-webkit-text-stroke:1.5px_#111] [font-size:clamp(1.6rem,3vw,2.4rem)]"
        >
          {sfx}
        </span>
      )}
    </article>
  );
}

/** Tankōbon in 3D disegnato in CSS, con la fascia OBI. */
function HeroBook() {
  return (
    <div className="relative mx-auto flex h-[380px] w-full max-w-[420px] items-center justify-center sm:h-[440px]">
      <div aria-hidden="true" className="manga-speedlines absolute -inset-10 opacity-20" />
      <div aria-hidden="true" className="absolute h-72 w-72 rounded-full bg-[#ffe600] sm:h-80 sm:w-80" />

      <div className="relative [perspective:1200px]">
        <div className="manga-book relative h-[300px] w-[200px] sm:h-[340px] sm:w-[226px]">
          {/* Dorso */}
          <div
            className="absolute left-0 top-0 flex h-full w-[38px] origin-left flex-col items-center justify-between border-[3px] border-[#111] bg-[#e60012] py-3 text-white"
            style={{ transform: "rotateY(-90deg) translateX(-38px)" }}
          >
            <span className="text-[10px] font-black">1</span>
            <span className="manga-vertical text-xs font-black tracking-widest">マンガコレクション</span>
            <span className="text-[9px] font-black">JC</span>
          </div>
          {/* Copertina */}
          <div className="absolute inset-0 overflow-hidden border-[3px] border-[#111] bg-white shadow-[12px_12px_0_#111]">
            <div className="manga-tone absolute inset-0 opacity-[0.15]" />
            <div className="absolute inset-x-0 top-0 flex items-start justify-between bg-[#111] px-3 py-2 text-white">
              <span className="text-[9px] font-black uppercase leading-tight tracking-widest">
                Manga
                <br />
                Collection
              </span>
              <span className="text-4xl font-black leading-none text-[#ffe600]">1</span>
            </div>
            <div className="absolute inset-x-0 top-[26%] flex justify-center">
              <span className="manga-vertical text-5xl font-black text-[#111] [-webkit-text-stroke:1px_#111]">
                漫画
              </span>
            </div>
            <div className="absolute left-3 top-[30%] h-24 w-1 -rotate-12 bg-[#e60012]" />
            <div className="absolute right-5 top-[40%] h-16 w-1 rotate-12 bg-[#111]" />
            {/* Fascia OBI */}
            <div className="absolute inset-x-0 bottom-0 h-[28%] border-t-[3px] border-[#111] bg-[#ffe600] px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-wider">Valore stimato</p>
              <p className="text-2xl font-black leading-tight">¥ → €</p>
              <p className="text-[9px] font-bold uppercase text-[#111]/70">初版 · prima stampa</p>
            </div>
          </div>
        </div>
      </div>

      <span
        aria-hidden="true"
        className="manga-sfx absolute -left-4 -top-2 z-10 text-5xl font-black text-[#e60012] [-webkit-text-stroke:2px_#111] sm:text-6xl"
      >
        ドン！
      </span>
      <div className="absolute -right-1 bottom-6 max-w-[170px] rotate-3 rounded-[50%] border-[3px] border-[#111] bg-white px-5 py-4 text-center text-xs font-black leading-snug shadow-[4px_4px_0_#111] sm:right-0">
        “Prima stampa con OBI? Vale ~380 €!”
      </div>
    </div>
  );
}

function ScanDemo() {
  const rows: [string, string][] = [
    ["Serie", "One Piece"],
    ["Volume", "#1"],
    ["Lingua", "Giapponese"],
    ["Stampa", "初版 · 1ª"],
    ["OBI", "Sì"],
    ["Stato", "Ottimo"],
  ];
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-[140px_1fr]">
      <div className="relative mx-auto h-[190px] w-[130px] border-[3px] border-[#111] bg-[#111]">
        <div className="absolute inset-2 border-2 border-dashed border-[#ffe600]" />
        <div className="absolute inset-x-2 top-1/2 h-0.5 animate-pulse bg-[#e60012] shadow-[0_0_12px_#e60012]" />
        <span className="absolute bottom-2 left-0 right-0 text-center text-[10px] font-black uppercase tracking-widest text-[#ffe600]">
          scansione…
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-2 self-center text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="border-2 border-[#111] bg-[#f3eee2] px-2.5 py-1.5">
            <dt className="text-[10px] font-black uppercase tracking-wider text-[#111]/60">{label}</dt>
            <dd className="font-black">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PriceTag() {
  return (
    <div className="mt-4 -rotate-2 border-[3px] border-[#111] bg-[#ffe600] p-3 shadow-[4px_4px_0_#111]">
      <p className="text-[10px] font-black uppercase tracking-widest">Mediana di 755 vendite</p>
      <p className="text-3xl font-black">380 €</p>
      <p className="text-[10px] font-bold uppercase text-[#111]/70">One Piece 1 · 初版 · RAW</p>
    </div>
  );
}

function Sparkline() {
  return (
    <svg viewBox="0 0 200 70" className="mt-4 h-20 w-full" role="img" aria-label="Andamento del valore in crescita">
      <path d="M0 69 H200" stroke="#111" strokeWidth="2" />
      <path
        className="manga-draw"
        d="M2 58 L28 52 L50 55 L74 40 L98 44 L122 30 L146 33 L170 16 L196 8"
        fill="none"
        stroke="#e60012"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="196" cy="8" r="5" fill="#ffe600" stroke="#111" strokeWidth="2" />
    </svg>
  );
}

function ChatDemo() {
  return (
    <div className="space-y-3 text-sm">
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-none border-2 border-[#111] bg-[#111] px-4 py-2.5 font-medium text-white">
        Ho preso la Jump 36-37 del 2025, quanto vale?
      </div>
      <div className="flex items-start gap-2">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[#111] bg-[#e60012] font-black text-white"
          aria-hidden="true"
        >
          コ
        </span>
        <div className="max-w-[85%] rounded-2xl rounded-tl-none border-2 border-[#111] bg-white px-4 py-2.5 font-medium">
          Numero doppio, bello! Mediana di 106 annunci: <b>~158 €</b>. La aggiungo alla collezione?
        </div>
      </div>
    </div>
  );
}
