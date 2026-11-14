# Migrations 0054 and 0055: what they change, reversibility, backup and rollback

Status: **not applied to production.** The live database (`l2f-ecosystem`, Supabase) is at 0053. The branch preview uses the live
database, which is why the preview's notification panel says "couldn't be loaded": the code expects 0054. Nothing here is applied
without the owner's explicit approval.

## 0054 · Notifications for every app

| Change | Type | Effect on existing data |
|---|---|---|
| `notifications`: new columns `app` (default `'projects'`), `title`, `href`, `event_key` | additive | existing rows get `app = 'projects'`, the rest stay empty |
| `notifications`: kind and entity checks widened (`shared`, `approval`, … ; `app_event`) | widened | none (every existing row already passes) |
| `notifications`: `app` format check; app events must carry a title and an in-app link (`#/…`) | new check | none (no app events exist yet) |
| unique index `(user_id, event_key)` where `event_key` is set | new | none (all existing keys are empty) |
| new table `notification_prefs` (in-app on/off per person, organization and app), row-level security own row + organization scope | new | — |
| `private.notify(...)`: the one write path for app events (never the actor, respects settings, never twice) | new | — |
| `public.my_inbox(limit, group, app)`: the reader's inbox, current organization only | new | — |
| trigger on `drive_shares`: "shared with you" notice | new | fires only for shares made after the migration |
| `revoke` from `anon` / `authenticated` (Supabase Data API roles) | security | — |

## 0055 · Profile details

| Change | Type | Effect on existing data |
|---|---|---|
| `profiles`: new optional columns `full_name`, `job_title`, `time_zone` (must be a real time zone), `about` | additive | all empty |
| `public.profile_details()` / `public.profile_details_set(...)`: the caller's own row only | new | — |
| `revoke` from `anon` / `authenticated` | security | — |

## Reversible?

Yes, both. Rollback scripts: `migrations/rollback/0054_notifications_every_app.down.sql` and `migrations/rollback/0055_profile_details.down.sql`
(each one transaction). `test/migration-rollback.test.mjs` (part of `npm test`) proves: up → data → down → every new object is gone, Projects
notifications and profiles are kept, the old checks are back → up again works → applying twice is harmless.

What a rollback loses: 0054 removes the app-event notices (Drive "shared with you") and the per-app settings; 0055 removes the four profile
fields people typed. Projects notifications, names, emails and photos are untouched. Roll the code back first (the previous deployment),
then the database, so no screen calls a function that is gone.

## Procedure (each step needs the owner's go)

