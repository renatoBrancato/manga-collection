import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ItemsTable from "@/components/ItemsTable";
import AddItemForm from "@/components/AddItemForm";
import LogoutButton from "@/components/LogoutButton";
import KpiBar from "@/components/KpiBar";
import ShareButton from "@/components/ShareButton";
import AiChatPanel from "@/components/AiChatPanel";
import CollectionHero from "@/components/CollectionHero";
import type { MangaItem } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: items }, { data: profile }] = await Promise.all([
    supabase.from("items").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("share_enabled, share_slug").eq("id", user.id).single(),
  ]);

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
              Impostazioni
            </Link>
            <LogoutButton />
          </>
        }
      />

      <KpiBar items={(items ?? []) as MangaItem[]} />

      <div className="mb-6">
        <AddItemForm userId={user.id} />
      </div>

      <ItemsTable items={(items ?? []) as MangaItem[]} />
      <AiChatPanel userId={user.id} />
    </main>
  );
}
