import type { MangaItem } from "@/lib/types";
import { checkIssueNumber, lookupMarketPrice, magazineKey } from "@/lib/pricing/westblue";
import { revalueUserCollection } from "@/lib/pricing/revalue";
import {
  MAX_CHAT_IMAGES,
  mangaMutationSchema,
  mangaPatchSchema,
  type ChatAction,
  type ChatEntityContext,
} from "@/lib/ai/schemas";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_TOOL_ROUNDS = 6;
export { MAX_CHAT_IMAGES };

const coverPhotoProperty = {
  type: ["integer", "null"],
  description:
    "Numero (1, 2, ...) della foto allegata da usare come copertina di QUESTO pezzo. Scegli la foto frontale del volume; null se nessuna foto è una copertina adatta (es. solo retro, colophon, dettagli o una foto di gruppo con più volumi).",
};

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
  is_sealed: {
    type: ["boolean", "null"],
    description: "true solo se il pezzo è ancora nel cellophane originale di fabbrica",
  },
  is_for_sale: {
    type: ["boolean", "null"],
    description: "true se l'utente dice di averlo messo in vendita; altrimenti false/null",
  },
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
  is_sealed: { type: "boolean" },
  is_for_sale: { type: "boolean", description: "true per metterlo in vendita, false per toglierlo" },
  printing_notes: { type: "string" },
  grading_authority: { type: "string", enum: ["CGC", "CBCS", "BGS", "altro"] },
  grading_value: { type: "number" },
  condition_estimate: { type: "string" },
  language: { type: "string" },
  estimated_value: { type: "number" },
  currency: { type: "string" },
  notes: { type: "string" },
};

