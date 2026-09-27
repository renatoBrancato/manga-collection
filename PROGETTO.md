# Manga Collection — Documento di progetto

> Questo file descrive **cosa stiamo costruendo, perché, e come è fatto**.
> Serve a chiunque riprenda in mano il progetto: te, me (Copilot CLI) in
> una sessione futura, o un altro agente/sviluppatore. Tenerlo aggiornato
> quando si prendono decisioni architetturali importanti.

## 1. Cos'è

Web app per catalogare la propria collezione di manga: **tankobon**
(volumi) e **zashi** (riviste tipo Weekly Shonen Jump), con stima del
valore economico. L'utente può aggiungere i volumi:

1. **Manualmente**, da un form nella dashboard.
2. **Facendo una foto** al volume/rivista e passandola a ChatGPT, che
   estrae i metadati e li invia all'app tramite un **server MCP** esposto
   dall'app stessa (vedi sezione 4).
3. **Dalla chat AI integrata nella dashboard**, allegando facoltativamente
   fino a 6 foto per messaggio (anche incollandole). Le foto vengono
   compresse nel browser, caricate su Supabase Storage e passate a OpenAI
   come URL per l'analisi vision.

Deploy pubblico: **https://manga-collection-seven.vercel.app**
Repo: `https://github.com/renatoBrancato/manga-collection`

## 2. Stack tecnico

| Livello | Scelta |
|---|---|
| Frontend/Backend | Next.js 16 (App Router, Turbopack, TypeScript) |
| Hosting | Vercel |
| Auth | Supabase Auth (Google OAuth) |
| Database | Supabase Postgres, con Row Level Security |
| Integrazione AI | MCP (Model Context Protocol) server custom, in `/api/mcp` |
| Chat interna | OpenAI Responses API con vision e function calling |
| Gestione schema DB | Supabase CLI, migrazioni in `supabase/migrations/` |

## 3. Come funziona l'autenticazione / sicurezza dati

- L'utente fa login con Google (gestito da Supabase Auth).
- Ad ogni utente è associata una **API key personale** (colonna
  `profiles.api_key`, un UUID), visibile/rigenerabile nella pagina
  **Impostazioni** dell'app.
- Questa API key **non è la password di Google**: è una chiave separata
  che serve solo per far scrivere ChatGPT (via MCP) o chiamate REST nella
  collezione di quello specifico utente.
- Le API route che ricevono questa chiave (`/api/mcp`, `/api/collection`)
  usano la **service_role key** di Supabase (che bypassa la RLS) solo
  *dopo* aver verificato a chi appartiene la API key, cosi ogni richiesta
  scrive/legge solo i dati di quell'utente.
- La `service_role key` e le altre chiavi Supabase vivono solo in
  `.env.local` (locale, gitignored) e nelle Environment Variables di
  Vercel — mai nel codice o committate.

## 4. Perché MCP e non un Custom GPT / plugin ChatGPT

Approccio inizialmente previsto: un **Custom GPT** con una Action
(OpenAPI) che ChatGPT chiama dopo aver analizzato la foto.

**Scartato** perché (verificato a Settembre 2026):
- OpenAI ha bloccato la **creazione** di nuovi Custom GPT/Actions per
  account personali (Free/Go/Plus/Pro) dal 16 agosto 2026. Solo i piani
  Business/Enterprise/Edu possono ancora crearne, e comunque l'intero
  sistema Custom GPT verrà **dismesso l'11 dicembre 2026**.
- Una chat ChatGPT "normale" (senza Action/plugin) non può fare chiamate
  HTTP verso un server esterno: è sandboxata, nessun accesso a internet
  anche con Code Interpreter.

**Soluzione adottata: server MCP** (`src/app/api/mcp/route.ts`), esposto
dall'app stessa:

- ChatGPT Plus/Pro (personale) supporta i **connettori MCP custom** via
  *Developer Mode* (Impostazioni → Apps & Connectors), senza restrizioni
  di creazione e senza scadenza annunciata.
