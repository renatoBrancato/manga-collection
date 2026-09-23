import { chatActionSchema } from "@/lib/ai/schemas";
import { executeChatAction } from "@/lib/ai/actions";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const action = chatActionSchema.parse(await request.json());
    const { item, error, imageWarning } = await executeChatAction(user.id, action);
    if (error) return Response.json({ error }, { status: 400 });
    return Response.json({ item, imageWarning });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Azione non valida";
    return Response.json({ error: message }, { status: 400 });
  }
}
