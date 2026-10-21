// Office → Funnels API operations (records live in the ecosystem database, migration 0006; nothing here touches Funnel Mapper Pro).
// One spec per record type generates list / get / create / update / archive / restore / share / delete, so the four stay identical.
// Column names come from these constants only, never from the request, so the generated SQL is not injectable.
// Permissions are NOT checked here: row policies and triggers in the database decide, and a refusal looks like "not found".
import { defineOperation } from './define.mjs';

const T = (max = 8000) => ({ type: 'text', min: 0, max });
export const FUNNEL_TYPES = Object.freeze({
  avatars: {
    table: 'funnel_avatars', one: 'avatar', order: 'name',
    fields: { name: { type: 'text', required: true, max: 200 }, summary: T(4000), pains: T(), desires: T(), objections: T() },
  },
  offers: {
    table: 'funnel_offers', one: 'offer', order: 'name',
    fields: {
      kind: { type: 'enum', values: ['offer', 'product'] }, name: { type: 'text', required: true, max: 200 }, promise: T(4000), description: T(),
      price_amount: { type: 'number' }, currency: { type: 'currency' }, avatar_id: { type: 'uuid' },
    },
  },
  stories: {
    table: 'funnel_stories', one: 'story', order: 'title',
    fields: {
      kind: { type: 'enum', values: ['origin', 'case_study', 'testimonial', 'analogy', 'other'] }, title: { type: 'text', required: true, max: 200 },
      body: T(20000), avatar_id: { type: 'uuid' }, offer_id: { type: 'uuid' },
    },
  },
  brand_kits: {
    table: 'funnel_brand_kits', one: 'brand kit', order: 'name',
    fields: {
      name: { type: 'text', required: true, max: 200 }, voice: T(), colors: { type: 'list', items: 'hex', max: 24 },
      fonts: { type: 'list', items: 'text', max: 12, itemMax: 100 }, logo_file_id: { type: 'uuid' }, notes: T(),
    },
  },
});
const JSON_COLS = new Set(['colors', 'fonts']);
const val = (col, v) => (JSON_COLS.has(col) ? JSON.stringify(v) : v);

const makeOps = (plural, { table, order, fields }) => {
  const cols = Object.keys(fields);
  const optional = Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, { ...f, required: false }]));
  const name = (a) => `funnels.${plural}.${a}`;
  return [
    defineOperation({
      name: name('list'), class: 'read', input: { client: { type: 'uuid' }, archived: { type: 'bool' } },
      run: (q, _c, i) => q(`select * from ${table} where ($1::uuid is null or client_id = $1) and (archived_at is not null) = $2 order by ${order} limit 200`, [i.client ?? null, i.archived ?? false]),
    }),
    defineOperation({ name: name('get'), single: true, class: 'read', input: { id: { type: 'uuid', required: true } }, run: (q, _c, i) => q(`select * from ${table} where id = $1`, [i.id]) }),
    defineOperation({
      name: name('create'), single: true, class: 'write', input: { ...fields, client: { type: 'uuid' } },
      run: (q, ctx, i) => {
        const used = cols.filter((c) => i[c] !== undefined);
        return q(`insert into ${table} (workspace_id, client_id${used.map((c) => `, ${c}`).join('')}) values ($1, $2${used.map((_, n) => `, $${n + 3}`).join('')}) returning *`,
          [ctx.orgId, i.client ?? null, ...used.map((c) => val(c, i[c]))]);
      },
    }),
    defineOperation({
      name: name('update'), single: true, class: 'write', input: { id: { type: 'uuid', required: true }, ...optional },
      run: (q, _c, i) => {
        const used = cols.filter((c) => i[c] !== undefined);
        if (!used.length) return q(`select * from ${table} where id = $1`, [i.id]);
        return q(`update ${table} set ${used.map((c, n) => `${c} = $${n + 2}`).join(', ')} where id = $1 returning *`, [i.id, ...used.map((c) => val(c, i[c]))]);
      },
    }),
    defineOperation({ name: name('archive'), single: true, class: 'write', input: { id: { type: 'uuid', required: true } }, run: (q, _c, i) => q(`update ${table} set archived_at = now() where id = $1 and archived_at is null returning *`, [i.id]) }),
    defineOperation({ name: name('restore'), single: true, class: 'write', input: { id: { type: 'uuid', required: true } }, run: (q, _c, i) => q(`update ${table} set archived_at = null where id = $1 and archived_at is not null returning *`, [i.id]) }),
    defineOperation({ name: name('share'), single: true, class: 'write', input: { id: { type: 'uuid', required: true }, visible: { type: 'bool', required: true } }, run: (q, _c, i) => q(`update ${table} set client_visible = $2 where id = $1 returning *`, [i.id, i.visible]) }),
    defineOperation({ name: name('delete'), single: true, class: 'write', input: { id: { type: 'uuid', required: true } }, run: (q, _c, i) => q(`delete from ${table} where id = $1 returning id`, [i.id]) }),
  ];
};

const REF_TARGETS = { avatar: 'avatar_id', offer: 'offer_id', story: 'story_id', brand_kit: 'brand_kit_id' };
const refOps = [
  defineOperation({
    name: 'funnels.references.list', class: 'read',
    input: { referrer_app: { type: 'enum', values: ['clients', 'value_ladder'] }, referrer_id: { type: 'uuid' }, client: { type: 'uuid' } },
    run: (q, _c, i) => q('select * from funnel_references where ($1::text is null or referrer_app = $1) and ($2::uuid is null or referrer_id = $2) and ($3::uuid is null or client_id = $3) order by created_at desc limit 200', [i.referrer_app ?? null, i.referrer_id ?? null, i.client ?? null]),
  }),
  defineOperation({
    name: 'funnels.references.link', single: true, class: 'write',
    input: {
      referrer_app: { type: 'enum', values: ['clients', 'value_ladder'], required: true }, referrer_type: { type: 'text', required: true, max: 40 }, referrer_id: { type: 'uuid', required: true },
      target_type: { type: 'enum', values: Object.keys(REF_TARGETS), required: true }, target_id: { type: 'uuid', required: true }, client: { type: 'uuid' },
    },
    run: (q, ctx, i) => q(`insert into funnel_references (workspace_id, client_id, referrer_app, referrer_type, referrer_id, ${REF_TARGETS[i.target_type]}) values ($1,$2,$3,$4,$5,$6) returning *`,
      [ctx.orgId, i.client ?? null, i.referrer_app, i.referrer_type, i.referrer_id, i.target_id]),
  }),
  defineOperation({ name: 'funnels.references.unlink', single: true, class: 'write', input: { id: { type: 'uuid', required: true } }, run: (q, _c, i) => q('delete from funnel_references where id = $1 returning id', [i.id]) }),
];

// Funnels home: how many live records of each type this person can see (rows hidden by policy are simply not counted).
const overview = defineOperation({
  name: 'funnels.overview', class: 'read',
  run: (q) => q(`select 'avatars' as type, count(*)::int as n from funnel_avatars where archived_at is null
    union all select 'offers', count(*)::int from funnel_offers where archived_at is null
    union all select 'stories', count(*)::int from funnel_stories where archived_at is null
    union all select 'brand_kits', count(*)::int from funnel_brand_kits where archived_at is null`),
});

export const funnelOperations = [overview, ...Object.entries(FUNNEL_TYPES).flatMap(([plural, spec]) => makeOps(plural, spec)), ...refOps];
