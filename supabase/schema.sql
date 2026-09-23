-- Run this in the Supabase SQL editor (or via `supabase db push`).

-- One profile row per authenticated user, holding the secret API key that
-- the ChatGPT Custom GPT Action uses to identify the user when posting
-- scanned manga/tankōbon data.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  api_key uuid not null default gen_random_uuid(),
  share_enabled boolean not null default false, -- collezione visibile in sola lettura su /c/<share_slug>
  share_slug text unique,                        -- slug casuale per il link pubblico (non è lo user id)
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_api_key_idx on public.profiles (api_key);

-- The manga/collection items themselves.
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,          -- (legacy, sempre allineato a series) usare series come campo principale
  series text,
  format text not null default 'tankobon' check (format in ('tankobon', 'zashi')), -- tankobon (volume) | zashi (rivista, es. Weekly Shonen Jump)
  volume_number numeric,       -- numero volume (tankobon)
  issue_number text,           -- numero/uscita (zashi)
  release_date date,           -- (deprecato, non più usato in UI) data di pubblicazione precisa
  release_year smallint,       -- anno di pubblicazione/uscita: dato chiave per gli zashi (numero + anno)
  publisher text,
  isbn text,
  is_first_print boolean,      -- vero se prima stampa/初版 (rilevata dal colophon)
  has_obi boolean,             -- vero se presente la fascetta OBI originale
  printing_notes text,         -- es. "3a ristampa", note libere sulla stampa/edizione
  grading_authority text check (grading_authority is null or grading_authority in ('CGC', 'CBCS', 'BGS', 'altro')),
  grading_value numeric,       -- es. 9.8, se gradato da un ente
  condition_estimate text,     -- stima stato (usata solo se NON gradato)
  language text,
  estimated_value numeric,
  currency text default 'EUR',
  image_url text,
  notes text,
  source text default 'manual', -- 'manual' | 'mcp' | 'chat'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists items_user_id_idx on public.items (user_id);

-- Keep updated_at fresh.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
  before update on public.items
  for each row execute procedure public.set_updated_at();

-- Auto-create a profile row whenever a new auth user signs up (e.g. via
-- Google OAuth), so the API key exists immediately.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Row Level Security -------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.items enable row level security;

drop policy if exists "profiles are self-readable" on public.profiles;
create policy "profiles are self-readable"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles are self-updatable" on public.profiles;
create policy "profiles are self-updatable"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "items are self-readable" on public.items;
create policy "items are self-readable"
  on public.items for select
  using (auth.uid() = user_id);

drop policy if exists "items are self-insertable" on public.items;
create policy "items are self-insertable"
  on public.items for insert
  with check (auth.uid() = user_id);

drop policy if exists "items are self-updatable" on public.items;
create policy "items are self-updatable"
  on public.items for update
  using (auth.uid() = user_id);

drop policy if exists "items are self-deletable" on public.items;
create policy "items are self-deletable"
  on public.items for delete
  using (auth.uid() = user_id);

-- Note: the /api/collection and /api/mcp routes authenticate with the
-- SERVICE ROLE key (bypassing RLS) after manually validating the caller's
-- api_key against public.profiles, then insert rows on behalf of that
-- user_id. RLS above protects direct client (anon/browser) access.
