import type { SupabaseClient } from "@supabase/supabase-js";
import type { ValuePoint } from "@/components/ValueChart";

/**
 * Valore giornaliero della collezione (ultimo valore noto di ogni pezzo per
 * ciascun giorno). Usato sia dalla dashboard sia dalla vista pubblica, che
 * così mostrano lo stesso grafico.
 */
export async function loadCollectionHistory(client: SupabaseClient, userId: string): Promise<ValuePoint[]> {
  const { data, error } = await client.rpc("collection_value_history", { p_user: userId });
  if (error) {
    console.error("[history] storico collezione non disponibile:", error.message);
    return [];
  }
  return ((data ?? []) as Array<{ day: string; total: number | string }>).map((row) => ({
    day: row.day,
    value: Number(row.total),
  }));
}
