-- Independent sign-ups: the pending row is now removed by the server (lib/independent.ts, service role) right
-- after the invite, instead of inside handle_new_user(). The trigger only reads it.
--
-- Why: the Supabase connector used for the demo/production databases can't run SQL containing destructive
-- statements, so the previous function body couldn't be deployed through it. Behaviour is unchanged for every
-- account; a pending row left behind (e.g. the server failing between invite and clean-up) can only make a
-- future account with that same email private, never give it team access. Replaced in place (additive).

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  team uuid := public.team_workspace_id();
  first_account boolean := not exists (select 1 from public.profiles where role = 'admin' and workspace_id = team);
  pending public.workspace_signups;
  ws uuid;
  nm text := coalesce(new.raw_user_meta_data ->> 'full_name', '');
begin
  select * into pending from public.workspace_signups where email = lower(coalesce(new.email, ''));
  if found then
    insert into public.workspaces (kind, agency_name)
    values ('personal', coalesce(nullif(trim(pending.workspace_name), ''), nullif(trim(pending.full_name), ''), 'My workspace'))
    returning id into ws;
    insert into public.profiles (id, full_name, email, role, active, workspace_id)
    values (new.id, coalesce(nullif(nm, ''), pending.full_name), coalesce(new.email, ''), 'admin', true, ws)
    on conflict (id) do nothing;
    return new;
  end if;
  -- everyone else joins the team workspace: the first account as its admin, invited accounts active
  -- (see handle_user_invited), any other account inactive until an admin activates it
  insert into public.profiles (id, full_name, email, role, active, workspace_id)
  values (new.id, nm, coalesce(new.email, ''), case when first_account then 'admin' else 'member' end,
          first_account or new.invited_at is not null, team)
  on conflict (id) do nothing;
  return new;
end $$;
