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

const SOURCE_LABELS: Record<string, string> = {
  westblue: "West Blue",
  manual: "Modifica manuale",
  chat: "Koma",
  mcp: "ChatGPT",
  delete: "Rimosso",
};

const BASIS_LABELS: Record<string, string> = {
  media_vendite_compatibili: "mediana vendite",
  riga_esatta_piu_recente: "riga esatta graded",
  invariato_nessuna_vendita: "nessuna vendita, invariato",
};

/** Storico del valore di un singolo pezzo, disponibile anche nella vista read-only. */
export default function ItemHistoryModal({ item, onClose }: { item: MangaItem; onClose: () => void }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      </div>
    </div>
  );
}
