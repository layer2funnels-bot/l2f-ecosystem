// Clients app API operations (migration 0008). Data and API only: screens wait for approved designs.
// Same conventions as funnel-operations.mjs: column names are constants (never from the request), permissions are decided by
// row policies and triggers in the database, and a refusal reads as "not found".
import { defineOperation } from './define.mjs';

const T = (max = 8000) => ({ type: 'text', min: 0, max });
const PROFILE = {
  business_name: T(200), niche: T(200), email: { type: 'email' }, phone: T(40), website: T(300), country: T(80), currency: { type: 'currency' },
  status: { type: 'enum', values: ['lead', 'proposal', 'active', 'paused', 'past'] }, tags: { type: 'list', items: 'text', max: 20, itemMax: 40, itemMin: 1 },
};
const PROFILE_COLS = Object.keys(PROFILE);
const like = (q) => `%${String(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const SELECT = `select c.id, c.name, c.archived_at, c.created_at, p.business_name, p.niche, p.email, p.phone, p.website, p.country, p.currency, p.status, p.stage_key, p.tags
  from clients c left join client_profiles p on p.client_id = c.id`;

const setProfile = (q, id, i) => {
  const used = PROFILE_COLS.filter((c) => i[c] !== undefined);
  if (i.stage !== undefined) used.push('stage_key');
  if (!used.length) return Promise.resolve([]);
  return q(`update client_profiles set ${used.map((c, n) => `${c} = $${n + 2}`).join(', ')} where client_id = $1 returning client_id`,
    [id, ...used.map((c) => (c === 'stage_key' ? i.stage : i[c]))]);
};
const getOne = (q, id) => q(`${SELECT} where c.id = $1`, [id]);

const clientOps = [
  defineOperation({
    name: 'clients.list', class: 'read',
    input: { archived: { type: 'bool' }, status: PROFILE.status, stage: { type: 'text', max: 31 }, q: { type: 'text', max: 100 } },
    run: (q, _c, i) => q(`${SELECT} where ((c.archived_at is not null) = $1) and ($2::text is null or p.status = $2) and ($3::text is null or p.stage_key = $3)
      and ($4::text is null or c.name ilike $4 or p.business_name ilike $4) order by c.name limit 200`, [i.archived ?? false, i.status ?? null, i.stage ?? null, i.q ? like(i.q) : null]),
  }),
  defineOperation({ name: 'clients.get', class: 'read', single: true, input: { id: { type: 'uuid', required: true } }, run: (q, _c, i) => getOne(q, i.id) }),
  defineOperation({
    name: 'clients.create', class: 'write', single: true, input: { name: { type: 'text', required: true, max: 200 }, ...PROFILE, stage: { type: 'text', max: 31 } },
    run: async (q, ctx, i) => {
      const [c] = await q('insert into clients (workspace_id, name) values ($1, $2) returning id', [ctx.orgId, i.name]);
      await setProfile(q, c.id, i);
      return getOne(q, c.id);
    },
  }),
  defineOperation({
    name: 'clients.update', class: 'write', single: true, input: { id: { type: 'uuid', required: true }, name: { type: 'text', max: 200 }, ...PROFILE, stage: { type: 'text', max: 31 } },
    run: async (q, _c, i) => {
      if (i.name !== undefined && !(await q('update clients set name = $2 where id = $1 returning id', [i.id, i.name])).length) return [];
      if (!(await getOne(q, i.id)).length) return [];
      await setProfile(q, i.id, i);
      return getOne(q, i.id);
    },
  }),
  defineOperation({
    // moves a client to another stage (null clears it)
    name: 'clients.stage.set', class: 'write', single: true, input: { id: { type: 'uuid', required: true }, stage: { type: 'text', max: 31 } },
    run: async (q, _c, i) => (await q('update client_profiles set stage_key = $2 where client_id = $1 returning client_id', [i.id, i.stage ?? null])).length ? getOne(q, i.id) : [],
  }),
  defineOperation({ name: 'clients.archive', class: 'write', single: true, input: { id: { type: 'uuid', required: true } }, run: (q, _c, i) => q('update clients set archived_at = now() where id = $1 and archived_at is null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'clients.restore', class: 'write', single: true, input: { id: { type: 'uuid', required: true } }, run: (q, _c, i) => q('update clients set archived_at = null where id = $1 and archived_at is not null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'clients.delete', class: 'write', single: true, input: { id: { type: 'uuid', required: true } }, run: (q, _c, i) => q('delete from clients where id = $1 returning id', [i.id]) }),
];

const stageOps = [
  defineOperation({ name: 'clients.stages.list', class: 'read', run: (q) => q('select key, label, position, progress_only from client_stages order by position, key') }),
  defineOperation({
    name: 'clients.stages.create', class: 'write', single: true,
    input: { key: { type: 'text', required: true, max: 31 }, label: { type: 'text', required: true, max: 60 }, position: { type: 'int', required: true, min: 0, max: 100 }, progress_only: { type: 'bool' } },
    run: (q, ctx, i) => q('insert into client_stages (workspace_id, key, label, position, progress_only) values ($1,$2,$3,$4,$5) returning key, label, position, progress_only', [ctx.orgId, i.key, i.label, i.position, i.progress_only ?? false]),
  }),
  defineOperation({
    name: 'clients.stages.update', class: 'write', single: true,
    input: { key: { type: 'text', required: true, max: 31 }, label: { type: 'text', max: 60 }, position: { type: 'int', min: 0, max: 100 }, progress_only: { type: 'bool' } },
    run: (q, _c, i) => q('update client_stages set label = coalesce($2, label), position = coalesce($3, position), progress_only = coalesce($4, progress_only) where key = $1 returning key, label, position, progress_only', [i.key, i.label ?? null, i.position ?? null, i.progress_only ?? null]),
  }),
  defineOperation({ name: 'clients.stages.delete', class: 'write', single: true, input: { key: { type: 'text', required: true, max: 31 } }, run: (q, _c, i) => q('delete from client_stages where key = $1 returning key', [i.key]) }),
];

// ---- child records: team notes (internal only), requests and updates (shareable with the client)
const CHILD = {
  notes: { table: 'client_notes', fields: { body: { type: 'text', required: true, max: 20000 } }, share: false },
  requests: {
    table: 'client_requests', share: true,
    fields: { kind: { type: 'enum', values: ['info', 'approval'] }, title: { type: 'text', required: true, max: 200 }, body: T(8000), status: { type: 'enum', values: ['open', 'answered', 'closed'] }, response: T(8000), due_on: { type: 'date' } },
  },
  updates: { table: 'client_updates', share: true, fields: { title: { type: 'text', required: true, max: 200 }, body: T(20000) } },
};
const childOps = Object.entries(CHILD).flatMap(([plural, { table, fields, share }]) => {
  const cols = Object.keys(fields); const name = (a) => `clients.${plural}.${a}`;
  const optional = Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, { ...f, required: false }]));
  const idIn = { id: { type: 'uuid', required: true } };
  return [
    defineOperation({
      name: name('list'), class: 'read', input: { client: { type: 'uuid', required: true }, archived: { type: 'bool' } },
      run: (q, _c, i) => q(`select * from ${table} where client_id = $1 and (archived_at is not null) = $2 order by created_at desc limit 200`, [i.client, i.archived ?? false]),
    }),
    defineOperation({ name: name('get'), class: 'read', single: true, input: idIn, run: (q, _c, i) => q(`select * from ${table} where id = $1`, [i.id]) }),
    defineOperation({
      name: name('create'), class: 'write', single: true, input: { client: { type: 'uuid', required: true }, ...fields },
      run: (q, ctx, i) => {
        const used = cols.filter((c) => i[c] !== undefined);
        return q(`insert into ${table} (workspace_id, client_id${used.map((c) => `, ${c}`).join('')}) values ($1, $2${used.map((_, n) => `, $${n + 3}`).join('')}) returning *`, [ctx.orgId, i.client, ...used.map((c) => i[c])]);
      },
    }),
    defineOperation({
      name: name('update'), class: 'write', single: true, input: { ...idIn, ...optional },
      run: (q, _c, i) => {
        const used = cols.filter((c) => i[c] !== undefined);
        if (!used.length) return q(`select * from ${table} where id = $1`, [i.id]);
        return q(`update ${table} set ${used.map((c, n) => `${c} = $${n + 2}`).join(', ')} where id = $1 returning *`, [i.id, ...used.map((c) => i[c])]);
      },
    }),
    defineOperation({ name: name('archive'), class: 'write', single: true, input: idIn, run: (q, _c, i) => q(`update ${table} set archived_at = now() where id = $1 and archived_at is null returning *`, [i.id]) }),
    defineOperation({ name: name('restore'), class: 'write', single: true, input: idIn, run: (q, _c, i) => q(`update ${table} set archived_at = null where id = $1 and archived_at is not null returning *`, [i.id]) }),
    ...(share ? [defineOperation({ name: name('share'), class: 'write', single: true, input: { ...idIn, visible: { type: 'bool', required: true } }, run: (q, _c, i) => q(`update ${table} set client_visible = $2 where id = $1 returning *`, [i.id, i.visible]) })] : []),
    defineOperation({ name: name('delete'), class: 'write', single: true, input: idIn, run: (q, _c, i) => q(`delete from ${table} where id = $1 returning id`, [i.id]) }),
  ];
});

// ---- Strategy copies (migration 0027, V4-1): a client's own copy of a library avatar, offer, story or brand kit, started once, never synced.
// The copy is a normal Funnels record owned by the client; fields that point at other library records (avatar_id, offer_id) are left empty on purpose.
const COPY = {
  avatars: { table: 'funnel_avatars', cols: 'name, summary, pains, desires, objections', label: 'name' },
  offers: { table: 'funnel_offers', cols: 'kind, name, promise, description, price_amount, currency', label: 'name' },
  stories: { table: 'funnel_stories', cols: 'kind, title, body', label: 'title' },
  brand_kits: { table: 'funnel_brand_kits', cols: 'name, voice, colors, fonts, logo_file_id, notes', label: 'name' },
  strategies: { table: 'funnel_strategies', label: 'name' },       // copied with its document (see below)
};
const strategyOps = [
  defineOperation({
    name: 'clients.strategy.list', class: 'read', input: { client: { type: 'uuid', required: true } },
    run: (q, _c, i) => q(`select k.id, k.kind, k.source_id, k.copy_id, k.created_at,
        case k.kind ${Object.entries(COPY).map(([kind, c]) => `when '${kind}' then (select x.${c.label} from ${c.table} x where x.id = k.copy_id)`).join(' ')} end as copy_name,
        case k.kind ${Object.entries(COPY).map(([kind, c]) => `when '${kind}' then (select x.${c.label} from ${c.table} x where x.id = k.source_id)`).join(' ')} end as source_name
      from client_strategy_copies k where k.client_id = $1 order by k.created_at desc limit 200`, [i.client]),
  }),
  defineOperation({
    name: 'clients.strategy.copy', class: 'write', single: true,
    input: { client: { type: 'uuid', required: true }, kind: { type: 'enum', values: Object.keys(COPY), required: true }, source: { type: 'uuid', required: true } },
    run: async (q, ctx, i) => {
      const c = COPY[i.kind];
      if (i.kind === 'strategies') {   // the strategy row and its Drive document are copied together; the document lands in the client's own space
        const [src] = await q('select s.id, s.name, s.file_id from funnel_strategies s where s.id = $1 and s.client_id is null and s.archived_at is null', [i.source]);
        if (!src) return [];
        const [file] = await q(`insert into files (workspace_id, space, client_id, name, kind, mime_type, size_bytes, uploaded_by, managed_by)
          select f.workspace_id, 'client', $2, f.name, 'document', f.mime_type, f.size_bytes, $3, 'funnels' from files f where f.id = $1 returning id`, [src.file_id, i.client, ctx.userId]);
        await q(`insert into file_versions (workspace_id, file_id, body, size_bytes, note) select v.workspace_id, $2, v.body, v.size_bytes, 'Copied from the organization library' from file_versions v
          join files f on f.id = v.file_id and f.current_version = v.version where v.file_id = $1`, [src.file_id, file.id]);
        const [copy] = await q('insert into funnel_strategies (workspace_id, client_id, name, file_id) values ($1,$2,$3,$4) returning id', [ctx.orgId, i.client, src.name, file.id]);
        return q('insert into client_strategy_copies (workspace_id, client_id, kind, source_id, copy_id) values ($1,$2,$3,$4,$5) returning id, kind, source_id, copy_id, created_at', [ctx.orgId, i.client, i.kind, i.source, copy.id]);
      }
      const [made] = await q(`insert into ${c.table} (workspace_id, client_id, ${c.cols}) select workspace_id, $2, ${c.cols} from ${c.table} where id = $1 and client_id is null and archived_at is null returning id`, [i.source, i.client]);
      if (!made) return [];
      return q('insert into client_strategy_copies (workspace_id, client_id, kind, source_id, copy_id) values ($1,$2,$3,$4,$5) returning id, kind, source_id, copy_id, created_at', [ctx.orgId, i.client, i.kind, i.source, made.id]);
    },
  }),
];

export const clientsOperations = [...clientOps, ...stageOps, ...childOps, ...strategyOps];
