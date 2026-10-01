import Link from "next/link";
import DonateButton from "@/components/DonateButton";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ItemsTable from "@/components/ItemsTable";
import AddItemForm from "@/components/AddItemForm";
import LogoutButton from "@/components/LogoutButton";
import KpiBar from "@/components/KpiBar";
import ShareButton from "@/components/ShareButton";
import AiChatPanel from "@/components/AiChatPanel";
import CollectionHero from "@/components/CollectionHero";
import CollectionValueChart from "@/components/CollectionValueChart";
import DashboardRecovery from "@/components/DashboardRecovery";
import { loadCollectionHistory } from "@/lib/history";
import type { MangaItem } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [itemsResult, { data: profile }, history] = await Promise.all([
    loadItems(supabase, user.id),
    supabase.from("profiles").select("share_enabled, share_slug").eq("id", user.id).single(),
    loadCollectionHistory(supabase, user.id),
  ]);
  const items = itemsResult.items;
  const failed = itemsResult.failed;
  // Collezione vuota ma lo storico (che non passa da RLS) dice che oggi vale
  // qualcosa: quasi sempre è una lettura fatta senza sessione valida.
  const suspicious = !failed && items.length === 0 && (history.at(-1)?.value ?? 0) > 0;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-50 sm:px-8">
      <CollectionHero
        title="La tua storia,"
        highlight="volume dopo volume."
        description="Ogni collezione ha il suo primo capitolo. Cataloga, valorizza e custodisci ogni pezzo della tua."
        footer={user.email}
        actions={
          <>
            <ShareButton
              userId={user.id}
              initialEnabled={profile?.share_enabled ?? false}
              initialSlug={profile?.share_slug ?? null}
            />
            <Link
              href="/settings"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              MCP
            </Link>
            <DonateButton />
            <LogoutButton />
          </>
        }
      />

      <DashboardRecovery failed={failed} suspicious={suspicious} />

      {!failed && <KpiBar items={items} />}

      <CollectionValueChart points={history} />

      <div className="mb-6">
        <AddItemForm userId={user.id} />
      </div>

      {!failed && <ItemsTable items={items} />}
      <AiChatPanel userId={user.id} />
    </main>
  );
}

/**
 * Legge la collezione con un paio di tentativi: un errore di rete o una
 * sessione in rinnovo non deve trasformarsi in una dashboard vuota.
 */
async function loadItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{ items: MangaItem[]; failed: boolean }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from("items")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (!error) return { items: (data ?? []) as MangaItem[], failed: false };
    console.error(`[dashboard] lettura collezione fallita (tentativo ${attempt + 1}):`, error.message);
    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }
  return { items: [], failed: true };
}
