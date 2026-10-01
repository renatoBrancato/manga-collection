"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [mobile, setMobile] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 16, width: 320 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const shareUrl = slug && origin ? `${origin}/c/${slug}` : "";

  // Il pannello parte allineato al bordo destro del pulsante, ma deve
  // restare dentro la finestra: il pulsante Condividi sta a sinistra
  // dell'hero, quindi senza limiti il pannello uscirebbe dallo schermo.
  function updatePopoverPosition() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const isMobile = window.matchMedia("(max-width: 639px)").matches;
    setMobile(isMobile);
    if (isMobile) return;

    const margin = 16;
    const width = Math.min(320, window.innerWidth - margin * 2);
    const left = Math.min(Math.max(margin, rect.right - width), window.innerWidth - width - margin);
    setPosition({ top: rect.bottom + 8, left, width });
  }

  function togglePopover() {
    if (open) {
      setOpen(false);
      return;
    }
    setOrigin(window.location.origin);
    updatePopoverPosition();
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const reposition = () => updatePopoverPosition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

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
        ref={buttonRef}
        onClick={togglePopover}
        className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800"
      >
        🔗 Condividi
      </button>

      {open &&
        createPortal(
          <div
            className={`fixed inset-0 z-[100] ${mobile ? "flex items-center justify-center bg-black/70 p-4" : ""}`}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal={mobile}
              aria-label="Condividi la collezione"
              className={`rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-xl ${
                mobile ? "w-full max-w-sm" : "fixed"
              }`}
              style={!mobile ? { top: position.top, left: position.left, width: position.width } : undefined}
            >
              {mobile && (
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold text-white">Condividi la collezione</h2>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-md px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-white"
                    aria-label="Chiudi"
                  >
                    ✕
                  </button>
                </div>
              )}
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
                <div className="mt-3 flex min-w-0 items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-950 px-2 py-1.5 text-xs text-emerald-400">
                    {shareUrl}
                  </code>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 rounded-lg bg-indigo-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-400"
                  >
                    {copied ? "Copiato!" : "Copia"}
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
