set check_function_bodies = off;
-- 0010 · The only way in is our API (owner requirement, 21 Oct 2026).
-- Supabase exposes every table and function in `public` to its Data API (PostgREST, GraphQL) for the `anon` and `authenticated`
-- roles. With row policies a signed-in person could already read only their own rows, but they could still call the Data API
-- directly with their own token: skipping rate limits, safe logging, input checks, typed operations and the x-org-id request scope
-- (a person in two organizations would see both at once). So those roles get NO privileges on our objects at all.
-- Our API server runs each request as the NOLOGIN role `app_user` (set local role, claims and x-org-id set per transaction), which
-- is the role every migration already grants privileges to. `service_role` (server-only key) is untouched.
-- The `private` schema stays unexposed (supabase/config.toml lists only public and graphql_public, and nothing here is granted).
do $$
declare r text; c text; s text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    continue when not exists (select 1 from pg_roles where rolname = r);
    execute format('revoke all on all tables in schema public from %I', r);
    execute format('revoke all on all sequences in schema public from %I', r);
    execute format('revoke all on all functions in schema public from %I', r);
    execute format('revoke all on all tables in schema private from %I', r);
    execute format('revoke all on all functions in schema private from %I', r);
    execute format('revoke all on schema private from %I', r);
    -- objects created from now on must not be auto-exposed either (Supabase's default privileges grant them to these roles)
    foreach s in array array['tables', 'sequences', 'functions'] loop
      execute format('alter default privileges in schema public revoke all on %s from %I', s, r);
      foreach c in array array['postgres', 'supabase_admin'] loop
        continue when not exists (select 1 from pg_roles where rolname = c);
        begin
          execute format('alter default privileges for role %I in schema public revoke all on %s from %I', c, s, r);
          execute format('alter default privileges for role %I in schema private revoke all on %s from %I', c, s, r);
        exception when others then null;   -- not permitted to change another role's defaults: the schema-level revoke above still applies
        end;
      end loop;
    end loop;
  end loop;
  -- NOTE: PostgreSQL lets PUBLIC execute every new function unless the migration revokes it. That global default is deliberately left alone
  -- (changing it for Supabase's admin roles could break extension installs); instead every function in a migration revokes it, and
  -- test/audit.test.mjs F4b fails the build if any public or private function is executable by PUBLIC.
  -- the API's database login (Supabase: postgres, through the pooler) must be able to switch to app_user
  if exists (select 1 from pg_roles where rolname = 'postgres') then
    -- PostgreSQL 16+: the creator of a role only gets an admin-only link (no SET, no INHERIT); say what we need explicitly.
    begin execute 'grant app_user to postgres with set true, inherit true';
    exception when others then begin execute 'grant app_user to postgres'; exception when others then null; end; end;
  end if;
end $$;
