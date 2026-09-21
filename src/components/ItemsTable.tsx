"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { MangaItem } from "@/lib/types";
import CoverImage from "@/components/CoverImage";

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

export default function ItemsTable({ items }: { items: MangaItem[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (formatFilter !== "all" && item.format !== formatFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          (item.series ?? "").toLowerCase().includes(q) ||
          (item.publisher ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, formatFilter, search]);

  const totalValue = filtered.reduce((sum, item) => sum + (item.estimated_value ?? 0), 0);

  async function handleDelete(id: string) {
    if (!confirm("Rimuovere questo elemento dalla collezione?")) return;
    await supabase.from("items").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca per titolo, serie, editore..."
          className="input max-w-xs"
        />
        <select
          value={formatFilter}
          onChange={(e) => setFormatFilter(e.target.value)}
          className="input max-w-[200px]"
        >
          <option value="all">Tutti i formati</option>
          <option value="tankobon">Tankobon</option>
          <option value="zashi">Zashi</option>
        </select>
        <div className="ml-auto rounded-lg bg-slate-900 px-4 py-2 text-sm">
          <span className="text-slate-400">Valore stimato totale: </span>
          <span className="font-semibold text-emerald-400">
            {totalValue.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
          </span>
          <span className="ml-2 text-slate-500">({filtered.length} elementi)</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-800 px-4 py-10 text-center text-slate-500">
          Nessun elemento trovato. Aggiungine uno manualmente o scansionalo tramite il connettore MCP.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 transition hover:border-slate-600"
            >
              <button
                onClick={() => handleDelete(item.id)}
                className="absolute right-1.5 top-1.5 z-10 hidden h-6 w-6 items-center justify-center rounded-full bg-slate-950/80 text-slate-300 transition hover:text-red-400 group-hover:flex"
                title="Rimuovi"
              >
                ✕
              </button>

              <CoverImage item={item} className="aspect-[2/3] w-full" />

              <div className="flex flex-1 flex-col gap-1 p-2.5 text-xs">
                <div className="flex items-center justify-between gap-1">
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px]">
                    {FORMAT_LABELS[item.format] ?? item.format}
                  </span>
                  <span className="text-slate-500">
                    {item.source === "mcp" ? "🤖" : "✍️"}
                  </span>
                </div>
                <p className="line-clamp-2 font-medium text-slate-100" title={item.title}>
                  {item.title}
                </p>
                <p className="truncate text-slate-400" title={item.series ?? undefined}>
                  {item.series ?? "-"}
                  {(item.volume_number ?? item.issue_number) != null
                    ? ` · #${item.volume_number ?? item.issue_number}`
                    : ""}
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
                <p className="mt-auto font-semibold text-emerald-400">
                  {item.estimated_value != null
                    ? item.estimated_value.toLocaleString("it-IT", {
                        style: "currency",
                        currency: item.currency || "EUR",
                      })
                    : "-"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
