import type { MangaItem } from "@/lib/types";
import ObiIcon from "./ObiIcon";
import { formatMoney } from "@/lib/money";

/**
 * Icone a tratto disegnate a mano: le emoji rendono in modo diverso su ogni
 * sistema e il kanji da solo non è leggibile per chi non conosce il giapponese.
 */
const icon = {
  stack: "M4 8.2 12 4.6l8 3.6-8 3.6-8-3.6Z M4.2 12.4 12 15.9l7.8-3.5 M4.2 16.4 12 19.9l7.8-3.5",
  coins: "M12 6.6c3.3 0 6 .9 6 2.1s-2.7 2.1-6 2.1-6-.9-6-2.1 2.7-2.1 6-2.1Z M6 8.7v6.6c0 1.2 2.7 2.1 6 2.1s6-.9 6-2.1V8.7 M6 12c0 1.2 2.7 2.1 6 2.1s6-.9 6-2.1",
  folders: "M4 8.5h5.4l1.4 1.8H20v8.2H4V8.5Z M7 8.5V5.7h4.6l1.4 1.8H18",
  book: "M12 7.4C10.2 5.9 7.7 5.4 4.6 5.7v11.6c3.1-.3 5.6.2 7.4 1.7 1.8-1.5 4.3-2 7.4-1.7V5.7c-3.1-.3-5.6.2-7.4 1.7Z M12 7.4v11.6",
  medal: "M8.6 3.4 10.8 7.6 M15.4 3.4 13.2 7.6 M12 21a6.6 6.6 0 1 0 0-13.2A6.6 6.6 0 0 0 12 21Z M9.2 14.4l2 2 3.6-3.8",
  crown: "M4.6 18.6h14.8 M4 7.2l3.8 3.4L12 5l4.2 5.6L20 7.2l-1.4 8.6H5.4L4 7.2Z",
};
function formatCurrency(value: number) {
  return formatMoney(value);
}

/**
 * Riepilogo della collezione. Il kanji resta come filigrana sullo sfondo,
 * come il timbro (hanko) sulle schede dei negozi giapponesi, ma il simbolo
 * in evidenza è un'icona comprensibile anche a chi non legge il giapponese.
 * L'icona dell'OBI è la stessa usata sulle schede della collezione.
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
    { label: "Volumi totali", kana: "総数", kanji: "冊", path: icon.stack, value: total.toString() },
    { label: "Valore stimato", kana: "評価額", kanji: "円", path: icon.coins, value: formatCurrency(totalValue), accent: true },
    { label: "Serie diverse", kana: "作品", kanji: "作", path: icon.folders, value: series.toString() },
    { label: "Tankobon / Zashi", kana: "単行本・雑誌", kanji: "単", path: icon.book, value: `${tankobon} / ${zashi}` },
    { label: "Pezzi gradati", kana: "鑑定済み", kanji: "鑑", path: icon.medal, value: graded.toString() },
    { label: "Prima stampa", kana: "初版", kanji: "初", text: "1st", value: firstPrints.toString() },
    {
      label: "Con OBI / Senza",
      kana: "帯あり・なし",
      kanji: "帯",
      obi: true,
      value: `${withObi} / ${withoutObi}`,
      hint: obiUnknown > 0 ? `${obiUnknown} con OBI non specificato` : undefined,
    },
    {
      label: "Serie più numerosa",
      kana: "最多作品",
      kanji: "王",
      path: icon.crown,
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
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                kpi.accent ? "bg-rose-600/90 text-white" : "bg-slate-100/10 text-slate-300"
              }`}
            >
              {kpi.text ? (
                <span className="flex items-baseline font-black leading-none tracking-tight">
                  <span className="text-[14px]">1</span>
                  <span className="text-[9px]">st</span>
                </span>
              ) : kpi.obi ? (
                <ObiIcon />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  {kpi.path?.split(" M").map((d, i) => (
                    <path key={d} d={i === 0 ? d : `M${d}`} />
                  ))}
                </svg>
              )}
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