- Ogni utente configura il **proprio** connettore MCP con la **propria**
  API key personale (Bearer auth) — nessuna chiave condivisa, nessun
  costo OpenAI a carico del gestore dell'app (paga il singolo utente col
  proprio abbonamento ChatGPT).
- Stesso principio funziona anche per test locali in **VS Code** (Agent
  Mode + MCP tools), vedi `.vscode/mcp.json.example`.

Il server MCP espone due tool:
- `add_manga_item` — inserisce un volume/numero nella collezione.
- `list_manga_items` — elenca la collezione (usato per query tipo "quanti
  volumi di One Piece ho?").

Le istruzioni comportamentali per l'LLM (come riconoscere tankobon vs
zashi, prima stampa dal colophon, slab di grading, ecc.) sono in
`public/mcp/instructions.md`, da incollare nella configurazione del
connettore/system prompt lato ChatGPT.

## 5. Modello dati (tabella `items`)

Campi principali (vedi `src/lib/types.ts` per il tipo TypeScript
completo e `supabase/migrations/` per lo schema SQL):

| Campo | Note |
|---|---|
| `format` | `tankobon` o `zashi` (obbligatorio) |
| `volume_number` | solo per tankobon |
| `issue_number` | solo per zashi (es. numero/anno rivista) |
| `is_first_print` + `printing_notes` | prima stampa (dal colophon 奥付/初版) o ristampa |
| `has_obi` | fascetta OBI presente/assente; `null` se non determinabile (in quel caso la valutazione non filtra per OBI) |
| `is_sealed` | ancora nel cellophane originale; sempre `true`/`false` (default `false`) |
| `grading_authority` | `CGC` / `CBCS` / `BGS` / `altro`, se il volume è gradato (slab) |
| `grading_value` | voto di grading, se presente |
| `condition_estimate` | stima testuale della condizione, se **non** gradato |
| `estimated_value` + `currency` | valore di mercato stimato |
| `source` | `manual` (form) o `mcp` (inserito via ChatGPT) |

**Fonte prezzi primaria**: per `estimated_value` si usa il Manga Price
Tracker di West Blue. La pagina pubblica carica però le vendite via
JavaScript da un indice JSON su CDN: una ricerca web o una navigazione
vedono solo il testo statico e concluderebbero a torto che il prezzo non
esiste. Per questo `src/lib/pricing/westblue.ts` interroga **direttamente il
dataset**, ed è esposto sia a Koma sia all'MCP come tool
`lookup_market_price`.

Il tool applica i filtri compatibili (volume, OBI, RAW/graded), e restituisce:
per i **graded** il prezzo della riga esatta con stesso volume e voto (mai una
media tra graded diversi); per i **RAW** la media delle vendite compatibili.
Il valore è già convertito in EUR. Se non esistono vendite compatibili
`suggested_value_eur` è `null` e il valore resta vuoto, con il motivo nelle
note: non vengono usati fallback silenziosi o filtri più larghi.

Il tool `revalue_manga_collection` rivaluta e salva tutti gli elementi (o
solo quelli senza prezzo) direttamente sul server, in un'unica chiamata; il
prompt MCP `rivaluta_collezione` lo avvia nei client che supportano i
prompt/comandi. La stessa rivalutazione gira ogni giorno via cron (vedi
"Rivalutazione automatica").

### Chat AI nella dashboard

La chat interna usa `OPENAI_API_KEY` e `OPENAI_CHAT_MODEL` esclusivamente
lato server. Il modello dispone di tool di sola lettura
(`search_collection`, `get_collection_summary`) e tool preparatori
(`prepare_add_manga`, `prepare_update_manga`). Questi ultimi non scrivono
nel database: restituiscono una proposta mostrata nella UI, e solo il
pulsante **Conferma** chiama `/api/chat/action`, che riusa `insertItems()`
o `updateItem()`.

Le immagini non transitano come base64 nel JSON della chat: il browser le
riduce e le invia in multipart a `/api/chat/image`; il server le salva nel
bucket `covers` e passa a OpenAI il relativo URL pubblico.

