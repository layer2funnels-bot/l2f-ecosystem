set check_function_bodies = off;
-- 0009 · Shared rate-limit store (PREPARED, off by default; see docs/RATE_LIMIT_DESIGN.md).
-- Cloudflare Pages Functions run as many short-lived instances that share no memory, so the per-instance limiter in
-- packages/core/rate-limit.mjs cannot enforce a global limit. This keeps one fixed-window counter per (person, class) in Postgres.
-- Private schema: not reachable through the Data API. Keys are hashes, never user ids. Called by the server's own database
-- connection, not by browser roles.
create unlogged table private.api_rate_limits (        -- unlogged: counters need not survive a crash and cost no WAL
  key text not null check (length(key) <= 80),
  cls text not null check (cls in ('read', 'write', 'sensitive')),
  window_start timestamptz not null,
  hits int not null,
  primary key (key, cls)
);

create or replace function private.rate_limit_take(p_key text, p_class text, p_max int, p_window_seconds int)
returns table (allowed boolean, retry_after_seconds int)
language plpgsql security definer set search_path = '' as $$
declare r record; win interval := make_interval(secs => p_window_seconds);
begin
  if p_max < 1 or p_window_seconds < 1 then raise exception 'invalid limit' using errcode = '22023'; end if;
  insert into private.api_rate_limits as t (key, cls, window_start, hits) values (p_key, p_class, now(), 1)
  on conflict (key, cls) do update set
    window_start = case when t.window_start + win <= now() then now() else t.window_start end,
    hits = case when t.window_start + win <= now() then 1 else least(t.hits + 1, p_max + 1) end   -- capped: a flood cannot grow the number
  returning t.hits, t.window_start into r;
  if random() < 0.01 then delete from private.api_rate_limits where window_start < now() - interval '1 hour'; end if;   -- opportunistic tidy-up, no scheduler needed
  allowed := r.hits <= p_max;
  retry_after_seconds := greatest(1, ceil(extract(epoch from (r.window_start + win - now())))::int);
  return next;
end $$;
revoke all on all functions in schema private from public;
revoke all on private.api_rate_limits from public;
