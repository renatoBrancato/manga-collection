import { createAdminClient } from "@/lib/supabase/server";

const BUCKET = "covers";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Decodes a base64-encoded photo (either a raw base64 string or a full
 * `data:<mime>;base64,<data>` URI, which is what ChatGPT/MCP clients
 * typically produce when they don't have a public URL for the picture they
 * just took) and uploads it to the public "covers" Supabase Storage bucket.
 * Returns the resulting public URL, to be stored in items.image_url.
 */
export async function uploadCoverImage(
  userId: string,
  imageBase64: string
): Promise<{ url: string } | { error: string }> {
  let mime = "image/jpeg";
  let base64Data = imageBase64.trim();

  const dataUrlMatch = base64Data.match(/^data:([^;]+);base64,([\s\S]*)$/);
  if (dataUrlMatch) {
    mime = dataUrlMatch[1];
    base64Data = dataUrlMatch[2];
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Data, "base64");
  } catch {
    return { error: "image_base64 non è una stringa base64 valida" };
  }
  if (buffer.length === 0) {
    return { error: "image_base64 è vuoto o non decodificabile" };
  }

  const ext = MIME_EXT[mime] ?? "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: true,
  });
  if (error) return { error: error.message };

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}

/**
 * Checks that a URL actually serves image bytes (Content-Type: image/*)
 * rather than an HTML page that merely *contains* an image (a very common
 * mistake: e.g. a wiki "File:Volume_3.png" page URL, which ends in .png but
 * returns text/html). Invalid links are dropped so the cover fallback
 * chain (ISBN lookup, then placeholder) kicks in instead of a broken
 * image. Uses a short timeout since this runs inline in the MCP call.
 */
export async function validateDirectImageUrl(url: string): Promise<string | null> {
  try {
    const check = async (method: "HEAD" | "GET") =>
      fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(5000) });

    let res = await check("HEAD");
    // Some hosts don't implement HEAD properly (405/501/odd content-type); retry with GET.
    if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) {
      res = await check("GET");
    }
    const contentType = res.headers.get("content-type") ?? "";
    return res.ok && contentType.startsWith("image/") ? url : null;
  } catch {
    return null;
  }
}
