-- Consente di condividere la propria collezione con un link pubblico in
-- sola lettura (es. https://.../c/<share_slug>). La lettura per chi non è
-- il proprietario avviene lato server con la service role (bypassando RLS,
-- come già fanno /api/mcp e /api/collection), quindi non servono nuove
-- policy per l'accesso anonimo: solo il proprietario può leggere/scrivere
-- il proprio profilo/i propri item tramite RLS, il link condiviso passa
-- dal server.
alter table public.profiles
  add column if not exists share_enabled boolean not null default false,
  add column if not exists share_slug text unique;

comment on column public.profiles.share_enabled is 'Se true, la collezione è visibile in sola lettura al link /c/<share_slug>.';
comment on column public.profiles.share_slug is 'Slug casuale usato nel link pubblico di condivisione (non è lo user id, per non esporlo).';
