import { createClient } from "@/lib/supabase/server";
import { updateItem } from "@/lib/items";
import type { IncomingItemPayload } from "@/lib/types";

/**
 * PATCH endpoint used by the dashboard's edit form to update any field of
 * an existing item (including the cover image, either as a direct URL or
 * as a base64 upload). Authenticates via the logged-in browser session
 * (cookies), not the MCP API key, and reuses the same updateItem() helper
 * (with its image_base64 upload / image_url validation logic) that the
 * MCP tool uses - so behavior stays consistent between the two entry
 * points.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let patch: Partial<IncomingItemPayload>;
  try {
    patch = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { updated, error, imageWarning } = await updateItem(user.id, id, patch);
  if (error) {
    return Response.json({ error }, { status: 400 });
  }

  return Response.json({ item: updated, imageWarning });
}
