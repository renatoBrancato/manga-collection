"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prepareCoverBlob } from "@/lib/image-client";
import type { ChatAction, ChatEntityContext } from "@/lib/ai/schemas";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  imageUrl?: string;
  actions?: ChatAction[];
};

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  text: "Ciao, sono Koma — il tuo assistente da collezione. Posso riconoscere un manga da una foto, cercare tra i tuoi volumi e preparare aggiunte o modifiche.",
};

const FIELD_LABELS: Record<string, string> = {
  series: "Serie",
  format: "Formato",
  volume_number: "Volume",
  issue_number: "Numero",
  release_year: "Anno",
  publisher: "Editore",
  isbn: "ISBN",
  is_first_print: "Prima stampa",
  has_obi: "OBI",
  printing_notes: "Stampa",
  grading_authority: "Grading",
  grading_value: "Voto",
  condition_estimate: "Condizione",
  language: "Lingua",
  estimated_value: "Valore",
  currency: "Valuta",
  notes: "Note",
};

function actionTitle(action: ChatAction): string {
  if (action.type === "add") {
    const number = action.payload.volume_number ?? action.payload.issue_number;
    return `Aggiungi ${action.payload.series}${number != null ? ` #${number}` : ""}`;
  }
  if (action.type === "update") return `Aggiorna ${action.payload.series ?? "elemento selezionato"}`;
  return `Rimuovi ${action.payload.series}`;
}

function actionDetails(action: ChatAction): Array<[string, string]> {
  const ignored = new Set(["id", "image_url"]);
  return Object.entries(action.payload)
    .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== "")
    .map(([key, value]) => [
      FIELD_LABELS[key] ?? key,
      value === null
        ? "Svuota il campo"
        : typeof value === "boolean"
          ? value
            ? "Sì"
            : "No"
          : String(value),
    ]);
}

function actionImageUrl(action: ChatAction): string | null {
  return action.type === "delete" ? null : action.payload.image_url ?? null;
}

