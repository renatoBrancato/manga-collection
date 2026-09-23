"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prepareCoverBlob } from "@/lib/image-client";
import type { ChatAction } from "@/lib/ai/schemas";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  imageUrl?: string;
  actions?: ChatAction[];
};

function actionTitle(action: ChatAction): string {
  if (action.type === "add") {
    const number = action.payload.volume_number ?? action.payload.issue_number;
    return `Aggiungi ${action.payload.series}${number != null ? ` #${number}` : ""}`;
  }
  return `Aggiorna ${action.payload.series ?? "elemento selezionato"}`;
}

function actionDetails(action: ChatAction): Array<[string, string]> {
  const ignored = new Set(["id", "image_url"]);
  return Object.entries(action.payload)
    .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== "")
    .map(([key, value]) => [key, value === null ? "svuota il campo" : String(value)]);
}

export default function AiChatPanel() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [contextImageUrl, setContextImageUrl] = useState<string | null>(null);
  const [previousResponseId, setPreviousResponseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Ciao! Posso cercare nella collezione, aggiungere o modificare manga. Puoi anche allegare una foto della copertina o del colophon.",
    },
  ]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  function selectImage(file: File | null) {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    if (!file && fileInputRef.current) fileInputRef.current.value = "";
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : null);
    setError(null);
  }

  async function uploadImage(file: File): Promise<string> {
    const blob = await prepareCoverBlob(file);
    const form = new FormData();
    form.append("image", blob, "cover.jpg");

    const response = await fetch("/api/chat/image", { method: "POST", body: form });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Upload immagine fallito");
    return body.imageUrl as string;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if ((!input.trim() && !imageFile) || loading) return;

    const text = input.trim() || "Analizza questa immagine e dimmi cosa riconosci.";
    const localPreview = imagePreview ?? undefined;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      imageUrl: localPreview,
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const imageUrl = imageFile ? await uploadImage(imageFile) : null;
      if (imageUrl) {
        setContextImageUrl(imageUrl);
        setMessages((current) =>
          current.map((message) => (message.id === userMessage.id ? { ...message, imageUrl } : message))
        );
      }
      selectImage(null);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          imageUrl,
          contextImageUrl: imageUrl ?? contextImageUrl,
          previousResponseId,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Richiesta AI fallita");

      setPreviousResponseId(body.responseId);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: body.text,
          actions: body.actions,
        },
      ]);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Errore durante la richiesta";
      if (imageFile) {
        setMessages((current) =>
          current.map((message) => (message.id === userMessage.id ? { ...message, imageUrl: undefined } : message))
        );
        selectImage(null);
      }
      setError(message);
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: `Non sono riuscito a completare la richiesta: ${message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmAction(messageId: string, index: number, action: ChatAction) {
    const actionKey = `${messageId}:${index}`;
    setConfirming(actionKey);
    setError(null);

    try {
      const response = await fetch("/api/chat/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Operazione fallita");

      setCompletedActions((current) => new Set(current).add(actionKey));
      if (action.payload.image_url && action.payload.image_url === contextImageUrl) {
        setContextImageUrl(null);
      }
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text:
            (action.type === "add" ? "Elemento aggiunto alla collezione." : "Elemento aggiornato correttamente.") +
            (body.imageWarning ? ` Attenzione: ${body.imageWarning}` : ""),
        },
      ]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Operazione fallita");
    } finally {
      setConfirming(null);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 rounded-full bg-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-xl shadow-indigo-950/40 transition hover:bg-indigo-400"
      >
        ✨ Chat AI
      </button>
    );
  }

  return (
    <section className="fixed inset-x-3 bottom-3 z-40 flex max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50 sm:left-auto sm:w-[430px]">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="font-semibold text-slate-100">✨ Assistente collezione</h2>
          <p className="text-xs text-slate-500">Le modifiche richiedono sempre conferma</p>
        </div>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white" aria-label="Chiudi chat">
          ✕
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "ml-10" : "mr-6"}>
            <div
              className={
                message.role === "user"
                  ? "rounded-2xl rounded-br-sm bg-indigo-500 px-3 py-2 text-sm text-white"
                  : "rounded-2xl rounded-bl-sm bg-slate-800 px-3 py-2 text-sm text-slate-200"
              }
            >
              {message.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={message.imageUrl} alt="Allegato" className="mb-2 max-h-40 rounded-lg object-cover" />
              )}
              <p className="whitespace-pre-wrap">{message.text}</p>
            </div>

            {message.actions?.map((action, index) => {
              const actionKey = `${message.id}:${index}`;
              const completed = completedActions.has(actionKey);
              return (
                <div key={actionKey} className="mt-2 rounded-xl border border-indigo-500/40 bg-indigo-950/30 p-3">
                  <p className="text-sm font-semibold text-indigo-200">{actionTitle(action)}</p>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 text-xs">
                    {actionDetails(action).map(([key, value]) => (
                      <div key={key} className="contents">
                        <dt className="text-slate-500">{key}</dt>
                        <dd className="truncate text-slate-300">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {action.payload.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={action.payload.image_url} alt="Copertina proposta" className="mt-2 h-20 rounded object-cover" />
                  )}
                  <button
                    onClick={() => confirmAction(message.id, index, action)}
                    disabled={completed || confirming === actionKey}
                    className="mt-3 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {completed ? "Confermato" : confirming === actionKey ? "Salvataggio..." : "Conferma"}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
        {loading && <p className="text-sm text-slate-500">Analisi in corso...</p>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-slate-800 p-3">
        {!imagePreview && contextImageUrl && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-950 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={contextImageUrl} alt="Immagine in contesto" className="h-12 w-9 rounded object-cover" />
            <span className="min-w-0 flex-1 text-xs text-slate-400">
              Immagine mantenuta per i messaggi successivi
            </span>
            <button type="button" onClick={() => setContextImageUrl(null)} className="text-xs text-red-400">
              Rimuovi
            </button>
          </div>
        )}
        {imagePreview && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-950 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview} alt="Anteprima allegato" className="h-14 w-10 rounded object-cover" />
            <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{imageFile?.name}</span>
            <button type="button" onClick={() => selectImage(null)} className="text-xs text-red-400">
              Rimuovi
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => selectImage(event.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-slate-700 px-3 py-2 text-lg text-slate-300 hover:bg-slate-800"
            title="Allega immagine"
          >
            📎
          </button>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            placeholder="Es. aggiungi questo manga alla collezione..."
            className="input min-h-10 flex-1 resize-none"
          />
          <button
            type="submit"
            disabled={loading || (!input.trim() && !imageFile)}
            className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            Invia
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </form>
    </section>
  );
}
