-- Funnel Mapper in the ecosystem, stage 1 (docs/implementation/FUNNEL_MAPPER_PLAN.md): the id of the same client in the ecosystem
-- Clients list (written only when shared clients are switched on; null for every existing row). Additive and nullable: nothing
-- existing changes, and old rows keep working until the owner-approved client migration fills it in (matching report first).
alter table public.clients add column if not exists ecosystem_client_id uuid;
create unique index if not exists clients_ecosystem_client_id on public.clients (ecosystem_client_id) where ecosystem_client_id is not null;
comment on column public.clients.ecosystem_client_id is 'Same client in the ecosystem Clients list (one source of truth for identity). Null until linked.';
