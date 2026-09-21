import type { MangaItem } from "@/lib/types";

function formatCurrency(value: number) {
  return value.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

export default function KpiBar({ items }: { items: MangaItem[] }) {
  const total = items.length;
  const totalValue = items.reduce((sum, i) => sum + (i.estimated_value ?? 0), 0);
  const series = new Set(items.map((i) => i.series || i.title)).size;
  const tankobon = items.filter((i) => i.format === "tankobon").length;
  const zashi = items.filter((i) => i.format === "zashi").length;
  const graded = items.filter((i) => i.grading_authority).length;
  const firstPrints = items.filter((i) => i.is_first_print === true).length;
  const avgValue = total > 0 ? totalValue / total : 0;

  const topSeriesEntry = Object.entries(
    items.reduce<Record<string, number>>((acc, i) => {
      const key = i.series || i.title;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1])[0];

  const kpis = [
    { label: "Volumi totali", value: total.toString(), icon: "📚" },
    { label: "Valore stimato", value: formatCurrency(totalValue), icon: "💰" },
    { label: "Serie diverse", value: series.toString(), icon: "🗂️" },
    { label: "Tankobon / Zashi", value: `${tankobon} / ${zashi}`, icon: "📖" },
    { label: "Pezzi gradati", value: graded.toString(), icon: "🏅" },
    { label: "Prima stampa", value: firstPrints.toString(), icon: "🆕" },
    { label: "Valore medio/volume", value: formatCurrency(avgValue), icon: "📈" },
    {
      label: "Serie più numerosa",
      value: topSeriesEntry ? `${topSeriesEntry[0]} (${topSeriesEntry[1]})` : "-",
      icon: "🏆",
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-3 text-center"
        >
          <div className="text-xl">{kpi.icon}</div>
          <div className="mt-1 truncate text-sm font-semibold text-slate-100" title={kpi.value}>
            {kpi.value}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">{kpi.label}</div>
        </div>
      ))}
    </div>
  );
}
