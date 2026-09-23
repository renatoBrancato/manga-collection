import { createAdminClient } from "@/lib/supabase/server";
import { uploadCoverImage, validateDirectImageUrl } from "@/lib/storage";
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

/**
 * If the payload carries a base64 photo (the common case for MCP callers
 * that can't produce a public URL), uploads it to Storage and replaces it
 * with the resulting public image_url. Otherwise, if a plain image_url was
 * given, verifies it actually points to image bytes (not e.g. a wiki page
 * that merely displays a picture) and drops it if not, so the cover
 * fallback chain (ISBN lookup, then placeholder) takes over instead of a
 * permanently broken image. Mutates a copy, never the input.
 */
async function resolveImage<T extends { image_url?: string | null; image_base64?: string | null }>(
  userId: string,
  item: T
): Promise<{ item: T; error?: string }> {
  if (item.image_base64) {
    const result = await uploadCoverImage(userId, item.image_base64);
    const { image_base64, ...rest } = item;
    void image_base64;
    if ("error" in result) {
      return { item: rest as T, error: `Caricamento immagine fallito: ${result.error}` };
    }
    return { item: { ...rest, image_url: result.url } as T };
  }

  if (item.image_url) {
    const storagePrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/covers/`;
    const valid = item.image_url.startsWith(storagePrefix)
      ? item.image_url
      : await validateDirectImageUrl(item.image_url);
    if (!valid) {
      return {
        item: { ...item, image_url: undefined },
        error: `Il link immagine fornito non punta a un'immagine diretta ed è stato ignorato (${item.image_url}). Verrà mostrata una copertina alternativa o un segnaposto.`,
      };
    }
  }

  return { item };
}

function toRow(userId: string, item: IncomingItemPayload, source: "manual" | "mcp" | "chat") {
  // "series" è ora il campo principale (nome dell'opera/rivista); "title"
  // resta in DB (colonna NOT NULL, usata anche da vecchie versioni
  // dell'MCP) ma viene sempre allineato a "series" se non fornito a parte.
  const series = item.series ?? item.title ?? null;
  return {
    user_id: userId,
    title: item.title ?? series ?? "Senza nome",
    series,
    format: item.format ?? "tankobon",
    volume_number: item.volume_number ?? null,
    issue_number: item.issue_number ?? null,
    release_year: item.release_year ?? null,
    publisher: item.publisher ?? null,
    isbn: item.isbn ?? null,
    is_first_print: item.is_first_print ?? null,
    has_obi: item.has_obi ?? null,
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
  source: "manual" | "mcp" | "chat"
): Promise<{ inserted: MangaItem[]; error?: string; imageWarning?: string }> {
  const valid = items.filter((item) => item && (item.series || item.title));
  if (valid.length === 0) {
    return { inserted: [], error: "No valid items ('series' is required)" };
  }

  const resolved = await Promise.all(valid.map((item) => resolveImage(userId, item)));
  const imageWarning = resolved.find((r) => r.error)?.error;
  const rows = resolved.map((r) => toRow(userId, r.item, source));

  const admin = createAdminClient();
  const { data, error } = await admin.from("items").insert(rows).select();

  if (error) {
    return { inserted: [], error: error.message };
  }

  return { inserted: (data ?? []) as MangaItem[], imageWarning };
}

export async function updateItem(
  userId: string,
  id: string,
  patch: Partial<IncomingItemPayload>
): Promise<{ updated: MangaItem | null; error?: string; imageWarning?: string }> {
  const { item: resolvedPatch, error: imageWarning } = await resolveImage(userId, patch);

  // "title" resta allineato a "series" quando quest'ultimo viene aggiornato
  // senza specificare esplicitamente un titolo diverso (retrocompatibilità).
  if (resolvedPatch.series && !resolvedPatch.title) {
    resolvedPatch.title = resolvedPatch.series;
  }

  // Only include fields explicitly provided in the patch, so omitted fields
  // are left untouched (this is a true partial update, not an upsert).
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(resolvedPatch)) {
    if (value !== undefined) row[key] = value;
  }

  if (Object.keys(row).length === 0) {
    return { updated: null, error: imageWarning ?? "No fields provided to update" };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("items")
    .update(row)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .maybeSingle();

  if (error) return { updated: null, error: error.message };
  if (!data) return { updated: null, error: "Item not found" };
  return { updated: data as MangaItem, imageWarning };
}

export async function deleteItem(
  userId: string,
  id: string
): Promise<{ deleted: MangaItem | null; error?: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("items")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .maybeSingle();

  if (error) return { deleted: null, error: error.message };
  if (!data) return { deleted: null, error: "Item not found" };
  return { deleted: data as MangaItem };
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
