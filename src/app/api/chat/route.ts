import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { listItems } from "@/lib/items";
import { runCollectionChat } from "@/lib/ai/openai";

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
    return Response.json(result);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Errore durante la richiesta AI";
    return Response.json({ error: message }, { status: 400 });
  }
}
