import type { SupabaseClient } from "@supabase/supabase-js";

/** Punti in cui il valore di un pezzo è cambiato: [giorno ISO, valore]. */
export type TrendPoints = Array<[string, number]>;
export type ItemTrends = Record<string, TrendPoints>;

export type TrendPeriod = "1" | "7" | "30" | "365" | "all";

export const TREND_PERIODS: Array<{ key: TrendPeriod; label: string }> = [
  { key: "1", label: "1g" },
  { key: "7", label: "7g" },
  { key: "30", label: "30g" },
  { key: "365", label: "1a" },
  { key: "all", label: "Tutto" },
];

export async function loadItemTrends(client: SupabaseClient, userId: string): Promise<ItemTrends> {
  const { data, error } = await client.rpc("item_value_trends", { p_user: userId });
  if (error) {
    console.error("[trends] andamento dei pezzi non disponibile:", error.message);
    return {};
  }
  const trends: ItemTrends = {};
  for (const row of (data ?? []) as Array<{ item_id: string; points: Array<[string, number | string]> }>) {
    trends[row.item_id] = row.points.map(([day, value]) => [day, Number(value)]);
  }
  return trends;
}

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export interface ItemChange {
  /** Valore a inizio periodo (o al primo prezzo noto, se il pezzo è più recente). */
  from: number;
  to: number;
  delta: number;
  /** null quando il valore di partenza è 0. */
  percent: number | null;
}

/**
 * Variazione di un pezzo nel periodo: dal valore valido all'inizio del
 * periodo (ultimo punto non successivo) al valore attuale. Se il pezzo ha il
 * primo prezzo dentro il periodo si parte da quello, come il "dal carico" di
 * un titolo in portafoglio.
 */
export function itemChange(points: TrendPoints | undefined, current: number | null, period: TrendPeriod): ItemChange | null {
  if (!points || points.length === 0 || current == null) return null;
  let from = points[0][1];
  if (period !== "all") {
    const start = isoDaysAgo(Number(period));
    for (const [day, value] of points) {
      if (day > start) break;
      from = value;
    }
  }
  const delta = current - from;
  return { from, to: current, delta, percent: from > 0 ? (delta / from) * 100 : null };
}

/** Serie per la sparkline nel periodo, con il valore attuale in coda. */
export function sparklineValues(points: TrendPoints | undefined, current: number | null, period: TrendPeriod): number[] {
  if (!points || points.length === 0) return current == null ? [] : [current];
  const start = period === "all" ? "" : isoDaysAgo(Number(period));
  const values: number[] = [];
  let carried: number | null = null;
  for (const [day, value] of points) {
    if (day <= start) carried = value;
    else values.push(value);
  }
  if (carried != null) values.unshift(carried);
  if (current != null && values.at(-1) !== current) values.push(current);
  return values;
}
