"use client";

import { useMemo, useState } from "react";
import ValueChart, { formatDay, formatEuro, type ValuePoint } from "@/components/ValueChart";
import { useTranslations } from "@/lib/i18n/LocaleProvider";

const RANGE_KEYS = ["30", "90", "365", "all"] as const;
const RANGE_DAYS: Record<(typeof RANGE_KEYS)[number], number | null> = { "30": 30, "90": 90, "365": 365, all: null };

type RangeKey = (typeof RANGE_KEYS)[number];

/** Andamento del valore dell'intera collezione, condiviso tra dashboard e vista pubblica. */
export default function CollectionValueChart({ points }: { points: ValuePoint[] }) {
  const { locale, t } = useTranslations();
  const [range, setRange] = useState<RangeKey>("90");

  const ranges = [
    { key: "30" as const, label: t.collectionValueChart.rangeDays30 },
    { key: "90" as const, label: t.collectionValueChart.rangeDays90 },
    { key: "365" as const, label: t.collectionValueChart.rangeYear },
    { key: "all" as const, label: t.collectionValueChart.rangeAll },
  ];

  const visible = useMemo(() => {
    const days = RANGE_DAYS[range];
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
          <p className="text-[11px] uppercase tracking-wide text-slate-500">{t.collectionValueChart.trendTitle}</p>
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
            {ranges.map((option) => (
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
          {t.collectionValueChart.emptyHistory}
        </p>
      ) : (
        <>
          <ValueChart points={visible} height={140} />
          <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
            <span>{visible[0] ? formatDay(visible[0].day, locale) : ""}</span>
            {hasTrend ? (
              <span>{formatDay(visible.at(-1)!.day, locale)}</span>
            ) : (
              <span>{t.collectionValueChart.historyBuilding}</span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
