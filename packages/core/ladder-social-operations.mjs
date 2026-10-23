// Value Ladder (0020) and Social Planner (0021) API. Same conventions as the other operation files: named columns, permissions decided by row
// policies and triggers in the database, a refusal reads as "not found". Data and API only; internal (no client-facing path).
import { defineOperation } from './define.mjs';

const T = (max = 4000) => ({ type: 'text', min: 0, max });
const id = { id: { type: 'uuid', required: true } };
const like = (q) => `%${String(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// ------------------------------------------------------------------ value ladder
const STAGES = ['lead_magnet', 'tripwire', 'core', 'upsell', 'downsell', 'continuity', 'premium'];
const RUNG = `select r.id, r.ladder_id, r.position, r.stage, r.name, r.description, r.offer_id, o.name as offer_name,
    coalesce(o.price_amount, r.price_amount)::float8 as price_amount, coalesce(o.currency, r.currency) as currency, o.archived_at as offer_archived_at,
    r.audience, r.conversion_pct::float8 as conversion_pct, r.assumption_notes, r.owner_id, r.archived_at
  from value_ladder_rungs r left join funnel_offers o on o.workspace_id = r.workspace_id and o.id = r.offer_id`;
const LADDER = `select l.id, l.client_id, l.name, l.description, l.status, l.archived_at, l.created_at, l.updated_at,
    (select count(*)::int from value_ladder_rungs r where r.ladder_id = l.id and r.archived_at is null) as rungs from value_ladders l`;
const RUNG_IN = { stage: { type: 'enum', values: STAGES }, name: { type: 'text', max: 200 }, description: T(), offer: { type: 'uuid' }, price_amount: { type: 'number', min: 0, max: 1e9 }, currency: { type: 'currency' },
  audience: T(500), conversion_pct: { type: 'number', min: 0, max: 100 }, assumption_notes: T(2000), owner: { type: 'uuid' } };

export const ladderOperations = [
  defineOperation({
    name: 'valueladder.list', class: 'read', input: { client: { type: 'uuid' }, archived: { type: 'bool' }, q: { type: 'text', max: 100 } },
    run: (q, _c, i) => q(`${LADDER} where ($1::uuid is null or l.client_id = $1) and ((l.archived_at is not null) = $2) and ($3::text is null or l.name ilike $3) order by l.name limit 200`,
      [i.client ?? null, i.archived ?? false, i.q ? like(i.q) : null]),
  }),
  defineOperation({
    // the ladder with its rungs in order, and what it adds up to per currency (never mixing currencies)
    name: 'valueladder.get', class: 'read', single: true, input: id,
    run: (q, _c, i) => q(`select l.*, coalesce((select json_agg(x order by x.position) from (${RUNG} where r.ladder_id = l.id and r.archived_at is null) x), '[]'::json) as rung_list,
      coalesce((select json_agg(json_build_object('currency', s.currency, 'total', s.total, 'rungs', s.n)) from (select coalesce(o.currency, r.currency) as currency, sum(coalesce(o.price_amount, r.price_amount))::float8 as total, count(*)::int as n
        from value_ladder_rungs r left join funnel_offers o on o.workspace_id = r.workspace_id and o.id = r.offer_id where r.ladder_id = l.id and r.archived_at is null and coalesce(o.currency, r.currency) is not null group by 1) s), '[]'::json) as totals
      from (${LADDER} where l.id = $1) l`, [i.id]),
  }),
  defineOperation({
    name: 'valueladder.create', class: 'write', single: true, input: { name: { type: 'text', required: true, max: 200 }, description: T(), client: { type: 'uuid' } },
    run: async (q, ctx, i) => {
      const [r] = await q('insert into value_ladders (workspace_id, name, description, client_id) values ($1, $2, $3, $4) returning id', [ctx.orgId, i.name, i.description ?? null, i.client ?? null]);
      return q(`${LADDER} where l.id = $1`, [r.id]);
    },
  }),
  defineOperation({
    name: 'valueladder.update', class: 'write', single: true, input: { ...id, name: { type: 'text', max: 200 }, description: T(), status: { type: 'enum', values: ['draft', 'approved'] } },
    run: async (q, _c, i) => {
      if (!(await q('update value_ladders set name = coalesce($2, name), description = coalesce($3, description), status = coalesce($4, status) where id = $1 and archived_at is null returning id', [i.id, i.name ?? null, i.description ?? null, i.status ?? null])).length) return [];
      return q(`${LADDER} where l.id = $1`, [i.id]);
    },
  }),
  defineOperation({ name: 'valueladder.archive', class: 'write', single: true, input: id, run: (q, _c, i) => q('update value_ladders set archived_at = now() where id = $1 and archived_at is null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'valueladder.restore', class: 'write', single: true, input: id, run: (q, _c, i) => q('update value_ladders set archived_at = null where id = $1 and archived_at is not null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'valueladder.delete', class: 'write', single: true, input: id, run: (q, _c, i) => q('delete from value_ladders where id = $1 returning id', [i.id]) }),
  defineOperation({
    name: 'valueladder.rungs.add', class: 'write', single: true, input: { ladder: { type: 'uuid', required: true }, ...RUNG_IN, stage: { ...RUNG_IN.stage, required: true }, name: { ...RUNG_IN.name, required: true } },
    run: async (q, ctx, i) => {
      const [r] = await q('insert into value_ladder_rungs (workspace_id, ladder_id, stage, name, description, offer_id, price_amount, currency, audience, conversion_pct, assumption_notes, owner_id) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id',
        [ctx.orgId, i.ladder, i.stage, i.name, i.description ?? null, i.offer ?? null, i.price_amount ?? null, i.currency ?? null, i.audience || null, i.conversion_pct ?? null, i.assumption_notes || null, i.owner ?? null]);
      return q(`${RUNG} where r.id = $1`, [r.id]);
    },
  }),
  defineOperation({
    name: 'valueladder.rungs.update', class: 'write', single: true, input: { ...id, ...RUNG_IN, clear_offer: { type: 'bool' }, clear_price: { type: 'bool' }, clear_conversion: { type: 'bool' }, clear_owner: { type: 'bool' } },
    run: async (q, _c, i) => {
      const sets = []; const p = [i.id];
      const add = (col, v) => { p.push(v); sets.push(`${col} = $${p.length}`); };
      for (const [k, col] of [['stage', 'stage'], ['name', 'name'], ['description', 'description'], ['offer', 'offer_id'], ['price_amount', 'price_amount'], ['currency', 'currency'], ['conversion_pct', 'conversion_pct'], ['owner', 'owner_id']]) if (i[k] !== undefined) add(col, i[k]);
      for (const [k, col] of [['audience', 'audience'], ['assumption_notes', 'assumption_notes']]) if (i[k] !== undefined) add(col, i[k] === '' ? null : i[k]);   // an empty text clears it
      if (i.clear_offer) sets.push('offer_id = null');
      if (i.clear_price) sets.push('price_amount = null', 'currency = null');
      if (i.clear_conversion) sets.push('conversion_pct = null');
      if (i.clear_owner) sets.push('owner_id = null');
      if (sets.length && !(await q(`update value_ladder_rungs set ${sets.join(', ')} where id = $1 and archived_at is null returning id`, p)).length) return [];
      return q(`${RUNG} where r.id = $1`, [i.id]);
    },
  }),
  defineOperation({
    // the new order is the list of ALL active rung ids of the ladder, first to last; the database keeps positions unique
    name: 'valueladder.rungs.reorder', class: 'write', input: { ladder: { type: 'uuid', required: true }, order: { type: 'list', items: 'uuid', required: true, max: 12 } },
    run: async (q, _c, i) => {
      const cur = await q('select id from value_ladder_rungs where ladder_id = $1 and archived_at is null', [i.ladder]);
      if (cur.length !== i.order.length || new Set(i.order).size !== i.order.length || !cur.every((r) => i.order.includes(r.id))) throw { code: 'P0001' };
      for (let n = 0; n < i.order.length; n += 1) await q('update value_ladder_rungs set position = $2 where id = $1 and ladder_id = $3', [i.order[n], n + 1, i.ladder]);
      return q(`${RUNG} where r.ladder_id = $1 and r.archived_at is null order by r.position`, [i.ladder]);
    },
  }),
  defineOperation({ name: 'valueladder.rungs.archive', class: 'write', single: true, input: id, run: (q, _c, i) => q('update value_ladder_rungs set archived_at = now() where id = $1 and archived_at is null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'valueladder.rungs.restore', class: 'write', single: true, input: id, run: (q, _c, i) => q('update value_ladder_rungs set archived_at = null, position = null where id = $1 and archived_at is not null returning id, position', [i.id]) }),
  defineOperation({ name: 'valueladder.rungs.delete', class: 'write', single: true, input: id, run: (q, _c, i) => q('delete from value_ladder_rungs where id = $1 returning id', [i.id]) }),
];


// A copy of a ladder with all its active rungs, optionally for a client (a client-specific copy, V4-1). Rungs keep pointing at the same offers (references).
export async function duplicateLadder(q, ctx, sourceId, clientId, name) {
  const [src] = await q('select l.name, l.description from value_ladders l where l.id = $1 and l.archived_at is null', [sourceId]);
  if (!src) return null;
  const [r] = await q('insert into value_ladders (workspace_id, name, description, client_id) values ($1, $2, $3, $4) returning id', [ctx.orgId, name ?? src.name, src.description, clientId ?? null]);
  const rungs = await q('select stage, name, description, offer_id, price_amount, currency, audience, conversion_pct, assumption_notes from value_ladder_rungs where ladder_id = $1 and archived_at is null order by position', [sourceId]);
  for (const g of rungs) await q('insert into value_ladder_rungs (workspace_id, ladder_id, stage, name, description, offer_id, price_amount, currency, audience, conversion_pct, assumption_notes) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [ctx.orgId, r.id, g.stage, g.name, g.description, g.offer_id, g.price_amount, g.currency, g.audience, g.conversion_pct, g.assumption_notes]);
  return r.id;
}
const SNAP_RUNGS = `coalesce((select json_agg(json_build_object('id', x.id, 'stage', x.stage, 'name', x.name, 'description', x.description, 'offer_id', x.offer_id, 'offer_name', x.offer_name, 'price_amount', x.price_amount, 'currency', x.currency, 'audience', x.audience, 'conversion_pct', x.conversion_pct, 'assumption_notes', x.assumption_notes) order by x.position)
  from (${RUNG} where r.ladder_id = $1 and r.archived_at is null) x), '[]'::json)`;
ladderOperations.push(
  defineOperation({
    name: 'valueladder.duplicate', class: 'write', single: true, input: { ...id, name: { type: 'text', max: 200 }, client: { type: 'uuid' } },
    run: async (q, ctx, i) => { const nid = await duplicateLadder(q, ctx, i.id, i.client, i.name ?? null); return nid ? q(`${LADDER} where l.id = $1`, [nid]) : []; },
  }),
  defineOperation({
    // a snapshot of the ladder as it is now (name, status and every active step with the offer's name and price at that moment)
    name: 'valueladder.versions.save', class: 'write', single: true, input: { ladder: { type: 'uuid', required: true }, note: T(300) },
    run: async (q, ctx, i) => {
      const [l] = await q('select l.name, l.description, l.status from value_ladders l where l.id = $1 and l.archived_at is null', [i.ladder]);
      if (!l) return [];
      const [r] = await q(`insert into value_ladder_versions (workspace_id, ladder_id, name, description, status, rungs, note) select $2, $1, $3, $4, $5, ${SNAP_RUNGS}, $6 returning ladder_id, version, name, status, note, created_at`, [i.ladder, ctx.orgId, l.name, l.description, l.status, i.note || null]);
      return [r];
    },
  }),
  defineOperation({
    name: 'valueladder.versions.list', class: 'read', input: { ladder: { type: 'uuid', required: true } },
    run: (q, _c, i) => q('select v.version, v.name, v.status, v.note, jsonb_array_length(v.rungs)::int as rungs, v.created_by, v.created_at from value_ladder_versions v where v.ladder_id = $1 order by v.version desc limit 200', [i.ladder]),
  }),
  defineOperation({
    name: 'valueladder.versions.get', class: 'read', single: true, input: { ladder: { type: 'uuid', required: true }, version: { type: 'int', required: true, min: 1 } },
    run: (q, _c, i) => q('select v.version, v.name, v.description, v.status, v.rungs, v.note, v.created_at from value_ladder_versions v where v.ladder_id = $1 and v.version = $2', [i.ladder, i.version]),
  }),
);

// ------------------------------------------------------------------ social planner
const CHANNELS = ['facebook', 'instagram', 'linkedin', 'x', 'tiktok', 'youtube', 'pinterest', 'email', 'other'];
const POST_STATUS = ['idea', 'draft', 'in_review', 'approved', 'scheduled', 'published', 'failed', 'cancelled'];
const CAMPAIGN_STATUS = ['draft', 'planned', 'active', 'paused', 'completed'];
const POST = `select p.id, p.client_id, p.channel, p.title, p.caption, p.scheduled_for, p.status, p.published_at, p.archived_at, p.created_at, p.updated_at, p.campaign_id, p.variant_of, p.failure_reason, p.published_by, p.post_url,
    coalesce((select json_agg(f.file_id order by f.position, f.created_at) from social_post_files f where f.post_id = p.id), '[]'::json) as files from social_posts p`;
const CAMPAIGN = `select c.id, c.client_id, c.name, c.goal, c.status, c.starts_on, c.ends_on, c.owner_id, c.archived_at, c.created_at, c.updated_at,
    (select count(*)::int from social_posts p where p.campaign_id = c.id and p.archived_at is null) as posts,
    (select count(*)::int from social_posts p where p.campaign_id = c.id and p.archived_at is null and p.status = 'published') as published,
    (select count(*)::int from social_posts p where p.campaign_id = c.id and p.archived_at is null and p.status = 'scheduled') as scheduled,
    (select count(*)::int from social_posts p where p.campaign_id = c.id and p.archived_at is null and p.status = 'failed') as failed,
    (select count(*)::int from social_posts p where p.campaign_id = c.id and p.archived_at is null and p.status = 'cancelled') as cancelled from social_campaigns c`;
const PIN = { channel: { type: 'enum', values: CHANNELS }, title: { type: 'text', max: 200 }, caption: T(5000), scheduled_for: { type: 'timestamp' } };

export const socialOperations = [
  defineOperation({
    name: 'social.posts.list', class: 'read',
    input: { client: { type: 'uuid' }, channel: PIN.channel, status: { type: 'enum', values: POST_STATUS }, archived: { type: 'bool' }, q: { type: 'text', max: 100 }, campaign: { type: 'uuid' } },
    run: (q, _c, i) => q(`${POST} where ($1::uuid is null or p.client_id = $1) and ($2::text is null or p.channel = $2) and ($3::text is null or p.status = $3) and ((p.archived_at is not null) = $4)
      and ($5::text is null or p.title ilike $5) and ($6::uuid is null or p.campaign_id = $6) order by p.scheduled_for nulls last, p.created_at desc limit 300`, [i.client ?? null, i.channel ?? null, i.status ?? null, i.archived ?? false, i.q ? like(i.q) : null, i.campaign ?? null]),
  }),
  defineOperation({
    // the calendar: posts planned between two dates (inclusive), by planned time
    name: 'social.calendar', class: 'read', input: { from: { type: 'date', required: true }, to: { type: 'date', required: true }, client: { type: 'uuid' }, channel: PIN.channel },
    run: (q, _c, i) => q(`${POST} where p.archived_at is null and p.scheduled_for >= $1::date and p.scheduled_for < ($2::date + 1) and ($3::uuid is null or p.client_id = $3) and ($4::text is null or p.channel = $4)
      order by p.scheduled_for limit 500`, [i.from, i.to, i.client ?? null, i.channel ?? null]),
  }),
  defineOperation({ name: 'social.posts.get', class: 'read', single: true, input: id, run: (q, _c, i) => q(`${POST} where p.id = $1`, [i.id]) }),
  defineOperation({
    name: 'social.posts.create', class: 'write', single: true,
    input: { channel: { ...PIN.channel, required: true }, title: { ...PIN.title, required: true }, caption: PIN.caption, scheduled_for: PIN.scheduled_for, client: { type: 'uuid' }, campaign: { type: 'uuid' }, status: { type: 'enum', values: ['idea', 'draft'] } },
    run: async (q, ctx, i) => {
      const [r] = await q('insert into social_posts (workspace_id, channel, title, caption, scheduled_for, client_id, status, campaign_id) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id',
        [ctx.orgId, i.channel, i.title, i.caption ?? null, i.scheduled_for ?? null, i.client ?? null, i.status ?? 'idea', i.campaign ?? null]);
      return q(`${POST} where p.id = $1`, [r.id]);
    },
  }),
  defineOperation({
    name: 'social.posts.update', class: 'write', single: true, input: { ...id, ...PIN, campaign: { type: 'uuid' }, clear_campaign: { type: 'bool' }, post_url: { type: 'text', max: 500 } },
    run: async (q, _c, i) => {
      if (!(await q(`update social_posts set channel = coalesce($2, channel), title = coalesce($3, title), caption = coalesce($4, caption), scheduled_for = coalesce($5, scheduled_for),
        campaign_id = case when $7::boolean then null else coalesce($6, campaign_id) end, post_url = case when status = 'published' then coalesce(nullif($8, ''), post_url) else post_url end
        where id = $1 and archived_at is null returning id`, [i.id, i.channel ?? null, i.title ?? null, i.caption ?? null, i.scheduled_for ?? null, i.campaign ?? null, i.clear_campaign ?? false, i.post_url ?? null])).length) return [];
      return q(`${POST} where p.id = $1`, [i.id]);
    },
  }),
  defineOperation({
    // plan moves: idea/draft, unschedule back to approved, schedule (needs a time), mark published. Review and approval come from the approval.
    name: 'social.posts.set_status', class: 'write', single: true, input: { ...id, status: { type: 'enum', values: ['idea', 'draft', 'approved', 'scheduled', 'published', 'failed', 'cancelled'], required: true }, scheduled_for: PIN.scheduled_for, failure_reason: T(500), post_url: { type: 'text', max: 500 } },
    run: async (q, ctx, i) => {
      if (!(await q('update social_posts set status = $2, scheduled_for = coalesce($3, scheduled_for), failure_reason = $4, post_url = $5 where id = $1 and archived_at is null returning id', [i.id, i.status, i.scheduled_for ?? null, i.failure_reason ?? null, i.post_url ?? null])).length) return [];
      return q(`${POST} where p.id = $1`, [i.id]);
    },
  }),
  defineOperation({
    // asking for review = an approval of the post; its decision moves the post (approved) or sends it back to draft (rejected, withdrawn)
    name: 'social.posts.submit_for_review', class: 'write', single: true, input: { ...id, note: T() },
    run: async (q, ctx, i) => {
      const [p] = await q('select id, title, client_id from social_posts where id = $1 and archived_at is null', [i.id]);
      if (!p) return [];
      await q(`insert into approvals (workspace_id, subject_type, subject_id, requested_by, title, note, client_id) values ($1, 'post', $2, $3, $4, $5, $6)`, [ctx.orgId, p.id, ctx.userId, p.title, i.note ?? null, p.client_id]);
      return q(`${POST} where p.id = $1`, [i.id]);
    },
  }),
  defineOperation({
    name: 'social.posts.files.set', class: 'write', single: true, input: { ...id, files: { type: 'list', items: 'uuid', required: true, max: 10 } },
    run: async (q, ctx, i) => {
      if (!(await q('select id from social_posts where id = $1 and archived_at is null', [i.id])).length) return [];
      await q('delete from social_post_files where post_id = $1', [i.id]);
      for (let n = 0; n < i.files.length; n += 1) await q('insert into social_post_files (workspace_id, post_id, file_id, position) values ($1, $2, $3, $4)', [ctx.orgId, i.id, i.files[n], n + 1]);
      return q(`${POST} where p.id = $1`, [i.id]);
    },
  }),
  defineOperation({ name: 'social.channels', class: 'read', input: {}, run: (q) => q('select key, label, max_text, max_media, media_types, can_schedule, connect_state from social_channels order by label') }),
  defineOperation({
    // the same post written for other channels: new drafts that start from this post's words and media and point back at it
    name: 'social.posts.variants', class: 'write', input: { ...id, channels: { type: 'list', items: 'text', required: true, max: 8 } },
    run: async (q, ctx, i) => {
      const [p] = await q('select id, client_id, channel, title, caption, scheduled_for, campaign_id, variant_of from social_posts where id = $1 and archived_at is null', [i.id]);
      if (!p) return [];
      const root = p.variant_of ?? p.id; const made = [];
      for (const ch of [...new Set(i.channels)]) {
        if (!CHANNELS.includes(ch) || ch === p.channel) continue;
        const [n] = await q("insert into social_posts (workspace_id, channel, title, caption, scheduled_for, client_id, status, campaign_id, variant_of) values ($1, $2, $3, $4, $5, $6, 'draft', $7, $8) returning id", [ctx.orgId, ch, p.title, p.caption, p.scheduled_for, p.client_id, p.campaign_id, root]);
        await q('insert into social_post_files (workspace_id, post_id, file_id, position) select workspace_id, $2, file_id, position from social_post_files where post_id = $1', [p.id, n.id]);
        made.push(n.id);
      }
      return made.length ? q(`${POST} where p.id = any($1::uuid[]) order by p.channel`, [made]) : [];
    },
  }),
  defineOperation({
    name: 'social.campaigns.list', class: 'read',
    input: { client: { type: 'uuid' }, status: { type: 'enum', values: CAMPAIGN_STATUS }, archived: { type: 'bool' }, q: { type: 'text', max: 100 } },
    run: (q, _c, i) => q(`${CAMPAIGN} where ($1::uuid is null or c.client_id = $1) and ($2::text is null or c.status = $2) and ((c.archived_at is not null) = $3) and ($4::text is null or c.name ilike $4)
      order by c.starts_on nulls last, c.created_at desc limit 200`, [i.client ?? null, i.status ?? null, i.archived ?? false, i.q ? like(i.q) : null]),
  }),
  defineOperation({ name: 'social.campaigns.get', class: 'read', single: true, input: id, run: (q, _c, i) => q(`${CAMPAIGN} where c.id = $1`, [i.id]) }),
  defineOperation({
    name: 'social.campaigns.create', class: 'write', single: true,
    input: { name: { type: 'text', max: 200, required: true }, goal: T(1000), starts_on: { type: 'date' }, ends_on: { type: 'date' }, client: { type: 'uuid' }, owner: { type: 'uuid' } },
    run: async (q, ctx, i) => {
      const [r] = await q('insert into social_campaigns (workspace_id, name, goal, starts_on, ends_on, client_id, owner_id) values ($1, $2, $3, $4, $5, $6, $7) returning id', [ctx.orgId, i.name, i.goal ?? null, i.starts_on ?? null, i.ends_on ?? null, i.client ?? null, i.owner ?? ctx.userId]);
      return q(`${CAMPAIGN} where c.id = $1`, [r.id]);
    },
  }),
  defineOperation({
    name: 'social.campaigns.update', class: 'write', single: true,
    input: { ...id, name: { type: 'text', max: 200 }, goal: T(1000), starts_on: { type: 'date' }, ends_on: { type: 'date' }, clear_dates: { type: 'bool' }, status: { type: 'enum', values: CAMPAIGN_STATUS }, owner: { type: 'uuid' } },
    run: async (q, _c, i) => {
      if (!(await q(`update social_campaigns set name = coalesce($2, name), goal = case when $3::text is null then goal else nullif($3, '') end,
        starts_on = case when $7::boolean then null else coalesce($4, starts_on) end, ends_on = case when $7::boolean then null else coalesce($5, ends_on) end,
        status = coalesce($6, status), owner_id = coalesce($8, owner_id) where id = $1 and archived_at is null returning id`,
      [i.id, i.name ?? null, i.goal ?? null, i.starts_on ?? null, i.ends_on ?? null, i.status ?? null, i.clear_dates ?? false, i.owner ?? null])).length) return [];
      return q(`${CAMPAIGN} where c.id = $1`, [i.id]);
    },
  }),
  defineOperation({ name: 'social.campaigns.archive', class: 'write', single: true, input: id, run: (q, _c, i) => q('update social_campaigns set archived_at = now() where id = $1 and archived_at is null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'social.campaigns.restore', class: 'write', single: true, input: id, run: (q, _c, i) => q('update social_campaigns set archived_at = null where id = $1 and archived_at is not null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'social.posts.archive', class: 'write', single: true, input: id, run: (q, _c, i) => q('update social_posts set archived_at = now() where id = $1 and archived_at is null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'social.posts.restore', class: 'write', single: true, input: id, run: (q, _c, i) => q('update social_posts set archived_at = null where id = $1 and archived_at is not null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'social.posts.delete', class: 'write', single: true, input: id, run: (q, _c, i) => q('delete from social_posts where id = $1 returning id', [i.id]) }),
];