const functionTools = [
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
    name: "verify_series_identity",
    description:
      "Verifica il titolo fotografato: per i tankobon usa AniList, per gli zashi gli alias delle riviste e la fonte web, non AniList. La fonte può usare il titolo originale, la traslitterazione o il nome canonico. Per una rivista volume_number deve essere null: cerca separatamente numero del fascicolo e anno. Usa sempre canonical_series restituito. Obbligatorio prima del prezzo e dell'aggiunta.",
    parameters: {
      type: "object",
      properties: {
        cover_photo: { type: "integer", description: "Numero della foto della copertina; 0 se non proviene da una foto" },
        observed_title: { type: "string", description: "Titolo originale trascritto dal logo, non dall'OBI" },
        canonical_series: { type: "string", description: "Nome canonico candidato; il tool lo confronterà con il catalogo ufficiale" },
        volume_number: { type: ["number", "null"] },
        evidence_text: { type: "string", description: "Estratto della fonte che supporta il titolo originale o canonico e il volume" },
        evidence_url: { type: "string", description: "URL della fonte mostrata nella ricerca web" },
      },
      required: ["cover_photo", "observed_title", "canonical_series", "volume_number", "evidence_text", "evidence_url"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "lookup_market_price",
    description:
      "Legge direttamente il Manga Price Tracker di West Blue e restituisce le vendite compatibili con il pezzo, con il valore suggerito già convertito in EUR. Per tutti i RAW assenti dal tracker ripiega sugli annunci eBay (provider ebay), con almeno 3 comparabili compatibili; prima stampa, anno, lingua e OBI restringono i comparabili e non si allargano a edizioni diverse se i risultati sono pochi. Gli annunci eBay sono prezzi richiesti, non vendite concluse. È la fonte OBBLIGATORIA per qualsiasi prezzo: usalo sempre invece della ricerca web, che non riesce a leggere le tabelle del tracker.",
    parameters: {
      type: "object",
      properties: {
        series: { type: "string", description: "Nome della serie in inglese, es. 'Attack on Titan'" },
        cover_title_text: { type: ["string", "null"], description: "Se viene da una foto: trascrizione letterale del logo, usata per abbinare la verifica canonica" },
        cover_photo: { type: ["integer", "null"], description: "Numero della foto della copertina, per identificare il volume in una richiesta con più foto" },
        volume: { type: ["number", "null"], description: "Numero del volume" },
        format: { type: ["string", "null"], enum: ["tankobon", "zashi", null] },
        graded: { type: "boolean", description: "true se il pezzo è in slab gradato, false se RAW" },
        grade: { type: ["number", "null"], description: "Voto di grading, es. 8.0" },
        has_obi: { type: ["boolean", "null"], description: "true con OBI, false senza, null se ignoto" },
        issue_number: {
          type: ["string", "null"],
          description: "Solo zashi: numero della rivista come stampato, es. '36-37'",
        },
        year: { type: ["integer", "null"], description: "Anno di pubblicazione del volume o della rivista, es. 1986" },
        language: {
          type: ["string", "null"],
          description:
            "Lingua dell'edizione (Japanese, Italian, English...). West Blue copre solo il giapponese: per le altre si usano gli annunci eBay del paese giusto",
        },
        is_first_print: { type: ["boolean", "null"], description: "Prima stampa: true, false o null se ignoto" },
        special_edition: { type: "boolean", description: "true se variant, box, limited, celebration o simili" },
      },
      required: ["series", "graded"],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: "function",
    name: "revalue_collection",
    description:
      "Rivaluta in un colpo solo TUTTI i pezzi della collezione leggendo il tracker West Blue e salvando subito i nuovi valori. Usalo quando l'utente chiede di rivalutare/aggiornare i prezzi della collezione (o di più pezzi): è molto più efficiente che chiamare lookup_market_price pezzo per pezzo. Non serve nessun altro tool dopo: i valori sono già salvati.",
    parameters: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["all", "missing_value"],
          description:
            "'all' rivaluta tutta la collezione; 'missing_value' solo i pezzi che non hanno ancora un valore",
        },
      },
      required: ["scope"],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: "function",
    name: "prepare_add_manga",
    description:
      "Completa e invia i dati di UN manga che l'utente ha chiesto esplicitamente di aggiungere. Se le foto mostrano più manga diversi, chiamalo una volta per ciascuno (anche in parallelo). Prima usa search_collection per evitare duplicati e lookup_market_price per il valore.",
    parameters: {
      type: "object",
      properties: {
        ...itemProperties,
        cover_title_text: { type: ["string", "null"], description: "Trascrizione letterale del titolo sul logo della copertina; non viene salvata" },
        cover_photo: coverPhotoProperty,
      },
      required: ["series", "format", "currency"],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: "function",
    name: "prepare_update_manga",
    description:
      "Completa e invia la modifica che l'utente ha chiesto esplicitamente. Prima usa search_collection per ottenere l'id corretto e web_search se servono metadati o prezzo.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "UUID dell'elemento esistente" },
        ...patchProperties,
        cover_photo: {
          ...coverPhotoProperty,
          description:
            "Numero della foto allegata da usare come NUOVA copertina, solo se è una foto frontale o l'utente chiede di sostituire l'immagine; null per foto di colophon, retro, dettagli o slab che servono solo all'analisi.",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    strict: false,
  },
  {
    type: "function",
    name: "delete_manga",
    description:
      "Rimuove l'elemento richiesto dall'utente. Usa il contesto dell'ultimo elemento quando l'utente dice 'rimuovilo', 'cancellalo' o espressioni equivalenti.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "UUID esatto dell'elemento da rimuovere" },
        series: { type: "string" },
        volume_number: { type: ["number", "null"] },
        issue_number: { type: ["string", "null"] },
        forget_history: {
          type: "boolean",
          description:
            "true = cancella anche lo storico del valore, come se il pezzo non fosse mai stato aggiunto; false = lo storico dei giorni passati resta",
        },
      },
      required: ["id", "series", "forget_history"],
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

Quando l'utente usa un comando esplicito come "aggiungi", "inserisci",
"aggiorna", "modifica", "salva", "rimuovi" o "cancella", quello costituisce già autorizzazione:
completa le ricerche necessarie e chiama il relativo tool nello stesso turno.
Non chiedere "vuoi procedere?" e non fermarti a "operazione preparata".
Usa i metadati che l'utente dichiara esplicitamente nel messaggio (per esempio
numero del volume o prima stampa) per completare una lettura fotografica
incompleta; non sovrascrivere un dato visibile che la contraddica.

CONTESTO CONVERSAZIONALE
- il messaggio può contenere un blocco "ELEMENTO CORRENTE": è l'ultimo manga
  aggiunto, aggiornato o citato con certezza;
- pronomi come "lo", "quello", "questo manga", "rimuovilo", "modificalo" o
  "aggiungigli" si riferiscono a quell'elemento;
- usa direttamente il suo id senza chiedere nuovamente serie o numero;
- per una rimozione chiama delete_manga. Non serve ricerca web per eliminare;
- rimozione e storico: se l'utente dice che l'aveva aggiunto per errore o che
  non vuole lasciare traccia, forget_history = true; se l'ha venduto, perso o
  regalato, forget_history = false (il valore passato resta nei grafici). Se
  non è chiaro, prima di chiamare delete_manga chiedi in una frase se
  cancellare anche la traccia del valore nello storico (es. "L'hai venduto o
  l'avevi aggiunto per errore? Nel secondo caso cancello anche lo storico del
  valore."), senza citare nomi di parametri;
- se non esiste un elemento corrente e il riferimento è ambiguo, usa
  search_collection o chiedi chiarimenti.

Prima di aggiungere:
- usa search_collection per verificare che non esista già lo stesso pezzo;
- usa web_search per completare i metadati pubblici dell'edizione esatta:
  anno di uscita, editore, lingua, ISBN e altri dati reperibili;
- se il pezzo viene da una foto, cerca prima il testo letterale del logo
  trascritto in cover_title_text insieme al volume; poi verifica che il nome
  canonico da salvare identifichi proprio quel titolo. Non usare solo il nome
  traslitterato proposto dalla lettura visiva e non confondere titolo, autore
  e testo dell'OBI. Se le fonti non confermano la corrispondenza, non salvare
  un nome ipotetico: chiedi all'utente di chiarire il titolo;
- flusso obbligatorio per una foto: cerca sul web il titolo originale + volume.
  Se i risultati sono indicizzati con una traslitterazione o il nome canonico,
  cerca anche quel nome + volume: non serve che la fonte ripeta gli stessi
  caratteri della copertina. Chiama poi verify_series_identity con titolo
  originale, volume, estratto e fonte; il tool controlla la corrispondenza
  esatta nel catalogo manga AniList e restituisce il titolo inglese ufficiale
  o, se assente, quello romaji. Usa esattamente il canonical_series restituito,
  mai una traduzione libera; solo dopo chiama
  lookup_market_price e poi prepare_add_manga. I tool rifiutano prezzo o
  salvataggio se l'identità non è stata verificata prima;
- per gli zashi verifica il nome della RIVISTA, non il manga in copertina:
  verify_series_identity usa gli alias delle riviste e la fonte web, senza
  richiedere un match AniList. Passa volume_number null; numero del fascicolo
  e anno restano issue_number e year nella ricerca prezzi. Non chiedere di
  scegliere il nome se il tool conferma già la rivista;
- una variante ortografica NON richiede una scelta dell'utente: Weekly Shonen
  Jump, Weekly Shōnen Jump e 週刊少年ジャンプ indicano la stessa testata.
  Usa Weekly Shonen Jump, senza chiedere quale scrittura salvare. Non offrire
  menu di nomi equivalenti; chiedi chiarimenti solo sull'identità della
  rivista, sul numero o sull'anno se realmente incerti;
- non chiedere all'utente di scegliere il nome canonico prima di aver tentato
  questa verifica: se la prima ricerca è inconcludente, prova una ricerca
  mirata con il nome canonico/traslitterato e il volume; chiedi conferma solo
  se AniList non conferma l'identità o non trovi una fonte utile;
- non lasciare questi campi vuoti solo perché non sono scritti nel messaggio:
  cercali online, usando foto, serie, numero ed edizione per disambiguare.

VALUTAZIONE OBBLIGATORIA
- se l'utente chiede di rivalutare la collezione, aggiornare i prezzi o
  ricalcolare i valori di più pezzi, chiama SUBITO revalue_collection una
  sola volta: rivaluta e salva tutto in un colpo. Non ciclare con
  lookup_market_price pezzo per pezzo e non chiamare prepare_update_manga
  dopo, perché i valori sono già stati scritti;
- per il prezzo di un SINGOLO pezzo chiama SEMPRE lookup_market_price: legge
  direttamente il tracker West Blue e restituisce le righe di vendita
  compatibili;
- NON usare web_search per i prezzi: il tracker carica i dati via JavaScript e
  la ricerca web non riesce a leggerli, quindi concluderesti a torto che il
  dato non esiste;
- passa serie in inglese, volume, graded (true/false), grade e has_obi;
- passa sempre language (lingua dell'edizione): un volume italiano o
  inglese NON va valutato con i prezzi giapponesi di West Blue; il tool
  ripiega da solo sugli annunci eBay (provider "ebay") quando West Blue non
  ha un prezzo, e se nemmeno eBay basta il valore resta vuoto da inserire a
  mano;
- quando noto e verificabile, passa anche year e is_first_print: per una
  prima stampa il fallback eBay considera solo annunci che la dichiarano
  esplicitamente e non li sostituisce con ristampe se sono pochi. Non dedurre
  la prima stampa da un titolo ambiguo; se non è certa, passa null;
- quando il prezzo riguarda un pezzo fotografato, passa anche
  cover_title_text (testo letterale del logo) e cover_photo; il lookup deve
  usare il nome canonico restituito da verify_series_identity, non una
  traslitterazione provvisoria;
- per gli zashi passa format "zashi", series = nome della rivista in romaji
  ("Weekly Shonen Jump", non 週刊少年ジャンプ), issue_number come stampato
  ("36-37") e year: senza numero e anno il tracker non trova il numero esatto;
  se l'anno non è noto e il tracker dice che il numero esiste in più annate,
  chiedi l'anno all'utente: non prenderlo dai risultati né indovinarlo;
- per un graded il tool restituisce la riga esatta con stesso volume e voto:
  usa quel prezzo, non una media tra graded diversi;
- per i tankōbon RAW il tool filtra sempre per lingua giapponese; se is_first_print è noto usa solo vendite i cui titoli dichiarano esplicitamente la prima stampa o una ristampa. I titoli ambigui non sono comparabili per una stampa nota e il tracker non certifica le dichiarazioni dei venditori. Se has_obi è noto, filtra anche per OBI: se i comparabili compatibili sono meno di 3, non produrre una stima West Blue;
- per i tankōbon RAW il tool richiede almeno 3 comparabili per stimare e calcola la media aritmetica fino a 10 vendite degli ultimi 12 mesi; se nell'ultimo anno ce ne sono meno di 3, usa le vendite storiche più recenti degli stessi comparabili e lo segnala nelle note. Le stesse vendite sono in matched_rows;
- il campo suggested_value_eur è già convertito in EUR: copialo in
  estimated_value e imposta currency EUR;
- riporta in notes la base usata (suggested_basis) e la fonte: West Blue,
  oppure "annunci eBay" se provider = "ebay" (succede quando West Blue non
  traccia il volume RAW o per le edizioni non giapponesi: è una mediana di
  prezzi richiesti e non di vendite concluse, dillo all'utente);
- solo se suggested_value_eur è null lascia estimated_value vuoto e scrivi in
  notes che non esistono vendite compatibili.

RICERCA WEB (solo metadati)
- usa web_search soltanto per metadati pubblici come anno, editore, lingua e
  ISBN, mai per i prezzi;
- usa al massimo 2 ricerche web per richiesta;
- dopo le ricerche chiama sempre il tool di aggiunta/aggiornamento: non
  terminare con una semplice spiegazione testuale.

Quando ricevi una o più foto:
- le foto sono numerate ("Foto 1", "Foto 2", ...) nell'ordine di invio;
- capisci prima se ritraggono lo STESSO pezzo da angolazioni diverse
  (copertina, retro, dorso, colophon, angoli, slab) oppure pezzi DIVERSI;
- stesso pezzo: combina tutte le foto per una valutazione unica. Deduci lo
  stato osservando angoli, dorso, retro e pagine; la prima stampa dal
  colophon; OBI e cellophane da qualunque foto li mostri. Crea un solo pezzo;
- pezzi diversi (es. "aggiungi questi manga"): crea un pezzo per ciascuno,
  chiamando prepare_add_manga una volta per volume. Più foto dello stesso
  volume vanno comunque unite in un unico pezzo;
- una singola foto con più volumi insieme: aggiungi ogni volume
  riconoscibile, con cover_photo=null perché la foto di gruppo non è la
  copertina di nessuno di essi;
- in cover_photo indica il numero della foto frontale di quel pezzo;
- analizza copertina, dorso, colophon ed eventuale slab;
- la serie è il LOGO principale della copertina. Il numero di volume nei
  tankōbon giapponesi è spesso in kanji vicino al logo o sul dorso:
  巻一=1, 巻十=10, 巻四十=40, 巻ノ六十=60, 巻百五=105, 第23巻=23. Convertilo
  sempre in volume_number: senza volume il prezzo non si trova;
- l'OBI (fascetta di carta sulla parte bassa) contiene pubblicità: film,
  artbook ("COLOR WALK"), date di uscita, campagne. NON è il titolo né la
  serie, e non trasforma il volume in un libro speciale; indica solo che
  l'OBI è presente (has_obi=true);
- estrai solo dati visibili o ragionevolmente certi;
- non inventare ISBN, anno, prima stampa, OBI, grading o prezzo;
- imposta is_sealed=true solo se il volume è chiaramente ancora avvolto nel
  cellophane originale (riflessi della pellicola, bordi termosaldati); in
  ogni altro caso false. Un pezzo in slab gradato non è "sealed";
- usa tankobon per volumi rilegati e zashi per riviste; per uno zashi la
  serie è il nome della rivista in romaji (es. "Weekly Shonen Jump"), con
  issue_number e release_year. Una rivista è UN pezzo: non aggiungerla due
  volte con il nome in inglese e in giapponese;
- se l'utente chiede di aggiungere il pezzo e serie/numero sono identificabili,
  chiama prepare_add_manga;
- se il titolo è chiaro ma il volume non si legge, cerca di identificare la
  copertina esatta sul web usando serie e dettagli dell'illustrazione prima di
  chiedere il numero; una fonte che conferma la copertina e il volume può
  completare il dato fotografico mancante;
- se chiede di aggiornare un pezzo, usa prima search_collection e poi
  prepare_update_manga;
- "mettilo in vendita" / "non è più in vendita": prepare_update_manga con
  is_for_sale true/false (nessuna valutazione necessaria);
- per un aggiornamento indica cover_photo solo se una foto è una copertina o
  l'utente chiede esplicitamente di sostituire l'immagine. Usa null per
  colophon, retro, dettagli interni o slab che servono solo all'analisi.

Chiedi una precisazione solo se non puoi identificare l'edizione dopo aver
analizzato la foto e cercato sul web, oppure se trovi più edizioni plausibili.
Non chiedere conferma dopo un comando esplicito dell'utente.`;

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
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY non configurata in questo deployment. Su Vercel aggiungi la variabile per l'ambiente in uso (Production e Preview) e poi esegui un nuovo deploy: le variabili non vengono applicate ai deployment già esistenti."
    );
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...body,
      ...(Array.isArray(body.tools) && body.tools.some(
        (tool) => tool && typeof tool === "object" && tool.type === "web_search"
      ) ? { include: [...new Set([
        ...(Array.isArray(body.include) ? body.include : []),
        "web_search_call.action.sources",
      ])] } : {}),
    }),
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
    is_sealed: item.is_sealed,
    is_for_sale: item.is_for_sale,
    language: item.language,
    grading_authority: item.grading_authority,
    grading_value: item.grading_value,
    condition_estimate: item.condition_estimate,
    estimated_value: item.estimated_value,
    currency: item.currency,
  };
}

