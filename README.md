# Manga Collection

Web app (Next.js + Supabase, deploy su Vercel) per catalogare la tua
collezione di tankobon e riviste Shonen Jump. I volumi si aggiungono
scansionandoli con un **Custom GPT** (foto -> metadati + stima valore
tramite ricerca web), oppure manualmente dalla dashboard.

## Architettura

```
Foto volume -> Custom GPT (Vision + ricerca web)
            -> Action (OpenAPI) -> POST /api/collection (Bearer <api_key>)
            -> Supabase (Postgres, RLS)
            -> Dashboard React (Next.js su Vercel)
```

- **Auth utenti**: Google login via Supabase Auth.
- **Autenticazione del GPT**: ogni utente ha una `api_key` privata
  (pagina *Impostazioni*), usata come Bearer token dall'Action. L'endpoint
  `/api/collection` la valida con la service-role key (bypassando RLS) e
  scrive solo per quello `user_id`.
- **DB**: Supabase Postgres, schema in `supabase/schema.sql`, con Row Level
  Security per far sì che ogni utente veda solo i propri volumi.

## Setup

### 1. Supabase

1. Crea un progetto su [supabase.com](https://supabase.com).
2. In **SQL Editor**, esegui il contenuto di `supabase/schema.sql`.
3. In **Authentication -> Providers**, abilita **Google** (serve un OAuth
   Client ID/Secret da [Google Cloud Console](https://console.cloud.google.com/apis/credentials);
   redirect URI da inserire in Google: quella mostrata da Supabase).
4. In **Authentication -> URL Configuration**, aggiungi come *Redirect URL*:
   - `http://localhost:3000/api/auth/callback` (sviluppo)
   - `https://TUO-DOMINIO.vercel.app/api/auth/callback` (produzione)
5. Copia da **Project Settings -> API**: `Project URL`, `anon public key`,
   `service_role key`.

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

### 5. Configura il Custom GPT

1. Su chatgpt.com -> *Explore GPTs* -> *Create*.
2. Incolla le istruzioni da `public/gpt/instructions.md` nel campo
   "Instructions" del GPT.
3. In **Actions -> Create new action**, importa lo schema
   `public/gpt/openapi.yaml` (dopo aver sostituito l'URL del server con il
   tuo dominio Vercel, sia nel file che ri-caricandolo, sia incollando lo
   YAML direttamente).
4. Imposta l'autenticazione dell'Action su **API Key -> Bearer**, e incolla
   come valore l'API key personale (visibile nella pagina *Impostazioni*
   della web app, dopo il login).
5. Testa: invia una foto della copertina/dorso di un volume nella chat del
   GPT. Il GPT estrae titolo, volume, editore, stato di conservazione,
   cerca il valore di mercato sul web e - dopo tua conferma - lo salva
   nella tua collezione tramite l'Action.

## Struttura del progetto

- `src/app/login` - login Google
- `src/app/dashboard` - collezione dell'utente, filtri, valore totale
- `src/app/settings` - API key personale + istruzioni GPT
- `src/app/api/collection` - endpoint chiamato dall'Action del GPT
- `src/app/api/auth/callback` - callback OAuth Supabase
- `supabase/schema.sql` - schema DB + RLS
- `public/gpt/` - istruzioni e schema OpenAPI per il Custom GPT
