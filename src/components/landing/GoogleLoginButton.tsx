"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authRedirectOrigin } from "@/lib/site-url";

/** Pulsante di accesso con Google, in stile "vignetta" della landing. */
export default function GoogleLoginButton({
  label = "Accedi con Google",
  variant = "ink",
}: {
  label?: string;
  variant?: "ink" | "paper";
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setLoading(true);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${authRedirectOrigin()}/api/auth/callback` },
    });
    if (error) {
      console.error("[login] signInWithOAuth:", error.message);
      setError(error.message);
      setLoading(false);
    }
  }

  const palette =
    variant === "ink"
      ? "bg-[#111] text-white hover:bg-[#e60012]"
      : "bg-white text-[#111] hover:bg-[#ffe600]";

  return (
    <span className="inline-flex flex-col items-start gap-2">
    <button
      type="button"
      onClick={signIn}
      disabled={loading}
      className={`group relative inline-flex items-center gap-3 border-[3px] border-[#111] px-6 py-3.5 text-base font-black uppercase tracking-wide shadow-[6px_6px_0_#111] transition-all duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[9px_9px_0_#111] active:translate-x-1 active:translate-y-1 active:shadow-[2px_2px_0_#111] disabled:cursor-wait disabled:opacity-80 ${palette}`}
    >
      <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5 shrink-0 rounded-full bg-white p-0.5">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
      {loading ? "Apertura del portale…" : label}
      <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
        ▶
      </span>
    </button>
    {error && (
      <span role="alert" className="border-2 border-[#111] bg-[#ffe600] px-2 py-1 text-xs font-bold normal-case">
        Accesso non riuscito: {error}
      </span>
    )}
    </span>
  );
}
