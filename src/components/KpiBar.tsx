import type { MangaItem } from "@/lib/types";

function formatCurrency(value: number) {
  return value.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

/**
 * Riepilogo della collezione. Ogni riquadro usa un kanji al posto
 * dell'emoji: 冊 è il contatore giapponese dei volumi, 帯 è proprio la
 * fascetta OBI, 初 sta per "prima" stampa. Il kanji fa anche da filigrana
 * sullo sfondo, come il timbro (hanko) sulle schede dei negozi giapponesi.
 */
export default function KpiBar({ items }: { items: MangaItem[] }) {
  const total = items.length;
  const totalValue = items.reduce((sum, i) => sum + (i.estimated_value ?? 0), 0);
  const series = new Set(items.map((i) => i.series || i.title)).size;
  const tankobon = items.filter((i) => i.format === "tankobon").length;
  const zashi = items.filter((i) => i.format === "zashi").length;
  const graded = items.filter((i) => i.grading_authority).length;
  const firstPrints = items.filter((i) => i.is_first_print === true).length;
  const withObi = items.filter((i) => i.has_obi === true).length;
  const withoutObi = items.filter((i) => i.has_obi === false).length;
  const obiUnknown = total - withObi - withoutObi;

  const topSeriesEntry = Object.entries(
    items.reduce<Record<string, number>>((acc, i) => {
      const key = i.series || i.title;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1])[0];

  const kpis = [
    { label: "Volumi totali", kana: "総数", kanji: "冊", value: total.toString() },
    { label: "Valore stimato", kana: "評価額", kanji: "円", value: formatCurrency(totalValue), accent: true },
    { label: "Serie diverse", kana: "作品", kanji: "作", value: series.toString() },
    { label: "Tankobon / Zashi", kana: "単行本・雑誌", kanji: "単", value: `${tankobon} / ${zashi}` },
    { label: "Pezzi gradati", kana: "鑑定済み", kanji: "鑑", value: graded.toString() },
    { label: "Prima stampa", kana: "初版", kanji: "初", value: firstPrints.toString() },
    {
      label: "Con OBI / Senza",
      kana: "帯あり・なし",
      kanji: "帯",
      value: `${withObi} / ${withoutObi}`,
      hint: obiUnknown > 0 ? `${obiUnknown} con OBI non specificato` : undefined,
    },
    {
      label: "Serie più numerosa",
      kana: "最多作品",
      kanji: "王",
      value: topSeriesEntry ? `${topSeriesEntry[0]} (${topSeriesEntry[1]})` : "-",
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className={`group relative isolate overflow-hidden rounded-xl border px-3 pb-3 pt-2.5 transition hover:-translate-y-0.5 ${
            kpi.accent
              ? "border-rose-500/30 bg-gradient-to-b from-rose-950/40 to-slate-900/70 hover:border-rose-400/50"
              : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
          }`}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute -right-2 -bottom-3 -z-10 select-none text-[62px] font-black leading-none transition group-hover:opacity-[0.16] ${
              kpi.accent ? "text-rose-500/[0.14]" : "text-slate-100/[0.07]"
            }`}
          >
            {kpi.kanji}
          </span>

          <div className="flex items-center gap-1.5">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] text-[12px] font-bold leading-none ${
                kpi.accent ? "bg-rose-600 text-white" : "bg-slate-100/10 text-slate-300"
              }`}
            >
              {kpi.kanji}
            </span>
            <span className="truncate text-[10px] tracking-wide text-slate-500">{kpi.kana}</span>
          </div>

          <div
            className={`mt-1.5 truncate text-sm font-semibold ${kpi.accent ? "text-rose-50" : "text-slate-100"}`}
            title={kpi.hint ?? kpi.value}
          >
            {kpi.value}
          </div>
          <div className="truncate text-[11px] uppercase tracking-wide text-slate-500">{kpi.label}</div>
        </div>
      ))}
    </div>
  );
}