Con più foto, ciascuna è preceduta dall'etichetta "Foto N" e Koma distingue
due casi: **stesso pezzo** da più lati (copertina, retro, colophon, angoli) →
un solo pezzo, con stato, prima stampa, OBI e sealed dedotti da tutte le
foto; **pezzi diversi** → un pezzo per volume. Per ogni pezzo il modello
indica in `cover_photo` quale foto è la copertina; con una sola foto si usa
quella, con più foto solo quella indicata (retro e colophon non diventano
mai cover, e una foto di gruppo non è la copertina di nessun volume).

Il turno non si chiude alla prima proposta se restano pezzi già valutati con
`lookup_market_price` ma non ancora aggiunti: il modello riceve un promemoria
(al massimo due) e aggiunge anche quelli senza vendite compatibili, con
valore vuoto. Con un solo pezzo il comportamento e il costo non cambiano.

La conversazione di Koma, le operazioni e le foto in
contesto vengono conservate nel `localStorage` con una chiave separata per
utente, quindi un refresh non azzera la chat. Il pulsante **Nuova chat**
permette di cancellarla volontariamente. Un comando esplicito come
“aggiungi”, “aggiorna” o “salva” costituisce già autorizzazione: Koma esegue
l'operazione nello stesso turno senza chiedere una seconda conferma.

Koma conserva inoltre un **elemento corrente** strutturato (ID, serie,
volume/numero) dopo ogni aggiunta o aggiornamento. Questo contesto viene
persistito insieme alla chat e passato esplicitamente al modello, quindi
comandi successivi come “rimuovilo”, “modificalo” o “aggiungigli l'OBI”
si riferiscono al pezzo appena trattato senza richiedere nuovamente ID o
serie. Dopo la rimozione il riferimento corrente viene cancellato.

Per controllare i costi OpenAI, la chat non concatena più i
`previous_response_id` tra messaggi: quella modalità faceva rileggere al
modello tutta la catena, incluse le precedenti ricerche web, facendo crescere
progressivamente i token. Ogni turno riceve invece solo gli ultimi 6 messaggi
testuali (massimo 1000 caratteri ciascuno) più l'elemento corrente
strutturato. `web_search` viene esposto solo per richieste che richiedono
inserimento, valutazione o completamento dei metadati; conversazione,
riepiloghi, modifiche semplici e rimozioni non pagano il contesto della
ricerca web.

Prima delle scritture, Koma deve usare la ricerca web per completare i
metadati pubblici dell'edizione (anno, editore, lingua, ISBN) e consultare
West Blue per la valutazione secondo le stesse regole dell'MCP. Il server
accetta il tool di scrittura solo se nello stesso turno è stata realmente
eseguita almeno una ricerca web. Le ricerche sono limitate per contenere
latenza e costi; se West Blue non ha comparabili compatibili il valore resta
vuoto e il motivo viene salvato nelle note, senza inventare un prezzo.

Decisioni prese sul modello dati:
- Rimosso il vecchio campo `status` (posseduto/in lettura/completato/da
  acquistare) — non richiesto/utile per un catalogo di proprietà.
- Sostituito "condizione" generica con la coppia grading/condizione,
  perché i tankobon possono essere certificati da enti di grading mentre
  le riviste (zashi) no (troppo spesse/economiche per essere slabbate).

### Rivalutazione automatica

- `src/lib/pricing/revalue.ts` rivaluta in batch le collezioni applicando le
  stesse regole di `lookupMarketPrice` (mediana per i RAW, riga esatta per i
  graded), ordinando i pezzi per serie così ogni file del tracker viene
  scaricato una sola volta. Nessun LLM coinvolto.
- Vercel Cron (`vercel.json`, 04:00 UTC) chiama `/api/cron/revalue`, protetto
  da `CRON_SECRET`. Aggiorna tutti i pezzi ogni giorno, anche quelli con
  valore inserito a mano.
- Ogni valutazione scrive `items.valued_at` / `valuation_basis` e una riga in
  `price_history` (una per pezzo al giorno, in upsert). Ogni esecuzione è
  registrata in `valuation_runs`.
