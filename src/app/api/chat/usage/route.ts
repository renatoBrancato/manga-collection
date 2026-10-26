import { createClient } from "@/lib/supabase/server";
import { getAiBudget, freeTierUsagePercent } from "@/lib/ai/usage";

/**
 * Stato del tetto gratuito per la barra nella chat. Espone solo una
 * percentuale 0-100: nessun importo in $ arriva mai al client.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const budget = await getAiBudget(user.id);
  return Response.json({
    usedPercent: freeTierUsagePercent(budget),
    allowed: budget.allowed,
  });
}
