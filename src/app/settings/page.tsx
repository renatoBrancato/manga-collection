import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RegenerateKeyButton from "@/components/RegenerateKeyButton";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("api_key")
    .eq("id", user.id)
    .single();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tuo-dominio.vercel.app";
  const apiKey = profile?.api_key ?? "";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-50 sm:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">⚙️ Impostazioni</h1>
          <Link href="/dashboard" className="text-sm text-slate-300 hover:underline">
            ← Torna alla collezione
          </Link>
        </div>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="font-semibold">La tua API key personale</h2>
          <p className="mt-1 text-sm text-slate-400">
            Usala nella configurazione dell&apos;Action del tuo Custom GPT così i volumi scansionati
            vengono salvati nel tuo account.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-slate-950 px-3 py-2 text-xs text-emerald-400">
              {apiKey}
            </code>
            <RegenerateKeyButton />
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="font-semibold">Come collegare ChatGPT</h2>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-slate-300">
            <li>Su chatgpt.com vai su Explore GPTs → Create → configura un Custom GPT.</li>
            <li>
              Nelle istruzioni incolla il prompt suggerito (vedi{" "}
              <code className="text-emerald-400">public/gpt/instructions.md</code> nel progetto).
            </li>
            <li>
              In &quot;Actions&quot; → &quot;Create new action&quot;, importa lo schema OpenAPI da{" "}
              <code className="text-emerald-400">{siteUrl}/gpt/openapi.yaml</code>.
            </li>
            <li>
              Imposta l&apos;autenticazione dell&apos;Action su &quot;API Key&quot; → &quot;Bearer&quot;,
              incollando la key qui sopra.
            </li>
            <li>Fai una foto al dorso/copertina del volume nella chat: il GPT estrae i metadati, stima il valore cercando sul web, e li invia automaticamente alla tua collezione.</li>
          </ol>
        </section>
      </div>
    </main>
  );
}
