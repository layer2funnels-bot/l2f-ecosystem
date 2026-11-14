// Global search (V8 02_GLOBAL_SHELL §5, owner requirements OR-08…OR-10, 14 Nov 2026).
// One operation asks each app's records AS THE SIGNED-IN PERSON: every query runs under the same row-level security as the app itself,
// inside the current organization only, so search can never show something the person could not open in the app.
// Owner rule (OR-09): a client RECORD may be found (and opened if permitted), but never the client's confidential material: files and
// documents in a client's space, and client-owned strategy records (avatars, offers, stories, brand kits, strategies with a client_id),
// are not searched at all. The browser builds the links (one routing source); the server returns ids and plain labels only.
import { defineOperation } from './define.mjs';

const LIMIT = 12;                     // per app in a scope; the browser shows 4 per app in "Everything"
const esc = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
// prefix matches first, then matches inside the text (ranked in SQL)
const rank = (col) => `case when lower(${col}) like lower($1) || '%' then 0 when lower(${col}) like '% ' || lower($1) || '%' then 1 else 2 end`;

const providers = {
  projects: async (q, ctx, i) => (await q(`select 'projects' app, 'project' type, p.id::text id, p.name title,
      case when p.is_personal then 'Personal project' when c.name is not null then 'Client · ' || c.name else 'Internal project' end subtitle,
      p.archived_at is not null archived, null::text extra
    from pm_projects p left join clients c on c.id = p.client_id
    where p.deleted_at is null and not p.is_template and p.name ilike '%' || $2 || '%' escape '\\'
      and (p.archived_at is null or $3::boolean or length($1) >= 3)
    order by ${rank('p.name')}, p.archived_at nulls first, p.name limit ${LIMIT}`, [i.q, esc(i.q), i.archived])),
  tasks: async (q, ctx, i) => (await q(`select 'projects' app, 'task' type, t.id::text id, t.title title, p.name || coalesce(' · due ' || to_char(t.due_on, 'DD Mon'), '') subtitle,
      false archived, p.id::text extra
    from pm_tasks t join pm_projects p on p.id = t.project_id
    where t.deleted_at is null and p.deleted_at is null and p.archived_at is null and (t.title ilike '%' || $2 || '%' escape '\\' or $2 = '')
      and (not $3::boolean or exists (select 1 from pm_task_assignees a where a.task_id = t.id and a.user_id = $4::uuid))
      and (not $5::boolean or (t.due_on < current_date and t.completed_at is null))
      and ($2 <> '' or $3::boolean or $5::boolean)
    order by ${rank('t.title')}, t.due_on nulls last limit ${LIMIT}`, [i.q, esc(i.q), Boolean(i.me), ctx.userId, Boolean(i.overdue)])),
  clients: async (q, ctx, i) => (await q(`select 'clients' app, 'client' type, c.id::text id, c.name title, 'Client' subtitle, c.archived_at is not null archived, null::text extra
    from clients c where c.name ilike '%' || $2 || '%' escape '\\' and (c.archived_at is null or $3::boolean or length($1) >= 3)
    order by ${rank('c.name')}, c.name limit ${LIMIT}`, [i.q, esc(i.q), i.archived])),
  // Drive: Library and Personal only. Client spaces are never searched (OR-09).
  files: async (q, ctx, i) => (await q(`select 'drive' app, f.kind type, f.id::text id, f.name title,
      case when f.space = 'personal' then 'Personal' else 'Library' end || ' · ' || to_char(f.updated_at, 'DD Mon') subtitle,
      f.archived_at is not null archived, f.mime_type extra
    from files f where f.client_id is null and f.space <> 'client' and f.name ilike '%' || $2 || '%' escape '\\'
      and (f.archived_at is null or $3::boolean) and (f.space <> 'shared' or f.in_library)
    order by ${rank('f.name')}, f.updated_at desc limit ${LIMIT}`, [i.q, esc(i.q), i.archived])),
  // Office records of the organization itself (client_id is null): client-owned copies are confidential and stay out (OR-09)
  office: async (q, ctx, i) => (await q(`select * from (
      select 'office' app, 'avatars' type, id::text id, name title, 'Customer avatar' subtitle, archived_at is not null archived, null::text extra, ${rank('name')} r from funnel_avatars where client_id is null and name ilike '%' || $2 || '%' escape '\\' and (archived_at is null or $3::boolean)
      union all select 'office', 'offers', id::text, name, 'Offer', archived_at is not null, null, ${rank('name')} from funnel_offers where client_id is null and name ilike '%' || $2 || '%' escape '\\' and (archived_at is null or $3::boolean)
      union all select 'office', 'stories', id::text, title, 'Story', archived_at is not null, null, ${rank('title')} from funnel_stories where client_id is null and title ilike '%' || $2 || '%' escape '\\' and (archived_at is null or $3::boolean)
      union all select 'office', 'brand_kits', id::text, name, 'Brand kit', archived_at is not null, null, ${rank('name')} from funnel_brand_kits where client_id is null and name ilike '%' || $2 || '%' escape '\\' and (archived_at is null or $3::boolean)
      union all select 'office', 'strategy', id::text, name, 'Funnel strategy', archived_at is not null, null, ${rank('name')} from funnel_strategies where client_id is null and name ilike '%' || $2 || '%' escape '\\' and (archived_at is null or $3::boolean)
    ) x order by r, title limit ${LIMIT}`, [i.q, esc(i.q), i.archived])).map(({ r, ...row }) => row),
  planner: async (q, ctx, i) => (await q(`select * from (
      select 'planner' app, 'plan' type, id::text id, name title, 'Plan' subtitle, archived_at is not null archived, null::text extra, ${rank('name')} r from planner_plans where $2 <> '' and name ilike '%' || $2 || '%' escape '\\' and (archived_at is null or $3::boolean)
      union all select 'planner', 'goal', g.id::text, g.title, 'Objective · ' || p.name, g.archived_at is not null, g.plan_id::text, ${rank('g.title')} from planner_goals g join planner_plans p on p.id = g.plan_id
        where g.title ilike '%' || $2 || '%' escape '\\' and (g.archived_at is null or $3::boolean) and (not $4::boolean or g.owner_id = $5::uuid)
    ) x order by r, title limit ${LIMIT}`, [i.q, esc(i.q), i.archived, Boolean(i.me), ctx.userId])).map(({ r, ...row }) => row),
  // team members of this organization (avatars are drawn by the browser from the existing photo operation)
  people: async (q, ctx, i) => (await q(`select 'people' app, 'person' type, user_id::text id, display_name title, initcap(role) subtitle, false archived, case when has_photo then 'photo' end extra
    from team_list() where display_name ilike '%' || $2 || '%' escape '\\' order by ${rank('display_name')}, display_name limit ${LIMIT}`, [i.q, esc(i.q)])),
};
// Search scopes from the design ("Search in"): which providers each one asks
export const SEARCH_SCOPES = {
  all: Object.keys(providers), projects: ['projects', 'tasks'], tasks: ['tasks'], clients: ['clients'], files: ['files'], office: ['office', 'people'], planner: ['planner'], funnels: [],
};

export const searchOperations = [
  defineOperation({
    name: 'search.query', class: 'read', audience: 'staff',
    input: { q: { type: 'text', max: 100 }, scope: { type: 'enum', values: Object.keys(SEARCH_SCOPES) }, archived: { type: 'bool' }, me: { type: 'bool' }, overdue: { type: 'bool' } },
    run: async (q, ctx, i) => {
      const input = { q: String(i.q ?? '').trim(), archived: Boolean(i.archived), me: Boolean(i.me), overdue: Boolean(i.overdue) };
      if (!input.q && !input.me && !input.overdue) return [];
      // with only @me / overdue, only tasks (and my objectives) can answer
      const wanted = (SEARCH_SCOPES[i.scope ?? 'all'] ?? []).filter((p) => (input.q ? true : p === 'tasks' || (p === 'planner' && input.me)));
      const out = [];
      // row-level security filters each query to what this person may open; nothing is caught here, so a real fault is never hidden
      for (const p of wanted) out.push(...await providers[p](q, ctx, input));
      return out;
    },
  }),
];
