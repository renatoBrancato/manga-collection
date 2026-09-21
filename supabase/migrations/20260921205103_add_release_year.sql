-- Aggiunge l'anno di pubblicazione come campo dedicato (intero), più utile
-- della data precisa: gli zashi (riviste) si identificano tipicamente con
-- numero + anno, non con una data completa.
alter table public.items
  add column if not exists release_year smallint;

comment on column public.items.release_year is 'Anno di pubblicazione/uscita (es. 2024). Per gli zashi è il dato chiave insieme al numero.';
