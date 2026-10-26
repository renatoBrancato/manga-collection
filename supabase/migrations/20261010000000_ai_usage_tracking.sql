-- Tracciamento costi AI per utente, tetto gratuito settimanale e crediti.
--
-- Il costo di ogni turno di chat (inclusa l'eventuale lettura foto dedicata e
-- i giri successivi di tool-calling) viene aggregato lato server in un'unica
-- stima in USD e registrato qui. Il tetto gratuito è una finestra mobile di 7
-- giorni (non una settimana solare): ogni richiesta guarda la spesa "free"
-- delle ultime 168 ore.

alter table public.profiles
  add column if not exists credit_balance_usd numeric(10, 4) not null default 0,
  add column if not exists is_admin boolean not null default false;

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  feature text not null default 'chat',
  model text not null,
  input_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric(10, 6) not null default 0,
  -- 'free' = coperto dal tetto gratuito della finestra mobile di 7 giorni,
  -- 'credits' = scalato dal saldo crediti acquistato (profiles.credit_balance_usd).
  funded_by text not null check (funded_by in ('free', 'credits'))
);

create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at desc);

-- Row Level Security --------------------------------------------------------
-- Ogni utente legge solo i propri eventi; la scrittura avviene sempre lato
-- server con la service role key (che bypassa RLS), subito dopo ogni turno
-- di chat. La vista admin usa anch'essa la service role key, dopo aver
-- verificato lato server che l'utente corrente abbia profiles.is_admin = true.

alter table public.ai_usage_events enable row level security;

drop policy if exists "ai usage is self-readable" on public.ai_usage_events;
create policy "ai usage is self-readable"
  on public.ai_usage_events for select
  using (auth.uid() = user_id);

-- Decremento atomico del saldo crediti dopo un turno a pagamento (una volta
-- esaurito il tetto gratuito della finestra mobile). Non scende sotto zero.
create or replace function public.decrement_credit_balance(p_user_id uuid, p_amount numeric)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set credit_balance_usd = greatest(credit_balance_usd - p_amount, 0)
  where id = p_user_id;
$$;
