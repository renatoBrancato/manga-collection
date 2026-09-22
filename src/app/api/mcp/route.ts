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

const PRICE_TRACKER_URL = "https://westblue.shop/pages/manga-price-tracker";

const PRICE_TRACKER_INSTRUCTIONS = `REGOLE OBBLIGATORIE PER LE VALUTAZIONI

La fonte primaria per 'estimated_value' è il Manga Price Tracker di West Blue
Collectibles: ${PRICE_TRACKER_URL}

Prima di aggiungere, aggiornare o rivalutare un elemento:
1. Identifica l'edizione esatta: serie, volume/numero, lingua, anno, prima
   stampa/ristampa, stato RAW o graded, ente/voto di grading e presenza OBI.
2. Cerca l'elemento su West Blue e applica filtri compatibili con il pezzo:
   - RAW e graded non devono mai essere mescolati;
   - con OBI e senza OBI non devono mai essere mescolati;
   - per un graded usa, quando disponibile, lo stesso ente e lo stesso voto;
   - non usare dati di una prima stampa per una ristampa o viceversa.
3. Usa la MEDIA mostrata dal tracker per quella combinazione esatta di filtri,
   basata sulle vendite recenti. Non scegliere il prezzo più alto e non fare
   una media manuale tra categorie differenti.
4. Se un attributo decisivo non è noto (per esempio OBI o prima stampa), non
   inventarlo: chiedi chiarimenti oppure non valorizzare il prezzo.
5. Se West Blue non contiene vendite compatibili, dichiaralo chiaramente e
   lascia 'estimated_value' invariato/omesso. Non sostituire silenziosamente
   la fonte e non allargare i filtri solo per ottenere un risultato.
6. West Blue può mostrare USD: converti la media in EUR al cambio corrente,
   salva 'currency' come EUR e comunica sinteticamente media originale,
   cambio applicato e risultato arrotondato a due decimali.

Per rivalutare tutta la collezione usa prima 'revalue_manga_collection', poi
consulta West Blue per ogni elemento restituito e chiama 'update_manga_item'
solo per quelli con una media compatibile. Non fermarti alla sola lista.`;

function buildValuationCandidate(item: Awaited<ReturnType<typeof listItems>>[number]) {
  return {
    id: item.id,
    series: item.series ?? item.title,
    format: item.format,
    volume_number: item.volume_number,
    issue_number: item.issue_number,
    release_year: item.release_year,
    language: item.language,
    publisher: item.publisher,
    printing: item.is_first_print === true ? "first_print" : item.is_first_print === false ? "reprint" : "unknown",
    obi: item.has_obi === true ? "with_obi" : item.has_obi === false ? "without_obi" : "unknown",
    market_state: item.grading_authority
      ? {
          type: "graded",
          authority: item.grading_authority,
          grade: item.grading_value,
        }
      : {
          type: "raw",
          condition: item.condition_estimate,
        },
    current_estimated_value: item.estimated_value,
    current_currency: item.currency,
    search_instruction:
      `Cerca "${item.series ?? item.title}"` +
      `${item.volume_number != null ? ` volume ${item.volume_number}` : ""}` +
      `${item.issue_number ? ` numero ${item.issue_number}` : ""}` +
      ` come ${item.grading_authority ? `graded ${item.grading_authority}${item.grading_value != null ? ` ${item.grading_value}` : ""}` : "RAW"}` +
      `${item.has_obi === true ? ", con OBI" : item.has_obi === false ? ", senza OBI" : ", OBI non noto"}` +
      `${item.is_first_print === true ? ", prima stampa" : item.is_first_print === false ? ", ristampa" : ", stampa non nota"}.`,
  };
}

