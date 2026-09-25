"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Manual "add item" form for the dashboard, used when the user wants to add
 * a volume/issue without going through the MCP scanning flow.
 */
export default function AddItemForm({ userId }: { userId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<"tankobon" | "zashi">("tankobon");
  const [graded, setGraded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const isFirstPrintRaw = String(form.get("is_first_print") || "");
    const hasObiRaw = String(form.get("has_obi") || "");

    const { error } = await supabase.from("items").insert({
      user_id: userId,
      title: String(form.get("series") || ""),
      series: String(form.get("series") || "") || null,
      format,
      volume_number:
        format === "tankobon" && form.get("volume_number") ? Number(form.get("volume_number")) : null,
      issue_number: format === "zashi" ? String(form.get("issue_number") || "") || null : null,
      release_year: form.get("release_year") ? Number(form.get("release_year")) : null,
      publisher: String(form.get("publisher") || "") || null,
      isbn: String(form.get("isbn") || "") || null,
      is_first_print: isFirstPrintRaw === "" ? null : isFirstPrintRaw === "true",
      has_obi: hasObiRaw === "" ? null : hasObiRaw === "true",
      printing_notes: String(form.get("printing_notes") || "") || null,
      grading_authority: graded ? String(form.get("grading_authority") || "") || null : null,
      grading_value: graded && form.get("grading_value") ? Number(form.get("grading_value")) : null,
      condition_estimate: !graded ? String(form.get("condition_estimate") || "") || null : null,
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
    setGraded(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-indigo-400/20 bg-gradient-to-r from-indigo-500/15 via-violet-500/10 to-transparent px-5 py-4 text-left transition hover:border-indigo-400/40 hover:from-indigo-500/25 sm:w-auto sm:min-w-[320px]"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-lg shadow-indigo-950/40 transition group-hover:scale-105">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span>
            <span className="block font-semibold text-white">Nuovo pezzo</span>
            <span className="mt-0.5 block text-xs text-slate-400">Inserisci volume o rivista nella collezione</span>
          </span>
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-5 w-5 text-indigo-300 transition group-hover:translate-x-1"
          aria-hidden="true"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value as "tankobon" | "zashi")}
        className="input"
      >
        <option value="tankobon">Tankobon (volume)</option>
        <option value="zashi">Zashi (rivista, es. Shonen Jump)</option>
      </select>
      <input name="series" required placeholder="Serie/Titolo *" className="input" />

      {format === "tankobon" ? (
        <input name="volume_number" type="number" step="0.1" placeholder="Numero volume" className="input" />
      ) : (
        <input name="issue_number" placeholder="Numero/uscita" className="input" />
      )}
      <input
        name="release_year"
        type="number"
        min="1900"
        max="2100"
        step="1"
        placeholder="Anno di uscita"
        className="input"
      />
      <input name="publisher" placeholder="Editore" className="input" />
      <input name="isbn" placeholder="ISBN" className="input" />

      <select name="is_first_print" defaultValue="" className="input">
        <option value="">Prima stampa? (non specificato)</option>
        <option value="true">Sì, prima stampa (初版)</option>
        <option value="false">No, ristampa</option>
      </select>
      <select name="has_obi" defaultValue="" className="input">
        <option value="">Fascetta OBI? (non specificato)</option>
        <option value="true">Sì, presente</option>
        <option value="false">No, assente</option>
      </select>
      <input name="printing_notes" placeholder="Note stampa (es. 3a ristampa)" className="input" />

      <label className="col-span-full flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={graded}
          onChange={(e) => setGraded(e.target.checked)}
          className="h-4 w-4 rounded border-slate-700 bg-slate-950"
        />
        Gradato da un ente (CGC/CBCS/BGS)
      </label>

      {graded ? (
        <>
          <select name="grading_authority" defaultValue="CGC" className="input">
            <option value="CGC">CGC</option>
            <option value="CBCS">CBCS</option>
            <option value="BGS">BGS</option>
            <option value="altro">Altro</option>
          </select>
          <input name="grading_value" type="number" step="0.1" placeholder="Voto (es. 9.8)" className="input" />
        </>
      ) : (
        <input name="condition_estimate" placeholder="Stima condizione (es. buono)" className="input" />
      )}

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
