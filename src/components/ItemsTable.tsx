"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { MangaItem } from "@/lib/types";
import CoverImage from "@/components/CoverImage";
import ObiIcon from "@/components/ObiIcon";
import { formatMoney } from "@/lib/money";
import EditItemModal from "@/components/EditItemModal";
import ItemDetailsModal from "@/components/ItemDetailsModal";
import ItemHistoryModal from "@/components/ItemHistoryModal";
import DeleteItemDialog from "@/components/DeleteItemDialog";
import StockList, { ChangeBadge } from "@/components/StockList";
import { type ItemTrends, type TrendPeriod, TREND_PERIODS, itemChange } from "@/lib/trends";

const FORMAT_LABELS: Record<string, string> = {
  tankobon: "Tankobon",
  zashi: "Zashi",
};

function formatCondition(item: MangaItem): string {
  if (item.grading_authority && item.grading_value != null) {
    return `${item.grading_authority} ${item.grading_value}`;
  }
  if (item.grading_authority) return item.grading_authority;
  if (item.condition_estimate) return item.condition_estimate;
  return "-";
}

const PAGE_SIZE = 48;
const VIEW_KEY = "manga-collection:view";

type ViewMode = "grid" | "list";

export default function ItemsTable({
  items,
  trends = {},
  readOnly = false,
}: {
  items: MangaItem[];
  trends?: ItemTrends;
  readOnly?: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const [gradingFilter, setGradingFilter] = useState("all");
  const [obiFilter, setObiFilter] = useState("all");
  const [sealedFilter, setSealedFilter] = useState("all");
  const [saleFilter, setSaleFilter] = useState("all");
  const [printingFilter, setPrintingFilter] = useState("all");
  const [languageFilter, setLanguageFilter] = useState<string[]>([]);
  const [valueFilter, setValueFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MangaItem | null>(null);
  const [detailsItem, setDetailsItem] = useState<MangaItem | null>(null);
  const [historyItem, setHistoryItem] = useState<MangaItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<MangaItem | null>(null);
  const [view, setView] = useState<ViewMode>("grid");
  const [period, setPeriod] = useState<TrendPeriod>("30");

  // Vista e periodo restano quelli scelti l'ultima volta (anche nella vista
  // pubblica). Letti dopo il mount per non rompere l'idratazione.
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "{}") as { view?: ViewMode; period?: TrendPeriod };
        if (saved.view === "grid" || saved.view === "list") setView(saved.view);
        if (TREND_PERIODS.some((option) => option.key === saved.period)) setPeriod(saved.period as TrendPeriod);
      } catch {
        localStorage.removeItem(VIEW_KEY);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateView(next: { view?: ViewMode; period?: TrendPeriod }) {
    const merged = { view: next.view ?? view, period: next.period ?? period };
    setView(merged.view);
    setPeriod(merged.period);
    localStorage.setItem(VIEW_KEY, JSON.stringify(merged));
  }

  const changes = useMemo(() => {
    const result = new Map<string, number | null>();
    for (const item of items) {
      const change = itemChange(trends[item.id], item.estimated_value, period);
      result.set(item.id, change ? (change.percent ?? (change.delta > 0 ? Infinity : change.delta < 0 ? -Infinity : 0)) : null);
    }
    return result;
  }, [items, trends, period]);

  const languages = useMemo(
    () =>
      [...new Set(items.map((item) => item.language?.trim()).filter((value): value is string => Boolean(value)))].sort(
        (a, b) => a.localeCompare(b, "it"),
      ),
    [items],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("it");
    const result = items.filter((item) => {
      if (formatFilter !== "all" && item.format !== formatFilter) return false;
      if (gradingFilter === "graded" && !item.grading_authority) return false;
      if (gradingFilter === "raw" && item.grading_authority) return false;
      if (obiFilter === "yes" && item.has_obi !== true) return false;
      if (obiFilter === "no" && item.has_obi !== false) return false;
      if (sealedFilter === "yes" && !item.is_sealed) return false;
      if (sealedFilter === "no" && item.is_sealed) return false;
      if (saleFilter === "yes" && !item.is_for_sale) return false;
      if (saleFilter === "no" && item.is_for_sale) return false;
      if (printingFilter === "first" && item.is_first_print !== true) return false;
      if (printingFilter === "reprint" && item.is_first_print !== false) return false;
      if (languageFilter.length > 0 && !languageFilter.includes(item.language ?? "")) return false;
      if (valueFilter === "valued" && item.estimated_value == null) return false;
      if (valueFilter === "missing" && item.estimated_value != null) return false;
      if (!query) return true;

      return [item.series, item.title, item.publisher, item.isbn, item.issue_number]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase("it").includes(query));
    });

    return result.sort((a, b) => {
      if (sort === "title") return (a.series ?? a.title).localeCompare(b.series ?? b.title, "it");
      if (sort === "value_desc") return (b.estimated_value ?? -1) - (a.estimated_value ?? -1);
      if (sort === "value_asc") return (a.estimated_value ?? Number.MAX_VALUE) - (b.estimated_value ?? Number.MAX_VALUE);
      if (sort === "change_desc" || sort === "change_asc") {
        const left = changes.get(a.id);
        const right = changes.get(b.id);
        if (left == null || right == null) return left == null ? (right == null ? 0 : 1) : -1;
        return sort === "change_desc" ? right - left : left - right;
      }
      if (sort === "year_desc") return (b.release_year ?? 0) - (a.release_year ?? 0);
      if (sort === "year_asc") return (a.release_year ?? Number.MAX_VALUE) - (b.release_year ?? Number.MAX_VALUE);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [
    items,
    formatFilter,
    gradingFilter,
    obiFilter,
    sealedFilter,
    saleFilter,
    printingFilter,
    languageFilter,
    valueFilter,
    sort,
    search,
    changes,
  ]);

  // Scorrimento infinito: filtri e totali lavorano su tutta la collezione, ma
  // la griglia disegna le schede a blocchi, così le copertine non vengono
  // scaricate tutte all'apertura.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [lastFiltered, setLastFiltered] = useState(filtered);
  if (lastFiltered !== filtered) {
    setLastFiltered(filtered);
    setVisibleCount(PAGE_SIZE);
  }
  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisibleCount((count) => count + PAGE_SIZE);
      },
      { rootMargin: "800px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, visibleCount]);

  // Conta solo i filtri collassati: la ricerca resta sempre visibile e
  // l'ordinamento non riduce i risultati.
  const activeFilterCount = [
    formatFilter,
    gradingFilter,
    obiFilter,
    sealedFilter,
    saleFilter,
    printingFilter,
    languageFilter.length > 0 ? "selected" : "all",
    valueFilter,
  ].filter((value) => value !== "all").length;

  const hasActiveFilters = Boolean(search) || activeFilterCount > 0;

  function resetFilters() {
    setSearch("");
    setFormatFilter("all");
    setGradingFilter("all");
    setObiFilter("all");
    setSealedFilter("all");
    setSaleFilter("all");
    setPrintingFilter("all");
    setLanguageFilter([]);
    setValueFilter("all");
  }

  async function handleDelete(item: MangaItem, forgetHistory: boolean) {
    const { data, error } = await supabase.rpc("delete_item", {
      p_item_id: item.id,
      p_forget_history: forgetHistory,
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Elemento non trovato");
    setDeletingItem(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-4 shadow-lg shadow-black/10 backdrop-blur">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Archivio</p>
            <h2 className="mt-1 text-lg font-bold text-white">Esplora la collezione</h2>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {hasActiveFilters && (
              <button onClick={resetFilters} className="font-medium text-indigo-300 transition hover:text-indigo-200">
                Azzera filtri
              </button>
            )}
            <span className="rounded-full bg-white/5 px-3 py-1 text-slate-400">
              {filtered.length} di {items.length}
            </span>
            <div role="group" aria-label="Vista" className="flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
              {(
                [
                  ["grid", "Copertine", "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"],
                  ["list", "Borsa", "M3 17l6-6 4 4 8-8M15 7h6v6"],
                ] as const
              ).map(([key, label, icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => updateView({ view: key })}
                  aria-pressed={view === key}
                  title={key === "grid" ? "Vista a copertine" : "Vista borsa: valore e variazioni"}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    view === key ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden="true">
                    <path d={icon} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Cerca nella collezione</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setSearch("")}
              placeholder="Serie, editore, ISBN..."
              className="input w-full pl-9 pr-9"
            />
            {search && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setSearch("");
                  (e.currentTarget.previousElementSibling as HTMLInputElement | null)?.focus();
                }}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
                aria-label="Cancella ricerca"
                title="Cancella ricerca"
              >
                ✕
              </button>
            )}
          </label>

          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            className={`flex shrink-0 items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition ${
              activeFilterCount > 0
                ? "border-indigo-400/40 bg-indigo-500/15 text-indigo-200"
                : "border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M3 5h18M6 12h12M10 19h4" />
            </svg>
            Filtri
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-500 px-1.5 text-[11px] font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          <label className="flex shrink-0 items-center gap-2 text-sm text-slate-400">
            <span>Ordina per</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="input min-w-40">
              <option value="newest">Più recenti</option>
              <option value="title">Titolo A-Z</option>
              <option value="year_desc">Anno: più nuovi</option>
              <option value="year_asc">Anno: più vecchi</option>
              <option value="value_desc">Valore: decrescente</option>
              <option value="value_asc">Valore: crescente</option>
              <option value="change_desc">Variazione: rialzi</option>
              <option value="change_asc">Variazione: ribassi</option>
            </select>
          </label>
        </div>

        {filtersOpen && (
          <div className="mt-2.5 grid gap-2.5 border-t border-white/8 pt-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)} className="input w-full">
              <option value="all">Ogni formato</option>
              <option value="tankobon">Tankobon</option>
              <option value="zashi">Zashi</option>
            </select>
            <select value={gradingFilter} onChange={(e) => setGradingFilter(e.target.value)} className="input w-full">
              <option value="all">Raw e gradati</option>
              <option value="raw">Solo raw</option>
              <option value="graded">Solo gradati</option>
            </select>
            <select value={obiFilter} onChange={(e) => setObiFilter(e.target.value)} className="input w-full">
              <option value="all">OBI: tutti</option>
              <option value="yes">Con OBI</option>
              <option value="no">Senza OBI</option>
            </select>
            <select value={sealedFilter} onChange={(e) => setSealedFilter(e.target.value)} className="input w-full">
              <option value="all">Sigillati e aperti</option>
              <option value="yes">Solo sigillati</option>
              <option value="no">Solo non sigillati</option>
            </select>
            <select value={saleFilter} onChange={(e) => setSaleFilter(e.target.value)} className="input w-full">
              <option value="all">Vendita: tutti</option>
              <option value="yes">Solo in vendita</option>
              <option value="no">Non in vendita</option>
            </select>
            <select
              value={printingFilter}
              onChange={(e) => setPrintingFilter(e.target.value)}
              className="input w-full"
            >
              <option value="all">Ogni tiratura</option>
              <option value="first">Prima stampa</option>
              <option value="reprint">Ristampa</option>
            </select>
            <select value={valueFilter} onChange={(e) => setValueFilter(e.target.value)} className="input w-full">
              <option value="all">Valore: tutti</option>
              <option value="valued">Con valutazione</option>
              <option value="missing">Da valutare</option>
            </select>

            {languages.length > 0 && (
              <fieldset className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">
                <legend className="px-1 text-xs text-slate-400">Lingua</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {languages.map((language) => (
                    <label key={language} className="flex items-center gap-2 text-sm text-slate-200">
                      <input
                        type="checkbox"
                        checked={languageFilter.includes(language)}
                        onChange={(event) =>
                          setLanguageFilter((selected) =>
                            event.target.checked
                              ? [...selected, language]
                              : selected.filter((value) => value !== language),
                          )
                        }
                        className="h-4 w-4 accent-indigo-500"
                      />
                      {language}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        )}
      </div>

      {(view === "list" || sort.startsWith("change")) && filtered.length > 0 && (
        <MarketSummary items={filtered} trends={trends} period={period} onPeriod={(key) => updateView({ period: key })} />
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-800 px-4 py-10 text-center text-slate-500">
          {items.length === 0
            ? "La collezione è ancora vuota. Registra il primo pezzo o chiedi a Koma di farlo per te."
            : "Nessun pezzo corrisponde ai filtri selezionati."}
        </div>
      ) : view === "list" ? (
        <StockList
          items={visible}
          trends={trends}
          period={period}
          readOnly={readOnly}
          onOpen={setHistoryItem}
          onDetails={setDetailsItem}
          onEdit={setEditingItem}
          onDelete={setDeletingItem}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {visible.map((item) => (
            <div
              key={item.id}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 transition hover:border-slate-600"
            >
              {!readOnly && (
                <div className="absolute right-1.5 top-1.5 z-10 flex gap-1 opacity-90 transition sm:opacity-0 sm:group-hover:opacity-100">
                  <button
                    onClick={() => setEditingItem(item)}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/80 text-slate-300 transition hover:text-indigo-400"
                    title="Modifica"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => setDeletingItem(item)}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/80 text-slate-300 transition hover:text-red-400"
                    title="Rimuovi"
                  >
                    ✕
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setDetailsItem(item)}
                aria-label={`Mostra dettagli di ${item.series ?? item.title} #${item.volume_number ?? item.issue_number ?? ""}`}
                className="relative block w-full overflow-hidden text-left focus-visible:outline-2 focus-visible:outline-indigo-400"
              >
                <CoverImage item={item} className="aspect-[2/3] w-full" />
                {item.is_for_sale && (
                  <span
                    title="In vendita"
                    className="pointer-events-none absolute -left-9 top-4 w-32 -rotate-45 bg-rose-500 py-0.5 text-center text-[10px] font-bold uppercase tracking-wider text-white shadow-md shadow-black/40"
                  >
                    In vendita
                  </span>
                )}
              </button>

              <div className="flex flex-1 flex-col gap-1 p-2.5 text-xs">
                <div className="flex items-center justify-between gap-1">
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px]">
                    {FORMAT_LABELS[item.format] ?? item.format}
                  </span>
                  <span className="flex items-center gap-1">
                    {item.is_sealed && (
                      <span
                        title="Sigillato nel cellophane originale"
                        className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300"
                      >
                        Sealed
                      </span>
                    )}
                    {item.has_obi === true && (
                      <span title="Fascetta OBI presente" className="text-amber-300">
                        <ObiIcon className="h-[15px] w-[15px]" />
                      </span>
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailsItem(item)}
                  className="line-clamp-2 text-left font-medium text-slate-100 hover:text-indigo-300"
                  title="Mostra dettagli"
                >
                  {item.series ?? item.title}
                </button>
                <p className="truncate text-slate-400">
                  {(item.volume_number ?? item.issue_number) != null
                    ? `#${item.volume_number ?? item.issue_number}`
                    : "-"}
                  {item.release_year ? ` · ${item.release_year}` : ""}
                </p>
                <p className="truncate text-slate-500">
                  {item.is_first_print === true
                    ? "Prima stampa"
                    : item.is_first_print === false
                      ? "Ristampa"
                      : "-"}
                  {item.printing_notes ? ` (${item.printing_notes})` : ""}
                </p>
                <p className="truncate text-slate-500">{formatCondition(item)}</p>
                <button
                  type="button"
                  onClick={() => setHistoryItem(item)}
                  title="Andamento del valore"
                  className="mt-auto flex items-center justify-between gap-1 rounded-md text-left font-semibold text-emerald-400 transition hover:text-emerald-300"
                >
                  <span className="truncate">
                    {item.estimated_value != null
                      ? formatMoney(item.estimated_value, item.currency)
                      : "-"}
                  </span>
                  <ChangeBadge
                    change={itemChange(trends[item.id], item.estimated_value, period)}
                    currency={item.currency || "EUR"}
                    compact
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
          >
            Mostra altri ({filtered.length - visibleCount})
          </button>
        </div>
      )}

      {detailsItem && (
        <ItemDetailsModal
          item={detailsItem}
          onClose={() => setDetailsItem(null)}
          onEdit={readOnly ? undefined : () => {
            setEditingItem(detailsItem);
            setDetailsItem(null);
          }}
          onHistory={() => {
            setHistoryItem(detailsItem);
            setDetailsItem(null);
          }}
        />
      )}
      {editingItem && <EditItemModal item={editingItem} onClose={() => setEditingItem(null)} />}
      {deletingItem && (
        <DeleteItemDialog
          item={deletingItem}
          onCancel={() => setDeletingItem(null)}
          onConfirm={(forgetHistory) => handleDelete(deletingItem, forgetHistory)}
        />
      )}
      {historyItem && <ItemHistoryModal item={historyItem} onClose={() => setHistoryItem(null)} />}
    </div>
  );
}

/** Barra in stile mercato: periodo, rialzi/ribassi e variazione complessiva. */
function MarketSummary({
  items,
  trends,
  period,
  onPeriod,
}: {
  items: MangaItem[];
  trends: ItemTrends;
  period: TrendPeriod;
  onPeriod: (period: TrendPeriod) => void;
}) {
  let up = 0;
  let down = 0;
  let from = 0;
  let to = 0;
  for (const item of items) {
    const change = itemChange(trends[item.id], item.estimated_value, period);
    if (!change) continue;
    if (change.delta > 0.004) up++;
    else if (change.delta < -0.004) down++;
    from += change.from;
    to += change.to;
  }
  const delta = to - from;
  const percent = from > 0 ? (delta / from) * 100 : null;
  const tone = delta > 0.004 ? "text-emerald-300" : delta < -0.004 ? "text-rose-300" : "text-slate-300";
  const sign = delta > 0.004 ? "+" : delta < -0.004 ? "−" : "";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/65 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <span className="font-mono font-semibold tabular-nums">
          <span className="mr-2 text-xs font-sans font-medium uppercase tracking-wider text-slate-500">Variazione</span>
          <span className={tone}>
            {sign}
            {formatMoney(Math.abs(delta))}
            {percent != null && ` (${sign}${Math.abs(percent).toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%)`}
          </span>
        </span>
        <span className="text-emerald-300">▲ {up} in rialzo</span>
        <span className="text-rose-300">▼ {down} in ribasso</span>
      </div>
      <div role="group" aria-label="Periodo" className="flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
        {TREND_PERIODS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onPeriod(option.key)}
            aria-pressed={period === option.key}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              period === option.key ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
