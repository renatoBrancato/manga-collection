import type { MangaItem } from "@/lib/types";
import { mangaMutationSchema, mangaPatchSchema, type ChatAction } from "@/lib/ai/schemas";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_TOOL_ROUNDS = 5;

type FunctionCall = {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
};

type OutputText = {
  type: "output_text";
  text: string;
};

type OutputMessage = {
  type: "message";
  content: OutputText[];
};

type ResponseOutput = FunctionCall | OutputMessage | { type: string };

type OpenAIResponse = {
  id: string;
  output: ResponseOutput[];
  error?: { message?: string };
};

const itemProperties = {
  series: { type: "string", description: "Nome della serie/opera o della rivista" },
  format: { type: "string", enum: ["tankobon", "zashi"] },
  volume_number: { type: ["number", "null"] },
  issue_number: { type: ["string", "null"] },
  release_year: { type: ["integer", "null"] },
  publisher: { type: ["string", "null"] },
  isbn: { type: ["string", "null"] },
  is_first_print: { type: ["boolean", "null"] },
  has_obi: { type: ["boolean", "null"] },
  printing_notes: { type: ["string", "null"] },
  grading_authority: { type: ["string", "null"], enum: ["CGC", "CBCS", "BGS", "altro", null] },
  grading_value: { type: ["number", "null"] },
  condition_estimate: { type: ["string", "null"] },
  language: { type: ["string", "null"] },
  estimated_value: { type: ["number", "null"] },
  currency: { type: "string", description: "Codice valuta a tre lettere, normalmente EUR" },
  notes: { type: ["string", "null"] },
};

const patchProperties = {
  series: { type: "string" },
  format: { type: "string", enum: ["tankobon", "zashi"] },
  volume_number: { type: "number" },
  issue_number: { type: "string" },
  release_year: { type: "integer" },
  publisher: { type: "string" },
  isbn: { type: "string" },
  is_first_print: { type: "boolean" },
  has_obi: { type: "boolean" },
  printing_notes: { type: "string" },
  grading_authority: { type: "string", enum: ["CGC", "CBCS", "BGS", "altro"] },
  grading_value: { type: "number" },
  condition_estimate: { type: "string" },
  language: { type: "string" },
  estimated_value: { type: "number" },
  currency: { type: "string" },
  notes: { type: "string" },
};

