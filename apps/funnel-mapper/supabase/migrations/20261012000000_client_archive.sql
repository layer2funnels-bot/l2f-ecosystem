-- Archive clients: an archived client (and its funnels) drops out of the active portfolio, the dashboard and the
-- agency MRR, but nothing is deleted and it can be restored. Separate from the relationship status ("past"
-- describes the relationship; archiving tidies the portfolio). Additive.
alter table public.clients add column if not exists archived_at timestamptz;
create index if not exists clients_archived_idx on public.clients (workspace_id, archived_at);
