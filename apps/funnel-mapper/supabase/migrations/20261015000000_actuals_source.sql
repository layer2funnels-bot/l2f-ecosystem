-- Actuals provenance (V2 F4): typed and CSV-imported actuals are first-class and indistinguishable except for their
-- source. `source` says how a value arrived ('manual' typed in the app, 'csv' imported), `source_ref` keeps the file
-- name and import date for CSV rows, and `updated_at` says when it last changed. Duplicates still update the same row
-- (unique funnel / period / step), so importing a corrected file never adds a second value. Additive: existing rows
-- read as typed ('manual').
alter table public.funnel_actuals add column if not exists source text not null default 'manual';
alter table public.funnel_actuals add column if not exists source_ref text;
alter table public.funnel_actuals add column if not exists updated_at timestamptz not null default now();
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'funnel_actuals_source_check') then
    alter table public.funnel_actuals add constraint funnel_actuals_source_check check (source in ('manual', 'csv'));
  end if;
end $$;
-- keep updated_at current on every change (the shared trigger function from the initial schema)
create or replace trigger funnel_actuals_updated_at before update on public.funnel_actuals for each row execute function public.set_updated_at();
