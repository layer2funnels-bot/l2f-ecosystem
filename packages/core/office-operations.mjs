// Office V8 (P01) operations: the default strategy template (versioned) and Documents sections. Row rules decide (migration 0056):
// template read = funnels.strategy.view, save = funnels.strategy.edit; sections visible to staff ('everyone') or owners/admins
// ('admins'), managed by owners/admins; each section is a folder in the shared Drive (Drive's own folder rules apply).
import { defineOperation } from './define.mjs';

// V8's starting template (prototype office6.js STPL) — used until the organization saves its first version
export const DEFAULT_TEMPLATE = [
  ['Funnel overview', 'Name, purpose and business goal.'], ['Target audience', 'Customer avatar, problems, motivations and objections.'],
  ['Offer and value', 'What you sell and why it matters.'], ['Customer journey', 'From first touch to conversion.'],
  ['Messaging direction', 'Core message, proof and calls to action.'], ['Success criteria', 'How you’ll know it worked.'],
].map(([heading, help]) => ({ heading, help }));
// V8's starting sections (prototype DOCSEC); "Approved SOPs" lists Drive's protected SOPs
export const DEFAULT_SECTIONS = [['Approved SOPs', 'everyone', true], ['Policies', 'everyone', false], ['Templates', 'everyone', false]];

const section = { name: { type: 'text', required: true, min: 1, max: 80 }, visibility: { type: 'enum', values: ['everyone', 'admins'] }, owner_protected: { type: 'bool' } };

export const officeOperations = [
  defineOperation({
    name: 'office.template.get', class: 'read', single: true,
    run: async (q, ctx) => {
      const [t] = await q('select version, sections, created_at from strategy_templates where workspace_id = $1 order by version desc limit 1', [ctx.orgId]);
      return [t ?? { version: 0, sections: DEFAULT_TEMPLATE, created_at: null }];
    },
  }),
  defineOperation({
    name: 'office.template.versions', class: 'read',
    run: (q, ctx) => q(`select t.version, t.created_at, coalesce(nullif(p.display_name, ''), 'Someone') as by_name from strategy_templates t left join profiles p on p.id = t.created_by
      where t.workspace_id = $1 order by t.version desc limit 50`, [ctx.orgId]),
  }),
  defineOperation({
    name: 'office.template.save', class: 'write', single: true, input: { sections: { type: 'json', required: true, max: 30000 } },
    run: async (q, ctx, i) => {
      const list = Array.isArray(i.sections) ? i.sections : [];
      const clean = list.map((s) => ({ heading: String(s?.heading ?? '').trim().slice(0, 120), help: String(s?.help ?? '').trim().slice(0, 300) })).filter((s) => s.heading);
      if (!clean.length || clean.length > 40) throw { code: '22023', message: 'a template needs 1 to 40 sections with a heading' };
      return q(`insert into strategy_templates (workspace_id, version, sections, created_by)
        values ($1, coalesce((select max(version) from strategy_templates where workspace_id = $1), 0) + 1, $2, $3) returning version, sections, created_at`, [ctx.orgId, JSON.stringify(clean), ctx.userId]);
    },
  }),
  defineOperation({
    name: 'office.sections.list', class: 'read',
    run: async (q, ctx) => {
      let rows = await q('select id, name, visibility, owner_protected, folder_id, position from doc_sections where workspace_id = $1 order by position, created_at', [ctx.orgId]);
      // first visit by an owner/admin: create V8's three starting sections (staff who cannot manage simply see none yet)
      if (!rows.length) {
        const [{ admin } = {}] = await q("select private.has_role($1, 'admin') as admin", [ctx.orgId]);
        if (admin) {
          for (const [n, [name, vis, prot]] of DEFAULT_SECTIONS.entries()) await q('insert into doc_sections (workspace_id, name, visibility, owner_protected, position, created_by) values ($1, $2, $3, $4, $5, $6)', [ctx.orgId, name, vis, prot, n, ctx.userId]);
          rows = await q('select id, name, visibility, owner_protected, folder_id, position from doc_sections where workspace_id = $1 order by position, created_at', [ctx.orgId]);
        }
      }
      return rows;
    },
  }),
  defineOperation({
    name: 'office.sections.create', class: 'write', single: true, input: section,
    run: async (q, ctx, i) => {
      const [f] = await q("insert into drive_folders (workspace_id, space, name, created_by) values ($1, 'shared', $2, $3) returning id", [ctx.orgId, i.name.trim(), ctx.userId]);
      return q(`insert into doc_sections (workspace_id, name, visibility, owner_protected, folder_id, position, created_by)
        values ($1, $2, $3, $4, $5, coalesce((select max(position) + 1 from doc_sections where workspace_id = $1), 0), $6) returning id, name, visibility, owner_protected, folder_id, position`,
      [ctx.orgId, i.name.trim(), i.visibility ?? 'everyone', i.owner_protected ?? false, f.id, ctx.userId]);
    },
  }),
  defineOperation({
    name: 'office.sections.update', class: 'write', single: true, input: { id: { type: 'uuid', required: true }, ...Object.fromEntries(Object.entries(section).map(([k, f]) => [k, { ...f, required: false }])), position: { type: 'int', min: 0, max: 1000 } },
    run: async (q, _c, i) => {
      const r = await q(`update doc_sections set name = coalesce($2, name), visibility = coalesce($3, visibility), owner_protected = coalesce($4, owner_protected), position = coalesce($5, position), updated_at = now()
        where id = $1 returning id, name, visibility, owner_protected, folder_id, position`, [i.id, i.name?.trim() ?? null, i.visibility ?? null, i.owner_protected ?? null, i.position ?? null]);
      if (r.length && i.name && r[0].folder_id) await q('update drive_folders set name = $2 where id = $1', [r[0].folder_id, i.name.trim()]);
      return r;
    },
  }),
  // deleting a section removes it from Documents; its folder and files stay in Drive (nothing is lost)
  defineOperation({ name: 'office.sections.delete', class: 'write', single: true, input: { id: { type: 'uuid', required: true } }, run: (q, _c, i) => q('delete from doc_sections where id = $1 returning id', [i.id]) }),
];
