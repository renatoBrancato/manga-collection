import { chatActionSchema } from "@/lib/ai/schemas";
import { createClient } from "@/lib/supabase/server";
import { insertItems, updateItem } from "@/lib/items";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const action = chatActionSchema.parse(await request.json());

    if (action.type === "add") {
      const { inserted, error, imageWarning } = await insertItems(
        user.id,
        [action.payload],
        "chat"
      );
      if (error) return Response.json({ error }, { status: 400 });
      return Response.json({ item: inserted[0], imageWarning });
    }

    const { id, ...patch } = action.payload;
    const { updated, error, imageWarning } = await updateItem(user.id, id, patch);
    if (error) return Response.json({ error }, { status: 400 });
    return Response.json({ item: updated, imageWarning });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Azione non valida";
    return Response.json({ error: message }, { status: 400 });
  }
}
