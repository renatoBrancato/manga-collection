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

    const { error } = await supabase.from("items").insert({
      user_id: userId,
      title: String(form.get("title") || ""),
      series: String(form.get("series") || "") || null,
      format,
      volume_number:
        format === "tankobon" && form.get("volume_number") ? Number(form.get("volume_number")) : null,
      issue_number: format === "zashi" ? String(form.get("issue_number") || "") || null : null,
      release_date: String(form.get("release_date") || "") || null,
      publisher: String(form.get("publisher") || "") || null,
      isbn: String(form.get("isbn") || "") || null,
      is_first_print: isFirstPrintRaw === "" ? null : isFirstPrintRaw === "true",
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
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value as "tankobon" | "zashi")}
        className="input"
      >
        <option value="tankobon">Tankobon (volume)</option>
        <option value="zashi">Zashi (rivista, es. Shonen Jump)</option>
      </select>
      <input name="title" required placeholder="Titolo *" className="input" />
      <input name="series" placeholder="Serie" className="input" />

      {format === "tankobon" ? (
        <input name="volume_number" type="number" step="0.1" placeholder="Numero volume" className="input" />
      ) : (
        <input name="issue_number" placeholder="Numero/uscita" className="input" />
      )}
      <input name="release_date" type="date" placeholder="Data pubblicazione" className="input" />
      <input name="publisher" placeholder="Editore" className="input" />
      <input name="isbn" placeholder="ISBN" className="input" />

      <select name="is_first_print" defaultValue="" className="input">
        <option value="">Prima stampa? (non specificato)</option>
        <option value="true">Sì, prima stampa (初版)</option>
        <option value="false">No, ristampa</option>
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
