"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function randomSlug() {
  // 10 caratteri alfanumerici, sufficienti per un link non indovinabile
  // senza essere scomodo da copiare/leggere.
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

export default function ShareButton({
  userId,
  initialEnabled,
  initialSlug,
}: {
  userId: string;
  initialEnabled: boolean;
  initialSlug: string | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [slug, setSlug] = useState(initialSlug);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const shareUrl = slug && origin ? `${origin}/c/${slug}` : "";

  async function handleToggle() {
    setLoading(true);
    const nextEnabled = !enabled;
    const nextSlug = slug ?? randomSlug();

    const { error } = await supabase
      .from("profiles")
      .update({ share_enabled: nextEnabled, share_slug: nextSlug })
      .eq("id", userId);

    setLoading(false);
    if (error) {
      alert(`Errore: ${error.message}`);
      return;
    }
    setEnabled(nextEnabled);
    setSlug(nextSlug);
    router.refresh();
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
      >
        🔗 Condividi
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-xl">
          <p className="text-sm text-slate-300">
            Condividi la tua collezione con un link pubblico in sola lettura: chi lo apre può solo
            guardare, non può aggiungere o rimuovere nulla.
          </p>

          <label className="mt-3 flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={enabled}
              disabled={loading}
              onChange={handleToggle}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950"
            />
            Collezione pubblica
          </label>

          {enabled && slug && (
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-slate-950 px-2 py-1.5 text-xs text-emerald-400">
                {shareUrl}
              </code>
              <button
                onClick={handleCopy}
                className="rounded-lg bg-indigo-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-400"
              >
                {copied ? "Copiato!" : "Copia"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
