-- Pezzo messo in vendita dal collezionista ("on sale"). Come sealed non ha
-- uno stato indeterminato: i pezzi esistenti partono da false.
alter table public.items
  add column if not exists is_for_sale boolean not null default false;
