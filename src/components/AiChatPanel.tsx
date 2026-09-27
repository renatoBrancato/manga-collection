"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prepareCoverBlob } from "@/lib/image-client";
import { MAX_CHAT_IMAGES, type ChatAction, type ChatEntityContext } from "@/lib/ai/schemas";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  imageUrls?: string[];
  /** Formato della versione precedente (una sola foto), ancora presente nelle chat salvate. */
  imageUrl?: string;
  actions?: ChatAction[];
};

type Attachment = { id: string; file: File; preview: string };

function messageImages(message: ChatMessage): string[] {
  return message.imageUrls ?? (message.imageUrl ? [message.imageUrl] : []);
}

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  text: "Ciao, sono Koma — il tuo assistente da collezione. Mandami una o più foto: posso riconoscere più manga insieme, oppure valutare lo stato di un volume da copertina, retro e colophon. Cerco anche tra i tuoi volumi e aggiorno i dati.",
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
  is_sealed: "Sigillato",
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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attachmentsRef = useRef<Attachment[]>([]);
  const [contextImageUrls, setContextImageUrls] = useState<string[]>([]);
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
            contextImageUrls?: string[];
            contextImageUrl?: string | null;
            completedActions?: string[];
            recentContext?: ChatEntityContext | null;
            open?: boolean;
          };
          if (Array.isArray(state.messages) && state.messages.length > 0) {
            setMessages(state.messages);
          }
          setContextImageUrls(
            state.contextImageUrls ?? (state.contextImageUrl ? [state.contextImageUrl] : [])
          );
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
        contextImageUrls,
        completedActions: [...completedActions],
        recentContext,
        open,
      })
    );
  }, [completedActions, contextImageUrls, hydrated, messages, open, recentContext, storageKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  // Su mobile la chat è a schermo intero: bloccare lo scroll del documento
  // evita che sotto l'overlay resti attiva la pagina e compaiano scroll
  // orizzontali una volta richiusa.
  useEffect(() => {
    if (!open) return;
    const isMobile = window.matchMedia("(max-width: 639px)").matches;
    if (!isMobile) return;

    const { overflow, position, width } = document.body.style;
    document.body.style.overflow = "hidden";
    document.body.style.position = "relative";
    document.body.style.width = "100%";
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.position = position;
      document.body.style.width = width;
    };
  }, [open]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  // Le anteprime locali (blob:) vanno liberate anche se il pannello viene
  // smontato con allegati ancora in attesa di invio.
  useEffect(() => {
    return () => attachmentsRef.current.forEach((attachment) => URL.revokeObjectURL(attachment.preview));
  }, []);

  function addImages(files: Iterable<File>) {
    const images = [...files].filter((file) => file.type.startsWith("image/"));
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (images.length === 0) return;

    const free = MAX_CHAT_IMAGES - attachments.length;
    const accepted = images.slice(0, Math.max(0, free));
    setError(
      images.length > accepted.length
        ? `Puoi allegare al massimo ${MAX_CHAT_IMAGES} foto per messaggio.`
        : null
    );
    if (accepted.length === 0) return;

    setAttachments((current) => [
      ...current,
      ...accepted.map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) })),
    ]);
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      if (removed) URL.revokeObjectURL(removed.preview);
      return current.filter((attachment) => attachment.id !== id);
    });
    setError(null);
  }

  // Svuota il compositore senza revocare le anteprime: il messaggio appena
  // inviato continua a mostrarle finché non arrivano gli URL definitivi.
  function detachAttachments() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setAttachments([]);
  }

  function resetChat() {
    setMessages([WELCOME_MESSAGE]);
    setContextImageUrls([]);
    setCompletedActions(new Set());
    setRecentContext(null);
    setError(null);
    attachments.forEach((attachment) => URL.revokeObjectURL(attachment.preview));
    detachAttachments();
    localStorage.removeItem(storageKey);
  }

  async function uploadImage(file: File): Promise<string> {
    const blob = await prepareCoverBlob(file);
    const form = new FormData();
    form.append("image", blob, "photo.jpg");

    const response = await fetch("/api/chat/image", { method: "POST", body: form });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Upload immagine fallito");
    return body.imageUrl as string;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if ((!input.trim() && attachments.length === 0) || loading) return;

    const sending = attachments;
    const text =
      input.trim() ||
      (sending.length > 1
        ? "Analizza queste foto e dimmi cosa riconosci."
        : "Analizza questa immagine e dimmi cosa riconosci.");
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      imageUrls: sending.length > 0 ? sending.map((attachment) => attachment.preview) : undefined,
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);
    detachAttachments();

    try {
      // Upload in parallelo, mantenendo l'ordine: la numerazione "Foto N"
      // vista dal modello deve corrispondere a quella mostrata all'utente.
      const imageUrls = await Promise.all(sending.map((attachment) => uploadImage(attachment.file)));
      sending.forEach((attachment) => URL.revokeObjectURL(attachment.preview));
      if (imageUrls.length > 0) {
        setContextImageUrls(imageUrls);
        setMessages((current) =>
          current.map((message) => (message.id === userMessage.id ? { ...message, imageUrls } : message))
        );
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          imageUrls,
          contextImageUrls: imageUrls.length > 0 ? imageUrls : contextImageUrls,
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
        setContextImageUrls([]);
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
      if (sending.length > 0) {
        // Upload fallito: le anteprime blob: non sopravvivono al ricaricamento
        // e non devono finire nella chat salvata.
        sending.forEach((attachment) => URL.revokeObjectURL(attachment.preview));
        setMessages((current) =>
          current.map((message) => (message.id === userMessage.id ? { ...message, imageUrls: undefined } : message))
        );
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
      if (imageUrl && contextImageUrls.includes(imageUrl)) {
        setContextImageUrls((current) => current.filter((url) => url !== imageUrl));
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
    <section className="fixed inset-0 z-50 flex flex-col overflow-hidden border-white/10 bg-slate-950/95 shadow-2xl shadow-black/70 backdrop-blur-xl sm:inset-auto sm:bottom-5 sm:right-5 sm:z-40 sm:h-[min(780px,88vh)] sm:w-[520px] sm:rounded-3xl sm:border">
      <header className="relative shrink-0 overflow-hidden border-b border-white/10 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top))] sm:pt-4">
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
                {messageImages(message).length === 1 && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={messageImages(message)[0]}
                    alt="Allegato"
                    className="mb-3 max-h-64 w-full rounded-xl object-cover ring-1 ring-white/10"
                  />
                )}
                {messageImages(message).length > 1 && (
                  <div className="mb-3 grid grid-cols-3 gap-1.5">
                    {messageImages(message).map((url, index) => (
                      <div key={`${url}-${index}`} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Foto ${index + 1}`}
                          className="aspect-[3/4] w-full rounded-lg object-cover ring-1 ring-white/10"
                        />
                        <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">
                          {index + 1}
                        </span>
                      </div>
                    ))}
                  </div>
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

      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-white/10 bg-slate-950/90 p-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:p-4 sm:pb-4"
      >
        {attachments.length === 0 && contextImageUrls.length > 0 && (
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/8 bg-slate-900 p-2.5">
            <div className="flex -space-x-3">
              {contextImageUrls.slice(0, 3).map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt="Immagine in contesto"
                  className="h-12 w-9 rounded object-cover ring-2 ring-slate-900"
                />
              ))}
            </div>
            <span className="min-w-0 flex-1 text-xs text-slate-400">
              {contextImageUrls.length > 1
                ? `${contextImageUrls.length} foto mantenute per i messaggi successivi`
                : "Immagine mantenuta per i messaggi successivi"}
            </span>
            <button type="button" onClick={() => setContextImageUrls([])} className="text-xs text-red-400">
              Rimuovi
            </button>
          </div>
        )}
        {attachments.length > 0 && (
          <div className="mb-3 rounded-xl border border-white/8 bg-slate-900 p-2.5">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {attachments.map((attachment, index) => (
                <div key={attachment.id} className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachment.preview}
                    alt={`Foto ${index + 1}`}
                    className="h-16 w-12 rounded-lg object-cover ring-1 ring-white/10"
                  />
                  <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    aria-label={`Rimuovi foto ${index + 1}`}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-950 text-[10px] text-slate-300 ring-1 ring-white/20 transition hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {attachments.length < MAX_CHAT_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Aggiungi altre foto"
                  className="flex h-16 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-600 text-lg text-slate-500 transition hover:border-indigo-400 hover:text-indigo-300"
                >
                  +
                </button>
              )}
            </div>
            <p className="mt-1.5 text-[10px] text-slate-500">
              {attachments.length}/{MAX_CHAT_IMAGES} foto · stesso manga da più lati o manga diversi
            </p>
          </div>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-slate-700 bg-slate-900 p-2 transition focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/15">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => addImages(event.target.files ?? [])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
            title={`Allega foto (max ${MAX_CHAT_IMAGES})`}
          >
            📎
          </button>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onPaste={(event) => {
              const pasted = [...event.clipboardData.files].filter((file) => file.type.startsWith("image/"));
              if (pasted.length > 0) {
                event.preventDefault();
                addImages(pasted);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            rows={2}
            placeholder="Scrivi a Koma o allega delle foto..."
            className="min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-base text-slate-100 outline-none placeholder:text-slate-600 sm:text-sm"
          />
          <button
            type="submit"
            disabled={loading || (!input.trim() && attachments.length === 0)}
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
