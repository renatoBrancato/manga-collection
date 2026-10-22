import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site-url";
import RegenerateKeyButton from "@/components/RegenerateKeyButton";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { getTranslations } from "@/lib/i18n/server";

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

  const { t } = await getTranslations();
  const mcpBaseUrl = siteUrl();
  const apiKey = profile?.api_key ?? "";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-50 sm:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{t.settings.heading}</h1>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link href="/dashboard" className="text-sm text-slate-300 hover:underline">
              {t.settings.backToCollection}
            </Link>
          </div>
        </div>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="font-semibold">{t.settings.apiKeyTitle}</h2>
          <p className="mt-1 text-sm text-slate-400">
            {t.settings.apiKeyDescription}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-slate-950 px-3 py-2 text-xs text-emerald-400">
              {apiKey}
            </code>
            <RegenerateKeyButton />
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="font-semibold">{t.settings.howToConnectTitle}</h2>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-slate-300">
            <li>
              {t.settings.step1Before}
              <strong>{t.settings.step1Strong}</strong>
              {t.settings.step1After}
            </li>
            <li>
              {t.settings.step2Before}
              <strong>{t.settings.step2Strong}</strong>
              {t.settings.step2After}{" "}
              <code className="text-emerald-400">{mcpBaseUrl}/api/mcp</code>
            </li>
            <li>
              {t.settings.step3Before}
              <strong>{t.settings.step3Strong}</strong>
            </li>
            <li>
              {t.settings.step4Before}
              <code className="text-emerald-400">add_manga_item</code>
              {t.settings.step4Middle}
              <code className="text-emerald-400">list_manga_items</code>
              {t.settings.step4After}
            </li>
            <li>
              {t.settings.step5}
            </li>
          </ol>
        </section>
      </div>
    </main>
  );
}