const tools = [
  {
    type: "function",
    name: "search_collection",
    description: "Cerca elementi già presenti nella collezione prima di rispondere o preparare un aggiornamento.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Serie, numero volume, ISBN o editore da cercare" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "get_collection_summary",
    description: "Restituisce un riepilogo numerico della collezione.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "prepare_add_manga",
    description:
      "Prepara l'aggiunta di un manga senza salvarlo. Usalo solo quando i dati identificativi minimi sono sufficienti; la UI chiederà conferma.",
    parameters: {
      type: "object",
      properties: itemProperties,
      required: ["series", "format", "currency"],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: "function",
    name: "prepare_update_manga",
    description:
      "Prepara la modifica di un elemento esistente senza salvarla. Prima usa search_collection per ottenere l'id corretto.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "UUID dell'elemento esistente" },
        ...patchProperties,
        use_attached_image: {
          type: "boolean",
          description:
            "true solo se la foto allegata deve diventare la copertina; false per foto di colophon, dettagli o slab che non devono sostituire la cover",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    strict: false,
  },
];

const instructions = `Ti chiami Koma (コ), come la vignetta/pannello del manga.
Sei l'assistente della web app Manga Collection.
Rispondi in italiano, in modo breve e concreto.
Puoi presentarti e firmare occasionalmente le conferme come Koma, ma senza
ripetere il tuo nome in ogni frase.

Puoi cercare nella collezione e preparare aggiunte o modifiche tramite tool.
Non puoi modificare direttamente i dati: prepare_add_manga e
prepare_update_manga producono una proposta che l'utente deve confermare.

Quando ricevi una foto:
- analizza copertina, dorso, colophon ed eventuale slab;
- estrai solo dati visibili o ragionevolmente certi;
- non inventare ISBN, anno, prima stampa, OBI, grading o prezzo;
- usa tankobon per volumi rilegati e zashi per riviste;
- se l'utente chiede di aggiungere il pezzo e serie/numero sono identificabili,
  chiama prepare_add_manga;
- se chiede di aggiornare un pezzo, usa prima search_collection e poi
  prepare_update_manga;
- per un'aggiunta, la foto allegata viene usata come copertina;
- per un aggiornamento imposta use_attached_image=true solo se la foto è una
  copertina o l'utente chiede esplicitamente di sostituire l'immagine. Usa
  false per colophon, dettagli interni o slab che servono solo all'analisi.

Se mancano dati essenziali o ci sono più elementi possibili, chiedi una
precisazione invece di preparare una modifica ambigua.`;

function outputText(response: OpenAIResponse): string {
  return response.output
    .filter((item): item is OutputMessage => item.type === "message")
    .flatMap((item) => item.content)
    .filter((content) => content.type === "output_text")
    .map((content) => content.text)
    .join("\n")
    .trim();
}

async function createResponse(body: Record<string, unknown>): Promise<OpenAIResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY non configurata");

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  const data = (await response.json()) as OpenAIResponse;
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI API error (${response.status})`);
  }
  return data;
}

function searchableText(item: MangaItem): string {
  return [
    item.series,
    item.title,
    item.volume_number,
    item.issue_number,
    item.isbn,
    item.publisher,
    item.release_year,
  ]
    .filter((value) => value != null)
    .join(" ")
    .toLowerCase();
}

function searchTokens(query: string): string[] {
  const ignored = new Set(["vol", "volume", "numero", "number", "n"]);
  return query
    .toLowerCase()
    .replace(/[#.,/\\-]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !ignored.has(token));
}

function compactItem(item: MangaItem) {
  return {
    id: item.id,
    series: item.series ?? item.title,
    format: item.format,
    volume_number: item.volume_number,
    issue_number: item.issue_number,
    release_year: item.release_year,
    publisher: item.publisher,
    isbn: item.isbn,
    is_first_print: item.is_first_print,
    has_obi: item.has_obi,
    grading_authority: item.grading_authority,
    grading_value: item.grading_value,
    condition_estimate: item.condition_estimate,
    estimated_value: item.estimated_value,
    currency: item.currency,
  };
}

function executeTool(
  call: FunctionCall,
  items: MangaItem[],
  imageUrl: string | null
): { output: string; action?: ChatAction } {
  const args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;

  if (call.name === "search_collection") {
    const query = String(args.query ?? "").trim().toLowerCase();
    const tokens = searchTokens(query);
    const matches = items
      .filter((item) => {
        const haystack = searchableText(item);
        return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
      })
      .slice(0, 20);
    return { output: JSON.stringify({ count: matches.length, items: matches.map(compactItem) }) };
  }

  if (call.name === "get_collection_summary") {
    const total = items.reduce((sum, item) => sum + (item.estimated_value ?? 0), 0);
    return {
      output: JSON.stringify({
        count: items.length,
        estimated_total_value: total,
        currency: "EUR",
        distinct_series: new Set(items.map((item) => item.series ?? item.title)).size,
      }),
    };
  }

  if (call.name === "prepare_add_manga") {
    const payload = mangaMutationSchema.parse({
      ...args,
      image_url: imageUrl ?? args.image_url ?? null,
    });
    const action: ChatAction = { type: "add", payload };
    return { output: JSON.stringify({ prepared: true, action }), action };
  }

  if (call.name === "prepare_update_manga") {
    const { use_attached_image: useAttachedImage, ...patchArgs } = args;
    const payload = mangaPatchSchema.parse({
      ...patchArgs,
      ...(imageUrl && useAttachedImage === true ? { image_url: imageUrl } : {}),
    });
    const action: ChatAction = { type: "update", payload };
    return { output: JSON.stringify({ prepared: true, action }), action };
  }

  return { output: JSON.stringify({ error: `Tool sconosciuto: ${call.name}` }) };
}

export async function runCollectionChat({
  message,
  imageUrl,
  actionImageUrl,
  previousResponseId,
  items,
}: {
  message: string;
  imageUrl: string | null;
  actionImageUrl: string | null;
  previousResponseId: string | null;
  items: MangaItem[];
}): Promise<{ responseId: string | null; text: string; actions: ChatAction[] }> {
  const content: Array<Record<string, string>> = [{ type: "input_text", text: message }];
  if (imageUrl) {
    content.push({ type: "input_image", image_url: imageUrl, detail: "auto" });
  }

  const initialRequest = {
    model: process.env.OPENAI_CHAT_MODEL || "gpt-5-mini",
    instructions,
    tools,
    max_output_tokens: 1200,
    input: [{ role: "user", content }],
  };

  let response: OpenAIResponse;
  try {
    response = await createResponse({
      ...initialRequest,
      ...(previousResponseId ? { previous_response_id: previousResponseId } : {}),
    });
  } catch (cause) {
    if (!previousResponseId) throw cause;
    // Persisted response IDs can expire or become unavailable. Restart the
    // model context without losing the visible local chat history.
    response = await createResponse(initialRequest);
  }

  const actions: ChatAction[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const calls = response.output.filter((item): item is FunctionCall => item.type === "function_call");
    if (calls.length === 0) {
      return {
        responseId: response.id,
        text: outputText(response) || "Operazione preparata.",
        actions,
      };
    }

    const outputs = calls.map((call) => {
      let result: ReturnType<typeof executeTool>;
      try {
        result = executeTool(call, items, actionImageUrl);
        if (result.action) actions.push(result.action);
      } catch (cause) {
        result = {
          output: JSON.stringify({
            error: cause instanceof Error ? cause.message : "Argomenti del tool non validi",
            instruction: "Correggi gli argomenti e riprova, oppure chiedi chiarimenti all'utente.",
          }),
        };
      }
      return {
        type: "function_call_output",
        call_id: call.call_id,
        output: result.output,
      };
    });

    if (actions.length > 0) {
      const names = actions.map((action) =>
        action.type === "add"
          ? `${action.payload.series}${action.payload.volume_number != null ? ` vol. ${action.payload.volume_number}` : ""}`
          : action.payload.series ?? "l'elemento selezionato"
      );
      return {
        // The response contains unresolved function calls because no second
        // model round is needed for mutations. Start fresh on the next turn.
        responseId: null,
        text: `Ho preparato ${actions.length === 1 ? "l'operazione" : `${actions.length} operazioni`} per ${names.join(", ")}. Controlla i dati qui sotto e premi “Conferma e salva” per applicarla.`,
        actions,
      };
    }

    response = await createResponse({
      model: process.env.OPENAI_CHAT_MODEL || "gpt-5-mini",
      instructions,
      tools,
      max_output_tokens: 1200,
      previous_response_id: response.id,
      input: outputs,
    });
  }

  return {
    responseId: response.id,
    text: outputText(response) || "Ho preparato quanto possibile; controlla le proposte prima di confermare.",
    actions,
  };
}