export default function AiChatPanel({ userId }: { userId: string }) {
  const router = useRouter();
  const storageKey = `manga-collection:koma-chat:${userId}`;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [contextImageUrl, setContextImageUrl] = useState<string | null>(null);
  const [recentContext, setRecentContext] = useState<ChatEntityContext | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [completedActions, setCompletedActions] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const state = JSON.parse(saved) as {
            messages?: ChatMessage[];
            contextImageUrl?: string | null;
            completedActions?: string[];
            recentContext?: ChatEntityContext | null;
            open?: boolean;
          };
          if (Array.isArray(state.messages) && state.messages.length > 0) {
            setMessages(state.messages);
          }
          setContextImageUrl(state.contextImageUrl ?? null);
          setCompletedActions(new Set(state.completedActions ?? []));
          setRecentContext(state.recentContext ?? null);
          setOpen(state.open ?? false);
        }
      } catch {
        localStorage.removeItem(storageKey);
      } finally {
        setHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        messages,
        contextImageUrl,
        completedActions: [...completedActions],
        recentContext,
        open,
      })
    );
  }, [completedActions, contextImageUrl, hydrated, messages, open, recentContext, storageKey]);

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

  function resetChat() {
    setMessages([WELCOME_MESSAGE]);
    setContextImageUrl(null);
    setCompletedActions(new Set());
    setRecentContext(null);
    setError(null);
    selectImage(null);
    localStorage.removeItem(storageKey);
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
          history: messages
            .filter((message) => message.id !== "welcome")
            .slice(-6)
            .map((message) => ({ role: message.role, text: message.text.slice(0, 1000) })),
          recentContext,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Richiesta AI fallita");

      if ("recentContext" in body) setRecentContext(body.recentContext ?? null);
      if (body.executed > 0) {
        setContextImageUrl(null);
        router.refresh();
      }
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
      const imageUrl = actionImageUrl(action);
      if (imageUrl && imageUrl === contextImageUrl) {
        setContextImageUrl(null);
      }
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text:
            (action.type === "add"
              ? "Elemento aggiunto alla collezione."
              : action.type === "update"
                ? "Elemento aggiornato correttamente."
                : "Elemento rimosso dalla collezione.") +
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
        className="group fixed bottom-5 right-5 z-40 flex items-center gap-3 rounded-full border border-indigo-300/20 bg-gradient-to-r from-indigo-600 to-violet-500 px-4 py-3 text-sm font-semibold text-white shadow-2xl shadow-indigo-950/50 transition hover:-translate-y-0.5 hover:shadow-indigo-900/60"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-base ring-1 ring-white/20">
          コ
        </span>
        <span className="pr-1">Chiedi a Koma</span>
      </button>
    );
  }

  return (
    <section className="fixed inset-x-2 bottom-2 top-2 z-40 flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 shadow-2xl shadow-black/70 backdrop-blur-xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:top-auto sm:h-[min(780px,88vh)] sm:w-[520px]">
      <header className="relative overflow-hidden border-b border-white/10 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-5 py-4">
        <div className="absolute -right-10 -top-14 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-xl font-bold text-white ring-1 ring-white/25 shadow-lg">
              コ
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Koma</h2>
                <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-medium text-emerald-100 ring-1 ring-emerald-300/30">
                  online
                </span>
              </div>
              <p className="text-xs text-indigo-100/80">Il tuo assistente manga</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetChat}
              className="rounded-full bg-black/15 px-3 py-2 text-[11px] font-medium text-white/75 transition hover:bg-black/25 hover:text-white"
              title="Cancella la conversazione corrente"
            >
              Nuova chat
            </button>
            <button
              onClick={() => setOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/15 text-white/80 transition hover:bg-black/25 hover:text-white"
              aria-label="Chiudi chat"
            >
              ✕
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.08),_transparent_35%)] p-4 sm:p-5">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex items-end gap-2.5 ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {message.role === "assistant" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xs font-bold text-white shadow-md">
                コ
              </div>
            )}
            <div className={`max-w-[84%] ${message.role === "user" ? "order-first" : ""}`}>
              <div
                className={
                  message.role === "user"
                    ? "rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-500 to-violet-600 px-4 py-3 text-sm leading-relaxed text-white shadow-lg shadow-indigo-950/20"
                    : "rounded-2xl rounded-bl-md border border-white/8 bg-slate-900 px-4 py-3 text-sm leading-relaxed text-slate-200 shadow-lg shadow-black/10"
                }
              >
                {message.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={message.imageUrl}
                    alt="Allegato"
                    className="mb-3 max-h-64 w-full rounded-xl object-cover ring-1 ring-white/10"
                  />
                )}
                <p className="whitespace-pre-wrap">{message.text}</p>
              </div>

              {message.actions?.map((action, index) => {
                const actionKey = `${message.id}:${index}`;
                const completed = completedActions.has(actionKey);
                return (
                  <div
                    key={actionKey}
                    className="mt-3 overflow-hidden rounded-2xl border border-indigo-400/25 bg-gradient-to-br from-indigo-950/80 to-slate-900 shadow-xl shadow-black/15"
                  >
                    <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-sm">
                        {action.type === "add" ? "＋" : "✎"}
                      </span>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-indigo-300">
                          Proposta di Koma
                        </p>
                        <p className="text-sm font-semibold text-white">{actionTitle(action)}</p>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex gap-3">
                        {actionImageUrl(action) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={actionImageUrl(action)!}
                            alt="Copertina proposta"
                            className="h-28 w-20 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                          />
                        )}
                        <dl className="grid min-w-0 flex-1 grid-cols-[auto_1fr] content-start gap-x-3 gap-y-1.5 text-xs">
                          {actionDetails(action).map(([key, value]) => (
                            <div key={key} className="contents">
                              <dt className="text-slate-500">{key}</dt>
                              <dd className="truncate font-medium text-slate-200">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                      <button
                        onClick={() => confirmAction(message.id, index, action)}
                        disabled={completed || confirming === actionKey}
                        className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-400 disabled:opacity-50"
                      >
                        {completed
                          ? "✓ Operazione confermata"
                          : confirming === actionKey
                            ? "Salvataggio..."
                            : "Conferma e salva"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xs font-bold text-white">
              コ
            </div>
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-white/8 bg-slate-900 px-4 py-3">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fuchsia-400 [animation-delay:300ms]" />
              <span className="ml-2 text-xs text-slate-500">Koma sta analizzando...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-white/10 bg-slate-950/90 p-3.5 sm:p-4">
        {!imagePreview && contextImageUrl && (
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/8 bg-slate-900 p-2.5">
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
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/8 bg-slate-900 p-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview} alt="Anteprima allegato" className="h-14 w-10 rounded object-cover" />
            <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{imageFile?.name}</span>
            <button type="button" onClick={() => selectImage(null)} className="text-xs text-red-400">
              Rimuovi
            </button>
          </div>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-slate-700 bg-slate-900 p-2 transition focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/15">
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
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
            placeholder="Scrivi a Koma o allega una foto..."
            className="min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600"
          />
          <button
            type="submit"
            disabled={loading || (!input.trim() && !imageFile)}
            className="flex h-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 text-sm font-semibold text-white shadow-md transition hover:from-indigo-400 hover:to-violet-400 disabled:opacity-40"
          >
            ↑
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between px-1">
          <p className="text-[10px] text-slate-600">Invio con Enter · nuova riga con Shift+Enter</p>
          <p className="text-[10px] text-slate-600">Koma può sbagliare: controlla sempre i dati salvati</p>
        </div>
        {error && <p className="mt-2 rounded-lg bg-red-950/40 px-3 py-2 text-xs text-red-300">{error}</p>}
      </form>
    </section>
  );
}
