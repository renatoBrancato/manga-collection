import { createAdminClient } from "@/lib/supabase/server";
import {
  getUsdToEurRate,
  lookupMarketPrice,
  PRICE_TRACKER_URL,
  type PriceLookupResult,
} from "@/lib/pricing/westblue";
import type { MangaItem } from "@/lib/types";

/**
 * Rivalutazione massiva della collezione, senza passare da un LLM.
 *
 * Il calcolo del prezzo è già deterministico (`lookupMarketPrice` legge il
 * dataset del tracker e applica le regole: mediana per i RAW, riga esatta per
 * i graded). Farlo orchestrare a un modello significava due tool call per
 * pezzo e decine di migliaia di token per un risultato identico: qui gli
 * stessi item vengono processati lato server a costo zero di token.
 *
 * L'ordinamento per serie è deliberato: `lookupMarketPrice` tiene in cache i
 * chunk JSON già scaricati, quindi elaborare di fila tutti i volumi della
 * stessa serie scarica il file una volta sola invece che per ogni volume.
 */

const SOURCE = "westblue";
const LOOKUP_CONCURRENCY = 4;
const WRITE_CONCURRENCY = 8;

export type RevalueScope = "all" | "missing_value";

export type RevalueOutcome = {
  item_id: string;
  label: string;
  previous_value: number | null;
  new_value: number | null;
  basis: string;
  match_count: number;
  changed: boolean;
  note: string;
  error?: string;
};

export type RevalueSummary = {
  user_id: string;
  scope: RevalueScope;
  source: string;
  tracker_updated_at?: string;
  usd_eur_rate: number | null;
  items_processed: number;
  items_updated: number;
  items_unpriced: number;
  previous_total: number;
  new_total: number;
  outcomes: RevalueOutcome[];
};

function labelOf(item: MangaItem): string {
  const name = item.series ?? item.title;
  const number =
    item.format === "zashi"
      ? item.issue_number
        ? ` #${item.issue_number}`
        : ""
      : item.volume_number != null
        ? ` #${item.volume_number}`
        : "";
  const grade = item.grading_authority ? ` (${item.grading_authority} ${item.grading_value ?? "?"})` : "";
  return `${name}${number}${grade}`;
}

/** Esegue `worker` su tutti gli elementi con un limite di parallelismo. */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Ordina per dataset e serie, così i volumi che condividono lo stesso file
 * JSON vengono elaborati consecutivamente e la cache dei chunk lavora al
 * massimo.
 */
