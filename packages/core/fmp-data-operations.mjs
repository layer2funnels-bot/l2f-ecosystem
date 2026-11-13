// Funnel Mapper data on the ecosystem database (migration 0053). Every query runs as the signed-in person under row security:
// the organization (WCIGA), the client scope (SDOR) and the fmp.* permissions are decided by the database; a refusal is "not found"
// (empty result). Column names are constants here, never taken from the request. The funnel maths, maps and exports stay in
// Funnel Mapper: these operations only store and return its records.
import { createHash, randomBytes } from 'node:crypto';
import { defineOperation } from './define.mjs';
import { pathBelongsTo } from './storage.mjs';

const T = (max = 8000) => ({ type: 'text', min: 0, max });
const ID = { type: 'uuid', required: true };
const JSONV = { type: 'json', max: 3900000 };          // maps can be large; the HTTP layer allows 4 MB for these operations (LARGE_BODY_OPS)
const IDS = { type: 'list', items: 'uuid', max: 500 };
const FUNNEL_LIST = 'f.id, f.client_id, f.name, f.description, f.status, f.summary, f.settings, f.thumbnail_path, f.created_at, f.updated_at, f.trashed_at';
const FUNNEL_FULL = `${FUNNEL_LIST}, f.graph`;
const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
const STATUS = { type: 'enum', values: ['draft', 'proposed', 'live', 'archived'] };

/** UPDATE … SET only for the given keys (all column names are fixed in `cols`). */
function setClause(i, cols, startAt = 2) {
  const used = cols.filter((c) => i[c] !== undefined);
  return { used, sql: used.map((c, n) => `${c} = $${n + startAt}`).join(', '), vals: used.map((c) => (typeof i[c] === 'object' && i[c] !== null ? JSON.stringify(i[c]) : i[c])) };
}

