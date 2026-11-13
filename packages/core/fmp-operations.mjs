// Funnel Mapper ↔ Clients: one client list (migration 0052, Design V7 03 §3 and 16_FUNNEL_MAPPER).
// The Clients app owns client identity; Funnel Mapper reads and creates clients here, so a client made in either app is the
// same row in `clients`. Every query runs as the signed-in person under row security: app access (`fmp.*`), client scope
// (SDOR) and organization (WCIGA) are decided by the database, and a refusal reads as "not found" (empty), never as "forbidden".
// Duplicates are never merged or linked automatically:
//   - the same e-mail address (after trimming and lower-casing) → "exact" candidate: the person must choose "link" or "new";
//   - the same name or business name only → "possible" candidate: shown for review, nothing is linked;
//   - several candidates → the person must pick one (link_to) or say "new".
// Linking never changes the existing client's details.
import { defineOperation } from './define.mjs';

const T = (max = 8000) => ({ type: 'text', min: 0, max });
const STATUS = { type: 'enum', values: ['lead', 'proposal', 'active', 'paused', 'past'] };
const SELECT = `select c.id, c.name, c.archived_at, c.created_at, p.business_name, p.email, p.status, p.niche, p.tags,
    cc.monthly_retainer, cc.pricing_model, cc.pricing_amount, cc.billing_frequency, cc.hours_per_month, cc.commission_pct, cc.project_start, cc.project_end, cc.pricing_notes
  from clients c left join client_profiles p on p.client_id = c.id
  left join fmp.client_commercial cc on cc.workspace_id = c.workspace_id and cc.client_id = c.id`;

