"use client";

import { useEffect, useRef } from "react";
import type { MangaItem } from "@/lib/types";
import CoverImage from "@/components/CoverImage";
import { formatMoney } from "@/lib/money";
import { buildMangaPrimaStampaUrl } from "@/lib/mangaprimastampa";
import { useTranslations } from "@/lib/i18n/LocaleProvider";

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
  const { locale, t: dict } = useTranslations();
  const t = dict.itemDetailsModal;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const title = item.series ?? item.title;
  const number = item.format === "zashi" ? item.issue_number : item.volume_number;
  const mangaPrimaStampaUrl = buildMangaPrimaStampaUrl(item, locale);

  function valuationLabel(value: string | null): string | null {
    return value == null ? null : t.valuationLabels[value] ?? value;
  }

  function formatDate(value: string | null): string {
    if (!value) return t.notAvailable;
    return new Date(value).toLocaleString(locale === "it" ? "it-IT" : "en-US");
  }

  const details: Array<[string, string | number | null]> = [
    [t.format, item.format === "zashi" ? t.zashiFormat : t.tankobonFormat],
    [item.format === "zashi" ? t.issueNumber : t.volume, number],
    [t.releaseYear, item.release_year],
    [t.publisher, item.publisher],
    ["ISBN", item.isbn],
    [t.language, item.language],
    [t.printing, item.is_first_print == null ? null : item.is_first_print ? t.firstPrint : t.reprint],
    [t.obi, item.has_obi == null ? null : item.has_obi ? t.obiPresent : t.obiAbsent],
    [t.sealed, item.is_sealed ? t.sealedYes : t.sealedNo],
    [t.forSale, item.is_for_sale ? t.yes : t.no],
    [t.grading, item.grading_authority
      ? `${item.grading_authority}${item.grading_value != null ? ` ${item.grading_value}` : ""}`
      : t.gradingRaw],
    [t.condition, item.condition_estimate],
    [t.printingNotes, item.printing_notes],
    [t.estimatedValue, item.estimated_value == null ? t.valueToEstimate : formatMoney(item.estimated_value, item.currency)],
    [t.valuationSource, valuationLabel(item.valuation_source)],
    [t.valuationBasis, valuationLabel(item.valuation_basis)],
    [t.lastValuation, formatDate(item.valued_at)],
    [t.addedOn, formatDate(item.created_at)],
    [t.updatedOn, formatDate(item.updated_at)],
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
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">{t.eyebrow}</p>
          <h2 id="item-details-title" className="mt-1 text-lg font-semibold">
            {title}{number != null ? ` #${number}` : ""}
          </h2>
        </div>
        <button type="button" onClick={onClose} aria-label={t.close} className="rounded-lg px-3 py-2 text-slate-400 hover:bg-white/10 hover:text-white">
          ✕
        </button>
      </header>
      <div className="flex flex-col gap-5 sm:flex-row">
        <CoverImage item={item} className="mx-auto aspect-[2/3] w-36 shrink-0 rounded-lg sm:mx-0" />
        <dl className="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-slate-400">{label}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{value ?? t.notSpecified}</dd>
            </div>
          ))}
        </dl>
      </div>
      {item.notes && (
        <section className="mt-5 border-t border-slate-800 pt-4">
          <h3 className="text-xs text-slate-400">{t.notes}</h3>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm">{item.notes}</p>
        </section>
      )}
      <footer className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-4">
        {mangaPrimaStampaUrl && (
          <a
            href={mangaPrimaStampaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800"
          >
            {t.viewOnMangaPrimaStampa}
          </a>
        )}
        <button type="button" onClick={onHistory} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">{t.valueTrend}</button>
        {onEdit && (
          <button type="button" onClick={onEdit} className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400">{t.edit}</button>
        )}
      </footer>
    </dialog>
  );
}
