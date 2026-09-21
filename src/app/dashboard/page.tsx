import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ItemsTable from "@/components/ItemsTable";
import AddItemForm from "@/components/AddItemForm";
import LogoutButton from "@/components/LogoutButton";
import KpiBar from "@/components/KpiBar";
import ShareButton from "@/components/ShareButton";
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
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">📚 La mia collezione</h1>
          <p className="text-sm text-slate-400">{user.email}</p>
        </div>
        <nav className="flex items-center gap-3">
          <ShareButton
            userId={user.id}
            initialEnabled={profile?.share_enabled ?? false}
            initialSlug={profile?.share_slug ?? null}
          />
          <Link href="/settings" className="text-sm text-slate-300 hover:underline">
            Impostazioni / API key
          </Link>
          <LogoutButton />
        </nav>
      </header>

      <KpiBar items={(items ?? []) as MangaItem[]} />

      <div className="mb-6">
        <AddItemForm userId={user.id} />
      </div>

      <ItemsTable items={(items ?? []) as MangaItem[]} />
    </main>
  );
}