/** Lower-case, trimmed e-mail; null when empty. */
export const normEmail = (e) => { const v = String(e ?? '').trim().toLowerCase(); return v || null; };
/** Name for comparison: lower case, letters and digits only, single spaces ("Sam  Carter Ltd." → "sam carter ltd"). */
export const normName = (n) => String(n ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// An e-mail may arrive with spaces or capitals (pasted): it is trimmed and lower-cased first, then checked.
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanEmail = (e) => { const v = normEmail(e); if (v && !EMAIL_OK.test(v)) throw Object.assign(new Error('invalid e-mail'), { code: 'P0001' }); return v; };

const can = async (q, orgId, perm) => (await q('select private.has_permission($1, $2) ok', [orgId, perm]))[0]?.ok === true;

/** Candidates among the clients this person may see (archived ones included, so an archived duplicate is still found). */
export async function findCandidates(q, { email, name, businessName }) {
  const em = normEmail(email); const nm = normName(name); const bn = normName(businessName);
  const pat = (n) => { const t = n.split(' ').filter(Boolean).sort((x, y) => y.length - x.length)[0]; return t ? `%${t.replace(/[\\%_]/g, '')}%` : ''; };
  const rows = await q(`${SELECT} where ($1::text is not null and lower(trim(p.email)) = $1)
      or ($2 <> '' and (lower(c.name) like $2 or lower(coalesce(p.business_name, '')) like $2))
      or ($3 <> '' and (lower(c.name) like $3 or lower(coalesce(p.business_name, '')) like $3))
    order by c.name limit 100`, [em, pat(nm), pat(bn)]);
  const exact = []; const possible = [];
  for (const r of rows) {
    if (em && normEmail(r.email) === em) exact.push({ ...r, match: 'email_exact' });
    else if (nm && (normName(r.name) === nm || normName(r.business_name) === nm)) possible.push({ ...r, match: 'name' });
    else if (bn && (normName(r.name) === bn || normName(r.business_name) === bn)) possible.push({ ...r, match: 'business_name' });
  }
  return { exact, possible };
}

export const fmpOperations = [
  defineOperation({
    // the client list Funnel Mapper shows: the same rows as the Clients app, plus Funnel Mapper's commercial terms
    name: 'fmp.clients.list', class: 'read',
    input: { archived: { type: 'bool' }, q: { type: 'text', max: 100 } },
    run: async (q, ctx, i) => {
      if (!(await can(q, ctx.orgId, 'fmp.funnel.view'))) return [];
      const like = i.q ? `%${String(i.q).replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
      return q(`${SELECT} where ((c.archived_at is not null) = $1) and ($2::text is null or c.name ilike $2 or p.business_name ilike $2) order by c.name limit 500`,
        [i.archived ?? false, like]);
    },
  }),
  defineOperation({
    // before "New client" saves: who might this already be? (only clients the person may see)
    name: 'fmp.clients.match', class: 'read', single: true,
    input: { name: { type: 'text', required: true, max: 200 }, email: T(330), business_name: T(200) },
    run: async (q, ctx, i) => {
      if (!(await can(q, ctx.orgId, 'fmp.funnel.view'))) return [];
      return [await findCandidates(q, { email: cleanEmail(i.email), name: i.name, businessName: i.business_name })];
    },
  }),
  defineOperation({
    // "New client" in Funnel Mapper: creates the client in the shared list, or links to one the person chose.
    // decision: omitted = check first; 'new' = create anyway (after the person saw the candidates); 'link' = use link_to.
    name: 'fmp.clients.create', class: 'write', single: true,
    input: {
      name: { type: 'text', required: true, max: 200 }, business_name: T(200), email: T(330), status: STATUS,
      decision: { type: 'enum', values: ['new', 'link'] }, link_to: { type: 'uuid' },
    },
    run: async (q, ctx, i) => {
      if (!(await can(q, ctx.orgId, 'fmp.funnel.create'))) return [];
      if (i.decision === 'link') {
        if (!i.link_to) return [{ outcome: 'needs_decision', reason: 'choose_client', candidates: [] }];
        const [c] = await q(`${SELECT} where c.id = $1`, [i.link_to]);
        return c ? [{ outcome: 'linked', client: c }] : [];   // not visible = not found; the client's details are not touched
      }
      if (i.decision !== 'new') {
        const { exact, possible } = await findCandidates(q, { email: cleanEmail(i.email), name: i.name, businessName: i.business_name });
        if (exact.length || possible.length) {
          return [{ outcome: 'needs_decision', reason: exact.length > 1 ? 'ambiguous' : exact.length ? 'email_exact' : 'possible_duplicate', candidates: [...exact, ...possible] }];
        }
      }
      const [c] = await q('insert into clients (workspace_id, name) values ($1, $2) returning id', [ctx.orgId, i.name]);
      const set = []; const vals = [c.id];
      for (const [col, v] of [['business_name', i.business_name], ['email', cleanEmail(i.email) ?? undefined], ['status', i.status]]) {
        if (v !== undefined && v !== '') { vals.push(v); set.push(`${col} = $${vals.length}`); }
      }
      if (set.length) await q(`update client_profiles set ${set.join(', ')} where client_id = $1`, vals);
      const [row] = await q(`${SELECT} where c.id = $1`, [c.id]);
      return [{ outcome: 'created', client: row }];
    },
  }),
  defineOperation({
    name: 'fmp.clients.commercial.set', class: 'write', single: true,
    input: {
      client: { type: 'uuid', required: true }, monthly_retainer: { type: 'number', min: 0, max: 1e9 },
      pricing_model: { type: 'enum', values: ['retainer', 'fixed', 'one_time', 'hourly', 'commission', 'other'] },
      pricing_amount: { type: 'number', min: 0, max: 1e9 }, billing_frequency: { type: 'enum', values: ['one_time', 'weekly', 'monthly', 'quarterly', 'yearly'] },
      hours_per_month: { type: 'number', min: 0, max: 1e6 }, commission_pct: { type: 'number', min: 0, max: 100 },
      project_start: { type: 'date' }, project_end: { type: 'date' }, pricing_notes: T(20000),
    },
    run: async (q, ctx, i) => {
      if (!(await q('select 1 from clients where id = $1', [i.client])).length) return [];
      const cols = ['monthly_retainer', 'pricing_model', 'pricing_amount', 'billing_frequency', 'hours_per_month', 'commission_pct', 'project_start', 'project_end', 'pricing_notes'].filter((k) => i[k] !== undefined);
      const vals = [ctx.orgId, i.client, ...cols.map((k) => i[k])];
      const ins = cols.length ? `, ${cols.join(', ')}` : ''; const ph = cols.map((_, n) => `$${n + 3}`).join(', ');
      const upd = cols.length ? cols.map((k) => `${k} = excluded.${k}`).join(', ') : 'updated_at = now()';
      const r = await q(`insert into fmp.client_commercial (workspace_id, client_id${ins}) values ($1, $2${ph ? `, ${ph}` : ''})
        on conflict (workspace_id, client_id) do update set ${upd} returning client_id`, vals);
      return r.length ? q(`${SELECT} where c.id = $1`, [i.client]) : [];
    },
  }),
];