function pendingReminder(pending: string[]): string {
  return (
    `Hai valutato anche ${pending.join(", ")} ma non l'hai ancora aggiunto. ` +
    "Aggiungi ORA ogni pezzo richiesto con prepare_add_manga, uno per chiamata: se lookup_market_price non ha " +
    "trovato vendite compatibili lascia estimated_value null e spiegalo in notes, non scartare il pezzo. " +
    "Salta solo i pezzi già presenti in collezione, dicendolo."
  );
}

function uncoveredPhotosReminder(photos: number[]): string {
  const list = photos.map((n) => `Foto ${n}`).join(", ");
  return (
    `${list} non ${photos.length > 1 ? "sono associate" : "è associata"} a nessun pezzo preparato. ` +
    "Se mostra un altro volume, fai lookup_market_price e aggiungilo ORA con prepare_add_manga (cover_photo con il suo numero; " +
    "senza vendite compatibili lascia estimated_value null, non scartarlo). " +
    "Se invece è un altro lato di un pezzo già preparato (retro, dorso, colophon) o una foto di gruppo già gestita, " +
    "rispondi solo con il testo, senza tool."
  );
}

/** Converte il numero di foto (1-based) scelto dal modello nell'URL corrispondente. */
function pickPhoto(imageUrls: string[], coverPhoto: unknown): string | null {
  if (typeof coverPhoto !== "number" || !Number.isInteger(coverPhoto)) return null;
  return imageUrls[coverPhoto - 1] ?? null;
}

async function executeTool(
  call: FunctionCall,
  items: MangaItem[],
  imageUrls: string[],
  userId: string
): Promise<{ output: string; action?: ChatAction; sideEffects?: number }> {
  const args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;

  if (call.name === "revalue_collection") {
    try {
      const summary = await revalueUserCollection(userId, {
        scope: args.scope === "missing_value" ? "missing_value" : "all",
      });
      const changed = summary.outcomes.filter((o) => o.changed);
      return {
        sideEffects: summary.items_updated,
        output: JSON.stringify({
          done: true,
          instruction:
            "I valori sono GIÀ stati salvati: riepiloga all'utente quanti pezzi sono cambiati, il nuovo totale e quelli senza comparabili. Non chiamare altri tool per questi pezzi.",
          items_processed: summary.items_processed,
          items_updated: summary.items_updated,
          items_unpriced: summary.items_unpriced,
          previous_total_eur: summary.previous_total,
          new_total_eur: summary.new_total,
          changed: changed.slice(0, 20).map((o) => ({
            item: o.label,
            from: o.previous_value,
            to: o.new_value,
            basis: o.basis,
          })),
          unpriced: summary.outcomes
            .filter((o) => o.new_value == null)
            .slice(0, 10)
            .map((o) => o.label),
        }),
      };
    } catch (cause) {
      return {
        output: JSON.stringify({
          error: cause instanceof Error ? cause.message : "Rivalutazione fallita",
          instruction: "Non inventare valori: spiega all'utente che il tracker non è raggiungibile.",
        }),
      };
    }
  }

  if (call.name === "lookup_market_price") {
    try {
      const result = await lookupMarketPrice({
        series: String(args.series ?? "").trim(),
        volume: typeof args.volume === "number" ? args.volume : null,
        format: args.format === "zashi" ? "zashi" : "tankobon",
        graded: args.graded === true,
        grade: typeof args.grade === "number" ? args.grade : null,
        hasObi: typeof args.has_obi === "boolean" ? args.has_obi : null,
        issue: typeof args.issue_number === "string" ? args.issue_number : null,
        year: typeof args.year === "number" ? args.year : null,
        language: typeof args.language === "string" ? args.language : null,
        isFirstPrint: typeof args.is_first_print === "boolean" ? args.is_first_print : null,
        isSpecialEdition: args.special_edition === true,
      });
      return { output: JSON.stringify(result) };
    } catch (cause) {
      return {
        output: JSON.stringify({
          error: cause instanceof Error ? cause.message : "Tracker non raggiungibile",
          instruction:
            "Il tracker non è raggiungibile: non inventare un prezzo. Procedi senza estimated_value e spiega il motivo nelle note.",
        }),
      };
    }
  }

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

  if (
    (call.name === "prepare_add_manga" || call.name === "prepare_update_manga" || call.name === "lookup_market_price") &&
    typeof args.issue_number === "string"
  ) {
    const issue = checkIssueNumber(args.issue_number);
    if (issue.problem) {
      return {
        output: JSON.stringify({
          error: issue.problem,
          instruction:
            "Non salvare e non valutare con questo numero. Rileggi il numero sulla copertina (di solito in basso a sinistra, 'No.XX・YY'): se resta incerto chiedi all'utente quale è, proponendo le due letture consecutive plausibili.",
        }),
      };
    }
    args.issue_number = issue.normalized;
  }

  if (call.name === "prepare_add_manga") {
    const coverPhoto = args.cover_photo;
    const addArgs = { ...args };
    delete addArgs.cover_photo;
    delete addArgs.cover_title_text;
    // Con una sola foto è quasi sempre la copertina (comportamento storico);
    // con più foto la copertina va indicata esplicitamente, altrimenti un
    // retro o un colophon diventerebbero la cover.
    const cover =
      coverPhoto === undefined && imageUrls.length === 1 ? imageUrls[0] : pickPhoto(imageUrls, coverPhoto);
    const payload = mangaMutationSchema.parse({
      ...addArgs,
      currency: "EUR",
      image_url: cover ?? addArgs.image_url ?? null,
    });
    const action: ChatAction = { type: "add", payload };
    return { output: JSON.stringify({ prepared: true, action }), action };
  }

  if (call.name === "prepare_update_manga") {
    const { cover_photo: coverPhoto, use_attached_image: legacyUseImage, ...patchArgs } = args;
    const cover = legacyUseImage === true ? imageUrls[0] ?? null : pickPhoto(imageUrls, coverPhoto);
    const payload = mangaPatchSchema.parse({
      ...patchArgs,
      ...(patchArgs.estimated_value !== undefined ? { currency: "EUR" } : {}),
      ...(cover ? { image_url: cover } : {}),
    });
    const action: ChatAction = { type: "update", payload };
    return { output: JSON.stringify({ prepared: true, action }), action };
  }

  if (call.name === "delete_manga") {
    const payload = {
      id: String(args.id),
      series: String(args.series),
      volume_number: typeof args.volume_number === "number" ? args.volume_number : null,
      issue_number: typeof args.issue_number === "string" ? args.issue_number : null,
      forget_history: args.forget_history === true,
    };
    const action: ChatAction = { type: "delete", payload };
    return { output: JSON.stringify({ prepared: true, action }), action };
  }

  return { output: JSON.stringify({ error: `Tool sconosciuto: ${call.name}` }) };
}

