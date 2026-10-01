import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

/**
 * Sorgente dell'anteprima social della landing. WhatsApp ritaglia il quadrato
 * centrale della 1200x630, quindi il contenuto importante sta tutto al centro.
 * Il risultato viene esportato una volta sola in public/og.jpg (vedi PROGETTO.md):
 * il PNG generato al volo pesa troppo per le anteprime di WhatsApp.
 */
export const alt = "Manga Collection";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const eye = await readFile(path.join(process.cwd(), "public", "sharingan.png"));
  const eyeSrc = `data:image/png;base64,${eye.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 26,
          background: "radial-gradient(circle at 50% 42%, #3b0d12 0%, #140308 45%, #050308 100%)",
          color: "#f8fafc",
        }}
      >
        <img src={eyeSrc} width={300} height={300} alt="" />

        <div
          style={{
            display: "flex",
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          Manga Collection
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, color: "#f0a8ad" }}>
          <span style={{ display: "flex" }}>私のコレクション</span>
          <span style={{ display: "flex", width: 6, height: 6, borderRadius: 6, background: "#dc2626" }} />
          <span style={{ display: "flex" }}>cataloga e valuta</span>
        </div>
      </div>
    ),
    size,
  );
}
