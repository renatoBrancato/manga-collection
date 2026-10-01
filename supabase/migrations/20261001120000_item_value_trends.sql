-- Andamento dei singoli pezzi per la vista "borsa" della collezione.
--
-- Una riga per pezzo con i soli punti in cui il valore è cambiato
-- ([giorno, valore]): il client ricava la variazione su qualunque periodo
-- (1g, 7g, 30g, 1a, da sempre) e la mini-sparkline senza scaricare tutto lo
-- storico giornaliero. Un array per pezzo evita anche il limite di righe di
-- PostgREST.
create or replace function public.item_value_trends(p_user uuid)
returns table (item_id uuid, points jsonb)
language sql
stable
security definer
set search_path = public
as $$
  with history as (
    select h.item_id, h.captured_on, h.value,
           lag(h.value) over (partition by h.item_id order by h.captured_on) as previous
    from public.price_history h
    where h.user_id = p_user and h.value is not null
  )
  select history.item_id,
         jsonb_agg(jsonb_build_array(history.captured_on, history.value) order by history.captured_on)
  from history
  where public.can_view_collection(p_user)
    and (history.previous is null or history.previous <> history.value)
  group by history.item_id;
$$;

grant execute on function public.item_value_trends(uuid) to anon, authenticated;
