"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Manual "add item" form for the dashboard, used when the user wants to add
 * a volume without going through the ChatGPT scanning flow.
 */
export default function AddItemForm({ userId }: { userId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const { error } = await supabase.from("items").insert({
      user_id: userId,
      title: String(form.get("title") || ""),
      series: String(form.get("series") || "") || null,
      volume_number: form.get("volume_number") ? Number(form.get("volume_number")) : null,
      publisher: String(form.get("publisher") || "") || null,
      condition: String(form.get("condition") || "") || null,
      status: String(form.get("status") || "owned"),
      estimated_value: form.get("estimated_value") ? Number(form.get("estimated_value")) : null,
      source: "manual",
    });

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    (e.target as HTMLFormElement).reset();
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
      >
        + Aggiungi manualmente
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <input name="title" required placeholder="Titolo *" className="input" />
      <input name="series" placeholder="Serie" className="input" />
      <input name="volume_number" type="number" step="0.1" placeholder="Volume" className="input" />
      <input name="publisher" placeholder="Editore" className="input" />
      <input name="condition" placeholder="Stato (nuovo, buono...)" className="input" />
      <select name="status" defaultValue="owned" className="input">
        <option value="owned">Posseduto</option>
        <option value="reading">In lettura</option>
        <option value="completed">Completato</option>
        <option value="wanted">Da acquistare</option>
      </select>
      <input name="estimated_value" type="number" step="0.01" placeholder="Valore stimato (€)" className="input" />
      <div className="col-span-full flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
        >
          {saving ? "Salvataggio..." : "Salva"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          Annulla
        </button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </form>
  );
}
