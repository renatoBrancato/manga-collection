import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { resolveUserIdByApiKey, insertItems, listItems, updateItem } from "@/lib/items";

/**
 * MCP server exposed to ChatGPT (or any MCP-compatible client) as a custom
 * connector. This is the primary integration path for scanning manga
 * volumes: the user adds this URL as a connector in ChatGPT (Developer
 * Mode → Settings → Connectors), configuring their personal API key
 * (from /settings) as a Bearer token. Each user's connector instance is
 * independent, so there is no shared credential and no dependency on the
 * (now-restricted, sunsetting) Custom GPT Actions system.
 *
 * Runs stateless (one MCP server + transport per HTTP request), which is
 * compatible with Vercel's serverless functions.
 */

function getApiKeyFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  return bearer || null;
}

function buildServer(userId: string) {
  const server = new McpServer({ name: "manga-collection", version: "1.0.0" });

  server.registerTool(
    "add_manga_item",
    {
      title: "Aggiungi un volume alla collezione",
      description:
        "Salva un tankobon o un numero di rivista (zashi, es. Weekly Shonen Jump) nella collezione manga dell'utente autenticato, con i metadati estratti dalla foto (titolo, formato, numero, editore, prima stampa/ristampa dal colophon, grading o stima di condizione, valore stimato di mercato).",
      inputSchema: {
        title: z.string().describe("Titolo dell'opera (es. 'One Piece') o nome della rivista"),
        series: z.string().optional().describe("Nome della serie, se diverso dal titolo"),
        format: z
          .enum(["tankobon", "zashi"])
          .default("tankobon")
          .describe("'tankobon' per un volume rilegato, 'zashi' per una rivista/numero seriale"),
        volume_number: z.number().optional().describe("Numero del volume (per i tankobon)"),
        issue_number: z.string().optional().describe("Numero/uscita (per gli zashi, es. '2024-32')"),
        release_year: z
          .number()
          .int()
          .optional()
          .describe(
            "Anno di pubblicazione/uscita (es. 2024), dal colophon per i tankobon o dalla copertina/data per gli zashi. Per gli zashi è il dato chiave insieme al numero, preferisci l'anno alla data completa se non certa."
          ),
        publisher: z.string().optional().describe("Editore (es. Shueisha, Star Comics)"),
        isbn: z.string().optional(),
        is_first_print: z
          .boolean()
          .optional()
          .describe("true se il colophon indica prima stampa/初版 (shohan); false se è una ristampa; ometti se non determinabile"),
        printing_notes: z.string().optional().describe("Note libere sulla stampa/edizione, es. '3a ristampa'"),
        grading_authority: z
          .enum(["CGC", "CBCS", "BGS", "altro"])
          .optional()
          .describe("Ente di grading, solo se dalla foto si vede un'etichetta/slab di gradazione"),
        grading_value: z.number().optional().describe("Voto di grading (es. 9.8), solo se gradato"),
        condition_estimate: z
          .string()
          .optional()
          .describe("Stima della condizione (es. 'buono', 'come nuovo'), da usare SOLO se il volume non è gradato da un ente"),
        language: z.string().optional(),
        estimated_value: z
          .number()
          .optional()
          .describe("Valore di mercato stimato in euro, ricercato sul web"),
        currency: z.string().default("EUR"),
        image_url: z.string().optional(),
        notes: z.string().optional(),
      },
    },
    async (input) => {
      const { inserted, error } = await insertItems(userId, [input], "mcp");
      if (error) {
        return { content: [{ type: "text", text: `Errore: ${error}` }], isError: true };
      }
      const item = inserted[0];
      return {
        content: [
          {
            type: "text",
            text: `Aggiunto alla collezione: "${item.title}"${item.volume_number ? ` vol. ${item.volume_number}` : ""}${
              item.issue_number ? ` n. ${item.issue_number}` : ""
            }${item.estimated_value != null ? ` — valore stimato ${item.estimated_value} ${item.currency}` : ""}.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "update_manga_item",
    {
      title: "Aggiorna un volume esistente",
      description:
        "Aggiorna solo i campi specificati di un volume/rivista già presente nella collezione (es. cambiare grading dopo il ritorno dall'ente, aggiungere una foto in un secondo momento, correggere il valore stimato). I campi omessi restano invariati. Usa 'list_manga_items' per trovare l'id corretto se non lo conosci già.",
      inputSchema: {
        id: z.string().uuid().describe("ID dell'elemento da aggiornare, ottenuto da 'list_manga_items'"),
        title: z.string().optional(),
        series: z.string().optional(),
        format: z.enum(["tankobon", "zashi"]).optional(),
        volume_number: z.number().optional(),
        issue_number: z.string().optional(),
        release_year: z.number().int().optional().describe("Anno di pubblicazione/uscita (es. 2024)"),
        publisher: z.string().optional(),
        isbn: z.string().optional(),
        is_first_print: z.boolean().optional(),
        printing_notes: z.string().optional(),
        grading_authority: z
          .enum(["CGC", "CBCS", "BGS", "altro"])
          .optional()
          .describe("Ente di grading, es. da impostare quando il volume torna dalla gradazione"),
        grading_value: z.number().optional().describe("Voto di grading (es. 9.8)"),
        condition_estimate: z.string().optional(),
        language: z.string().optional(),
        estimated_value: z.number().optional(),
        currency: z.string().optional(),
        image_url: z.string().optional().describe("URL della foto, per aggiungerla/sostituirla in un secondo momento"),
        notes: z.string().optional(),
      },
    },
    async ({ id, ...patch }) => {
      const { updated, error } = await updateItem(userId, id, patch);
      if (error) {
        return { content: [{ type: "text", text: `Errore: ${error}` }], isError: true };
      }
      return {
        content: [
          {
            type: "text",
            text: `Aggiornato: "${updated!.title}" (id ${updated!.id}). Campi modificati: ${Object.keys(patch).join(", ") || "nessuno"}.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "list_manga_items",
    {
      title: "Elenca la collezione",
      description:
        "Restituisce l'elenco dei volumi/riviste salvati nella collezione dell'utente autenticato, con il valore totale stimato.",
      inputSchema: {},
    },
    async () => {
      const items = await listItems(userId);
      const total = items.reduce((sum, item) => sum + (item.estimated_value ?? 0), 0);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: items.length, estimated_total_value: total, items }, null, 2),
          },
        ],
      };
    }
  );

  return server;
}

async function handleMcpRequest(req: Request): Promise<Response> {
  const userId = await resolveUserIdByApiKey(getApiKeyFromRequest(req));
  if (!userId) {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Invalid or missing API key" }, id: null }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }

  const server = buildServer(userId);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export const GET = handleMcpRequest;
export const POST = handleMcpRequest;
export const DELETE = handleMcpRequest;
