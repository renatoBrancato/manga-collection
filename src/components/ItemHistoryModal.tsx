"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MangaItem } from "@/lib/types";
import ValueChart, { formatDay, formatEuro } from "@/components/ValueChart";

type HistoryRow = {
  day: string;
  value: number | null;
  basis: string | null;
  source: string | null;
  match_count: number | null;
};

type TrackerLink = { series: string | null; url: string; preselected: boolean };

const SOURCE_LABELS: Record<string, string> = {
  westblue: "West Blue",
  ebay: "annunci eBay",
  manual: "Modifica manuale",
  chat: "Koma",
  mcp: "ChatGPT",
  delete: "Rimosso",
};

const BASIS_LABELS: Record<string, string> = {
  media_vendite_compatibili: "mediana vendite",
  riga_esatta_piu_recente: "riga esatta graded",
  ebay_mediana_annunci: "mediana annunci eBay",
  invariato_nessuna_vendita: "nessuna vendita, invariato",
};

/** Storico del valore di un singolo pezzo, disponibile anche nella vista read-only. */
export default function ItemHistoryModal({ item, onClose }: { item: MangaItem; onClose: () => void }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tracker, setTracker] = useState<TrackerLink | null>(null);

  useEffect(() => {
    const series = item.series ?? item.title;
    if (!series) return;
    let active = true;
    const params = new URLSearchParams({
      series,
      format: item.format === "zashi" ? "zashi" : "tankobon",
      graded: String(Boolean(item.grading_authority)),
    });
    fetch(`/api/westblue/link?${params}`)
      .then((response) => (response.ok ? (response.json() as Promise<TrackerLink>) : null))
      .then((link) => active && link && setTracker(link))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [item.series, item.title, item.format, item.grading_authority]);

  useEffect(() => {
    let active = true;
    createClient()
      .rpc("item_value_history", { p_item: item.id })
      .then(({ data, error: rpcError }) => {
        if (!active) return;
        if (rpcError) {
          setError(rpcError.message);
          return;
        }
        setRows(
          ((data ?? []) as HistoryRow[]).map((row) => ({
            ...row,
            value: row.value == null ? null : Number(row.value),
          }))
        );
      });
    return () => {
      active = false;
    };
  }, [item.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const number = item.volume_number ?? item.issue_number;
  const grading = item.grading_authority ? ` · ${item.grading_authority} ${item.grading_value ?? ""}`.trimEnd() : "";
  const valued = rows?.filter((row) => row.value != null) ?? [];
  const first = valued[0]?.value ?? null;
  const last = valued.at(-1)?.value ?? null;
  const delta = first != null && last != null && valued.length > 1 ? last - first : null;
  const trackerFilters = [
    item.format === "zashi" ? "Zasshi" : item.grading_authority ? "Graded" : "Raw",
    item.format !== "zashi" && item.volume_number != null ? `Vol. ${item.volume_number}` : null,
    item.format === "zashi" && item.issue_number ? `N. ${item.issue_number}` : null,
    item.grading_authority && item.grading_value != null ? `Voto ${item.grading_value}` : null,
    item.format !== "zashi" && item.has_obi != null ? `OBI ${item.has_obi ? "sì" : "no"}` : null,
  ].filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-slate-800 bg-slate-900 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Andamento del valore</p>
            <h2 className="text-lg font-semibold text-slate-100">
              {item.series ?? item.title}
              {number != null ? ` #${number}` : ""}
              <span className="font-normal text-slate-400">{grading}</span>
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200" aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="mb-4 flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-emerald-400">
            {item.estimated_value != null ? formatEuro(item.estimated_value) : "Da valutare"}
          </span>
          {delta != null && (
            <span className={`text-sm ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-slate-400"}`}>
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} {formatEuro(Math.abs(delta))} dal {formatDay(valued[0].day)}
            </span>
          )}
        </div>

        {error ? (
          <p className="py-6 text-center text-sm text-rose-400">Storico non disponibile: {error}</p>
        ) : rows == null ? (
          <p className="py-6 text-center text-sm text-slate-500">Caricamento…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            Nessuna valutazione registrata finora. Lo storico si aggiorna ogni giorno.
          </p>
        ) : (
          <>
            <ValueChart points={rows} height={130} />
            {rows.length === 1 && (
              <p className="mt-2 text-center text-xs text-slate-500">
                Primo punto registrato: dal prossimo aggiornamento vedrai l&apos;andamento.
              </p>
            )}

            <ul className="mt-4 divide-y divide-slate-800 text-sm">
              {[...rows]
                .reverse()
                .slice(0, 12)
                .map((row) => (
                  <li key={row.day} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <div className="text-slate-200">{formatDay(row.day)}</div>
                      <div className="text-xs text-slate-500">
                        {SOURCE_LABELS[row.source ?? ""] ?? row.source ?? "—"}
                        {row.basis && BASIS_LABELS[row.basis] ? ` · ${BASIS_LABELS[row.basis]}` : ""}
                        {row.match_count ? ` · ${row.match_count} vendite` : ""}
                      </div>
                    </div>
                    <span className="font-medium text-slate-100">
                      {row.value != null ? formatEuro(row.value) : "—"}
                    </span>
                  </li>
                ))}
            </ul>
          </>
        )}

        {tracker && (
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm">
            <a
              href={tracker.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-indigo-300 hover:text-indigo-200"
            >
              Vedi su West Blue
              {tracker.series ? <span className="text-slate-400">· {tracker.series}</span> : null}
              <span aria-hidden="true">↗</span>
            </a>
            <p className="mt-1 text-xs text-slate-500">
              {tracker.series == null
                ? "Serie non trovata nel tracker: cercala a mano."
                : tracker.preselected
                  ? `Imposta sulla pagina: ${trackerFilters.join(" · ")}.`
                  : `Scegli ${trackerFilters[0]} e cerca "${tracker.series}", poi: ${trackerFilters.slice(1).join(" · ") || "nessun altro filtro"}.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