type PhotoPiece = {
  photos: number[];
  cover_photo: number | null;
  series: string;
  cover_title_text: string | null;
  volume_text: string | null;
  volume_number: number | null;
  issue_number: string | null;
  year: number | null;
  language: string | null;
  is_first_print: boolean | null;
  format: "tankobon" | "zashi";
  has_obi: boolean | null;
  obi_text: string | null;
  is_sealed: boolean;
  graded: boolean;
  grading_authority: string | null;
  grading_value: number | null;
  condition: string;
};

type WebSearchEvidence = { query: string; sources: Array<{ title?: string; url: string }> };

function collectWebSearchEvidence(item: unknown): WebSearchEvidence[] {
  if (!item || typeof item !== "object") return [];
  const action = (item as { action?: { query?: unknown; queries?: unknown; sources?: unknown } }).action;
  if (!action || !Array.isArray(action.sources)) return [];
  const queries = [
    ...(typeof action.query === "string" ? [action.query] : []),
    ...(Array.isArray(action.queries)
      ? action.queries.filter((query): query is string => typeof query === "string")
      : []),
  ];
  const sources = action.sources.flatMap((source) => {
    if (!source || typeof source !== "object") return [];
    const entry = source as { title?: unknown; url?: unknown };
    return typeof entry.url === "string"
      ? [{ ...(typeof entry.title === "string" ? { title: entry.title } : {}), url: entry.url }]
      : [];
  });
  return [...new Set(queries)].map((query) => ({ query, sources }));
}

type CanonicalTitleResult = { canonicalSeries: string | null; error?: string };
const canonicalTitleCache = new Map<string, { value: CanonicalTitleResult; expiresAt: number }>();

function resolveCanonicalMagazineTitle(observedTitle: string): CanonicalTitleResult {
  const titles: Record<string, string> = {
    "weekly shonen jump": "Weekly Shonen Jump",
    "monthly shonen jump": "Monthly Shonen Jump",
    "jump square": "Jump Square",
    "akamaru jump": "Akamaru Jump",
    "weekly young jump": "Weekly Young Jump",
    "weekly shonen magazine": "Weekly Shonen Magazine",
    "weekly shonen sunday": "Weekly Shonen Sunday",
    "corocoro comic": "Corocoro Comic",
  };
  const normalized = observedTitle.normalize("NFKC").replace(/\p{Script=Latin}+/gu,
    (word) => word.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""));
  // Il solo "ジャンプ" non identifica una testata: potrebbe essere parte
  // del marchio editoriale di un tankobon.
  const explicitMagazine =
    /週刊少年ジャンプ|月刊少年ジャンプ|少年ジャンプ|ジャンプスクエア|ジャンプSQ|赤マルジャンプ|ヤングジャンプ|少年マガジン|少年サンデー|コロコロ/i.test(normalized) ||
    /^(?:weekly shonen jump|shonen jump|monthly shonen jump|jump square|akamaru jump|weekly young jump|weekly shonen magazine|weekly shonen sunday|corocoro comic)$/i.test(normalized.trim());
  return { canonicalSeries: explicitMagazine ? titles[magazineKey(normalized)] ?? null : null };
}

function normalizeIdentityText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function sameSeriesIdentity(left: string, right: string): boolean {
  if (normalizeIdentityText(left) === normalizeIdentityText(right)) return true;
  const ignored = new Set(["of", "the", "no"]);
  const words = (value: string) =>
    value
      .normalize("NFKC")
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((word) => !ignored.has(word))
      .sort()
      .join("|") ?? "";
  const leftWords = words(left);
  return leftWords.length > 0 && leftWords === words(right);
}

function identityKey(title: string, volume: number | null): string {
  const magazine = resolveCanonicalMagazineTitle(title).canonicalSeries;
  return `${normalizeIdentityText(magazine ?? title)}|${volume ?? ""}`;
}

function sameObservedTitle(left: string, right: string): boolean {
  if (normalizeIdentityText(left) === normalizeIdentityText(right)) return true;
  const leftMagazine = resolveCanonicalMagazineTitle(left).canonicalSeries;
  const rightMagazine = resolveCanonicalMagazineTitle(right).canonicalSeries;
  return leftMagazine !== null && leftMagazine === rightMagazine;
}

async function resolveCanonicalMangaTitle(
  observedTitle: string,
  proposedSeries: string
): Promise<CanonicalTitleResult> {
  const observedKey = normalizeIdentityText(observedTitle);
  if (!observedKey) return { canonicalSeries: null };
  const key = `${observedKey}|${normalizeIdentityText(proposedSeries)}`;
  const cached = canonicalTitleCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const query = `query ($search: String) {
    Page(perPage: 25) {
      media(search: $search, type: MANGA) {
        title { romaji english native }
        synonyms
      }
    }
  }`;
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { search: observedTitle } }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    return { canonicalSeries: null, error: `Catalogo manga non raggiungibile (${response.status}).` };
  }
  const payload = (await response.json()) as {
    data?: {
      Page?: {
        media?: Array<{
          title?: { romaji?: string | null; english?: string | null; native?: string | null };
          synonyms?: string[];
        } | null>;
      } | null;
    };
    errors?: Array<{ message?: string }>;
  };
  if (payload.errors?.length) {
    return { canonicalSeries: null, error: "Catalogo manga non disponibile per questa verifica." };
  }
  const matches = (payload.data?.Page?.media ?? []).filter((manga) => {
    if (!manga) return false;
    const titles = [
      manga.title?.native,
      manga.title?.romaji,
      manga.title?.english,
      ...(manga.synonyms ?? []),
    ].filter((title): title is string => Boolean(title?.trim()));
    return titles.some((title) => normalizeIdentityText(title) === observedKey);
  });
  const proposedKey = normalizeIdentityText(proposedSeries);
  const proposedMatches = matches.filter((manga) =>
    [
      manga?.title?.english,
      manga?.title?.romaji,
      manga?.title?.native,
    ].some((title) => title && normalizeIdentityText(title) === proposedKey)
  );
  const manga = proposedMatches.length === 1
    ? proposedMatches[0]
    : matches.length === 1 ? matches[0] : undefined;
  const canonicalSeries =
    manga?.title?.english?.trim() || manga?.title?.romaji?.trim() || manga?.title?.native?.trim() || null;
  if (!canonicalSeries) return { canonicalSeries: null };
  const value = { canonicalSeries };
  canonicalTitleCache.set(key, { value, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  return value;
}

const photoReadingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["pieces"],
  properties: {
    pieces: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "photos", "cover_photo", "series", "cover_title_text", "volume_text", "volume_number", "issue_number", "year", "language",
          "is_first_print", "format", "has_obi",
          "obi_text", "is_sealed", "graded", "grading_authority", "grading_value", "condition",
        ],
        properties: {
          photos: { type: "array", items: { type: "integer" } },
          cover_photo: { type: ["integer", "null"] },
          series: { type: "string", description: "Nome canonico dell'opera, non testo promozionale dell'obi" },
          cover_title_text: { type: ["string", "null"], description: "Titolo principale trascritto dalla copertina nella scrittura originale" },
          volume_text: { type: ["string", "null"] },
          volume_number: { type: ["integer", "null"] },
          issue_number: { type: ["string", "null"] },
          year: { type: ["integer", "null"] },
          language: { type: ["string", "null"], description: "Lingua dell'edizione identificata dalla copertina, non il titolo canonico tradotto" },
          is_first_print: { type: ["boolean", "null"] },
          format: { type: "string", enum: ["tankobon", "zashi"] },
          has_obi: { type: ["boolean", "null"] },
          obi_text: { type: ["string", "null"] },
          is_sealed: { type: "boolean" },
          graded: { type: "boolean" },
          grading_authority: { type: ["string", "null"] },
          grading_value: { type: ["number", "null"] },
          condition: { type: "string" },
        },
      },
    },
  },
};

