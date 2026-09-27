-- Pezzo ancora sigillato nel cellophane originale (sealed). A differenza di
-- OBI e prima stampa non ha uno stato "non determinabile": un volume o è
-- sigillato o non lo è, quindi la colonna è NOT NULL e i pezzi esistenti
-- vengono portati a false.
alter table public.items
  add column if not exists is_sealed boolean not null default false;
