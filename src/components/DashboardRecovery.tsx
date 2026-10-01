"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const RETRY_KEY = "dashboard-load-retries";
const MAX_AUTO_RETRIES = 2;

/**
 * Se il server non è riuscito a leggere la collezione (rete, sessione appena
 * rinnovata, Supabase lento), ricarica i dati in automatico al massimo due
 * volte invece di mostrare una collezione vuota. Dopo, lascia un pulsante.
 */
export default function DashboardRecovery({ failed, suspicious }: { failed: boolean; suspicious: boolean }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!failed && !suspicious) {
      sessionStorage.removeItem(RETRY_KEY);
      return;
    }
    const attempts = Number(sessionStorage.getItem(RETRY_KEY) ?? "0");
    if (attempts >= MAX_AUTO_RETRIES) return;
    sessionStorage.setItem(RETRY_KEY, String(attempts + 1));
    const timer = setTimeout(() => router.refresh(), 400 * (attempts + 1));
    return () => clearTimeout(timer);
  }, [failed, suspicious, router]);

  if (!failed) return null;

  return (
    <div
      role="alert"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-5 py-4 text-sm text-amber-100"
    >
      <span>⚠️ Non sono riuscito a caricare la collezione (connessione o sessione). Riprovo in automatico; se resta così, premi Riprova.</span>
      <button
        type="button"
        disabled={retrying}
        onClick={() => {
          setRetrying(true);
          sessionStorage.removeItem(RETRY_KEY);
          window.location.reload();
        }}
        className="rounded-lg border border-amber-300/40 px-3 py-1.5 font-medium transition hover:bg-amber-400/20 disabled:opacity-60"
      >
        Riprova
      </button>
    </div>
  );
}
