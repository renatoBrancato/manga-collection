import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ItemsTable from "@/components/ItemsTable";
import AddItemForm from "@/components/AddItemForm";
import LogoutButton from "@/components/LogoutButton";
import KpiBar from "@/components/KpiBar";
import ShareButton from "@/components/ShareButton";
import AiChatPanel from "@/components/AiChatPanel";
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
      <header className="relative mb-7 overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/30">
        <div
          aria-hidden="true"
          className="absolute -inset-3 bg-cover bg-[center_25%] opacity-60 lg:scale-105 lg:bg-center lg:opacity-30 lg:blur-md lg:brightness-50"
          style={{ backgroundImage: "url('/manga-heroes.gif')" }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 hidden w-[68%] bg-contain bg-right bg-no-repeat lg:block"
          style={{ backgroundImage: "url('/manga-heroes.gif')" }}
        />
        <div className="absolute inset-0 bg-slate-950/55 lg:hidden" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-slate-950 via-slate-950/85 via-45% to-slate-950/5 lg:block" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_22%,rgba(99,102,241,0.3),transparent_34%)] lg:w-[58%]" />

        <div className="relative flex min-h-[255px] flex-col justify-between gap-8 p-6 sm:p-8 lg:w-[58%] lg:p-10">
          <nav className="flex flex-wrap items-center gap-2.5">
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
          </nav>

          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-indigo-300">
              <span className="h-px w-8 bg-indigo-400" />
              私のコレクション · Manga Collection
            </div>
            <h1 className="max-w-xl text-3xl font-black leading-tight text-white sm:text-4xl">
              La tua storia,
              <span className="block bg-gradient-to-r from-indigo-300 via-violet-200 to-pink-300 bg-clip-text text-transparent">
                volume dopo volume.
              </span>
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-300 sm:text-base">
              Ogni collezione ha il suo primo capitolo. Cataloga, valorizza e custodisci ogni pezzo della tua.
            </p>
            <p className="mt-4 text-xs text-slate-500">{user.email}</p>
          </div>
        </div>
      </header>

      <KpiBar items={(items ?? []) as MangaItem[]} />

      <div className="mb-6">
        <AddItemForm userId={user.id} />
      </div>

      <ItemsTable items={(items ?? []) as MangaItem[]} />
      <AiChatPanel userId={user.id} />
    </main>
  );
}
