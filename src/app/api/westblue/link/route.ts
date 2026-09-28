import { z } from "zod";
import { resolveTrackerLink } from "@/lib/pricing/westblue";

// Pubblico come il tracker stesso: serve anche alla vista in sola lettura.
const querySchema = z.object({
  series: z.string().trim().min(1).max(200),
  format: z.enum(["tankobon", "zashi"]).optional(),
  graded: z.enum(["true", "false"]).optional(),
});

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return Response.json({ error: "Parametri non validi" }, { status: 400 });

  try {
    const link = await resolveTrackerLink({
      series: parsed.data.series,
      format: parsed.data.format ?? "tankobon",
      graded: parsed.data.graded === "true",
    });
    return Response.json(link, { headers: { "Cache-Control": "public, s-maxage=21600" } });
  } catch (cause) {
    return Response.json(
      { error: cause instanceof Error ? cause.message : "Tracker non raggiungibile" },
      { status: 502 }
    );
  }
}
