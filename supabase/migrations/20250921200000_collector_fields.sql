-- Run this in the Supabase SQL editor AFTER schema.sql has already been
-- applied once. Revises the collection fields:
--   - removes the generic "status" (owned/reading/completed/wanted) and the
--     old free-text "condition" fields
--   - adds format (tankobon vs zashi/magazine), first-print/printing info
--     (from the colophon), and grading fields (authority + value, or a
--     plain condition estimate when the item isn't professionally graded)

alter table public.items
  drop column if exists status,
  drop column if exists condition;

alter table public.items
  add column if not exists format text not null default 'tankobon',
  add column if not exists issue_number text,
  add column if not exists release_date date,
  add column if not exists is_first_print boolean,
  add column if not exists printing_notes text,
  add column if not exists grading_authority text,
  add column if not exists grading_value numeric,
  add column if not exists condition_estimate text;

alter table public.items
  drop constraint if exists items_format_check;
alter table public.items
  add constraint items_format_check check (format in ('tankobon', 'zashi'));

alter table public.items
  drop constraint if exists items_grading_authority_check;
alter table public.items
  add constraint items_grading_authority_check
    check (grading_authority is null or grading_authority in ('CGC', 'CBCS', 'BGS', 'altro'));
