import { createAdminClient } from "@/lib/supabase/server";
import type { IncomingItemPayload, MangaItem } from "@/lib/types";

/**
 * Resolves a user id from a per-user API key (found in public.profiles),
 * using the service-role client to bypass RLS. Shared by the REST endpoint
 * (/api/collection) and the MCP server (/api/mcp), which both authenticate
 * external callers (the ChatGPT MCP connector, curl, etc.) the same way.
 */
export async function resolveUserIdByApiKey(apiKey: string | null | undefined): Promise<string | null> {
  const key = (apiKey ?? "").trim();
  if (!key) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.from("profiles").select("id").eq("api_key", key).single();

  if (error || !data) return null;
  return data.id as string;
}

function toRow(userId: string, item: IncomingItemPayload, source: "manual" | "mcp") {
  return {
    user_id: userId,
    title: item.title,
    series: item.series ?? null,
    format: item.format ?? "tankobon",
    volume_number: item.volume_number ?? null,
    issue_number: item.issue_number ?? null,
    release_date: item.release_date ?? null,
    publisher: item.publisher ?? null,
    isbn: item.isbn ?? null,
    is_first_print: item.is_first_print ?? null,
    printing_notes: item.printing_notes ?? null,
    grading_authority: item.grading_authority ?? null,
    grading_value: item.grading_value ?? null,
    condition_estimate: item.condition_estimate ?? null,
    language: item.language ?? null,
    estimated_value: item.estimated_value ?? null,
    currency: item.currency ?? "EUR",
    image_url: item.image_url ?? null,
    notes: item.notes ?? null,
    source,
  };
}

export async function insertItems(
  userId: string,
  items: IncomingItemPayload[],
  source: "manual" | "mcp"
): Promise<{ inserted: MangaItem[]; error?: string }> {
  const rows = items.filter((item) => item && item.title).map((item) => toRow(userId, item, source));

  if (rows.length === 0) {
    return { inserted: [], error: "No valid items ('title' is required)" };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("items").insert(rows).select();

  if (error) {
    return { inserted: [], error: error.message };
  }

  return { inserted: (data ?? []) as MangaItem[] };
}

export async function listItems(userId: string): Promise<MangaItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as MangaItem[];
}
