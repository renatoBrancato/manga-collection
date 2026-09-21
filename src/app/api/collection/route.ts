import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type { IncomingItemPayload } from "@/lib/types";

/**
 * Endpoint called by the ChatGPT Custom GPT Action after it has scanned a
 * manga volume's cover/spine and extracted metadata. Auth is a simple
 * per-user API key (see /settings) sent as `Authorization: Bearer <key>`,
 * validated against public.profiles.api_key using the service-role client
 * (which bypasses RLS) — after validating we insert scoped to that user_id.
 */
async function resolveUserId(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization") ?? "";
  const apiKey = auth.replace(/^Bearer\s+/i, "").trim();
  if (!apiKey) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("api_key", apiKey)
    .single();

  if (error || !data) return null;
  return data.id as string;
}

export async function POST(request: Request) {
  const userId = await resolveUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }

  let body: IncomingItemPayload | { items: IncomingItemPayload[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const incoming = Array.isArray((body as any).items)
    ? (body as { items: IncomingItemPayload[] }).items
    : [body as IncomingItemPayload];

  const rows = incoming
    .filter((item) => item && item.title)
    .map((item) => ({
      user_id: userId,
      title: item.title,
      series: item.series ?? null,
      volume_number: item.volume_number ?? null,
      publisher: item.publisher ?? null,
      isbn: item.isbn ?? null,
      condition: item.condition ?? null,
      status: item.status ?? "owned",
      language: item.language ?? null,
      estimated_value: item.estimated_value ?? null,
      currency: item.currency ?? "EUR",
      image_url: item.image_url ?? null,
      notes: item.notes ?? null,
      source: "chatgpt" as const,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid items in payload ('title' required)" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("items").insert(rows).select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: data.length, items: data }, { status: 201 });
}

/** Lets you sanity-check the same API key from a terminal (curl). */
export async function GET(request: Request) {
  const userId = await resolveUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data });
}
