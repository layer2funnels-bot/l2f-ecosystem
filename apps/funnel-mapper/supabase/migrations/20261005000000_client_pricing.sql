-- Client pricing model (separate from the relationship status).
--
-- Existing clients keep working unchanged: they become "retainer" clients and `monthly_retainer` stays the
-- retainer amount it always was. The other models use `pricing_amount` plus the fields that apply to them:
--   retainer    monthly_retainer (per month)
--   fixed       pricing_amount (project fee), project_start / project_end
--   one_time    pricing_amount, project_start (date of the engagement)
--   hourly      pricing_amount (rate per hour), hours_per_month (estimate)
--   commission  commission_pct (% of revenue), pricing_amount (optional base fee per month)
--   other       pricing_amount, billing_frequency
-- Additive only (no columns removed), so it is safe to apply to a live database.

alter table public.clients
  add column if not exists pricing_model text not null default 'retainer',
  add column if not exists pricing_amount numeric(12, 2) not null default 0,
  add column if not exists billing_frequency text not null default 'monthly',
  add column if not exists hours_per_month numeric(8, 2) not null default 0,
  add column if not exists commission_pct numeric(5, 2) not null default 0,
  add column if not exists project_start date,
  add column if not exists project_end date,
  add column if not exists pricing_notes text not null default '';

alter table public.clients
  add constraint clients_pricing_model_check check (pricing_model in ('retainer', 'fixed', 'one_time', 'hourly', 'commission', 'other')),
  add constraint clients_billing_frequency_check check (billing_frequency in ('one_time', 'weekly', 'monthly', 'quarterly', 'yearly')),
  add constraint clients_pricing_amounts_check check (pricing_amount >= 0 and monthly_retainer >= 0 and hours_per_month >= 0),
  add constraint clients_commission_pct_check check (commission_pct between 0 and 100),
  add constraint clients_project_dates_check check (project_end is null or project_start is null or project_end >= project_start);