const photoReadingInstructions = `Sei un esperto di manga giapponesi. Elenca i pezzi fisici distinti mostrati nelle foto: più foto dello stesso volume (copertina, retro, dorso, colophon, angoli) sono UN pezzo; una foto con più volumi sono più pezzi.
Per ciascun pezzo:
- cover_title_text: trascrivi per intero il titolo del LOGO principale nella scrittura originale, includendo tutte le parole/caratteri che compongono il marchio, anche se disposti in verticale, su righe diverse o con dimensioni diverse (non copiare solo la parola più grande o l'ultima parte); orienta mentalmente la copertina prima di leggerla. Non tradurlo, non ricostruirlo dal testo promozionale e non includere frasi dell'OBI. Se una parte del logo non è leggibile con sufficiente certezza, null invece di una trascrizione parziale;
- series: nome canonico dell'opera corrispondente al logo principale, in romaji/inglese quando identificabile. Non usare il testo dell'OBI per completare o indovinare il nome: se il logo non è leggibile, lascia la serie vuota;
- volume_text: la scritta del numero di volume COPIATA esattamente come stampata (es. 巻四十, 巻ノ六十, 第23巻, 1), di solito piccola vicino al logo o sul dorso; volume_number: la sua conversione in cifre (四十=40, 六十=60, 百五=105);
- language: lingua dell'edizione fisica, non la lingua del nome canonico. Se sulla copertina si vedono chiaramente titolo/testi/editori giapponesi, indica "Japanese" anche se series è restituito in inglese; se la lingua non è distinguibile, null;
- zashi (riviste): series = nome della rivista in romaji/inglese (週刊少年ジャンプ → "Weekly Shonen Jump"); issue_number = numero del fascicolo come stampato (es. "36・37号" → "36-37"), di solito piccolo in basso a sinistra ("No.36・37"): leggilo cifra per cifra, 5/6 e 3/8 si confondono facilmente; i numeri doppi (合併号) sono SEMPRE consecutivi, quindi "35・37" è impossibile: se le cifre non sono consecutive rileggi, e se resti incerto metti la lettura più probabile e segnalalo in notes; year = anno del fascicolo SOLO se stampato e leggibile in copertina (es. "2025年", data di uscita), altrimenti null: non dedurlo dal contenuto. volume_number null;
- tankōbon: issue_number e year null;
- is_first_print: true/false solo se una foto mostra una prova esplicita (es. colophon con 第1刷/初版 o una ristampa indicata); altrimenti null;
- l'OBI è la fascetta di carta nella parte bassa con pubblicità (film, artbook, date): riporta il testo in obi_text ma NON usarlo mai per serie o volume;
- is_sealed=true solo se è chiaramente nel cellophane originale termosaldato; una busta protettiva o uno slab non contano;
- graded/grading_*: solo se è in uno slab con etichetta leggibile;
- condition: stato fisico osservabile (angoli, dorso, bordi, macchie, ingiallimento) in italiano, breve;
- cover_photo: numero della foto frontale del pezzo; null se esiste solo in una foto di gruppo.
Non inventare nulla che non sia visibile.`;

/**
 * Lettura dedicata delle foto, senza tool: il modello della chat, dovendo
 * anche cercare prezzi e metadati, tende a leggere male i numeri in kanji e a
 * scambiare la pubblicità dell'OBI per il titolo. Un passaggio mirato è molto
 * più affidabile e fornisce l'elenco dei pezzi attesi.
 */
async function readPhotos(imageUrls: string[]): Promise<PhotoPiece[] | null> {
  const content: Array<Record<string, string>> = [{ type: "input_text", text: "Leggi le foto." }];
  imageUrls.forEach((url, index) => {
    content.push({ type: "input_text", text: `Foto ${index + 1}:` });
    content.push({ type: "input_image", image_url: url, detail: "high" });
  });
  try {
    const response = await createResponse({
      model: process.env.OPENAI_CHAT_MODEL || "gpt-5-mini",
      instructions: photoReadingInstructions,
      reasoning: { effort: "low" },
      max_output_tokens: 8000,
      input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: "photo_reading", strict: true, schema: photoReadingSchema } },
    });
    const parsed = JSON.parse(outputText(response)) as { pieces?: PhotoPiece[] };
    if (!Array.isArray(parsed.pieces) || parsed.pieces.length === 0) return null;
    return parsed.pieces.map((piece) => {
      const magazine = resolveCanonicalMagazineTitle(piece.cover_title_text ?? "").canonicalSeries;
      if (!magazine) return piece;
      const issue = piece.issue_number ??
        (piece.volume_number !== null ? String(piece.volume_number) : null);
      const checkedIssue = checkIssueNumber(issue);
      // Il logo identifica la rivista anche quando la visione scambia il fascicolo per un volume.
      return {
        ...piece,
        series: magazine,
        format: "zashi",
        issue_number: checkedIssue.problem ? issue : checkedIssue.normalized,
        volume_number: null,
      };
    });
  } catch {
    // In caso di errore la chat prosegue analizzando le foto direttamente.
    return null;
  }
}

