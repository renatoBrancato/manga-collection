# Manga Collection

Web app (Next.js + Supabase, deploy su Vercel) per catalogare la tua
collezione di tankobon e zashi (riviste, es. Shonen Jump). I volumi si
aggiungono facendo una foto e passandola a ChatGPT tramite un server
MCP esposto dall'app, oppure manualmente dalla dashboard.

Per una spiegazione completa di architettura, decisioni prese e stato
del progetto, vedi PROGETTO.md.

## Architettura

```
Foto volume -> ChatGPT (connettore MCP personale, Developer Mode)
            -> /api/mcp (Bearer = API key personale utente)
            -> Supabase (Postgres, RLS)
            -> Dashboard React (Next.js su Vercel)
```

- Auth utenti: Google login via Supabase Auth.
- Autenticazione MCP: ogni utente ha una api_key privata (pagina
  Impostazioni), usata come Bearer token nel proprio connettore MCP.
  L'endpoint /api/mcp la valida con la service-role key (bypassando
  RLS) e legge/scrive solo per quel user_id.
- DB: Supabase Postgres, schema gestito tramite Supabase CLI in
  supabase/migrations/, con Row Level Security per far si che ogni
  utente veda solo i propri volumi.

## Setup

### 1. Supabase

1. Crea un progetto su supabase.com.
2. Collega il progetto locale con la Supabase CLI:
   `supabase link --project-ref <tuo-project-ref>`
3. Applica le migrazioni esistenti: `supabase db push`
4. In Authentication -> Providers, abilita Google (serve un OAuth
   Client ID/Secret da Google Cloud Console; redirect URI da inserire
   in Google: quella mostrata da Supabase).
5. In Authentication -> URL Configuration, aggiungi come Redirect URL:
   - `http://localhost:3000/api/auth/callback` (sviluppo)
   - `https://TUO-DOMINIO.vercel.app/api/auth/callback` (produzione)
6. Copia da Project Settings -> API: Project URL, anon public key,
   service_role key.

### 2. Variabili d'ambiente

Copia `.env.example` in `.env.local` e compila i valori Supabase.

```bash
cp .env.example .env.local
```

### 3. Avvio locale

```bash
npm install
npm run dev
```

Apri http://localhost:3000 - verrai reindirizzato al login Google.

### 4. Deploy su Vercel

1. Collega il repo a Vercel.
2. Aggiungi le stesse variabili d'ambiente (incluso
   `NEXT_PUBLIC_SITE_URL=https://TUO-DOMINIO.vercel.app`).
3. Deploy.

### 5. Configura il connettore MCP in ChatGPT

1. Nella web app, vai su Impostazioni e copia la tua API key personale.
2. In ChatGPT: Impostazioni -> Apps & Connectors -> attiva Developer
   Mode -> aggiungi un connettore MCP custom.
3. URL del connettore: `https://TUO-DOMINIO.vercel.app/api/mcp`
4. Autenticazione: Bearer token, incolla la tua API key personale.
5. (Opzionale ma consigliato) Incolla il contenuto di
   `public/mcp/instructions.md` come istruzioni/system prompt del
   connettore, cosi ChatGPT sa come riconoscere tankobon/zashi, prima
   stampa, grading, ecc.
6. Testa: manda una foto del volume in chat e chiedi di aggiungerlo
   alla collezione.

Per testare in locale da VS Code (Agent Mode), vedi
`.vscode/mcp.json.example`.

## Struttura del progetto

- `src/app/login` - login Google
- `src/app/dashboard` - collezione dell'utente, filtri, valore totale
- `src/app/settings` - API key personale + istruzioni connettore MCP
- `src/app/api/mcp` - server MCP (add_manga_item, list_manga_items)
- `src/app/api/collection` - endpoint REST alternativo, utile per test manuali
- `src/app/api/auth/callback` - callback OAuth Supabase
- `supabase/migrations/` - storico migrazioni SQL (gestito da Supabase CLI)
- `public/mcp/` - istruzioni comportamentali per l'LLM lato ChatGPT