1. **Backup** (Supabase free plan has no managed backups): `scripts/backup-supabase.sh` (pg_dump of `public`, `private`, `pm` and the auth users,
   encrypted with the owner's `age` key). The owner runs it on their machine with the session-pooler connection string in an environment
   variable (never in chat), or approves enabling `.github/workflows/backup.yml.disabled`. Keep the file until the change has been live for a week.
2. **Apply** 0054, then 0055, each in its own transaction (Supabase `apply_migration`, as for 0034–0053). A failure leaves the database unchanged.
3. **Verify**: `list_migrations` shows both; security advisors clean; `my_inbox` and `profile_details` not executable by `anon` / `authenticated`;
   the preview's bell and Profile › Notifications load; `npm run test:e2e` against a branch copy where possible.
4. **Rollback** if needed: redeploy the previous build, then run the two `.down.sql` files (0055 first, then 0054); restore from the backup only
   if data was damaged (`pg_restore --data-only` of the affected tables).

## Full SQL

### 0054_notifications_every_app.sql
```sql
-- 0054 · Notifications for every app (V8 02_GLOBAL_SHELL §6; owner requirements OR-05 and OR-11, 14 Nov 2026).
-- Extends the one notifications table of 0034/0049 (Projects tasks) instead of adding a second system:
--   * every row now says which app it belongs to, and app events carry their own title and link;
--   * one write path for every app, private.notify(), which never notifies the actor, respects the reader's app settings
--     (mentions and approvals always arrive), and never writes the same event twice (event_key unique per reader);
--   * my_inbox(): the reader's inbox in the current organization only, newest first, filterable by kind group and app;
--   * notification_prefs: in-app on/off per app (email digests wait for an approved provider: open decision D3).
-- Additive only: existing rows, functions and the Projects bell keep working. Reversible: drop the new objects and columns.

alter table public.notifications
  add column if not exists app text not null default 'projects',
  add column if not exists title text,
  add column if not exists href text,
  add column if not exists event_key text;
alter table public.notifications drop constraint if exists notifications_kind_check,
  add constraint notifications_kind_check check (kind in ('assigned', 'mentioned', 'commented', 'completed', 'unblocked', 'due_changed',
    'approval', 'approved', 'changes_requested', 'client_replied', 'update_due', 'shared', 'invitation', 'followed_changed'));
alter table public.notifications drop constraint if exists notifications_entity_type_check,
  add constraint notifications_entity_type_check check (entity_type in ('project_task', 'pm_task', 'app_event'));
alter table public.notifications drop constraint if exists notifications_app_check,
  add constraint notifications_app_check check (app ~ '^[a-z_]{2,40}$');
-- an app event must say where it leads, and only to an address inside the ecosystem
alter table public.notifications drop constraint if exists notifications_app_event_shape,
  add constraint notifications_app_event_shape check (entity_type <> 'app_event' or (title is not null and length(title) <= 300 and length(href) <= 400 and href ~ '^#/[A-Za-z0-9/_?=&.%:-]+$'));
create unique index if not exists notifications_event_once on public.notifications (user_id, event_key) where event_key is not null;

create table if not exists public.notification_prefs (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  app text not null check (app ~ '^[a-z_]{2,40}$'),
  in_app boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id, app),
  foreign key (workspace_id, user_id) references public.memberships (workspace_id, user_id) on delete cascade
);
alter table public.notification_prefs enable row level security;
alter table public.notification_prefs force row level security;
drop policy if exists own on public.notification_prefs;
create policy own on public.notification_prefs for all using (user_id = private.current_user_id()) with check (user_id = private.current_user_id());
drop policy if exists org_scope on public.notification_prefs;
create policy org_scope on public.notification_prefs as restrictive for all using (private.org_in_scope(workspace_id)) with check (private.org_in_scope(workspace_id));
grant select, insert, update, delete on public.notification_prefs to app_user;

-- The one write path for app events. The calling app has already checked that the reader may open p_href's record.
-- Mentions and approvals always arrive; other kinds follow the reader's "in app" setting for that app.
create or replace function private.notify(p_ws uuid, p_uid uuid, p_app text, p_kind text, p_title text, p_href text, p_event_key text,
  p_actor uuid default private.current_user_id()) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_uid is null or p_uid is not distinct from p_actor then return false; end if;
  if not exists (select 1 from public.memberships m where m.workspace_id = p_ws and m.user_id = p_uid and m.status = 'active') then return false; end if;
  if p_kind not in ('mentioned', 'approval', 'approved', 'changes_requested', 'client_replied')
     and exists (select 1 from public.notification_prefs np where np.workspace_id = p_ws and np.user_id = p_uid and np.app = p_app and not np.in_app) then return false; end if;
  insert into public.notifications (workspace_id, user_id, app, kind, entity_type, entity_id, actor_id, title, href, event_key)
  values (p_ws, p_uid, p_app, p_kind, 'app_event', gen_random_uuid(), p_actor, p_title, p_href, p_event_key)
  on conflict (user_id, event_key) where event_key is not null do nothing;
  return found;
end $$;
revoke all on function private.notify(uuid, uuid, text, text, text, text, text, uuid) from public;

-- The inbox: the reader's notifications in the current organization, every app, newest first.
-- Projects task rows keep 0049's rule (only tasks the reader can still open); app events carry their own title and link.
-- p_group: all | mentions | assigned | approvals | updates.
create or replace function public.my_inbox(p_limit int default 50, p_group text default 'all', p_app text default null)
returns table (id uuid, app text, kind text, title text, context text, href text, actor_id uuid, actor_name text, read_at timestamptz, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select n.id, n.app, n.kind,
         coalesce(n.title, vt.title, t.title),
         coalesce(vp.name, p.name, ''),
         coalesce(n.href, case when vt.id is not null then '#/projects/p/' || vt.project_id || '/list?task=' || vt.id when t.id is not null then '#/projects' end),
         n.actor_id, coalesce(nullif(pr.display_name, ''), 'Someone'), n.read_at, n.created_at
  from public.notifications n
  left join public.project_tasks t on n.entity_type = 'project_task' and t.workspace_id = n.workspace_id and t.id = n.entity_id
  left join public.projects p on p.workspace_id = t.workspace_id and p.id = t.project_id
  left join public.pm_tasks vt on n.entity_type = 'pm_task' and vt.workspace_id = n.workspace_id and vt.id = n.entity_id and vt.deleted_at is null
  left join public.pm_projects vp on vp.workspace_id = vt.workspace_id and vp.id = vt.project_id and vp.deleted_at is null
  left join public.profiles pr on pr.id = n.actor_id
  where n.user_id = private.current_user_id() and private.org_in_scope(n.workspace_id)
    and (n.entity_type = 'app_event' or p.id is not null or vp.id is not null)
    and (p_app is null or n.app = p_app)
    and (coalesce(p_group, 'all') = 'all'
      or (p_group = 'mentions' and n.kind = 'mentioned')
      or (p_group = 'assigned' and n.kind = 'assigned')
      or (p_group = 'approvals' and n.kind in ('approval', 'approved', 'changes_requested', 'client_replied'))
      or (p_group = 'updates' and n.kind not in ('mentioned', 'assigned', 'approval', 'approved', 'changes_requested', 'client_replied')))
  order by n.seq desc limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
revoke all on function public.my_inbox(int, text, text) from public;
grant execute on function public.my_inbox(int, text, text) to app_user;

-- First producer: "shared with you" in Drive (02 §6 "file shared with me"). A trigger, so the notice is written by the database itself
-- (no app can send someone an arbitrary notice). One notice per share, ever: re-sharing or a role change does not notify again.
create or replace function private.drive_share_notice() returns trigger
language plpgsql security definer set search_path = '' as $$
declare nm text; href text;
begin
  if new.user_id is null or new.link_id is not null then return new; end if;
  if new.file_id is not null then
    select f.name, case when f.kind = 'document' then case f.mime_type when 'application/vnd.l2f.sheet+json' then '#/sheet/' when 'application/vnd.excalidraw+json' then '#/board/' else '#/doc/' end || f.id
                        when f.mime_type like 'image/%' then '#/image/' || f.id when f.mime_type = 'application/pdf' then '#/pdf/' || f.id else '#/drive/shared' end
      into nm, href from public.files f where f.workspace_id = new.workspace_id and f.id = new.file_id;
  else
    select d.name, '#/drive/shared' into nm, href from public.drive_folders d where d.workspace_id = new.workspace_id and d.id = new.folder_id;
  end if;
  if nm is not null then
    perform private.notify(new.workspace_id, new.user_id, 'drive', 'shared', left('shared “' || nm || '” with you', 300), href,
      'drive.share:' || coalesce(new.file_id, new.folder_id)::text, coalesce(new.created_by, private.current_user_id()));
  end if;
  return new;
end $$;
drop trigger if exists drive_share_notice on public.drive_shares;
create trigger drive_share_notice after insert on public.drive_shares for each row execute function private.drive_share_notice();

-- Supabase grants EXECUTE on new functions to its Data API roles by default: take that away again (nothing of ours is reachable
-- through the Data API; the app reaches the database only as app_user). Same lockdown as every earlier migration.
revoke all on function private.drive_share_notice() from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.my_inbox(int, text, text) from %I', r);
      execute format('revoke all on function private.notify(uuid, uuid, text, text, text, text, text, uuid) from %I', r);
      execute format('revoke all on function private.drive_share_notice() from %I', r);
      execute format('revoke all on table public.notification_prefs from %I', r);
    end if;
  end loop;
end $$;
```

### 0055_profile_details.sql
```sql
-- 0055 · Your profile, V8 (02 §7 "Profile": full name, display name, job title, time zone, about).
-- display_name (0012/0041) stays the name shown everywhere; the new columns are optional and belong to the person only.
-- Each person reads and changes only their own row (no person argument). Teammates already see profiles in their own
-- organization through the existing profiles policy (audit F8), which is the V8 rule: "shown to the people you work with".
-- Additive and reversible: drop the two functions and the four columns.

alter table public.profiles
  add column if not exists full_name text check (full_name is null or length(full_name) between 1 and 120),
  add column if not exists job_title text check (job_title is null or length(job_title) between 1 and 80),
  add column if not exists time_zone text check (time_zone is null or (length(time_zone) <= 64 and time_zone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+){0,2}$')),
  add column if not exists about text check (about is null or length(about) between 1 and 600);

create or replace function public.profile_details()
returns table (full_name text, job_title text, time_zone text, about text)
language sql stable security definer set search_path = '' as $$
  select p.full_name, p.job_title, p.time_zone, p.about from public.profiles p where p.id = private.current_user_id()
$$;

-- an empty value clears the field; null leaves it as it is
create or replace function public.profile_details_set(p_full_name text default null, p_job_title text default null, p_time_zone text default null, p_about text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.current_user_id();
begin
  if uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_time_zone is not null and btrim(p_time_zone) <> '' and not exists (select 1 from pg_catalog.pg_timezone_names where name = btrim(p_time_zone)) then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;
  insert into public.profiles (id, email) values (uid, private.current_user_email()) on conflict (id) do nothing;
  update public.profiles set
    full_name = case when p_full_name is null then full_name else nullif(left(btrim(p_full_name), 120), '') end,
    job_title = case when p_job_title is null then job_title else nullif(left(btrim(p_job_title), 80), '') end,
    time_zone = case when p_time_zone is null then time_zone else nullif(btrim(p_time_zone), '') end,
    about     = case when p_about is null then about else nullif(left(btrim(p_about), 600), '') end
  where id = uid;
end $$;

revoke all on function public.profile_details(), public.profile_details_set(text, text, text, text) from public;
grant execute on function public.profile_details(), public.profile_details_set(text, text, text, text) to app_user;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.profile_details() from %I', r);
      execute format('revoke all on function public.profile_details_set(text, text, text, text) from %I', r);
    end if;
  end loop;
end $$;
```
