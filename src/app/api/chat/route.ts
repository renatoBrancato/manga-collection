import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { listItems } from "@/lib/items";
import { runCollectionChat } from "@/lib/ai/openai";
import { executeChatAction } from "@/lib/ai/actions";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  imageUrl: z.string().url().nullable().optional(),
  contextImageUrl: z.string().url().nullable().optional(),
  previousResponseId: z.string().nullable().optional(),
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
    const result = await runCollectionChat({
      message: body.message,
      imageUrl: body.imageUrl ?? null,
      actionImageUrl: body.imageUrl ?? body.contextImageUrl ?? null,
      previousResponseId: body.previousResponseId ?? null,
      items,
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
        return `${action.type === "add" ? "Aggiunto" : "Aggiornato"} ${name}${number != null ? ` #${number}` : ""}${
          item?.estimated_value != null ? ` — valore ${item.estimated_value} ${item.currency}` : ""
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
      executed: succeeded.length,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Errore durante la richiesta AI";
    return Response.json({ error: message }, { status: 400 });
  }
}
