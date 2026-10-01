import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Anteprima social di una collezione condivisa: mostra il nome del
 * proprietario, quanti volumi contiene e il valore stimato, così il link
 * incollato su WhatsApp dice subito cosa si sta per aprire.
 */
export const alt = "Collezione manga condivisa";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Row = { estimated_value: number | null; series: string | null };

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, display_name, share_enabled")
    .eq("share_slug", slug)
    .maybeSingle();

  const owner = profile?.display_name?.trim() || "un collezionista";
  let volumes = 0;
  let series = 0;
  let value = 0;

  if (profile?.share_enabled) {
    const { data } = await admin
      .from("items")
      .select("estimated_value, series")
      .eq("user_id", profile.id);
    const rows = (data ?? []) as Row[];
    volumes = rows.length;
    series = new Set(rows.map((r) => r.series).filter(Boolean)).size;
    value = rows.reduce((sum, r) => sum + (r.estimated_value ?? 0), 0);
  }

  const money = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);

  const stats: Array<[string, string]> = [
    [String(volumes), volumes === 1 ? "volume" : "volumi"],
    [String(series), series === 1 ? "serie" : "serie diverse"],
    [money, "valore stimato"],
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 40,
          padding: "80px",
          background: "linear-gradient(135deg, #020617 0%, #111827 60%, #312e81 100%)",
          color: "#f8fafc",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 26, color: "#a5b4fc" }}>
          <span
            style={{
              display: "flex",
              background: "#dc2626",
              color: "#fff",
              fontWeight: 700,
              padding: "8px 18px",
              borderRadius: 8,
              letterSpacing: 2,
            }}
          >
            MANGA COLLECTION
          </span>
          <span style={{ display: "flex" }}>私のコレクション · sola lettura</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>
          <span>La collezione di {owner},</span>
          <span style={{ color: "#818cf8" }}>volume dopo volume.</span>
        </div>

        <div style={{ display: "flex", gap: 24 }}>
          {stats.map(([big, small]) => (
            <div
              key={small}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "24px 36px",
                borderRadius: 24,
                background: "#0f172a",
                border: "2px solid #1e293b",
                minWidth: 260,
              }}
            >
              <span style={{ fontSize: 50, fontWeight: 700 }}>{big}</span>
              <span style={{ fontSize: 24, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 2 }}>
                {small}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