- Koma (`revalue_collection`) e l'MCP (`revalue_manga_collection`) usano lo
  stesso motore: una sola tool call rivaluta e salva tutta la collezione.

### Storico prezzi

- Un trigger su `items` (`log_item_value`) registra in `price_history` ogni
  variazione di valore, da qualunque fonte: form nel browser, Koma, MCP, cron.
  Una riga per pezzo al giorno (l'ultima scrittura della giornata vince).
- Lo storico **sopravvive all'eliminazione** del pezzo (nessuna FK su
  `item_id`): alla rimozione viene scritta una riga `removed` con valore
  nullo, così il pezzo esce dal totale da quel giorno ma i giorni passati
  restano invariati.
- Se il cron non trova vendite compatibili registra il valore precedente,
  non un buco.
- `collection_value_history(user)` calcola il totale giornaliero usando
  l'ultimo valore noto di ogni pezzo; `item_value_history(item)` restituisce
  lo storico del singolo pezzo. Entrambe sono accessibili solo al
  proprietario o se la collezione è condivisa.
- UI: grafico della collezione sotto i KPI (dashboard e vista pubblica) e
  storico del pezzo cliccando il valore sulla card.

## 6. Gestione schema database (Supabase CLI)

Il progetto è **collegato via Supabase CLI** (`supabase link`) al
progetto Supabase di produzione. Questo permette di applicare modifiche
allo schema direttamente da qui, senza copia-incolla manuale nell'SQL
Editor:

```bash
# creare una nuova migrazione
supabase migration new nome_della_modifica
# scrivere l'SQL nel file generato in supabase/migrations/
# poi applicarla al DB remoto:
supabase db push
```

Nota: il comando `supabase db diff` richiede Docker (per creare un
database "shadow") che non è installato in questo ambiente — non serve
per il flusso normale di lavoro, solo per generare diff automatici.

Il `SUPABASE_ACCESS_TOKEN` (token personale per usare la CLI) vive solo
in `.env.local`, mai committato.

## 7. Struttura del progetto

```
src/app/login              pagina di login (Google)
src/app/dashboard           collezione utente, filtri, valore totale
src/app/settings            API key personale + istruzioni connettore MCP
src/app/api/mcp             server MCP (add_manga_item, list_manga_items)
src/app/api/collection      endpoint REST alternativo (Bearer API key), utile per test manuali
src/app/api/auth/callback   callback OAuth Supabase
src/lib/items.ts            logica condivisa: auth via API key, insert, list
src/lib/types.ts            tipi condivisi (MangaItem, IncomingItemPayload)
src/lib/supabase/           client Supabase (browser, server, admin/service-role)
supabase/migrations/        storico migrazioni SQL (gestito da Supabase CLI)
public/mcp/instructions.md  istruzioni comportamentali per l'LLM lato ChatGPT
.vscode/mcp.json.example    template per testare il server MCP in locale da VS Code
```

## 8. Stato attuale / cose fatte

- [x] App scaffolded, deploy funzionante su Vercel con login Google.
- [x] Modello dati rivisto per collezionisti (grading, prima stampa, formato).
- [x] Server MCP funzionante, testato in locale.
- [x] Collegamento diretto via Supabase CLI per gestire lo schema DB.
- [x] Incidente di sicurezza risolto: una API key era stata committata per
      errore in `.vscode/mcp.json` — rimossa dal tracking git, chiave
      rigenerata dall'utente.

## 9. Prossimi passi / cose aperte

- [ ] Verificare/risolvere la lamentela "mi richiede il login troppo
      spesso" (sessione Supabase che scade prima del previsto) — non
      ancora diagnosticato a fondo.
- [ ] Deploy su Vercel non ancora riverificato dopo l'ultima ondata di
      modifiche (revisione modello dati + MCP) — fare un giro di test in
      produzione dopo il prossimo push.
- [ ] Valutare se serve un flusso di editing/cancellazione manuale dei
      volumi dalla dashboard (al momento probabilmente solo aggiunta).
