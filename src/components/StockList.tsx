"use client";

import type { MangaItem } from "@/lib/types";
import ObiIcon from "@/components/ObiIcon";
import { formatMoney, formatMoneyDelta } from "@/lib/money";
import { type ItemChange, type ItemTrends, type TrendPeriod, itemChange, sparklineValues } from "@/lib/trends";

const FORMAT_LABELS: Record<string, string> = { tankobon: "Tankobon", zashi: "Zashi" };

function euro(value: number, currency = "EUR", signed = false) {
  return signed ? formatMoneyDelta(value, currency) : formatMoney(Math.abs(value), currency);
}

/** Sigla in stile borsa: iniziali della serie + numero ("One Piece" #1 → OP 1). */
export function tickerSymbol(item: MangaItem): string {
  const name = (item.series ?? item.title).replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  const words = name.split(/\s+/).filter(Boolean);
  let letters =
    words.length > 1
      ? words
          .filter((word) => !/^\d+$/.test(word))
          .map((word) => word[0])
          .join("")
      : (words[0] ?? "").slice(0, 4);
  letters = letters.slice(0, 4).toUpperCase() || "?";
  const number = item.volume_number ?? item.issue_number;
  return number != null ? `${letters} ${number}` : letters;
}

export function ChangeBadge({ change, currency, compact = false }: { change: ItemChange | null; currency: string; compact?: boolean }) {
  if (!change) {
    return <span className="text-xs text-slate-600" title="Nessuno storico di prezzo">—</span>;
  }
  const up = change.delta > 0.004;
  const down = change.delta < -0.004;
  const tone = up
    ? "bg-emerald-500/15 text-emerald-300"
    : down
      ? "bg-rose-500/15 text-rose-300"
      : "bg-slate-700/40 text-slate-400";
  const arrow = up ? "▲" : down ? "▼" : "■";
  const percent =
    change.percent == null ? "" : `${change.percent > 0 ? "+" : change.percent < 0 ? "−" : ""}${Math.abs(change.percent).toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums ${tone}`}
      title={`Da ${euro(change.from, currency)} a ${euro(change.to, currency)}`}
    >
      <span aria-hidden="true" className="text-[10px]">{arrow}</span>
      {compact || (!up && !down) ? percent || euro(change.delta, currency, true) : (
        <>
          {euro(change.delta, currency, true)}
          {percent && <span className="opacity-80">({percent})</span>}
        </>
      )}
    </span>
  );
}

function Sparkline({ values, up, down }: { values: number[]; up: boolean; down: boolean }) {
  if (values.length < 2) {
    return <svg viewBox="0 0 80 24" className="h-6 w-20" aria-hidden="true"><path d="M2 12H78" stroke="#475569" strokeWidth="1.5" strokeDasharray="2 3" /></svg>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = 76 / (values.length - 1);
  const path = values
    .map((value, index) => `${index === 0 ? "M" : "L"}${(2 + index * step).toFixed(1)} ${(21 - ((value - min) / span) * 18).toFixed(1)}`)
    .join(" ");
  const color = up ? "#34d399" : down ? "#fb7185" : "#94a3b8";
  return (
    <svg viewBox="0 0 80 24" className="h-6 w-20" aria-hidden="true">
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Nelle righe basta la valutazione sintetica ("Ottimo"), non la descrizione completa. */
function shortCondition(value: string | null): string | null {
  const head = value?.split(/[,;(—–-]/)[0]?.trim();
  return head && head.length <= 24 ? head : null;
}

/** Vista "borsa": un pezzo per riga, valore e variazione nel periodo. */
export default function StockList({
  items,
  trends,
  period,
  readOnly,
  onOpen,
  onDetails,
  onEdit,
  onDelete,
}: {
  items: MangaItem[];
  trends: ItemTrends;
  period: TrendPeriod;
  readOnly: boolean;
  onOpen: (item: MangaItem) => void;
  onDetails: (item: MangaItem) => void;
  onEdit: (item: MangaItem) => void;
  onDelete: (item: MangaItem) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50">
      <div className="hidden grid-cols-[minmax(0,1fr)_88px_120px_170px_56px] items-center gap-4 border-b border-white/10 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 md:grid">
        <span>Titolo</span>
        <span>Trend</span>
        <span className="text-right">Valore</span>
        <span className="text-right">Variazione</span>
        <span />
      </div>
      <ul className="divide-y divide-white/5">
        {items.map((item) => {
          const points = trends[item.id];
          const change = itemChange(points, item.estimated_value, period);
          const up = (change?.delta ?? 0) > 0.004;
          const down = (change?.delta ?? 0) < -0.004;
          const currency = item.currency || "EUR";
          const number = item.volume_number ?? item.issue_number;
          const details = [
            FORMAT_LABELS[item.format] ?? item.format,
            item.release_year,
            item.is_first_print === true ? "Prima stampa" : item.is_first_print === false ? "Ristampa" : null,
            item.grading_authority
              ? `${item.grading_authority}${item.grading_value != null ? ` ${item.grading_value}` : ""}`
              : shortCondition(item.condition_estimate),
            item.language,
          ].filter(Boolean);
          return (
            <li
              key={item.id}
              className="group grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 transition hover:bg-white/[0.04] md:grid-cols-[minmax(0,1fr)_88px_120px_170px_56px] md:gap-4"
              onClick={() => onOpen(item)}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`hidden w-[4.5rem] shrink-0 rounded-md border px-1.5 py-1 text-center font-mono text-[11px] font-bold tracking-tight sm:block ${
                    up
                      ? "border-emerald-500/30 text-emerald-300"
                      : down
                        ? "border-rose-500/30 text-rose-300"
                        : "border-slate-700 text-slate-400"
                  }`}
                  title="Sigla"
                >
                  <span className="block truncate">{tickerSymbol(item)}</span>
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate font-medium text-slate-100">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDetails(item);
                      }}
                      title="Mostra dettagli"
                      className="truncate text-left hover:text-indigo-300"
                    >
                      {item.series ?? item.title}
                      {number != null && <span className="text-slate-400"> #{number}</span>}
                    </button>
                    {item.is_for_sale && (
                      <span className="shrink-0 rounded bg-rose-500 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-white">
                        In vendita
                      </span>
                    )}
                    {item.is_sealed && (
                      <span className="shrink-0 rounded bg-sky-500/15 px-1.5 py-px text-[9px] font-medium text-sky-300">Sealed</span>
                    )}
                    {item.has_obi === true && (
                      <span
                        title="Fascetta OBI presente"
                        className="flex shrink-0 items-center gap-1 rounded bg-amber-400/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-amber-300"
                      >
                        <ObiIcon className="h-2.5 w-2.5" />
                        OBI
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-slate-500">{details.join(" · ")}</p>
                </div>
              </div>

              <div className="hidden md:block">
                <Sparkline values={sparklineValues(points, item.estimated_value, period)} up={up} down={down} />
              </div>

              <div className="flex flex-col items-end gap-1 md:contents">
                <span className="text-right font-mono text-sm font-semibold tabular-nums text-slate-100">
                  {item.estimated_value != null ? euro(item.estimated_value, currency) : <span className="text-slate-600">da valutare</span>}
                </span>
                <span className="text-right">
                  <ChangeBadge change={change} currency={currency} />
                </span>
              </div>

              {!readOnly ? (
                <div
                  className="hidden justify-end gap-1 md:flex md:opacity-0 md:transition md:group-hover:opacity-100"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    onClick={() => onEdit(item)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-indigo-300"
                    title="Modifica"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => onDelete(item)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-rose-300"
                    title="Rimuovi"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <span className="hidden md:block" />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
