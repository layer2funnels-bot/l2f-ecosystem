-- 0022 · The shared rate-limit counters are called by the API server on its OWN database login (Supabase: postgres, through the pooler), not as a
-- request role. Found in the go-live rehearsal: where migrations are applied by another admin role (the local stack's supabase_admin) that login
-- had no right to run the function, the limiter silently fell back to per-instance counting. Grant it explicitly; harmless where it already holds.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'postgres') then
    grant usage on schema private to postgres;
    grant execute on function private.rate_limit_take(text, text, int, int) to postgres;
  end if;
end $$;