function buildServer(userId: string) {
  const server = new McpServer(
    { name: "manga-collection", version: "1.0.0" },
    { instructions: PRICE_TRACKER_INSTRUCTIONS }
  );

  server.registerTool(
    "add_manga_item",
    {
      title: "Aggiungi un volume alla collezione",
      description:
        "Salva un tankobon o un numero di rivista (zashi, es. Weekly Shonen Jump) nella collezione manga dell'utente autenticato, con i metadati estratti dalla foto (titolo, formato, numero, editore, prima stampa/ristampa dal colophon, grading o stima di condizione, valore stimato di mercato).",
      inputSchema: {
        series: z.string().describe("Nome della serie/opera (es. 'One Piece') o nome della rivista - campo principale"),
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
        has_obi: z
          .boolean()
          .optional()
          .describe("true se il volume ha ancora la fascetta OBI originale, false se manca, ometti se non visibile/determinabile"),
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
          .describe(
            `Valore di mercato in EUR. Prima consulta ${PRICE_TRACKER_URL}, usa esclusivamente la media mostrata per filtri compatibili (edizione, raw/graded, ente/voto, con/senza OBI, prima stampa/ristampa). Se non ci sono dati compatibili, ometti il campo; non usare automaticamente altre fonti.`
          ),
        currency: z.string().default("EUR"),
        image_url: z
          .string()
          .optional()
          .describe(
            "URL DIRETTO a un file immagine (deve finire con l'immagine vera e propria e rispondere con Content-Type image/*, es. link a un file .jpg/.png su un CDN/e-commerce). NON usare link a pagine web che mostrano un'immagine (es. pagine wiki, pagine prodotto, risultati di ricerca): verrebbero scartati perché non caricabili come <img>. Se non sei sicuro al 100% che l'URL sia diretto, o se l'immagine viene da una foto scattata/allegata in chat, usa invece 'image_base64'."
          ),
        image_base64: z
          .string()
          .optional()
          .describe(
            "Foto del volume/copertina codificata in base64 (o data URI 'data:image/jpeg;base64,...'). USA SEMPRE QUESTO CAMPO quando l'immagine è una foto scattata o allegata dall'utente in chat (il caso più comune): leggi i byte del file allegato e passali qui, verranno caricati automaticamente e compariranno nella dashboard."
          ),
        notes: z.string().optional(),
      },
    },
    async (input) => {
      const { inserted, error, imageWarning } = await insertItems(userId, [input], "mcp");
      if (error) {
        return { content: [{ type: "text", text: `Errore: ${error}` }], isError: true };
      }
      const item = inserted[0];
      return {
        content: [
          {
            type: "text",
            text: `Aggiunto alla collezione: "${item.series ?? item.title}"${item.volume_number ? ` vol. ${item.volume_number}` : ""}${
              item.issue_number ? ` n. ${item.issue_number}` : ""
            }${item.estimated_value != null ? ` — valore stimato ${item.estimated_value} ${item.currency}` : ""}.${
              imageWarning ? ` ⚠️ ${imageWarning}` : ""
            }`,
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
        series: z.string().optional().describe("Nome della serie/opera o della rivista"),
        format: z.enum(["tankobon", "zashi"]).optional(),
        volume_number: z.number().optional(),
        issue_number: z.string().optional(),
        release_year: z.number().int().optional().describe("Anno di pubblicazione/uscita (es. 2024)"),
        publisher: z.string().optional(),
        isbn: z.string().optional(),
        is_first_print: z.boolean().optional(),
        has_obi: z.boolean().optional().describe("true se ha la fascetta OBI, false se manca"),
        printing_notes: z.string().optional(),
        grading_authority: z
          .enum(["CGC", "CBCS", "BGS", "altro"])
          .optional()
          .describe("Ente di grading, es. da impostare quando il volume torna dalla gradazione"),
        grading_value: z.number().optional().describe("Voto di grading (es. 9.8)"),
        condition_estimate: z.string().optional(),
        language: z.string().optional(),
        estimated_value: z
          .number()
          .optional()
          .describe(
            `Valore di mercato in EUR. Ricontrolla su ${PRICE_TRACKER_URL} e usa soltanto la media per filtri compatibili (raw/graded, ente/voto, con/senza OBI, prima stampa/ristampa). Se non ci sono dati compatibili, lascia il valore invariato.`
          ),
        currency: z.string().optional(),
        image_url: z
          .string()
          .optional()
          .describe(
            "URL DIRETTO a un file immagine (Content-Type image/*), non una pagina web che la contiene. Se non sei sicuro, o la foto viene da un allegato in chat, usa 'image_base64'."
          ),
        image_base64: z
          .string()
          .optional()
          .describe(
            "Foto codificata in base64 (o data URI) da aggiungere/sostituire per questo volume, es. quando l'utente scatta/allega la foto solo dopo aver già salvato l'item. Usa sempre questo per foto scattate in chat."
          ),
        notes: z.string().optional(),
      },
    },
    async ({ id, ...patch }) => {
      const { updated, error, imageWarning } = await updateItem(userId, id, patch);
      if (error) {
        return { content: [{ type: "text", text: `Errore: ${error}` }], isError: true };
      }
      const changedFields = Object.keys(patch).map((k) => (k === "image_base64" ? "image_url" : k));
      return {
        content: [
          {
            type: "text",
            text: `Aggiornato: "${updated!.series ?? updated!.title}" (id ${updated!.id}). Campi modificati: ${changedFields.join(", ") || "nessuno"}.${
              imageWarning ? ` ⚠️ ${imageWarning}` : ""
            }`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "revalue_manga_collection",
    {
      title: "Rivaluta la collezione",
      description:
        `Prepara la rivalutazione della collezione usando ${PRICE_TRACKER_URL}. Dopo aver ricevuto l'elenco, il client DEVE visitare il tracker per ogni elemento, applicare i criteri indicati, leggere la media compatibile e aggiornare il prezzo tramite 'update_manga_item'. Non è sufficiente mostrare l'elenco all'utente.`,
      inputSchema: {
        scope: z
          .enum(["all", "missing_value"])
          .default("all")
          .describe("'all' rivaluta tutti gli elementi; 'missing_value' considera solo quelli senza valore stimato"),
      },
    },
    async ({ scope }) => {
      const items = await listItems(userId);
      const selected = scope === "missing_value" ? items.filter((item) => item.estimated_value == null) : items;
      const candidates = selected.map(buildValuationCandidate);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                action_required:
                  "Continua ora la procedura: visita West Blue per ciascun candidato, usa la media mostrata solo con filtri compatibili e chiama update_manga_item per ogni prezzo verificato. Non limitarti a presentare questa lista.",
                source: PRICE_TRACKER_URL,
                valuation_rules: [
                  "Non mescolare RAW e graded.",
                  "Non mescolare con OBI e senza OBI.",
                  "Per i graded abbina ente e voto quando disponibili.",
                  "Non mescolare prima stampa e ristampa.",
                  "Se OBI/stampa sono sconosciuti, chiedi chiarimenti o non aggiornare.",
                  "Se non esistono vendite compatibili, lascia il valore invariato e segnalalo.",
                  "Se la media è in USD, convertila in EUR al cambio corrente e comunica il calcolo.",
                ],
                count: candidates.length,
                candidates,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerPrompt(
    "rivaluta_collezione",
    {
      title: "Rivaluta la collezione manga",
      description:
        "Avvia la rivalutazione completa usando le medie del Manga Price Tracker di West Blue e aggiorna i valori verificati.",
      argsSchema: {
        scope: z.enum(["all", "missing_value"]).optional(),
      },
    },
    ({ scope }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Rivaluta la mia collezione (${scope ?? "all"}). ` +
              "Chiama revalue_manga_collection, poi visita West Blue per ogni candidato, applica esattamente i filtri richiesti e usa la media mostrata. " +
              "Aggiorna con update_manga_item soltanto gli elementi con dati compatibili e alla fine riepiloga valori precedenti, nuovi valori, elementi non aggiornati e motivazione.",
          },
        },
      ],
    })
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
