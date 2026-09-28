import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { listItems } from "@/lib/items";
import { MAX_CHAT_IMAGES, runCollectionChat } from "@/lib/ai/openai";
import { executeChatAction } from "@/lib/ai/actions";
import { chatEntityContextSchema } from "@/lib/ai/schemas";

// Più foto e più pezzi richiedono diversi giri con il modello.
export const maxDuration = 300;

const requestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  imageUrls: z.array(z.string().url()).max(MAX_CHAT_IMAGES).optional(),
  contextImageUrls: z.array(z.string().url()).max(MAX_CHAT_IMAGES).optional(),
  // Campi singoli della versione precedente, accettati per compatibilità.
  imageUrl: z.string().url().nullable().optional(),
  contextImageUrl: z.string().url().nullable().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().max(1000),
      })
    )
    .max(6)
    .optional(),
  recentContext: chatEntityContextSchema.nullable().optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = requestSchema.parse(await request.json());
    const items = await listItems(user.id);
    const imageUrls = body.imageUrls ?? (body.imageUrl ? [body.imageUrl] : []);
    const contextImageUrls = body.contextImageUrls ?? (body.contextImageUrl ? [body.contextImageUrl] : []);
    const result = await runCollectionChat({
      message: body.message,
      imageUrls,
      actionImageUrls: imageUrls.length > 0 ? imageUrls : contextImageUrls,
      history: body.history ?? [],
      recentContext: body.recentContext ?? null,
      items,
      userId: user.id,
    });

    if (result.actions.length === 0) {
      return Response.json(result);
    }

    const executions = await Promise.all(
      result.actions.map(async (action) => ({
        action,
        result: await executeChatAction(user.id, action),
      }))
    );
    const succeeded = executions.filter(({ result: execution }) => !execution.error);
    const failed = executions.filter(({ result: execution }) => execution.error);

    const successText = succeeded
      .map(({ action, result: execution }) => {
        const item = execution.item;
        const name = item?.series ?? item?.title ?? action.payload.series ?? "elemento";
        const number = item?.volume_number ?? item?.issue_number;
        const verb = action.type === "add" ? "Aggiunto" : action.type === "update" ? "Aggiornato" : "Rimosso";
        const label = `${name}${number != null ? ` #${number}` : ""}`;
        if (action.type === "delete") {
          return `Rimosso ${label}${action.payload.forget_history ? " — anche dallo storico del valore" : " — lo storico del valore resta"}`;
        }

        if (result.intent.valuation && action.type === "update") {
          if (action.payload.estimated_value != null) {
            return `Valore aggiornato per ${label} — ${action.payload.estimated_value} ${
              action.payload.currency ?? "EUR"
            }`;
          }

          return `Valore non aggiornato per ${label}: ${
            action.payload.notes ?? "West Blue non ha restituito comparabili compatibili."
          }`;
        }

        return `${verb} ${name}${number != null ? ` #${number}` : ""}${
          action.type === "add" && item?.estimated_value != null
            ? ` — valore ${item.estimated_value} ${item.currency}`
            : ""
        }${execution.imageWarning ? ` (immagine: ${execution.imageWarning})` : ""}`;
      })
      .join("\n");
    const errorText = failed
      .map(({ action, result: execution }) => `${action.payload.series ?? "Elemento"}: ${execution.error}`)
      .join("\n");

    return Response.json({
      responseId: result.responseId,
      text: [successText, errorText && `Non completato:\n${errorText}`].filter(Boolean).join("\n\n"),
      actions: [],
      executed: succeeded.length + result.executed,
      recentContext:
        succeeded.length > 0
          ? (() => {
              const item = succeeded.at(-1)?.result.item;
              if (!item || succeeded.at(-1)?.action.type === "delete") return null;
              return {
                id: item.id,
                series: item.series ?? item.title,
                volume_number: item.volume_number,
                issue_number: item.issue_number,
              };
            })()
          : body.recentContext ?? null,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Errore durante la richiesta AI";
    return Response.json({ error: message }, { status: 400 });
  }
}
