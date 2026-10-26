import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FREE_TIER_WEEKLY_USD, getAdminUsageSnapshot } from "@/lib/ai/usage";

/**
 * Vista interna per il proprietario dell'app: spesa AI per utente, utile a
 * capire come si comporta il tetto gratuito prima di introdurre i pacchetti
 * di crediti a pagamento. Non è tradotta/i18n: è uno strumento operativo, non
 * una pagina rivolta agli utenti finali.
 */
export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: ownProfile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!ownProfile?.is_admin) redirect("/dashboard");

  const rows = await getAdminUsageSnapshot();
  const formatUsd = (value: number) => `$${value.toFixed(4)}`;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-50 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Spesa AI per utente</h1>
          <Link href="/dashboard" className="text-sm text-slate-300 hover:underline">
            ← Torna alla collezione
          </Link>
        </div>
        <p className="text-sm text-slate-400">
          Costo stimato reale (token OpenAI) negli ultimi 90 giorni. Tetto gratuito: {formatUsd(FREE_TIER_WEEKLY_USD)}
          {" "}ogni 7 giorni (finestra mobile).
        </p>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">Utente</th>
                <th className="px-4 py-2 font-medium">Turni (90gg)</th>
                <th className="px-4 py-2 font-medium">Spesa tot. (90gg)</th>
                <th className="px-4 py-2 font-medium">Spesa free (7gg)</th>
                <th className="px-4 py-2 font-medium">Free residuo</th>
                <th className="px-4 py-2 font-medium">Saldo crediti</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((row) => (
                <tr key={row.id} className={row.freeRemainingUsd <= 0 ? "bg-red-950/20" : undefined}>
                  <td className="px-4 py-2">{row.displayName}</td>
                  <td className="px-4 py-2">{row.eventCount}</td>
                  <td className="px-4 py-2">{formatUsd(row.totalCostUsd)}</td>
                  <td className="px-4 py-2">{formatUsd(row.last7dFreeCostUsd)}</td>
                  <td className="px-4 py-2">{formatUsd(row.freeRemainingUsd)}</td>
                  <td className="px-4 py-2">{formatUsd(row.creditBalanceUsd)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    Nessun utente registrato.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
