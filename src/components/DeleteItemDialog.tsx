"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { MangaItem } from "@/lib/types";

/**
 * Conferma di rimozione con scelta sullo storico: "venduto" lascia il valore
 * nei giorni passati, "aggiunto per errore" cancella ogni traccia.
 */
export default function DeleteItemDialog({
  item,
  onCancel,
  onConfirm,
}: {
  item: MangaItem;
  onCancel: () => void;
  onConfirm: (forgetHistory: boolean) => Promise<void>;
}) {
  const [forgetHistory, setForgetHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const number = item.volume_number ?? item.issue_number;
  const label = `${item.series}${number != null ? ` #${number}` : ""}`;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(forgetHistory);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Rimozione non riuscita");
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="font-semibold text-white">Rimuovere {label}?</h2>
        <p className="mt-2 text-sm text-slate-300">Il pezzo verrà tolto dalla collezione.</p>

        <label className="mt-4 flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={forgetHistory}
            onChange={(event) => setForgetHistory(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-700 bg-slate-950"
          />
          <span>
            Cancella anche la traccia del suo valore nello storico
            <span className="mt-1 block text-xs text-slate-400">
              {forgetHistory
                ? "Come se non l'avessi mai aggiunto: i grafici dei giorni passati non lo conteranno più."
                : "Lascialo spento se l'hai venduto: il valore dei giorni passati resta nei grafici."}
            </span>
          </span>
        </label>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
          >
            Annulla
          </button>
          <button
            onClick={confirm}
            disabled={busy}
            className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-400 disabled:opacity-50"
          >
            {busy ? "Rimozione…" : "Rimuovi"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
