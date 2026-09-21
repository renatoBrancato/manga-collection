"use client";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();

  async function signInWithGoogle() {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${siteUrl}/api/auth/callback` },
    });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 px-4 text-slate-50">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-xl">
        <h1 className="text-2xl font-bold">📚 Manga Collection</h1>
        <p className="mt-2 text-sm text-slate-400">
          Registra i tuoi tankōbon e Shonen Jump, scansionandoli con ChatGPT.
        </p>
        <button
          onClick={signInWithGoogle}
          className="mt-6 w-full rounded-lg bg-white px-4 py-2.5 font-medium text-slate-900 transition hover:bg-slate-200"
        >
          Accedi con Google
        </button>
      </div>
    </main>
  );
}