function groupBySeries(items: MangaItem[]): MangaItem[] {
  return [...items].sort((a, b) => {
    const keyA = `${a.format}|${a.grading_authority ? "g" : "r"}|${(a.series ?? a.title).toLowerCase()}`;
    const keyB = `${b.format}|${b.grading_authority ? "g" : "r"}|${(b.series ?? b.title).toLowerCase()}`;
    return keyA.localeCompare(keyB);
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function lookupForItem(item: MangaItem): Promise<PriceLookupResult> {
  return lookupMarketPrice({
    series: item.series ?? item.title,
    volume: item.format === "zashi" ? null : item.volume_number,
    format: item.format === "zashi" ? "zashi" : "tankobon",
    graded: Boolean(item.grading_authority),
    grade: item.grading_value,
    hasObi: item.has_obi,
  });
}

/**
 * Rivaluta la collezione di un utente e scrive i nuovi valori, registrando
 * anche una riga di storico per pezzo (una al giorno, in upsert).
 */
export async function revalueUserCollection(
  userId: string,
  options: { scope?: RevalueScope; items?: MangaItem[] } = {}
): Promise<RevalueSummary> {
  const scope = options.scope ?? "all";
  const admin = createAdminClient();

  let items = options.items;
  if (!items) {
    items = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin
        .from("items")
        .select("*")
        .eq("user_id", userId)
        .order("id")
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      items.push(...((data ?? []) as MangaItem[]));
      if (!data || data.length < 1000) break;
    }
  }

  const selected = scope === "missing_value" ? items.filter((i) => i.estimated_value == null) : items;
  const ordered = groupBySeries(selected);

  type LookupEntry = { item: MangaItem; result?: PriceLookupResult; error?: string };

  const lookups = await mapWithLimit<MangaItem, LookupEntry>(ordered, LOOKUP_CONCURRENCY, async (item) => {
    try {
      return { item, result: await lookupForItem(item) };
    } catch (cause) {
      return {
        item,
        error: cause instanceof Error ? cause.message : "Tracker non raggiungibile",
      };
    }
  });

  const capturedAt = new Date().toISOString();
  const capturedOn = capturedAt.slice(0, 10);
  const historyRows: Array<Record<string, unknown>> = [];
  const outcomes: RevalueOutcome[] = [];
  const updates: Array<{ id: string; value: number; basis: string }> = [];

  for (const entry of lookups) {
    const { item } = entry;
    const previous = item.estimated_value;

    if (!entry.result) {
      outcomes.push({
        item_id: item.id,
        label: labelOf(item),
        previous_value: previous,
        new_value: previous,
        basis: "none",
        match_count: 0,
        changed: false,
        note: `Tracker non raggiungibile: ${entry.error ?? "errore sconosciuto"}`,
        error: entry.error ?? "errore sconosciuto",
      });
      continue;
    }

    const result = entry.result;
    const value = result.suggested_value_eur;

    // Senza vendite compatibili il pezzo mantiene il valore precedente: lo
    // storico registra il valore effettivo, non un buco che farebbe
    // sembrare crollato il totale della collezione.
    historyRows.push({
      item_id: item.id,
      user_id: userId,
      value: value ?? previous,
      currency: "EUR",
      basis: value == null ? (previous == null ? "none" : "invariato_nessuna_vendita") : result.suggested_basis,
      match_count: result.match_count,
      source: SOURCE,
      captured_at: capturedAt,
      captured_on: capturedOn,
    });

    if (value == null) {
      outcomes.push({
        item_id: item.id,
        label: labelOf(item),
        previous_value: previous,
        new_value: previous,
        basis: "none",
        match_count: 0,
        changed: false,
        note: result.note,
      });
      continue;
    }

    const changed = previous == null || Math.abs(previous - value) >= 0.01;
    if (changed) updates.push({ id: item.id, value, basis: result.suggested_basis });

    outcomes.push({
      item_id: item.id,
      label: labelOf(item),
      previous_value: previous,
      new_value: value,
      basis: result.suggested_basis,
      match_count: result.match_count,
      changed,
      note: result.note,
    });
  }

  // Lo storico va scritto anche quando il valore non cambia: serve a
  // ricostruire la curva nel tempo, non solo i salti.
  if (historyRows.length > 0) {
    const { error } = await admin
      .from("price_history")
      .upsert(historyRows, { onConflict: "item_id,captured_on" });
    if (error) {
      // Lo storico è accessorio: un suo fallimento non deve impedire
      // l'aggiornamento dei prezzi.
      console.error("[revalue] storico non salvato:", error.message);
    }
  }

  await mapWithLimit(updates, WRITE_CONCURRENCY, async (update) => {
    const { error } = await admin
      .from("items")
      .update({
        estimated_value: update.value,
        currency: "EUR",
        valued_at: capturedAt,
        valuation_basis: update.basis,
        valuation_source: SOURCE,
      })
      .eq("id", update.id)
      .eq("user_id", userId);
    if (error) console.error(`[revalue] update fallito su ${update.id}:`, error.message);
  });

  const trackerMeta = lookups.find((entry) => entry.result)?.result;

  return {
    user_id: userId,
    scope,
    source: PRICE_TRACKER_URL,
    tracker_updated_at: trackerMeta?.tracker_updated_at,
    usd_eur_rate: trackerMeta?.usd_eur_rate ?? null,
    items_processed: outcomes.length,
    items_updated: updates.length,
    items_unpriced: outcomes.filter((o) => o.new_value == null).length,
    previous_total: round2(outcomes.reduce((sum, o) => sum + (o.previous_value ?? 0), 0)),
    new_total: round2(outcomes.reduce((sum, o) => sum + (o.new_value ?? 0), 0)),
    outcomes,
  };
}

export type RevalueRunResult = {
  users_processed: number;
  items_processed: number;
  items_updated: number;
  items_unpriced: number;
  duration_ms: number;
  usd_eur_rate: number | null;
  per_user: Array<{ user_id: string; items_processed: number; items_updated: number }>;
};

/**
 * Rivaluta le collezioni di tutti gli utenti. Chiamata dal cron giornaliero:
 * carica una sola volta tutti gli item e li elabora raggruppati per utente,
 * riusando la cache dei chunk tra un utente e l'altro.
 */
export async function revalueAllCollections(
  options: { trigger?: string } = {}
): Promise<RevalueRunResult> {
  const startedAt = Date.now();
  const admin = createAdminClient();

  // PostgREST restituisce al massimo 1000 righe per richiesta: si pagina
  // finché non arrivano tutte, altrimenti oltre quella soglia i pezzi
  // verrebbero silenziosamente esclusi dalla rivalutazione.
  const PAGE_SIZE = 1000;
  const items: MangaItem[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("items")
      .select("*")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    items.push(...((data ?? []) as MangaItem[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  const byUser = new Map<string, MangaItem[]>();
  for (const item of items) {
    const bucket = byUser.get(item.user_id);
    if (bucket) bucket.push(item);
    else byUser.set(item.user_id, [item]);
  }

  const summaries: RevalueSummary[] = [];
  let runError: string | null = null;

  for (const [userId, userItems] of byUser) {
    try {
      summaries.push(await revalueUserCollection(userId, { scope: "all", items: userItems }));
    } catch (cause) {
      runError = cause instanceof Error ? cause.message : String(cause);
      console.error(`[revalue] utente ${userId} fallito:`, runError);
    }
  }

  const result: RevalueRunResult = {
    users_processed: summaries.length,
    items_processed: summaries.reduce((sum, s) => sum + s.items_processed, 0),
    items_updated: summaries.reduce((sum, s) => sum + s.items_updated, 0),
    items_unpriced: summaries.reduce((sum, s) => sum + s.items_unpriced, 0),
    duration_ms: Date.now() - startedAt,
    usd_eur_rate: summaries.find((s) => s.usd_eur_rate != null)?.usd_eur_rate ?? (await safeRate()),
    per_user: summaries.map((s) => ({
      user_id: s.user_id,
      items_processed: s.items_processed,
      items_updated: s.items_updated,
    })),
  };

  const { error: logError } = await admin.from("valuation_runs").insert({
    trigger: options.trigger ?? "cron",
    tracker_updated_at: summaries.find((s) => s.tracker_updated_at)?.tracker_updated_at ?? null,
    usd_eur_rate: result.usd_eur_rate,
    users_processed: result.users_processed,
    items_processed: result.items_processed,
    items_updated: result.items_updated,
    items_unpriced: result.items_unpriced,
    duration_ms: result.duration_ms,
    error: runError,
  });
  if (logError) console.error("[revalue] log run non salvato:", logError.message);

  return result;
}

async function safeRate(): Promise<number | null> {
  try {
    return await getUsdToEurRate();
  } catch {
    return null;
  }
}
