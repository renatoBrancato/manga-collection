"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MangaItem } from "@/lib/types";
import CoverImage from "@/components/CoverImage";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string); // already a data: URI
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function EditItemModal({ item, onClose }: { item: MangaItem; onClose: () => void }) {
  const router = useRouter();
  const [format, setFormat] = useState(item.format);
  const [graded, setGraded] = useState(!!item.grading_authority);
  const [imageUrl, setImageUrl] = useState(item.image_url ?? "");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewItem = imageFile
    ? { title: item.series ?? item.title, image_url: null, isbn: null } // real preview handled below via object URL
    : { title: item.series ?? item.title, image_url: imageUrl || null, isbn: item.isbn };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const isFirstPrintRaw = String(form.get("is_first_print") || "");
    const hasObiRaw = String(form.get("has_obi") || "");

    const patch: Record<string, unknown> = {
      series: String(form.get("series") || ""),
      title: String(form.get("series") || ""),
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
      language: String(form.get("language") || "") || null,
      estimated_value: form.get("estimated_value") ? Number(form.get("estimated_value")) : null,
      currency: String(form.get("currency") || "") || "EUR",
      notes: String(form.get("notes") || "") || null,
    };

    if (imageFile) {
      patch.image_base64 = await fileToBase64(imageFile);
    } else if (imageUrl !== (item.image_url ?? "")) {
      patch.image_url = imageUrl || null;
    }

    const res = await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = await res.json().catch(() => ({}));

    setSaving(false);
    if (!res.ok) {
      setError(body.error || "Errore durante il salvataggio");
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Modifica elemento</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="col-span-full flex items-center gap-4">
            {imageFile ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={URL.createObjectURL(imageFile)}
                alt="Anteprima"
                className="h-28 w-20 rounded-lg object-cover"
              />
            ) : (
              <CoverImage item={previewItem} className="h-28 w-20 rounded-lg" />
            )}
            <div className="flex-1 space-y-2">
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => {
                  setImageUrl(e.target.value);
                  setImageFile(null);
                }}
                placeholder="Link diretto a un'immagine (https://...jpg/.png)"
                className="input w-full"
              />
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                className="block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-500 file:px-3 file:py-1.5 file:text-white hover:file:bg-indigo-400"
              />
            </div>
          </div>

          <select value={format} onChange={(e) => setFormat(e.target.value as "tankobon" | "zashi")} className="input">
            <option value="tankobon">Tankobon (volume)</option>
            <option value="zashi">Zashi (rivista, es. Shonen Jump)</option>
          </select>
          <input
            name="series"
            required
            defaultValue={item.series ?? item.title}
            placeholder="Serie/Titolo *"
            className="input"
          />

          {format === "tankobon" ? (
            <input
              name="volume_number"
              type="number"
              step="0.1"
              defaultValue={item.volume_number ?? ""}
              placeholder="Numero volume"
              className="input"
            />
          ) : (
            <input
              name="issue_number"
              defaultValue={item.issue_number ?? ""}
              placeholder="Numero/uscita"
              className="input"
            />
          )}
          <input
            name="release_year"
            type="number"
            min="1900"
            max="2100"
            step="1"
            defaultValue={item.release_year ?? ""}
            placeholder="Anno di uscita"
            className="input"
          />
          <input name="publisher" defaultValue={item.publisher ?? ""} placeholder="Editore" className="input" />
          <input name="isbn" defaultValue={item.isbn ?? ""} placeholder="ISBN" className="input" />
          <input name="language" defaultValue={item.language ?? ""} placeholder="Lingua" className="input" />

          <select name="is_first_print" defaultValue={item.is_first_print == null ? "" : String(item.is_first_print)} className="input">
            <option value="">Prima stampa? (non specificato)</option>
            <option value="true">Sì, prima stampa (初版)</option>
            <option value="false">No, ristampa</option>
          </select>
          <select name="has_obi" defaultValue={item.has_obi == null ? "" : String(item.has_obi)} className="input">
            <option value="">Fascetta OBI? (non specificato)</option>
            <option value="true">Sì, presente</option>
            <option value="false">No, assente</option>
          </select>
          <input
            name="printing_notes"
            defaultValue={item.printing_notes ?? ""}
            placeholder="Note stampa (es. 3a ristampa)"
            className="input"
          />

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
              <select name="grading_authority" defaultValue={item.grading_authority ?? "CGC"} className="input">
                <option value="CGC">CGC</option>
                <option value="CBCS">CBCS</option>
                <option value="BGS">BGS</option>
                <option value="altro">Altro</option>
              </select>
              <input
                name="grading_value"
                type="number"
                step="0.1"
                defaultValue={item.grading_value ?? ""}
                placeholder="Voto (es. 9.8)"
                className="input"
              />
            </>
          ) : (
            <input
              name="condition_estimate"
              defaultValue={item.condition_estimate ?? ""}
              placeholder="Stima condizione (es. buono)"
              className="input"
            />
          )}

          <input
            name="estimated_value"
            type="number"
            step="0.01"
            defaultValue={item.estimated_value ?? ""}
            placeholder="Valore stimato"
            className="input"
          />
          <input name="currency" defaultValue={item.currency || "EUR"} placeholder="Valuta (es. EUR)" className="input" />
          <input name="notes" defaultValue={item.notes ?? ""} placeholder="Note" className="input" />

          <div className="col-span-full flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
            >
              {saving ? "Salvataggio..." : "Salva modifiche"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Annulla
            </button>
            {error && <span className="text-sm text-red-400">{error}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
