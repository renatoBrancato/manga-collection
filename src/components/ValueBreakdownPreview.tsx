"use client";

import { useState } from "react";
import ValueChart, { formatDay, formatEuro } from "@/components/ValueChart";
import { formatMoneyDelta } from "@/lib/money";

type DemoDay = {
  day: string;
  value: number;
  additions: number;
  removals: number;
  revaluation: number;
  event: string;
};

function demoDays(): DemoDay[] {
  const changes = [
    { additions: 0, removals: 0, revaluation: 0, event: "Valore iniziale del periodo" },
    { additions: 0, removals: 0, revaluation: 8, event: "Aggiornamento delle stime" },
    { additions: 90, removals: 0, revaluation: -3, event: "Aggiunti 2 volumi" },
    { additions: 0, removals: 0, revaluation: 12, event: "Aggiornamento delle stime" },
    { additions: 0, removals: 30, revaluation: 0, event: "Rimosso 1 volume" },
    { additions: 60, removals: 0, revaluation: 5, event: "Aggiunto 1 volume" },
    { additions: 0, removals: 0, revaluation: 8, event: "Aggiornamento delle stime" },
  ];
  let value = 1200;
  return changes.map((change, index) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - changes.length + 1 + index);
    value += change.additions - change.removals + change.revaluation;
    return { day: date.toISOString().slice(0, 10), value, ...change };
  });
}

export default function ValueBreakdownPreview() {
  const [days] = useState(demoDays);
  const [mode, setMode] = useState<"total" | "revaluation">("total");
  const first = days[0].value;
  const last = days.at(-1)!.value;
  const additions = days.reduce((sum, day) => sum + day.additions, 0);
  const removals = days.reduce((sum, day) => sum + day.removals, 0);
  const revaluation = days.reduce((sum, day) => sum + day.revaluation, 0);
  const points = days.map((day, index) => ({
    day: day.day,
    value: mode === "total"
      ? day.value
      : first + days.slice(0, index + 1).reduce((sum, entry) => sum + entry.revaluation, 0),
  }));

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-14">
      <div className="mb-6">
        <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">
          Anteprima · dati dimostrativi
        </span>
        <h1 className="mt-4 text-2xl font-bold text-white">La collezione cresce. Ma come?</h1>
        <p className="mt-2 text-sm text-slate-400">
          Una prova per distinguere nuovi volumi e cambiamenti delle stime. Nessun dato della collezione viene modificato.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-slate-400">Valore della collezione</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <span className="text-3xl font-semibold text-white">{formatEuro(last)}</span>
              <span className="rounded-full bg-indigo-400/10 px-2.5 py-1 text-sm text-indigo-200">
                {formatMoneyDelta(last - first)} nel periodo
              </span>
            </div>
          </div>
          <span className="text-xs text-slate-500">{formatDay(days[0].day)} – {formatDay(days.at(-1)!.day)}</span>
        </div>

        <div className="my-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-indigo-400/20 bg-indigo-400/5 p-3">
            <p className="text-xs text-indigo-200">Aggiunte / prime valutazioni</p>
            <p className="mt-1 text-xl font-semibold text-indigo-200">{formatMoneyDelta(additions)}</p>
            <p className="mt-1 text-xs text-slate-500">Valore entrato nella collezione</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-3">
            <p className="text-xs text-slate-300">Rimozioni</p>
            <p className="mt-1 text-xl font-semibold text-slate-300">{formatMoneyDelta(-removals)}</p>
            <p className="mt-1 text-xs text-slate-500">Valore uscito dalla collezione</p>
          </div>
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-3">
            <p className="text-xs text-emerald-300">Rivalutazione</p>
            <p className="mt-1 text-xl font-semibold text-emerald-300">{formatMoneyDelta(revaluation)}</p>
            <p className="mt-1 text-xs text-slate-500">Variazione delle stime dei pezzi</p>
          </div>
        </div>

        <div role="group" aria-label="Tipo di andamento" className="mb-4 flex w-fit max-w-full rounded-lg border border-slate-700 bg-slate-950 p-1 text-xs sm:text-sm">
          {([
            ["total", "Totale collezione"],
            ["revaluation", "Solo rivalutazione"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
              className={`rounded-md px-3 py-2 transition ${mode === key ? "bg-indigo-500/20 text-indigo-200" : "text-slate-400 hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="mb-4 min-h-10 text-sm text-slate-400">
          {mode === "total"
            ? "Il totale include nuovi volumi, rimozioni e variazioni delle stime."
            : "Linea al netto di aggiunte e rimozioni, a partire dal valore iniziale. Non è il totale reale della collezione."}
        </p>
        <ValueChart
          points={points}
          height={180}
          renderTooltip={(point) => {
            const day = days.find((entry) => entry.day === point.day);
            if (!day) return null;
            return (
              <div className="mt-2 space-y-1 border-t border-slate-700 pt-2">
                <p className="text-slate-300">{day.event}</p>
                {mode === "revaluation" && <p className="text-slate-400">Valore al netto dei movimenti</p>}
                <p className="text-indigo-300">Aggiunte: {formatMoneyDelta(day.additions)}</p>
                <p className="text-slate-400">Rimozioni: {formatMoneyDelta(-day.removals)}</p>
                <p className="text-emerald-300">Rivalutazione: {formatMoneyDelta(day.revaluation)}</p>
              </div>
            );
          }}
        />
        <div className="mt-2 flex justify-between text-xs text-slate-500">
          <span>{formatDay(days[0].day)}</span>
          <span>{formatDay(days.at(-1)!.day)}</span>
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">Tocca o passa sul grafico per il dettaglio del giorno.</p>

        <div className="mt-5 rounded-xl bg-slate-950/60 p-3 text-sm text-slate-300">
          Dei <strong className="text-white">{formatMoneyDelta(last - first)}</strong> totali,
          {" "}<strong className="text-indigo-200">{formatMoneyDelta(additions - removals)}</strong> dipendono dai movimenti
          e <strong className="text-emerald-300">{formatMoneyDelta(revaluation)}</strong> dalla rivalutazione.
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          Rivalutazione non significa profitto realizzato: comprende anche correzioni manuali.
          Nel calcolo reale useremo i primi valori giornalieri registrati; le variazioni nel giorno
          di ingresso non sempre si possono separare.
        </p>
      </section>
    </main>
  );
}
