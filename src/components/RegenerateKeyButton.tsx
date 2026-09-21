"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function RegenerateKeyButton() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRegenerate() {
    if (!confirm("Rigenerare la API key? La vecchia smetterà subito di funzionare nel GPT.")) return;
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({ api_key: crypto.randomUUID() }).eq("id", user.id);
    }
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={handleRegenerate}
      disabled={loading}
      className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
    >
      {loading ? "..." : "Rigenera key"}
    </button>
  );
}
