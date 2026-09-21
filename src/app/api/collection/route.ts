import { NextResponse } from "next/server";
import { resolveUserIdByApiKey, insertItems, listItems } from "@/lib/items";
import type { IncomingItemPayload } from "@/lib/types";

/**
 * REST endpoint kept for manual testing / non-MCP integrations. Auth is a
 * per-user API key (see /settings) sent as `Authorization: Bearer <key>`.
 * The primary integration path is now the MCP server at /api/mcp.
 */
function getApiKeyFromRequest(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  return bearer || null;
}

export async function POST(request: Request) {
  const userId = await resolveUserIdByApiKey(getApiKeyFromRequest(request));
  if (!userId) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }

  let body: IncomingItemPayload | { items: IncomingItemPayload[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const incoming = Array.isArray((body as { items?: unknown }).items)
    ? (body as { items: IncomingItemPayload[] }).items
    : [body as IncomingItemPayload];

  const { inserted, error } = await insertItems(userId, incoming, "manual");

  if (error) {
    return NextResponse.json({ error }, { status: inserted.length === 0 && error.includes("required") ? 400 : 500 });
  }

  return NextResponse.json({ inserted: inserted.length, items: inserted }, { status: 201 });
}

export async function GET(request: Request) {
  const userId = await resolveUserIdByApiKey(getApiKeyFromRequest(request));
  if (!userId) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 });
  }

  try {
    const items = await listItems(userId);
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