export async function runCollectionChat({
  message,
  imageUrls,
  actionImageUrls,
  history,
  recentContext,
  items,
  userId,
}: {
  message: string;
  /** Foto allegate a questo messaggio, inviate al modello per l'analisi. */
  imageUrls: string[];
  /** Foto disponibili come copertina: quelle nuove o, in loro assenza, quelle del turno precedente. */
  actionImageUrls: string[];
  history: Array<{ role: "user" | "assistant"; text: string }>;
  recentContext: ChatEntityContext | null;
  items: MangaItem[];
  userId: string;
}): Promise<{
  responseId: string | null;
  text: string;
  actions: ChatAction[];
  executed: number;
  intent: { valuation: boolean };
  verifiedPhotoTitles: Array<{ observedTitle: string; canonicalSeries: string; volume: number | null }>;
}> {
  const requiresValuation =
    /\b(valut|prezz|quanto vale|stima(?:re|zione)?|rivalut)\w*/i.test(message);
  const requiresWebResearch =
    /\b(aggiung|inserisc|salva|valut|prezz|quanto vale|stima|isbn|editore|anno|lingua)\w*/i.test(message);
  const tools = requiresWebResearch
    ? [{ type: "web_search" }, ...functionTools]
    : functionTools;
  const contextText = recentContext
    ? `\n\nELEMENTO CORRENTE (usa questo riferimento per pronomi e comandi successivi. Per una richiesta di prezzo usa i dati salvati qui, in particolare lingua, prima stampa, OBI e grading; non richiederli di nuovo se sono già presenti. Se cover_title_text è presente, usalo come titolo originale per riverificare il nome canonico):\n${JSON.stringify(recentContext)}`
    : "";
  const content: Array<Record<string, string>> = [
    { type: "input_text", text: `${message}${contextText}` },
  ];
  // Ogni foto è preceduta da un'etichetta: il modello la usa per indicare in
  // cover_photo quale immagine è la copertina di ciascun pezzo.
  const photoPieces = imageUrls.length > 0 ? await readPhotos(imageUrls) : null;
  if (photoPieces) {
    content.push({
      type: "input_text",
      text:
        "\n\nLETTURA DELLE FOTO (passaggio di visione dedicato: cover_title_text è la trascrizione letterale " +
        "del logo originale e va verificata sul web prima di normalizzare/salvare series; usa anche i campi " +
        "per volume_number, OBI, sealed, grading, stato e cover_photo; un elemento = un pezzo):\n" +
        JSON.stringify(photoPieces),
    });
  }
  imageUrls.forEach((url, index) => {
    content.push({ type: "input_text", text: `Foto ${index + 1}:` });
    // Con la lettura già fatta le foto servono solo come riscontro visivo.
    content.push({ type: "input_image", image_url: url, detail: photoPieces ? "low" : "high" });
  });
  if (imageUrls.length === 0 && actionImageUrls.length > 0) {
    content.push({
      type: "input_text",
      text: `\n(Ci sono ${actionImageUrls.length} foto del messaggio precedente ancora disponibili come copertina: Foto 1${
        actionImageUrls.length > 1 ? `-${actionImageUrls.length}` : ""
      }.)`,
    });
  }

  const compactHistory = history.slice(-6).map((entry) => ({
    role: entry.role,
    content: entry.text.slice(0, 1000),
  }));
  const initialRequest = {
    model: process.env.OPENAI_CHAT_MODEL || "gpt-5-mini",
    instructions,
    tools,
    reasoning: { effort: "low" },
    // Più foto significano spesso più pezzi da creare nello stesso turno,
    // ciascuno con la propria chiamata: serve più spazio per gli argomenti.
    max_output_tokens: imageUrls.length > 1 ? 6000 : 3000,
    max_tool_calls: 6,
    include: ["web_search_call.action.sources"],
    input: [...compactHistory, { role: "user", content }],
  };

  let response = await createResponse(initialRequest);

  const actions: ChatAction[] = [];
  let executed = 0;
  let usedWebSearch = false;
  let usedPriceLookup = false;
  let priceLookupFoundValue = false;
  const webSearchEvidence: WebSearchEvidence[] = [];
  const verifiedIdentities = new Map<
    string,
    { observedTitle: string; canonicalSeries: string; volume: number | null }
  >();
  const verifiedPhotoTitles = () =>
    [...verifiedIdentities.values()].map(({ observedTitle, canonicalSeries, volume }) => ({
      observedTitle,
      canonicalSeries,
      volume,
    }));
  const completedPriceLookups = new Set<string>();

  // Con più pezzi da aggiungere, il modello tende a fermarsi al primo (per
  // esempio scartando in silenzio quello senza vendite compatibili). Si
  // tiene traccia dei pezzi valutati e, finché qualcuno non è stato
  // aggiunto, il turno continua invece di chiudersi alla prima proposta.
  const requiresAdd = /\b(aggiung|inserisc|salva|registra)\w*/i.test(message);
  const evaluated = new Map<string, string>();
  const pieceKey = (series: unknown, volume: unknown) =>
    `${String(series ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "")}|${volume ?? ""}`;
  if (requiresAdd && photoPieces) {
    for (const piece of photoPieces) {
      const number = piece.volume_number ?? piece.issue_number;
      if (number == null) continue;
      evaluated.set(
        pieceKey(piece.series, number),
        `${piece.series}${
          piece.volume_number != null ? ` vol. ${piece.volume_number}` : piece.issue_number ? ` #${piece.issue_number}` : ""
        }`
      );
    }
  }
  const normalizeSeries = (series: unknown) => String(series ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const pendingPieces = () => {
    const added = actions
      .filter((action) => action.type === "add")
      .map((action) => ({
        series: normalizeSeries(action.payload.series),
        volume: String(action.payload.volume_number ?? action.payload.issue_number ?? ""),
      }));
    // Confronto tollerante: "One Piece" coincide con "ONE PIECE (ed. giapponese)".
    return [...evaluated]
      .filter(([key]) => {
        const [series, volume] = key.split("|");
        return !added.some(
          (other) =>
            other.volume === volume &&
            (!series || !other.series || other.series.includes(series) || series.includes(other.series))
        );
      })
      .map(([, label]) => label);
  };
  let reminders = 0;
  let identityReminderSent = false;
  // Con più foto e una richiesta di aggiunta, ogni foto deve finire in un
  // pezzo (come copertina) o essere dichiarata come lato di un pezzo già
  // preparato: si chiede una sola verifica esplicita al modello.
  let photoCheckDone = !requiresAdd || imageUrls.length < 2 || photoPieces !== null;
  const uncoveredPhotos = () => {
    const used = new Set(actions.map((action) => ("image_url" in action.payload ? action.payload.image_url : null)).filter(Boolean));
    return imageUrls.map((url, index) => (used.has(url) ? null : index + 1)).filter((n): n is number => n !== null);
  };
  const pushAction = (action: ChatAction) => {
    if (action.type === "add") {
      const key = pieceKey(action.payload.series, action.payload.volume_number ?? action.payload.issue_number);
      const number = String(action.payload.volume_number ?? action.payload.issue_number ?? "");
      const existing = actions.findIndex(
        (other) =>
          other.type === "add" &&
          (pieceKey(other.payload.series, other.payload.volume_number ?? other.payload.issue_number) === key ||
            // Stessa copertina e stesso numero: è lo stesso pezzo scritto con
            // un nome diverso (es. "Weekly Shonen Jump" e "週刊少年ジャンプ").
            (Boolean(action.payload.image_url) &&
              other.payload.image_url === action.payload.image_url &&
              String(other.payload.volume_number ?? other.payload.issue_number ?? "") === number))
      );
      // Il modello a volte ripropone lo stesso pezzo con dati arricchiti:
      // si tiene l'ultima versione invece di creare un duplicato.
      if (existing >= 0) {
        actions[existing] = action;
        return;
      }
    }
    actions.push(action);
  };

  // Ogni pezzo in più richiede in genere un giro per la valutazione e uno
  // per l'aggiunta: senza margine gli ultimi pezzi venivano persi.
  const maxRounds = MAX_TOOL_ROUNDS + Math.min(photoPieces?.length ?? imageUrls.length, MAX_CHAT_IMAGES);
  for (let round = 0; round < maxRounds; round += 1) {
    const searchCalls = response.output.filter((item) => item.type === "web_search_call");
    if (searchCalls.length > 0) {
      usedWebSearch = true;
      for (const item of searchCalls) {
        webSearchEvidence.push(...collectWebSearchEvidence(item));
      }
    }
    const calls = response.output.filter((item): item is FunctionCall => item.type === "function_call");
    const verifiedBeforeRound = new Map(verifiedIdentities);
    const identityVerificationResults = new Map<string, string>();
    for (const call of calls) {
      if (call.name !== "verify_series_identity") continue;
      try {
        const args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
        const coverPhoto = typeof args.cover_photo === "number" ? args.cover_photo : -1;
        const observedTitle = typeof args.observed_title === "string" ? args.observed_title.trim() : "";
        const proposedSeries = typeof args.canonical_series === "string" ? args.canonical_series.trim() : "";
        const volume = typeof args.volume_number === "number" ? args.volume_number : null;
        const evidenceText = typeof args.evidence_text === "string" ? args.evidence_text.trim() : "";
        const evidenceUrl = typeof args.evidence_url === "string" ? args.evidence_url.trim() : "";
        const validEvidenceUrl = /^https:\/\/\S+$/i.test(evidenceUrl);
        const normalizedObservedTitle = normalizeIdentityText(observedTitle);
        const normalizedProposedSeries = normalizeIdentityText(proposedSeries);
        const volumePattern =
          volume === null ? null : new RegExp(`(?:^|\\D)${volume}(?:\\D|$)`);
        const matchingPhoto =
          coverPhoto > 0
            ? photoPieces?.find(
                (piece) =>
                  (piece.cover_photo === coverPhoto || piece.photos.includes(coverPhoto)) &&
                  sameObservedTitle(piece.cover_title_text ?? "", observedTitle) &&
                  // Un numero letto dall'utente o dalla fonte può colmare l'OCR mancante,
                  // ma non contraddire un volume riconosciuto nella foto.
                  (piece.volume_number === null || piece.volume_number === volume)
              )
            : undefined;
        const matchingContext =
          coverPhoto === 0 &&
          imageUrls.length === 0 &&
          recentContext &&
          sameObservedTitle(recentContext.cover_title_text ?? recentContext.series, observedTitle) &&
          recentContext.volume_number === volume;
        const fallbackPhotoIdentity =
          coverPhoto > 0 && imageUrls.length > 0 && !photoPieces && observedTitle.length > 0;
        let problem: string | null = null;
        if (!usedWebSearch) {
          problem = "La ricerca web necessaria per verificare il titolo non è stata eseguita.";
        } else if (!matchingPhoto && !matchingContext && !fallbackPhotoIdentity) {
          problem = "Il titolo o il volume non corrispondono all'elemento identificato nella foto o nel contesto corrente.";
        } else {
          const magazineResolution = resolveCanonicalMagazineTitle(observedTitle);
          const isMagazine = matchingPhoto?.format === "zashi" ||
            (matchingContext && recentContext?.format === "zashi") ||
            magazineResolution.canonicalSeries !== null;
          const resolution = isMagazine
            ? magazineResolution
            : await resolveCanonicalMangaTitle(observedTitle, proposedSeries);
          if (resolution.error) {
            problem = resolution.error;
          } else if (!resolution.canonicalSeries) {
            problem = isMagazine
              ? "Il titolo della rivista non corrisponde a un alias noto. Serve una conferma del nome della rivista."
              : "Il titolo originale non ha una corrispondenza esatta nel catalogo manga. Non inventare il nome canonico.";
          } else {
            const normalizedCanonicalSeries = normalizeIdentityText(resolution.canonicalSeries);
            const matchingSource = webSearchEvidence.find(
              ({ query, sources }) =>
                observedTitle.length > 0 &&
                evidenceText.length > 0 &&
                validEvidenceUrl &&
                [
                  normalizedObservedTitle,
                  normalizedProposedSeries,
                  normalizedCanonicalSeries,
                ].some((title) => title.length > 0 && normalizeIdentityText(query).includes(title)) &&
                (volumePattern === null ||
                  volumePattern.test(query.normalize("NFKC")) ||
                  volumePattern.test(evidenceText.normalize("NFKC"))) &&
                sources.some((source) => source.url === evidenceUrl)
            );
            if (!matchingSource) {
              problem = "Non trovo nei risultati web una fonte per il titolo originale o canonico e il volume.";
            } else {
              verifiedIdentities.set(identityKey(observedTitle, volume), {
                observedTitle,
                canonicalSeries: resolution.canonicalSeries,
                volume,
              });
            }
          }
        }
        identityVerificationResults.set(
          call.call_id,
          JSON.stringify(
            problem
              ? {
                  verified: false,
                  error: problem,
                  instruction:
                    "Cerca il titolo originale oppure il nome canonico e il numero. Per i tankobon il catalogo AniList verifica l'identità; per gli zashi si usano gli alias della rivista e una fonte web, non AniList. Chiedi chiarimenti solo se la verifica appropriata non conferma l'identità.",
                }
              : {
                  verified: true,
                  canonical_series: verifiedIdentities.get(identityKey(observedTitle, volume))?.canonicalSeries,
                  proposed_series: proposedSeries,
                  volume_number: volume,
                  evidence_text: evidenceText,
                  evidence_url: evidenceUrl,
                }
          )
        );
      } catch {
        identityVerificationResults.set(
          call.call_id,
          JSON.stringify({
            verified: false,
            error: "La verifica dell'identità non è riuscita; riprova o chiedi all'utente di chiarire il titolo.",
          })
        );
      }
    }
    const pendingNow = requiresAdd && actions.length > 0 ? pendingPieces() : [];
    const uncoveredNow = !photoCheckDone && actions.length > 0 && pendingNow.length === 0 ? uncoveredPhotos() : [];
    if (calls.length === 0 && uncoveredNow.length > 0 && round < maxRounds - 1) {
      photoCheckDone = true;
      response = await createResponse({
        model: process.env.OPENAI_CHAT_MODEL || "gpt-5-mini",
        instructions,
        tools,
        reasoning: { effort: "low" },
        max_output_tokens: 6000,
        max_tool_calls: 6,
        previous_response_id: response.id,
        input: [{ role: "user", content: uncoveredPhotosReminder(uncoveredNow) }],
      });
      continue;
    }
    if (calls.length === 0 && pendingNow.length > 0 && reminders < 2 && round < maxRounds - 1) {
      reminders += 1;
      response = await createResponse({
        model: process.env.OPENAI_CHAT_MODEL || "gpt-5-mini",
        instructions,
        tools,
        reasoning: { effort: "low" },
        max_output_tokens: 6000,
        max_tool_calls: 6,
        previous_response_id: response.id,
        input: [{ role: "user", content: pendingReminder(pendingNow) }],
      });
      continue;
    }
    const unverifiedPhotoPieces =
      requiresAdd && photoPieces
        ? photoPieces.filter(
            (piece) =>
              piece.cover_title_text?.trim() &&
              !verifiedIdentities.has(identityKey(piece.cover_title_text, piece.volume_number))
          )
        : [];
    if (
      calls.length === 0 &&
      unverifiedPhotoPieces.length > 0 &&
      !identityReminderSent &&
      round < maxRounds - 1
    ) {
      identityReminderSent = true;
      response = await createResponse({
        model: process.env.OPENAI_CHAT_MODEL || "gpt-5-mini",
        instructions,
        tools,
        reasoning: { effort: "low" },
        max_output_tokens: 4000,
        max_tool_calls: 6,
        include: ["web_search_call.action.sources"],
        previous_response_id: response.id,
        input: [{
          role: "user",
          content:
            "Non chiedere ancora conferma all'utente. Per ogni copertina non verificata, cerca sul web il titolo originale o canonico e il numero. Poi chiama verify_series_identity con una fonte dei risultati. Per un tankobon usa volume_number e la verifica AniList; per uno zashi usa volume_number null, verifica testata, fascicolo e anno con gli alias della rivista e la fonte web, senza AniList. Non chiedere di scegliere fra grafie equivalenti di una testata riconosciuta.",
        }],
      });
      continue;
    }
    if (calls.length === 0) {
      return {
        responseId: response.id,
        text: outputText(response) || "Operazione preparata.",
        actions,
        executed,
        intent: { valuation: requiresValuation },
        verifiedPhotoTitles: verifiedPhotoTitles(),
      };
    }

    const outputs = await Promise.all(
      calls.map(async (call) => {
        let result: Awaited<ReturnType<typeof executeTool>>;
        try {
          const args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
          const requestedCoverPhoto = typeof args.cover_photo === "number" ? args.cover_photo : null;
          const requestedCoverTitle =
            typeof args.cover_title_text === "string"
              ? args.cover_title_text
              : call.name === "verify_series_identity" && typeof args.observed_title === "string"
                ? args.observed_title
                : null;
          const exactTitleMatch =
            requestedCoverTitle == null
              ? []
              : photoPieces?.filter(
                  (piece) =>
                    sameObservedTitle(piece.cover_title_text ?? "", requestedCoverTitle)
                ) ?? [];
          const exactCoverMatch =
            requestedCoverPhoto === null
              ? []
              : photoPieces?.filter(
                  (piece) =>
                    piece.cover_photo === requestedCoverPhoto ||
                    (call.name === "verify_series_identity" && piece.photos.includes(requestedCoverPhoto))
                ) ?? [];
          const matchingPhotoPieces =
            exactTitleMatch.length > 0
              ? exactTitleMatch
              : exactCoverMatch.length > 0
              ? exactCoverMatch
              : photoPieces?.filter((piece) =>
                  typeof args.volume_number === "number" &&
                  piece.volume_number === args.volume_number &&
                  normalizeSeries(piece.series) === normalizeSeries(args.series)
                ) ?? [];
          const photoPiece =
            matchingPhotoPieces.length === 1
              ? matchingPhotoPieces[0]
              : photoPieces?.length === 1
                ? photoPieces[0]
                : undefined;

          const contextVolume = call.name === "lookup_market_price"
            ? (typeof args.volume === "number" ? args.volume : null)
            : (typeof args.volume_number === "number" ? args.volume_number : null);
          const requestedSeries = typeof args.series === "string" ? args.series : "";
          const usesRecentContext =
            imageUrls.length === 0 &&
            recentContext !== null &&
            (contextVolume === null || contextVolume === recentContext.volume_number) &&
            (!requestedSeries || sameSeriesIdentity(requestedSeries, recentContext.series));
          const identityVolume = photoPiece?.volume_number ??
            (typeof args.volume_number === "number" ? args.volume_number : null) ??
            (typeof args.volume === "number" ? args.volume : null) ??
            (usesRecentContext ? recentContext.volume_number : null);
          const contextObservedTitle = usesRecentContext
            ? recentContext.cover_title_text ?? recentContext.series
            : "";
          const requestIdentityTitle = photoPiece?.cover_title_text?.trim() ||
            (imageUrls.length > 0 && typeof args.cover_title_text === "string" ? args.cover_title_text.trim() : "") ||
            contextObservedTitle;
          const identityKeyForCall = requestIdentityTitle ? identityKey(requestIdentityTitle, identityVolume) : null;
          const verifiedIdentity = identityKeyForCall ? verifiedBeforeRound.get(identityKeyForCall) : undefined;
          if (call.name === "lookup_market_price" && photoPiece) {
            args.cover_title_text ??= photoPiece.cover_title_text;
            args.cover_photo ??= photoPiece.cover_photo ?? photoPiece.photos[0];
            args.volume ??= photoPiece.volume_number;
          }
          if (call.name === "lookup_market_price" && recentContext) {
            const sameVolume =
              args.volume == null ||
              (typeof args.volume === "number" && args.volume === recentContext.volume_number);
            if (sameVolume) {
              args.series ??= recentContext.series;
              args.volume ??= recentContext.volume_number;
              args.format ??= recentContext.format;
              args.year ??= recentContext.release_year;
              args.language ??= recentContext.language;
              args.is_first_print ??= recentContext.is_first_print;
              args.has_obi ??= recentContext.has_obi;
              args.graded ??= Boolean(recentContext.grading_authority);
              args.grade ??= recentContext.grading_value;
            }
          }

          if (call.name === "verify_series_identity") {
            result = {
              output:
                identityVerificationResults.get(call.call_id) ??
                JSON.stringify({ verified: false, error: "Identità non verificata." }),
            };
          } else if (
            call.name === "lookup_market_price" &&
            (imageUrls.length > 0 || usesRecentContext) &&
            (!identityKeyForCall ||
              !verifiedIdentity ||
              normalizeIdentityText(String(args.series ?? "")) !==
                normalizeIdentityText(verifiedIdentity.canonicalSeries) ||
              (verifiedIdentity.volume !== null && args.volume !== verifiedIdentity.volume))
          ) {
            result = {
              output: JSON.stringify({
                error: "Nome canonico non verificato per questo prezzo",
                instruction:
                  "Prima cerca sul web il titolo originale della copertina e il volume, poi chiama verify_series_identity con una fonte dei risultati. Riprova lookup_market_price usando esattamente canonical_series restituito dalla verifica.",
              }),
            };
          } else if (call.name === "prepare_add_manga" && requiresWebResearch && !usedWebSearch) {
            result = {
              output: JSON.stringify({
                error: "Metadati dell'edizione non ancora verificati",
                instruction:
                  "Prima di aggiungere, cerca sul web l'edizione usando il titolo originale trascritto dalla copertina (cover_title_text) e il numero del volume. Verifica che la serie canonica corrisponda davvero al logo, non all'OBI o a un testo promozionale. La ricerca prezzi non sostituisce questa verifica. Se non trovi una corrispondenza affidabile o emergono titoli diversi plausibili, chiedi conferma all'utente; altrimenti richiama prepare_add_manga con i metadati verificati.",
              }),
            };
          } else if (
            call.name === "prepare_add_manga" &&
            imageUrls.length > 0 &&
            (!requestIdentityTitle || !identityKeyForCall)
          ) {
            result = {
              output: JSON.stringify({
                error: "Titolo della copertina non leggibile",
                instruction:
                  "Non aggiungere il pezzo con un nome indovinato. Chiedi all'utente di trascrivere il titolo principale del logo oppure di inviare una foto più nitida della copertina.",
              }),
            };
          } else if (
            call.name === "prepare_add_manga" &&
            imageUrls.length > 0 &&
            (!verifiedIdentity ||
              normalizeIdentityText(String(args.series ?? "")) !==
                normalizeIdentityText(verifiedIdentity.canonicalSeries) ||
              (verifiedIdentity.volume !== null && args.volume_number !== verifiedIdentity.volume))
          ) {
            result = {
              output: JSON.stringify({
                error: "Titolo canonico della copertina non verificato",
                instruction:
                  "Non aggiungere ancora il manga. Cerca il titolo originale del logo insieme al volume, verifica la corrispondenza e chiama verify_series_identity; usa esattamente canonical_series nel salvataggio.",
              }),
            };
          } else if (
            call.name === "prepare_add_manga" &&
            imageUrls.length > 0 &&
            identityKeyForCall &&
            !completedPriceLookups.has(identityKeyForCall)
          ) {
            result = {
              output: JSON.stringify({
                error: "Prezzo non ancora cercato per il titolo verificato",
                instruction:
                  "Prima chiama lookup_market_price con canonical_series verificato, cover_title_text e cover_photo. Poi aggiungi il pezzo anche se il prezzo resta null.",
              }),
            };
          } else if (
            (call.name === "prepare_update_manga" || call.name === "prepare_add_manga") &&
            requiresValuation &&
            !usedPriceLookup
          ) {
            result = {
              output: JSON.stringify({
                error: "Valutazione non ancora eseguita",
                instruction:
                  "Chiama prima lookup_market_price con serie, volume, graded, grade e has_obi. Poi richiama questo tool usando suggested_value_eur come estimated_value.",
              }),
            };
          } else if (
            call.name === "prepare_update_manga" &&
            requiresValuation &&
            args.estimated_value === undefined &&
            priceLookupFoundValue
          ) {
            result = {
              output: JSON.stringify({
                error: "Aggiornamento del valore incompleto",
                instruction:
                  "lookup_market_price ha restituito un valore compatibile: richiama il tool inserendolo in estimated_value con currency EUR.",
              }),
            };
          } else {
            if (call.name === "prepare_add_manga" && photoPiece) {
              if (args.language == null && photoPiece.language) args.language = photoPiece.language;
              if (args.has_obi == null && photoPiece.has_obi != null) args.has_obi = photoPiece.has_obi;
              if (args.is_first_print == null && photoPiece.is_first_print != null) {
                args.is_first_print = photoPiece.is_first_print;
              }
            }
            const callWithContext =
              call.name === "lookup_market_price" || call.name === "prepare_add_manga"
                ? { ...call, arguments: JSON.stringify(args) }
                : call;
            result = await executeTool(callWithContext, items, actionImageUrls, userId);
            executed += result.sideEffects ?? 0;
            if (call.name === "lookup_market_price") {
              usedPriceLookup = true;
              if (identityKeyForCall) {
                try {
                  const parsed = JSON.parse(result.output) as Record<string, unknown>;
                  if (Object.hasOwn(parsed, "suggested_value_eur")) {
                    completedPriceLookups.add(identityKeyForCall);
                  }
                } catch {
                  // Un errore del lookup non autorizza il salvataggio del pezzo.
                }
              }
              if (requiresAdd && !photoPieces && typeof args.series === "string" && args.series.trim()) {
                const volume = typeof args.volume === "number" ? args.volume : null;
                evaluated.set(
                  pieceKey(args.series, volume),
                  `${args.series}${volume != null ? ` vol. ${volume}` : ""}${
                    args.graded === true && typeof args.grade === "number" ? ` (graded ${args.grade})` : ""
                  }`
                );
              }
              try {
                const parsed = JSON.parse(result.output) as { suggested_value_eur?: number | null };
                if (typeof parsed.suggested_value_eur === "number") priceLookupFoundValue = true;
              } catch {
                // Output non interpretabile: si mantiene lo stato corrente.
              }
            }
            if (result.action) pushAction(result.action);
          }
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
      })
    );

    const pendingAfter = requiresAdd ? pendingPieces() : [];
    const uncoveredAfter =
      !photoCheckDone && actions.length > 0 && pendingAfter.length === 0 ? uncoveredPhotos() : [];
    if (uncoveredAfter.length > 0) photoCheckDone = true;
    if (actions.length > 0 && uncoveredAfter.length === 0 && (pendingAfter.length === 0 || reminders >= 2)) {
      const names = actions.map((action) =>
        action.type === "add"
          ? `${action.payload.series}${action.payload.volume_number != null ? ` vol. ${action.payload.volume_number}` : ""}`
          : action.payload.series ?? "l'elemento selezionato"
      );
      return {
        // The response contains unresolved function calls because no second
        // model round is needed for mutations. Start fresh on the next turn.
        responseId: null,
        text: `Operazione pronta per ${names.join(", ")}.`,
        actions,
        executed,
        intent: { valuation: requiresValuation },
        verifiedPhotoTitles: verifiedPhotoTitles(),
      };
    }

    const remind = actions.length > 0 && pendingAfter.length > 0;
    if (remind) reminders += 1;
    response = await createResponse({
      model: process.env.OPENAI_CHAT_MODEL || "gpt-5-mini",
      instructions,
      tools,
      reasoning: { effort: "low" },
      max_output_tokens: imageUrls.length > 1 ? 6000 : 3000,
      max_tool_calls: 6,
      include: ["web_search_call.action.sources"],
      previous_response_id: response.id,
      input: remind
        ? [...outputs, { role: "user", content: pendingReminder(pendingAfter) }]
        : uncoveredAfter.length > 0
          ? [...outputs, { role: "user", content: uncoveredPhotosReminder(uncoveredAfter) }]
          : outputs,
    });
  }

  const unreadableVolume =
    requiresAdd && actions.length === 0
      ? photoPieces?.find((piece) => piece.format === "tankobon" && piece.volume_number === null)
      : undefined;
  return {
    responseId: response.id,
    text: unreadableVolume
      ? `Ho riconosciuto ${unreadableVolume.series}, ma non sono riuscito a confermare il volume dalla foto o dalle fonti. Non ho aggiunto nulla: scrivimi il numero (per esempio 100) e riprovo.`
      : outputText(response) || "Non sono riuscito a completare l'operazione. Non ho aggiunto nulla.",
    actions,
    executed,
    intent: { valuation: requiresValuation },
    verifiedPhotoTitles: verifiedPhotoTitles(),
  };
}
