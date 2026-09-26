-- Rivalutazione automatica giornaliera.
--
-- Aggiunge i metadati di valutazione sugli item e lo storico dei prezzi, che
-- prima non esisteva: il valore veniva sovrascritto a ogni rivalutazione,
-- rendendo impossibile mostrare l'andamento nel tempo.

alter table public.items
  add column if not exists valued_at timestamptz,
  add column if not exists valuation_basis text,
  add column if not exists valuation_source text;

-- Una riga per ogni valutazione registrata (anche quelle senza prezzo
-- trovato, così si distingue "mai valutato" da "valutato ma senza vendite
-- compatibili").
create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  value numeric,
  currency text not null default 'EUR',
  basis text,
  match_count integer,
  source text not null default 'westblue',
  captured_at timestamptz not null default now(),
  captured_on date not null default current_date
);

create index if not exists price_history_item_idx
  on public.price_history (item_id, captured_at desc);
create index if not exists price_history_user_idx
  on public.price_history (user_id, captured_at desc);

-- Evita righe duplicate se il cron viene rieseguito più volte nello stesso
-- giorno per lo stesso pezzo (l'upsert lato applicazione punta qui).
create unique index if not exists price_history_item_day_idx
  on public.price_history (item_id, captured_on, source);

-- Diario delle esecuzioni del cron, utile per capire se e quando la
-- rivalutazione automatica ha girato davvero.
create table if not exists public.valuation_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null default 'cron',
  tracker_updated_at text,
  usd_eur_rate numeric,
  users_processed integer not null default 0,
  items_processed integer not null default 0,
  items_updated integer not null default 0,
  items_unpriced integer not null default 0,
  duration_ms integer,
  error text,
  started_at timestamptz not null default now()
);

create index if not exists valuation_runs_started_idx
  on public.valuation_runs (started_at desc);

-- Row Level Security -------------------------------------------------------
-- Lo storico è leggibile solo dal proprietario; la scrittura avviene sempre
-- lato server con la service role key (che bypassa RLS).

alter table public.price_history enable row level security;
alter table public.valuation_runs enable row level security;

drop policy if exists "price history is self-readable" on public.price_history;
create policy "price history is self-readable"
  on public.price_history for select
  using (auth.uid() = user_id);
