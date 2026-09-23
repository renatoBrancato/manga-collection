import { createClient } from "@/lib/supabase/server";
import { MAX_COVER_IMAGE_BYTES, uploadCoverBuffer } from "@/lib/storage";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File)) {
      return Response.json({ error: "Immagine mancante" }, { status: 400 });
    }
    if (!image.type.startsWith("image/")) {
      return Response.json({ error: "Il file non è un'immagine" }, { status: 400 });
    }
    if (image.size > MAX_COVER_IMAGE_BYTES) {
      return Response.json({ error: "Immagine troppo grande: massimo 2 MB" }, { status: 413 });
    }

    const result = await uploadCoverBuffer(user.id, Buffer.from(await image.arrayBuffer()), image.type);
    if ("error" in result) return Response.json({ error: result.error }, { status: 400 });

    return Response.json({ imageUrl: result.url });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Upload immagine fallito";
    return Response.json({ error: message }, { status: 400 });
  }
}

