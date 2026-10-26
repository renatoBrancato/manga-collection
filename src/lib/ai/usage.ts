import { createAdminClient } from "@/lib/supabase/server";
import { estimateCostUsd, type TokenUsage } from "@/lib/ai/pricing";

/** Tetto gratuito per utente, su una finestra mobile di 7 giorni (168 ore). */
export const FREE_TIER_WEEKLY_USD = 0.2;
const FREE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type AiBudget = {
  allowed: boolean;
  freeUsedUsd: number;
  freeRemainingUsd: number;
  creditBalanceUsd: number;
};

/**
 * Spesa "free" dell'utente nella finestra mobile di 7 giorni (168 ore, non
 * settimana solare) e saldo crediti acquistato. Va chiamata prima di avviare
 * un turno di chat per decidere se bloccare la richiesta.
 */
export async function getAiBudget(userId: string): Promise<AiBudget> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - FREE_WINDOW_MS).toISOString();

  const [{ data: profile }, { data: freeEvents }] = await Promise.all([
    admin.from("profiles").select("credit_balance_usd").eq("id", userId).single(),
    admin
      .from("ai_usage_events")
      .select("estimated_cost_usd")
      .eq("user_id", userId)
      .eq("funded_by", "free")
      .gte("created_at", since),
  ]);

  const freeUsedUsd = (freeEvents ?? []).reduce(
    (sum, event) => sum + Number(event.estimated_cost_usd ?? 0),
    0
  );
  const creditBalanceUsd = Number(profile?.credit_balance_usd ?? 0);
  const freeRemainingUsd = Math.max(FREE_TIER_WEEKLY_USD - freeUsedUsd, 0);

  return {
    allowed: freeRemainingUsd > 0 || creditBalanceUsd > 0,
    freeUsedUsd,
    freeRemainingUsd,
    creditBalanceUsd,
  };
}

/**
 * Registra il costo reale di un turno appena concluso e lo scala dal tetto
 * gratuito residuo o, se già esaurito, dal saldo crediti. Va chiamata dopo
 * ogni turno, indipendentemente dal pre-check: il costo reale si conosce
 * solo a turno concluso (round di tool-calling inclusi).
 */
export async function recordAiUsage(
  userId: string,
  model: string,
  usage: TokenUsage,
  feature: string = "chat"
): Promise<{ estimatedCostUsd: number; fundedBy: "free" | "credits" }> {
  const admin = createAdminClient();
  const estimatedCostUsd = estimateCostUsd(model, usage);

  const budget = await getAiBudget(userId);
  const fundedBy = budget.freeRemainingUsd > 0 ? "free" : "credits";

  await admin.from("ai_usage_events").insert({
    user_id: userId,
    feature,
    model,
    input_tokens: usage.inputTokens,
    cached_input_tokens: usage.cachedInputTokens,
    output_tokens: usage.outputTokens,
    estimated_cost_usd: estimatedCostUsd,
    funded_by: fundedBy,
  });

  if (fundedBy === "credits") {
    const { error } = await admin.rpc("decrement_credit_balance", {
      p_user_id: userId,
      p_amount: estimatedCostUsd,
    });
    if (error) {
      // Non blocchiamo la registrazione dell'uso per un errore sul saldo:
      // l'evento resta comunque tracciato per l'audit lato admin.
      console.error("decrement_credit_balance failed", error);
    }
  }

  return { estimatedCostUsd, fundedBy };
}

export type AdminUsageRow = {
  id: string;
  displayName: string;
  eventCount: number;
  totalCostUsd: number;
  last7dFreeCostUsd: number;
  freeRemainingUsd: number;
  creditBalanceUsd: number;
};

/**
 * Snapshot aggregato per la vista admin: spesa per utente negli ultimi 90
 * giorni. Vive qui (non nel Server Component) perché calcola finestre
 * temporali con Date.now(), che le regole React vietano dentro il corpo di
 * un componente.
 */
export async function getAdminUsageSnapshot(): Promise<AdminUsageRow[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const freeWindowSince = new Date(Date.now() - FREE_WINDOW_MS).toISOString();

  const [{ data: profiles }, { data: events }] = await Promise.all([
    admin.from("profiles").select("id, display_name, credit_balance_usd"),
    admin
      .from("ai_usage_events")
      .select("user_id, created_at, estimated_cost_usd, funded_by")
      .gte("created_at", since)
      .order("created_at", { ascending: false }),
  ]);

  return (profiles ?? [])
    .map((profile) => {
      const userEvents = (events ?? []).filter((event) => event.user_id === profile.id);
      const totalCostUsd = userEvents.reduce((sum, event) => sum + Number(event.estimated_cost_usd ?? 0), 0);
      const last7dFreeCostUsd = userEvents
        .filter((event) => event.created_at >= freeWindowSince && event.funded_by === "free")
        .reduce((sum, event) => sum + Number(event.estimated_cost_usd ?? 0), 0);
      return {
        id: profile.id,
        displayName: profile.display_name || profile.id.slice(0, 8),
        creditBalanceUsd: Number(profile.credit_balance_usd ?? 0),
        eventCount: userEvents.length,
        totalCostUsd,
        last7dFreeCostUsd,
        freeRemainingUsd: Math.max(FREE_TIER_WEEKLY_USD - last7dFreeCostUsd, 0),
      };
    })
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd);
}
