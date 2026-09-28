-- Rimozione di un pezzo con scelta sullo storico.
--
-- Di norma lo storico sopravvive all'eliminazione (un volume venduto resta
-- nel valore dei giorni passati). Se il pezzo era stato aggiunto per errore
-- l'utente può chiedere di cancellarne ogni traccia: vengono eliminate anche
-- le sue righe di price_history, compresa la riga "rimosso" scritta dal
-- trigger, come se non fosse mai stato inserito.
--
-- price_history è scrivibile solo lato server, quindi dal browser la
-- cancellazione passa da questa funzione, che verifica il proprietario.

create or replace function public.delete_item(p_item_id uuid, p_forget_history boolean default false)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  select user_id into owner from public.items where id = p_item_id;
  if owner is null or owner is distinct from auth.uid() then
    return false;
  end if;

  delete from public.items where id = p_item_id;

  if p_forget_history then
    delete from public.price_history where item_id = p_item_id and user_id = owner;
  end if;

  return true;
end;
$$;

revoke all on function public.delete_item(uuid, boolean) from public, anon;
grant execute on function public.delete_item(uuid, boolean) to authenticated;
