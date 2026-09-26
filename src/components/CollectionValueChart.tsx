"use client";

import { useMemo, useState } from "react";
import ValueChart, { formatDay, formatEuro, type ValuePoint } from "@/components/ValueChart";

const RANGES = [
  { key: "30", label: "30g", days: 30 },
  { key: "90", label: "90g", days: 90 },
  { key: "365", label: "1a", days: 365 },
  { key: "all", label: "Tutto", days: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

/** Andamento del valore dell'intera collezione, condiviso tra dashboard e vista pubblica. */
export default function CollectionValueChart({ points }: { points: ValuePoint[] }) {
  const [range, setRange] = useState<RangeKey>("90");

  const visible = useMemo(() => {
    const days = RANGES.find((option) => option.key === range)?.days;
    if (!days) return points;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffDay = cutoff.toISOString().slice(0, 10);
    return points.filter((point) => point.day >= cutoffDay);
  }, [points, range]);

  const first = visible.find((point) => point.value != null)?.value ?? null;
  const last = [...visible].reverse().find((point) => point.value != null)?.value ?? null;
  const delta = first != null && last != null ? last - first : null;
  const percent = delta != null && first ? (delta / first) * 100 : null;
  const hasTrend = visible.length >= 2;

  return (
    <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Andamento del valore</p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-xl font-semibold text-slate-100">{last != null ? formatEuro(last) : "—"}</span>
            {hasTrend && delta != null && (
              <span
                className={`text-sm font-medium ${
                  delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-slate-400"
                }`}
              >
                {delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} {formatEuro(Math.abs(delta))}
                {percent != null && ` (${percent > 0 ? "+" : ""}${percent.toFixed(1)}%)`}
              </span>
            )}
          </div>
        </div>

        {points.length >= 2 && (
          <div className="flex rounded-lg border border-slate-800 bg-slate-950/60 p-0.5 text-xs">
            {RANGES.map((option) => (
              <button
                key={option.key}
                onClick={() => setRange(option.key)}
                className={`rounded-md px-2.5 py-1 transition ${
                  range === option.key ? "bg-indigo-500/20 text-indigo-200" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {points.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          Lo storico partirà con la prima valutazione dei pezzi.
        </p>
      ) : (
        <>
          <ValueChart points={visible} height={140} />
          <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
            <span>{visible[0] ? formatDay(visible[0].day) : ""}</span>
            {hasTrend ? (
              <span>{formatDay(visible.at(-1)!.day)}</span>
            ) : (
              <span>Lo storico si costruisce ogni giorno: dal prossimo aggiornamento vedrai l&apos;andamento.</span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
