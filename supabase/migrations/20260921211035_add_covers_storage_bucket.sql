-- Bucket pubblico per le foto di copertina caricate dall'MCP (ChatGPT invia
-- l'immagine come base64, non come URL pubblico: la carichiamo qui e
-- salviamo l'URL pubblico risultante in items.image_url).
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

-- Lettura pubblica (serve per mostrare le copertine nella dashboard senza
-- URL firmati). Le scritture avvengono solo lato server con la service role,
-- che bypassa comunque le policy RLS.
drop policy if exists "Public read access on covers" on storage.objects;
create policy "Public read access on covers"
  on storage.objects for select
  using (bucket_id = 'covers');
