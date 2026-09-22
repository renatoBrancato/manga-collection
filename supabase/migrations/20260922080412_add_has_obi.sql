-- OBI: la fascetta di carta che avvolge tankobon/zashi giapponesi, un
-- dettaglio molto rilevante per collezionisti e valore di mercato.
alter table public.items
  add column if not exists has_obi boolean;

comment on column public.items.has_obi is 'true se il volume/rivista ha ancora la fascetta OBI originale, false se manca, null se non specificato.';
