import type { ChatAction } from "@/lib/ai/schemas";
import { deleteItem, insertItems, updateItem } from "@/lib/items";

export async function executeChatAction(userId: string, action: ChatAction) {
  if (action.type === "add") {
    const { inserted, error, imageWarning } = await insertItems(userId, [action.payload], "chat");
    if (error) return { error };
    return { item: inserted[0], imageWarning };
  }

  if (action.type === "delete") {
    const { deleted, error } = await deleteItem(userId, action.payload.id);
    if (error) return { error };
    return { item: deleted };
  }

  const { id, ...patch } = action.payload;
  const { updated, error, imageWarning } = await updateItem(userId, id, patch);
  if (error) return { error };
  return { item: updated, imageWarning };
}
