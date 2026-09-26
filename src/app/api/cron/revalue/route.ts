import { NextRequest, NextResponse } from "next/server";
import { revalueAllCollections } from "@/lib/pricing/revalue";

/**
 * Rivalutazione giornaliera di tutte le collezioni.
 *
 * Invocata da Vercel Cron (vedi vercel.json). Vercel firma la chiamata con
 * l'header `Authorization: Bearer $CRON_SECRET`; la stessa chiave permette di
 * lanciare l'esecuzione a mano per un test.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        error: process.env.CRON_SECRET
          ? "Non autorizzato: header Authorization mancante o errato."
          : "CRON_SECRET non configurata sul server.",
      },
      { status: 401 }
    );
  }

  try {
    const result = await revalueAllCollections({
      trigger: request.headers.get("user-agent")?.includes("vercel-cron") ? "cron" : "manual",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Rivalutazione fallita";
    console.error("[cron/revalue]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
