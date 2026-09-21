"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { MangaItem } from "@/lib/types";

const STATUS_LABELS: Record<string, string> = {
  owned: "Posseduto",
  reading: "In lettura",
  completed: "Completato",
  wanted: "Da acquistare",
};

export default function ItemsTable({ items }: { items: MangaItem[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
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
  }, [items, statusFilter, search]);

  const totalValue = filtered.reduce((sum, item) => sum + (item.estimated_value ?? 0), 0);

  async function handleDelete(id: string) {
    if (!confirm("Rimuovere questo volume dalla collezione?")) return;
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
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input max-w-[180px]"
        >
          <option value="all">Tutti gli stati</option>
          <option value="owned">Posseduto</option>
          <option value="reading">In lettura</option>
          <option value="completed">Completato</option>
          <option value="wanted">Da acquistare</option>
        </select>
        <div className="ml-auto rounded-lg bg-slate-900 px-4 py-2 text-sm">
          <span className="text-slate-400">Valore stimato totale: </span>
          <span className="font-semibold text-emerald-400">
            {totalValue.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
          </span>
          <span className="ml-2 text-slate-500">({filtered.length} volumi)</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-4 py-2">Titolo</th>
              <th className="px-4 py-2">Serie</th>
              <th className="px-4 py-2">Vol.</th>
              <th className="px-4 py-2">Editore</th>
              <th className="px-4 py-2">Stato</th>
              <th className="px-4 py-2">Condizione</th>
              <th className="px-4 py-2">Valore</th>
              <th className="px-4 py-2">Origine</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map((item) => (
              <tr key={item.id} className="hover:bg-slate-900/50">
                <td className="px-4 py-2 font-medium">{item.title}</td>
                <td className="px-4 py-2 text-slate-400">{item.series ?? "-"}</td>
                <td className="px-4 py-2">{item.volume_number ?? "-"}</td>
                <td className="px-4 py-2 text-slate-400">{item.publisher ?? "-"}</td>
                <td className="px-4 py-2">
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs">
                    {STATUS_LABELS[item.status] ?? item.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-400">{item.condition ?? "-"}</td>
                <td className="px-4 py-2">
                  {item.estimated_value != null
                    ? item.estimated_value.toLocaleString("it-IT", {
                        style: "currency",
                        currency: item.currency || "EUR",
                      })
                    : "-"}
                </td>
                <td className="px-4 py-2 text-slate-500">
                  {item.source === "chatgpt" ? "🤖 ChatGPT" : "✍️ Manuale"}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-slate-500 transition hover:text-red-400"
                    title="Rimuovi"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  Nessun volume trovato. Aggiungine uno manualmente o scansionalo con il GPT.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