export const fmpDataOperations = [
  // ---------------------------------------------------------------- funnels
  defineOperation({
    name: 'fmp.funnels.list', class: 'read',
    input: { client: { type: 'uuid' }, trashed: { type: 'bool' }, ids: IDS, with_graph: { type: 'bool' }, limit: { type: 'int', min: 1, max: 1000 } },
    run: (q, _c, i) => q(`select ${i.with_graph ? FUNNEL_FULL : FUNNEL_LIST} from fmp.funnels f
      where ($1::uuid is null or f.client_id = $1) and ((f.trashed_at is not null) = $2) and ($3::uuid[] is null or f.id = any($3))
      order by ${i.trashed ? 'f.trashed_at' : 'f.updated_at'} desc limit $4`, [i.client ?? null, i.trashed ?? false, i.ids ?? null, i.limit ?? 1000]),
  }),
  defineOperation({ name: 'fmp.funnels.get', class: 'read', single: true, input: { id: ID }, run: (q, _c, i) => q(`select ${FUNNEL_FULL} from fmp.funnels f where f.id = $1`, [i.id]) }),
  defineOperation({
    name: 'fmp.funnels.counts', class: 'read', single: true, input: {},
    run: (q) => q(`select count(*) filter (where trashed_at is null)::int as active, count(*) filter (where trashed_at is not null)::int as trashed,
      (select count(*)::int from fmp.client_commercial where trashed_at is not null) as trashed_clients from fmp.funnels`),
  }),
  defineOperation({
    name: 'fmp.funnels.create', class: 'write', single: true,
    input: { client: ID, name: T(200), description: T(4000), status: STATUS, graph: JSONV, settings: JSONV, summary: JSONV },
    run: (q, ctx, i) => q(`insert into fmp.funnels (workspace_id, client_id, name, description, status, graph, settings, summary)
      values ($1, $2, coalesce(nullif($3, ''), 'Untitled funnel'), coalesce($4, ''), coalesce($5, 'draft'), coalesce($6::jsonb, '{"nodes":[],"edges":[],"view":{"x":60,"y":40,"k":1}}'::jsonb), coalesce($7::jsonb, '{}'::jsonb), coalesce($8::jsonb, '{}'::jsonb))
      returning id, client_id, name, status, updated_at`,
      [ctx.orgId, i.client, i.name ?? null, i.description ?? null, i.status ?? null, i.graph === undefined ? null : JSON.stringify(i.graph), i.settings === undefined ? null : JSON.stringify(i.settings), i.summary === undefined ? null : JSON.stringify(i.summary)]),
  }),
  defineOperation({
    name: 'fmp.funnels.update', class: 'write', single: true,
    input: { id: ID, name: T(200), description: T(4000), status: STATUS, client: { type: 'uuid' }, graph: JSONV, settings: JSONV, summary: JSONV, thumbnail_path: T(400), expected_updated_at: { type: 'timestamp' } },
    run: async (q, _c, i) => {
      const x = { ...i, client_id: i.client };
      const { used, sql, vals } = setClause(x, ['name', 'description', 'status', 'client_id', 'graph', 'settings', 'summary', 'thumbnail_path']);
      if (!used.length) return q('select id, client_id, updated_at from fmp.funnels where id = $1', [i.id]);
      // optimistic save: a second tab can't silently overwrite a newer save
      const guard = i.expected_updated_at ? ` and date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $${used.length + 2}::timestamptz)` : '';
      return q(`update fmp.funnels set ${sql} where id = $1 and trashed_at is null${guard} returning id, client_id, updated_at`, [i.id, ...vals, ...(i.expected_updated_at ? [i.expected_updated_at] : [])]);
    },
  }),
  defineOperation({
    // Move to the trash (one funnel, or every funnel of a client when the client is trashed)
    name: 'fmp.funnels.trash', class: 'write', input: { id: { type: 'uuid' }, client: { type: 'uuid' } },
    run: (q, _c, i) => (i.id || i.client ? q('update fmp.funnels set trashed_at = now() where trashed_at is null and (id = $1 or client_id = $2) returning id, client_id, trashed_at', [i.id ?? null, i.client ?? null]) : []),
  }),
  defineOperation({
    name: 'fmp.funnels.restore', class: 'write', input: { id: { type: 'uuid' }, client: { type: 'uuid' }, trashed_at: { type: 'timestamp' } },
    run: (q, _c, i) => (i.id || i.client ? q(`update fmp.funnels set trashed_at = null where trashed_at is not null and (id = $1 or (client_id = $2 and ($3::timestamptz is null or trashed_at = $3::timestamptz)))
      returning id, client_id`, [i.id ?? null, i.client ?? null, i.trashed_at ?? null]) : []),
  }),
  defineOperation({
    // Delete for good: only things already in the trash (the row policy also requires fmp.funnel.delete)
    name: 'fmp.funnels.purge', class: 'sensitive', input: { id: { type: 'uuid' } },
    run: (q, _c, i) => q('delete from fmp.funnels where trashed_at is not null and ($1::uuid is null or id = $1) returning id', [i.id ?? null]),
  }),

  // ---------------------------------------------------------------- versions
  defineOperation({
    name: 'fmp.versions.list', class: 'read', input: { funnel: ID, limit: { type: 'int', min: 1, max: 100 }, with_graph: { type: 'bool' } },
    run: (q, _c, i) => q(`select id, funnel_id, label, auto, created_by, created_at${i.with_graph === false ? '' : ', graph, settings'} from fmp.funnel_versions
      where funnel_id = $1 order by created_at desc limit $2`, [i.funnel, i.limit ?? 100]),
  }),
  defineOperation({
    name: 'fmp.versions.add', class: 'write', single: true, input: { funnel: ID, graph: { type: 'json', required: true, max: 3900000 }, settings: JSONV, label: T(200), auto: { type: 'bool' } },
    run: (q, ctx, i) => q(`insert into fmp.funnel_versions (workspace_id, funnel_id, graph, settings, label, auto) values ($1, $2, $3::jsonb, coalesce($4::jsonb, '{}'::jsonb), coalesce($5, ''), coalesce($6, false))
      returning id, created_at`, [ctx.orgId, i.funnel, JSON.stringify(i.graph), i.settings === undefined ? null : JSON.stringify(i.settings), i.label ?? null, i.auto ?? null]),
  }),
  defineOperation({ name: 'fmp.versions.delete', class: 'write', single: true, input: { id: ID }, run: (q, _c, i) => q('delete from fmp.funnel_versions where id = $1 returning id', [i.id]) }),

  // ---------------------------------------------------------------- actuals (measured numbers per block and period)
  defineOperation({
    name: 'fmp.actuals.list', class: 'read', input: { funnel: { type: 'uuid' }, funnels: IDS },
    run: (q, _c, i) => q(`select id, funnel_id, period_start, period_end, node_id, visitors, conversions, revenue, spend, source, source_ref, updated_at
      from fmp.funnel_actuals where ($1::uuid is not null and funnel_id = $1) or ($2::uuid[] is not null and funnel_id = any($2)) order by period_start desc`, [i.funnel ?? null, i.funnels ?? null]),
  }),
  defineOperation({
    name: 'fmp.actuals.save', class: 'write',
    input: { funnel: ID, rows: { type: 'list', items: 'json', max: 500 }, clear: { type: 'json' } },
    run: async (q, ctx, i) => {
      const out = [];
      for (const r of i.rows ?? []) {
        if (!r || typeof r !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(r.period_start) || !/^\d{4}-\d{2}-\d{2}$/.test(r.period_end) || typeof r.node_id !== 'string') continue;
        const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
        out.push(...await q(`insert into fmp.funnel_actuals (workspace_id, funnel_id, period_start, period_end, node_id, visitors, conversions, revenue, spend, source, source_ref)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10, 'manual'), $11)
          on conflict (funnel_id, period_start, period_end, node_id) do update set
            visitors = case when $12 then excluded.visitors else fmp.funnel_actuals.visitors end,
            conversions = case when $13 then excluded.conversions else fmp.funnel_actuals.conversions end,
            revenue = case when $14 then excluded.revenue else fmp.funnel_actuals.revenue end,
            spend = case when $15 then excluded.spend else fmp.funnel_actuals.spend end,
            source = excluded.source, source_ref = excluded.source_ref returning id`,
          // a field left out of the row keeps its saved value (one cell typed in the grid must not wipe the others)
          [ctx.orgId, i.funnel, r.period_start, r.period_end, String(r.node_id).slice(0, 100), num(r.visitors), num(r.conversions), num(r.revenue), num(r.spend),
            typeof r.source === 'string' ? r.source.slice(0, 40) : null, typeof r.source_ref === 'string' ? r.source_ref.slice(0, 400) : null,
            'visitors' in r, 'conversions' in r, 'revenue' in r, 'spend' in r]));
      }
      const c = i.clear;
      if (c && typeof c === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(c.period_start) && /^\d{4}-\d{2}-\d{2}$/.test(c.period_end) && Array.isArray(c.node_ids) && c.node_ids.length) {
        out.push(...await q('delete from fmp.funnel_actuals where funnel_id = $1 and period_start = $2 and period_end = $3 and node_id = any($4::text[]) returning id',
          [i.funnel, c.period_start, c.period_end, c.node_ids.map((x) => String(x).slice(0, 100)).slice(0, 500)]));
      }
      return out;
    },
  }),

  // ---------------------------------------------------------------- products (organization-wide when client is null)
  defineOperation({
    name: 'fmp.products.list', class: 'read', input: { client: { type: 'uuid' }, include_org: { type: 'bool' } },
    run: (q, _c, i) => q(`select id, client_id, name, type, params, notes, created_at, updated_at from fmp.products
      where ($1::uuid is null and client_id is null) or client_id = $1 or (coalesce($2, true) and client_id is null) order by name`, [i.client ?? null, i.include_org ?? null]),
  }),
  defineOperation({
    name: 'fmp.products.save', class: 'write', single: true,
    input: { id: { type: 'uuid' }, client: { type: 'uuid' }, name: { type: 'text', min: 1, max: 200, required: true }, type: T(40), params: JSONV, notes: T(20000) },
    run: (q, ctx, i) => (i.id
      ? q(`update fmp.products set name = $2, type = coalesce($3, type), params = coalesce($4::jsonb, params), notes = coalesce($5, notes) where id = $1 returning id`,
        [i.id, i.name, i.type ?? null, i.params === undefined ? null : JSON.stringify(i.params), i.notes ?? null])
      : q(`insert into fmp.products (workspace_id, client_id, name, type, params, notes) values ($1, $2, $3, coalesce($4, 'product'), coalesce($5::jsonb, '{}'::jsonb), coalesce($6, '')) returning id`,
        [ctx.orgId, i.client ?? null, i.name, i.type ?? null, i.params === undefined ? null : JSON.stringify(i.params), i.notes ?? null])),
  }),
  defineOperation({ name: 'fmp.products.delete', class: 'write', single: true, input: { id: ID }, run: (q, _c, i) => q('delete from fmp.products where id = $1 returning id', [i.id]) }),

  // ---------------------------------------------------------------- templates (built-in + the organization's own)
  defineOperation({
    name: 'fmp.templates.list', class: 'read', input: { own: { type: 'bool' }, with_graph: { type: 'bool' } },
    run: (q, _c, i) => q(`select id, builtin_key, name, category, description, workspace_id is not null as own, created_at${i.with_graph ? ', graph, settings' : ''}
      from fmp.templates where ($1::boolean is null or (workspace_id is not null) = $1) order by created_at`, [i.own ?? null]),
  }),
  defineOperation({ name: 'fmp.templates.get', class: 'read', single: true, input: { id: ID }, run: (q, _c, i) => q('select id, builtin_key, name, category, description, graph, settings, workspace_id is not null as own from fmp.templates where id = $1', [i.id]) }),
  defineOperation({
    name: 'fmp.templates.create', class: 'write', single: true,
    input: { name: { type: 'text', min: 1, max: 200, required: true }, category: T(60), description: T(4000), graph: { type: 'json', required: true, max: 3900000 }, settings: JSONV },
    run: (q, ctx, i) => q(`insert into fmp.templates (workspace_id, name, category, description, graph, settings) values ($1, $2, coalesce(nullif($3, ''), 'Custom'), coalesce($4, ''), $5::jsonb, coalesce($6::jsonb, '{}'::jsonb)) returning id`,
      [ctx.orgId, i.name, i.category ?? null, i.description ?? null, JSON.stringify(i.graph), i.settings === undefined ? null : JSON.stringify(i.settings)]),
  }),
  defineOperation({ name: 'fmp.templates.delete', class: 'write', single: true, input: { id: ID }, run: (q, _c, i) => q('delete from fmp.templates where id = $1 and workspace_id is not null returning id', [i.id]) }),

  // ---------------------------------------------------------------- share links (the token is shown once; only its hash is stored)
  defineOperation({
    name: 'fmp.links.list', class: 'read', input: { funnel: ID },
    run: (q, _c, i) => q('select id, funnel_id, can_edit, hide_numbers, allow_comments, expires_at, created_at from fmp.share_links where funnel_id = $1 order by created_at desc', [i.funnel]),
  }),
  defineOperation({
    name: 'fmp.links.create', class: 'sensitive', single: true,
    input: { funnel: ID, can_edit: { type: 'bool' }, hide_numbers: { type: 'bool' }, allow_comments: { type: 'bool' }, expires_at: { type: 'timestamp' } },
    run: async (q, ctx, i) => {
      const token = randomBytes(24).toString('hex');
      const r = await q(`insert into fmp.share_links (workspace_id, funnel_id, token_hash, can_edit, hide_numbers, allow_comments, expires_at)
        values ($1, $2, $3, coalesce($4, false), coalesce($5, false), coalesce($6, true), $7::timestamptz) returning id, funnel_id, can_edit, hide_numbers, allow_comments, expires_at, created_at`,
        [ctx.orgId, i.funnel, sha(token), i.can_edit ?? null, i.hide_numbers ?? null, i.allow_comments ?? null, i.expires_at ?? null]);
      return r.map((x) => ({ ...x, token }));
    },
  }),
  defineOperation({
    name: 'fmp.links.update', class: 'sensitive', single: true,
    input: { id: ID, can_edit: { type: 'bool' }, hide_numbers: { type: 'bool' }, allow_comments: { type: 'bool' }, expires_at: { type: 'timestamp' }, clear_expiry: { type: 'bool' } },
    run: (q, _c, i) => {
      const x = { ...i, expires_at: i.clear_expiry ? null : i.expires_at };
      const cols = ['can_edit', 'hide_numbers', 'allow_comments', ...(i.clear_expiry || i.expires_at !== undefined ? ['expires_at'] : [])];
      const used = cols.filter((c) => x[c] !== undefined);
      if (!used.length) return q('select id from fmp.share_links where id = $1', [i.id]);
      return q(`update fmp.share_links set ${used.map((c, n) => `${c} = $${n + 2}`).join(', ')} where id = $1 returning id, can_edit, hide_numbers, allow_comments, expires_at`, [i.id, ...used.map((c) => x[c])]);
    },
  }),
  defineOperation({ name: 'fmp.links.delete', class: 'sensitive', single: true, input: { id: ID }, run: (q, _c, i) => q('delete from fmp.share_links where id = $1 returning id', [i.id]) }),
  defineOperation({
    name: 'fmp.comments.list', class: 'read', input: { funnel: ID, unresolved: { type: 'bool' } },
    run: (q, _c, i) => q('select id, share_link_id, funnel_id, node_id, author_name, body, resolved, created_at from fmp.share_comments where funnel_id = $1 and ($2::boolean is null or resolved = not $2) order by created_at desc', [i.funnel, i.unresolved ?? null]),
  }),
  defineOperation({ name: 'fmp.comments.resolve', class: 'write', single: true, input: { id: ID, resolved: { type: 'bool', required: true } }, run: (q, _c, i) => q('update fmp.share_comments set resolved = $2 where id = $1 returning id, resolved', [i.id, i.resolved]) }),
  defineOperation({ name: 'fmp.comments.delete', class: 'write', single: true, input: { id: ID }, run: (q, _c, i) => q('delete from fmp.share_comments where id = $1 returning id', [i.id]) }),

  // ---------------------------------------------------------------- saved styles and blocks; organization settings
  defineOperation({ name: 'fmp.assets.list', class: 'read', input: {}, run: (q) => q('select id, kind, name, data, created_at from fmp.assets order by created_at') }),
  defineOperation({
    name: 'fmp.assets.add', class: 'write', single: true, input: { kind: { type: 'enum', values: ['style', 'block'], required: true }, name: { type: 'text', min: 1, max: 60, required: true }, data: { type: 'json', required: true, max: 200000 } },
    run: (q, ctx, i) => q('insert into fmp.assets (workspace_id, kind, name, data) values ($1, $2, $3, $4::jsonb) returning id', [ctx.orgId, i.kind, i.name.trim(), JSON.stringify(i.data)]),
  }),
  defineOperation({ name: 'fmp.assets.delete', class: 'write', single: true, input: { id: ID }, run: (q, _c, i) => q('delete from fmp.assets where id = $1 returning id', [i.id]) }),
  defineOperation({
    name: 'fmp.settings.get', class: 'read', single: true, input: {},
    run: async (q, ctx) => {
      const [w] = await q(`select w.id, w.name, w.slug, coalesce(s.default_currency, 'GBP') as default_currency, private.has_role(w.id, 'admin') as is_admin
        from workspaces w left join fmp.org_settings s on s.workspace_id = w.id where w.id = $1 and private.has_permission(w.id, 'fmp.funnel.view')`, [ctx.orgId]);
      return w ? [w] : [];
    },
  }),
  defineOperation({
    name: 'fmp.settings.set', class: 'write', single: true, input: { default_currency: { type: 'currency', required: true } },
    run: (q, ctx, i) => q(`insert into fmp.org_settings (workspace_id, default_currency) values ($1, $2) on conflict (workspace_id) do update set default_currency = excluded.default_currency returning default_currency`, [ctx.orgId, i.default_currency]),
  }),

  // ---------------------------------------------------------------- clients as Funnel Mapper shows them (shared identity + Funnel Mapper's own terms)
  defineOperation({
    name: 'fmp.clients.full', class: 'read',
    input: { id: { type: 'uuid' }, trashed: { type: 'bool' }, archived: { type: 'bool' } },
    run: async (q, ctx, i) => {
      if (!(await q('select private.has_permission($1, $2) ok', [ctx.orgId, 'fmp.funnel.view']))[0]?.ok) return [];
      return q(`select c.id, c.name, c.created_at, c.archived_at, coalesce(p.business_name, '') business_name, coalesce(p.niche, '') niche, coalesce(p.email, '') email,
          coalesce(p.phone, '') phone, coalesce(p.website, '') website, coalesce(p.country, '') country, coalesce(p.currency, s.default_currency, 'GBP') currency,
          coalesce(p.status, 'lead') status, coalesce(p.tags, '{}') tags,
          coalesce(cc.monthly_retainer, 0) monthly_retainer, coalesce(cc.pricing_model, 'retainer') pricing_model, coalesce(cc.pricing_amount, 0) pricing_amount,
          coalesce(cc.billing_frequency, 'monthly') billing_frequency, coalesce(cc.hours_per_month, 0) hours_per_month, coalesce(cc.commission_pct, 0) commission_pct,
          cc.project_start, cc.project_end, coalesce(cc.pricing_notes, '') pricing_notes, coalesce(cc.notes, '') notes, cc.logo_path, cc.trashed_at,
          greatest(c.created_at, cc.updated_at) updated_at
        from clients c left join client_profiles p on p.client_id = c.id
        left join fmp.client_commercial cc on cc.workspace_id = c.workspace_id and cc.client_id = c.id
        left join fmp.org_settings s on s.workspace_id = c.workspace_id
        where ($1::uuid is null or c.id = $1) and ($1::uuid is not null or ((cc.trashed_at is not null) = coalesce($2, false)))
          and ($3::boolean is null or (c.archived_at is not null) = $3)
        order by c.name limit 1000`, [i.id ?? null, i.trashed ?? null, i.archived ?? null]);
    },
  }),
  defineOperation({
    // Funnel Mapper's client form: identity fields go to the shared client (Clients rules), its own terms and notes to fmp.client_commercial
    name: 'fmp.clients.update', class: 'write', single: true,
    input: {
      id: ID, name: { type: 'text', min: 1, max: 200 }, business_name: T(200), niche: T(200), email: T(330), phone: T(40), website: T(300), country: T(80), currency: { type: 'currency' },
      status: { type: 'enum', values: ['lead', 'proposal', 'active', 'paused', 'past'] }, tags: { type: 'list', items: 'text', max: 20, itemMax: 40, itemMin: 1 },
      archived: { type: 'bool' }, logo_path: T(400), notes: T(50000),
      monthly_retainer: { type: 'number', min: 0, max: 1e9 }, pricing_model: { type: 'enum', values: ['retainer', 'fixed', 'one_time', 'hourly', 'commission', 'other'] },
      pricing_amount: { type: 'number', min: 0, max: 1e9 }, billing_frequency: { type: 'enum', values: ['one_time', 'weekly', 'monthly', 'quarterly', 'yearly'] },
      hours_per_month: { type: 'number', min: 0, max: 1e6 }, commission_pct: { type: 'number', min: 0, max: 100 }, project_start: { type: 'date' }, project_end: { type: 'date' }, pricing_notes: T(20000),
      clear_project_dates: { type: 'bool' },
    },
    run: async (q, ctx, i) => {
      if (!(await q('select 1 from clients where id = $1', [i.id])).length) return [];
      if (!(await q('select private.has_permission($1, $2, $3) ok', [ctx.orgId, 'fmp.funnel.edit', i.id]))[0]?.ok) return [];
      if (i.name !== undefined) await q('update clients set name = $2 where id = $1', [i.id, i.name]);
      if (i.archived !== undefined) await q(`update clients set archived_at = case when $2 then coalesce(archived_at, now()) else null end where id = $1`, [i.id, i.archived]);
      const prof = ['business_name', 'niche', 'email', 'phone', 'website', 'country', 'currency', 'status', 'tags'].filter((k) => i[k] !== undefined);
      if (prof.length) {
        const val = (k) => (k === 'email' ? (String(i.email).trim().toLowerCase() || null) : k === 'website' ? (/^https?:\/\//.test(i.website) ? i.website : null) : i[k] === '' ? null : i[k]);
        await q(`update client_profiles set ${prof.map((k, n) => `${k} = $${n + 2}`).join(', ')} where client_id = $1`, [i.id, ...prof.map(val)]);
      }
      const x = { ...i, ...(i.clear_project_dates ? { project_start: null, project_end: null } : {}) };
      const comm = ['monthly_retainer', 'pricing_model', 'pricing_amount', 'billing_frequency', 'hours_per_month', 'commission_pct', 'project_start', 'project_end', 'pricing_notes', 'notes', 'logo_path']
        .filter((k) => x[k] !== undefined || (i.clear_project_dates && (k === 'project_start' || k === 'project_end')));
      if (comm.length) {
        await q(`insert into fmp.client_commercial (workspace_id, client_id, ${comm.join(', ')}) values ($1, $2, ${comm.map((_, n) => `$${n + 3}`).join(', ')})
          on conflict (workspace_id, client_id) do update set ${comm.map((k) => `${k} = excluded.${k}`).join(', ')}`, [ctx.orgId, i.id, ...comm.map((k) => x[k] ?? null)]);
      }
      return [{ id: i.id }];
    },
  }),

  // ---------------------------------------------------------------- images (logos, thumbnails, page screenshots) in the ecosystem file storage
  // The browser shrinks images first (WebP, at most 100 KB, Funnel Mapper's rule); these only sign short-lived addresses.
  // Paths: <organization>/fmp/<kind>/<random>.webp, never chosen by the caller.
  defineOperation({
    name: 'fmp.files.upload', class: 'write', single: true,
    input: { kind: { type: 'enum', values: ['logo', 'thumb', 'shot', 'pic'], required: true }, size_bytes: { type: 'int', required: true, min: 1, max: 600000 },
      mime_type: { type: 'enum', values: ['image/webp', 'image/png', 'image/jpeg', 'image/svg+xml', 'image/gif'], required: true }, of: { type: 'text', max: 200 } },
    run: async (q, ctx, i) => {
      if (!ctx.storage) throw { code: 'STORAGE_OFF' };
      if (!(await q('select private.has_permission($1, $2) ok', [ctx.orgId, 'fmp.funnel.edit']))[0]?.ok) return [];
      if (i.kind === 'pic' && !(typeof i.of === 'string' && pathBelongsTo(i.of, ctx.orgId) && i.of.startsWith(`${ctx.orgId}/fmp/shot/`))) return [];
      const ext = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/gif': 'gif' }[i.mime_type];
      // the block's 208 x 256 picture sits next to its capture (Funnel Mapper's lib/shot-path.ts picPath)
      const path = i.kind === 'pic' ? (/\.webp$/.test(i.of) ? i.of.replace(/\.webp$/, '-pic.webp') : `${i.of}-pic.webp`) : `${ctx.orgId}/fmp/${i.kind}/${randomBytes(16).toString('hex')}.${ext}`;
      // registered first: counts toward the shared storage cap (refused when full) and is known to the backup
      await q(`insert into fmp.images (path, workspace_id, kind, size_bytes) values ($1, $2, $3, $4)
        on conflict (path) do update set size_bytes = excluded.size_bytes`, [path, ctx.orgId, i.kind, i.size_bytes]);
      const r = await ctx.storage.signUpload({ path, size: i.size_bytes, contentType: i.mime_type });
      return [{ path, url: r.url, method: r.method ?? 'PUT', headers: r.headers ?? {} }];
    },
  }),
  defineOperation({
    name: 'fmp.files.url', class: 'read', input: { paths: { type: 'list', items: 'text', max: 100, itemMax: 300, itemMin: 1 } },
    run: async (q, ctx, i) => {
      if (!ctx.storage) throw { code: 'STORAGE_OFF' };
      if (!(await q('select private.has_permission($1, $2) ok', [ctx.orgId, 'fmp.funnel.view']))[0]?.ok) return [];
      const out = [];
      for (const path of i.paths ?? []) {
        if (!pathBelongsTo(path, ctx.orgId) || !path.startsWith(`${ctx.orgId}/fmp/`)) continue;   // only this organization's Funnel Mapper images
        out.push({ path, url: (await ctx.storage.signDownload({ path, seconds: 3600 })).url });
      }
      return out;
    },
  }),

  // ---------------------------------------------------------------- Funnel Mapper's trash for clients (the Clients app archive is separate)
  defineOperation({
    name: 'fmp.clients.trash', class: 'write', single: true, input: { client: ID },
    run: async (q, ctx, i) => {
      const at = await q(`insert into fmp.client_commercial (workspace_id, client_id, trashed_at, trashed_by) values ($1, $2, now(), private.current_user_id())
        on conflict (workspace_id, client_id) do update set trashed_at = now(), trashed_by = private.current_user_id() where fmp.client_commercial.trashed_at is null returning client_id, trashed_at`, [ctx.orgId, i.client]);
      if (at.length) await q('update fmp.funnels set trashed_at = $2 where client_id = $1 and trashed_at is null', [i.client, at[0].trashed_at]);
      return at;
    },
  }),
  defineOperation({
    name: 'fmp.clients.restore', class: 'write', single: true, input: { client: ID },
    run: async (q, _c, i) => {
      const [c] = await q('select trashed_at from fmp.client_commercial where client_id = $1 and trashed_at is not null', [i.client]);
      if (!c) return [];
      await q('update fmp.funnels set trashed_at = null where client_id = $1 and trashed_at = $2', [i.client, c.trashed_at]);   // only the funnels trashed with it
      return q('update fmp.client_commercial set trashed_at = null, trashed_by = null where client_id = $1 returning client_id', [i.client]);
    },
  }),
  defineOperation({
    // Delete for good from Funnel Mapper's trash: the client's funnels, products, pricing and notes in Funnel Mapper. The shared client itself
    // stays in the Clients app (no hard delete across apps, V7 03 §3). Owner-only through the row policies (fmp.funnel.delete).
    name: 'fmp.clients.purge', class: 'sensitive', input: { client: { type: 'uuid' } },
    run: async (q, _c, i) => {
      const cs = await q('select client_id from fmp.client_commercial where trashed_at is not null and ($1::uuid is null or client_id = $1)', [i.client ?? null]);
      const out = [];
      for (const { client_id: c } of cs) {
        await q('delete from fmp.funnels where client_id = $1 and trashed_at is not null', [c]);
        if ((await q('select 1 from fmp.funnels where client_id = $1 limit 1', [c])).length) continue;   // something could not be deleted: keep the rest
        await q('delete from fmp.products where client_id = $1', [c]);
        out.push(...await q('delete from fmp.client_commercial where client_id = $1 and trashed_at is not null returning client_id', [c]));
      }
      return out;
    },
  }),
  defineOperation({
    name: 'fmp.clients.trashed', class: 'read', input: {},
    run: (q) => q('select c.id, c.name, cc.trashed_at from fmp.client_commercial cc join clients c on c.id = cc.client_id where cc.trashed_at is not null order by cc.trashed_at desc'),
  }),
];

/** Public share-link operations (no sign-in). The token is checked by hash inside the database; anything else answers "not found". */
export const fmpPublic = {
  get: (q, token) => q('select private.fmp_shared_get($1) as data', [token]),
  save: (q, token, graph, settings) => q('select private.fmp_shared_save($1, $2::jsonb, $3::jsonb) as ok', [token, JSON.stringify(graph), settings == null ? null : JSON.stringify(settings)]),
  comment: (q, token, node, author, body) => q('select private.fmp_shared_comment($1, $2, $3, $4) as id', [token, node ?? null, author ?? '', body]),
};
