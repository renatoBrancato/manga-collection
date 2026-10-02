-- Currency codes are passed to Intl.NumberFormat in the dashboard.
-- A malformed value such as "EUR 30" throws during render and can leave
-- the user's dashboard blank. Normalize old values and reject new ones.
update public.items
set currency = 'EUR'
where currency is not null
  and currency !~ '^[A-Z]{3}$';

alter table public.items
  add constraint items_currency_code_check
  check (currency is null or currency ~ '^[A-Z]{3}$');
