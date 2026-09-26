-- Storico prezzi affidabile.
--
-- 1. Lo storico sopravvive all'eliminazione del pezzo: prima il vincolo
--    ON DELETE CASCADE cancellava le righe, e il valore della collezione nei
--    giorni passati cambiava a posteriori quando si vendeva un volume.
-- 2. Ogni variazione di valore viene registrata da un trigger, qualunque sia
--    la fonte (form nel browser, Koma, MCP, cron): un log applicativo non
--    avrebbe coperto l'inserimento che il form fa direttamente su Supabase.
-- 3. Funzioni di lettura per i grafici, con lo stesso controllo di accesso
--    della collezione (proprietario oppure collezione condivisa).

alter table public.price_history
  drop constraint if exists price_history_item_id_fkey;

-- Una sola riga per pezzo al giorno, qualunque sia la fonte: l'ultima
-- scrittura della giornata vince. Con la vecchia chiave (che includeva la
-- fonte) cron e modifica manuale avrebbero prodotto due righe e il totale
-- del giorno sarebbe stato contato due volte.
drop index if exists public.price_history_item_day_idx;
create unique index if not exists price_history_item_day_uidx
  on public.price_history (item_id, captured_on);

create index if not exists price_history_user_item_idx
  on public.price_history (user_id, item_id, captured_on desc);

create or replace function public.log_item_value()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  revalued boolean;
begin
  if tg_op = 'DELETE' then
    -- Riga "rimosso" con valore nullo: dal giorno dell'eliminazione il pezzo
    -- esce dal totale, ma i giorni precedenti restano invariati. Durante la
    -- cancellazione a cascata di un profilo il profilo non esiste più e non
    -- ha senso scrivere nulla.
    if exists (select 1 from public.profiles where id = old.user_id) then
      insert into public.price_history (item_id, user_id, value, currency, basis, source)
      values (old.id, old.user_id, null, coalesce(old.currency, 'EUR'), 'removed', 'delete')
      on conflict (item_id, captured_on) do update
        set value = null, basis = 'removed', source = 'delete',
            match_count = null, captured_at = now();
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.estimated_value is null then
      return new;
    end if;
    revalued := new.valued_at is not null;
  else
    revalued := new.valued_at is distinct from old.valued_at;
    if new.estimated_value is not distinct from old.estimated_value and not revalued then
      return new;
    end if;
  end if;

  insert into public.price_history (item_id, user_id, value, currency, basis, source)
  values (
    new.id,
    new.user_id,
    new.estimated_value,
    coalesce(new.currency, 'EUR'),
    case when revalued then new.valuation_basis else 'manual' end,
    case when revalued then coalesce(new.valuation_source, 'westblue') else coalesce(new.source, 'manual') end
  )
  on conflict (item_id, captured_on) do update
    set value = excluded.value,
        currency = excluded.currency,
        basis = excluded.basis,
        source = excluded.source,
        -- Il cron scrive prima lo storico (con il numero di vendite) e poi
        -- aggiorna il pezzo: il dato va conservato se la fonte coincide.
        match_count = case
          when excluded.source = price_history.source then price_history.match_count
          else null
        end,
        captured_at = now();

  return new;
end;
$$;

drop trigger if exists items_log_value on public.items;
create trigger items_log_value
  after insert or update or delete on public.items
  for each row execute procedure public.log_item_value();

-- Accesso in lettura: proprietario, oppure collezione condivisa pubblicamente.
create or replace function public.can_view_collection(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user = auth.uid()
      or exists (select 1 from public.profiles where id = p_user and share_enabled);
$$;

-- Valore della collezione giorno per giorno. Per ogni giorno usa l'ultimo
-- valore noto di ciascun pezzo (carry-forward): un giorno in cui il cron non
-- ha girato o un pezzo senza vendite compatibili non fa crollare il totale.
create or replace function public.collection_value_history(p_user uuid, p_days integer default 730)
returns table (day date, total numeric, priced_items integer)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select greatest(min(h.captured_on), current_date - p_days) as start_day
    from public.price_history h
    where h.user_id = p_user
  ),
  days as (
    select generate_series(b.start_day, current_date, interval '1 day')::date as day
    from bounds b
    where b.start_day is not null
  )
  select d.day,
         coalesce(sum(last_value.value), 0) as total,
         count(last_value.value)::integer as priced_items
  from days d
  left join lateral (
    select distinct on (h.item_id) h.value
    from public.price_history h
    where h.user_id = p_user and h.captured_on <= d.day
    order by h.item_id, h.captured_on desc
  ) last_value on true
  where public.can_view_collection(p_user)
  group by d.day
  order by d.day;
$$;

create or replace function public.item_value_history(p_item uuid)
returns table (day date, value numeric, basis text, source text, match_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select h.captured_on, h.value, h.basis, h.source, h.match_count
  from public.price_history h
  where h.item_id = p_item
    and public.can_view_collection(h.user_id)
  order by h.captured_on;
$$;

grant execute on function public.collection_value_history(uuid, integer) to anon, authenticated;
grant execute on function public.item_value_history(uuid) to anon, authenticated;
