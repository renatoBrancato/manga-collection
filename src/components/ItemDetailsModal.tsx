"use client";

import { useEffect, useRef } from "react";
import type { MangaItem } from "@/lib/types";
import CoverImage from "@/components/CoverImage";
import { formatMoney } from "@/lib/money";

const VALUATION_LABELS: Record<string, string> = {
  westblue: "West Blue",
  ebay: "Annunci eBay (prezzi richiesti)",
  manual: "Manuale",
  chat: "Koma",
  mcp: "ChatGPT",
  media_ultime_vendite: "Media delle ultime vendite RAW",
  media_vendite_compatibili: "Mediana delle vendite compatibili",
  riga_esatta_piu_recente: "Vendita graded compatibile più recente",
  ebay_mediana_annunci: "Mediana degli annunci eBay",
  invariato_nessuna_vendita: "Valore mantenuto: nessuna vendita compatibile",
};

function valuationLabel(value: string | null): string | null {
  return value == null ? null : VALUATION_LABELS[value] ?? value;
}

function formatDate(value: string | null): string {
  if (!value) return "Non disponibile";
  return new Date(value).toLocaleString("it-IT");
}

export default function ItemDetailsModal({
  item,
  onClose,
  onEdit,
  onHistory,
}: {
  item: MangaItem;
  onClose: () => void;
  onEdit?: () => void;
  onHistory: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const title = item.series ?? item.title;
  const number = item.format === "zashi" ? item.issue_number : item.volume_number;
  const details: Array<[string, string | number | null]> = [
    ["Formato", item.format === "zashi" ? "Zashi (rivista)" : "Tankobon (volume)"],
    [item.format === "zashi" ? "Numero / uscita" : "Volume", number],
    ["Anno di uscita", item.release_year],
    ["Editore", item.publisher],
    ["ISBN", item.isbn],
    ["Lingua", item.language],
    ["Stampa", item.is_first_print == null ? null : item.is_first_print ? "Prima stampa" : "Ristampa"],
    ["Fascetta OBI", item.has_obi == null ? null : item.has_obi ? "Presente" : "Assente"],
    ["Sigillato", item.is_sealed ? "Sì, cellophane originale" : "No"],
    ["In vendita", item.is_for_sale ? "Sì" : "No"],
    ["Grading", item.grading_authority
      ? `${item.grading_authority}${item.grading_value != null ? ` ${item.grading_value}` : ""}`
      : "RAW (non gradato)"],
    ["Condizione", item.condition_estimate],
    ["Note sulla stampa", item.printing_notes],
    ["Valore stimato", item.estimated_value == null ? "Da valutare" : formatMoney(item.estimated_value, item.currency)],
    ["Fonte valutazione", valuationLabel(item.valuation_source)],
    ["Criterio valutazione", valuationLabel(item.valuation_basis)],
    ["Ultima valutazione", formatDate(item.valued_at)],
    ["Aggiunto il", formatDate(item.created_at)],
    ["Aggiornato il", formatDate(item.updated_at)],
  ];

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="item-details-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right ||
              event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
        }
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-5 text-slate-100 backdrop:bg-black/60"
    >
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">Dettagli del volume</p>
          <h2 id="item-details-title" className="mt-1 text-lg font-semibold">
            {title}{number != null ? ` #${number}` : ""}
          </h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Chiudi dettagli" className="rounded-lg px-3 py-2 text-slate-400 hover:bg-white/10 hover:text-white">
          ✕
        </button>
      </header>
      <div className="flex flex-col gap-5 sm:flex-row">
        <CoverImage item={item} className="mx-auto aspect-[2/3] w-36 shrink-0 rounded-lg sm:mx-0" />
        <dl className="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-slate-400">{label}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{value ?? "Non specificato"}</dd>
            </div>
          ))}
        </dl>
      </div>
      {item.notes && (
        <section className="mt-5 border-t border-slate-800 pt-4">
          <h3 className="text-xs text-slate-400">Note</h3>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{item.notes}</p>
        </section>
      )}
      <footer className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-4">
        <button type="button" onClick={onHistory} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">Andamento del valore</button>
        {onEdit && (
          <button type="button" onClick={onEdit} className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400">Modifica</button>
        )}
      </footer>
    </dialog>
  );
}
