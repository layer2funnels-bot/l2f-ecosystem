// Form Builder API (migration 0019): forms, immutable versions of their fields, and submissions recorded by signed-in staff. No public path.
// The shape of fields and answers is checked by the database (private.form_fields_valid / form_answers_valid); a refusal reads as "not found".
import { defineOperation } from './define.mjs';

const T = (max = 4000) => ({ type: 'text', min: 0, max });
const id = { id: { type: 'uuid', required: true } };
const like = (q) => `%${String(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const FORM = `select f.id, f.client_id, f.name, f.description, f.status, f.current_version, f.confirmation_message, f.redirect_url, f.retention_note, f.is_template, f.archived_at, f.created_at, f.updated_at,
  (select v.fields from form_versions v where v.form_id = f.id and v.version = f.current_version) as fields from forms f`;
const SUB = 'select s.id, s.form_id, s.form_version, s.client_id, s.answers, s.submitted_by, s.archived_at, s.created_at from form_submissions s';

export const formsOperations = [
  defineOperation({
    name: 'forms.list', class: 'read', input: { client: { type: 'uuid' }, status: { type: 'enum', values: ['draft', 'published'] }, archived: { type: 'bool' }, q: { type: 'text', max: 100 }, templates: { type: 'bool' }, library: { type: 'bool' } },
    run: (q, _c, i) => q(`${FORM} where ($1::uuid is null or f.client_id = $1) and ($2::text is null or f.status = $2) and ((f.archived_at is not null) = $3) and ($4::text is null or f.name ilike $4) and (not $5 or f.is_template) and (not $6 or f.client_id is null) order by f.name limit 200`,
      [i.client ?? null, i.status ?? null, i.archived ?? false, i.q ? like(i.q) : null, i.templates ?? false, i.library ?? false]),
  }),
  defineOperation({ name: 'forms.get', class: 'read', single: true, input: id, run: (q, _c, i) => q(`${FORM} where f.id = $1`, [i.id]) }),
  defineOperation({
    name: 'forms.create', class: 'write', single: true, input: { name: { type: 'text', required: true, max: 200 }, description: T(), client: { type: 'uuid' } },
    run: async (q, ctx, i) => {
      const [r] = await q('insert into forms (workspace_id, name, description, client_id) values ($1, $2, $3, $4) returning id', [ctx.orgId, i.name, i.description ?? null, i.client ?? null]);
      return q(`${FORM} where f.id = $1`, [r.id]);
    },
  }),
  defineOperation({
    // settings (name, description, confirmation message, redirect, retention note, template flag); an empty text clears a setting
    name: 'forms.update', class: 'write', single: true,
    input: { ...id, name: { type: 'text', max: 200 }, description: T(), confirmation_message: T(1000), redirect_url: T(500), retention_note: T(500), is_template: { type: 'bool' } },
    run: async (q, _c, i) => {
      if (!(await q(`update forms set name = coalesce($2, name), description = coalesce($3, description),
          confirmation_message = case when $4::text is null then confirmation_message else nullif($4, '') end,
          redirect_url = case when $5::text is null then redirect_url else nullif($5, '') end,
          retention_note = case when $6::text is null then retention_note else nullif($6, '') end,
          is_template = coalesce($7, is_template)
        where id = $1 and archived_at is null returning id`, [i.id, i.name ?? null, i.description ?? null, i.confirmation_message ?? null, i.redirect_url ?? null, i.retention_note ?? null, i.is_template ?? null])).length) return [];
      return q(`${FORM} where f.id = $1`, [i.id]);
    },
  }),
  defineOperation({
    // a new draft form from an existing one (or a template): same fields and settings, version 1, optionally for a client
    name: 'forms.duplicate', class: 'write', single: true, input: { ...id, name: { type: 'text', max: 200 }, client: { type: 'uuid' } },
    run: async (q, ctx, i) => {
      const [src] = await q('select f.name, f.description, f.confirmation_message, f.redirect_url, f.retention_note, f.current_version, (select v.fields from form_versions v where v.form_id = f.id and v.version = f.current_version) as fields from forms f where f.id = $1', [i.id]);
      if (!src) return [];
      const [r] = await q('insert into forms (workspace_id, name, description, client_id, confirmation_message, redirect_url, retention_note) values ($1,$2,$3,$4,$5,$6,$7) returning id',
        [ctx.orgId, i.name ?? `${src.name} (copy)`.slice(0, 200), src.description, i.client ?? null, src.confirmation_message, src.redirect_url, src.retention_note]);
      if (src.fields) await q('insert into form_versions (workspace_id, form_id, version, fields) values ($1, $2, 1, $3::jsonb)', [ctx.orgId, r.id, JSON.stringify(src.fields)]);
      return q(`${FORM} where f.id = $1`, [r.id]);
    },
  }),
  defineOperation({
    // a change to the fields is always a NEW version; earlier submissions keep the version they were answered against
    name: 'forms.fields.save', class: 'write', single: true, input: { ...id, fields: { type: 'json', required: true, max: 60000 } },
    run: async (q, ctx, i) => {
      if (!(await q('select id from forms where id = $1 and archived_at is null', [i.id])).length) return [];
      await q('insert into form_versions (workspace_id, form_id, version, fields) values ($1, $2, 1, $3::jsonb)', [ctx.orgId, i.id, JSON.stringify(i.fields)]);
      return q(`${FORM} where f.id = $1`, [i.id]);
    },
  }),
  defineOperation({ name: 'forms.publish', class: 'write', single: true, input: id, run: (q, _c, i) => q(`update forms set status = 'published' where id = $1 and archived_at is null and current_version >= 1 returning id, status`, [i.id]) }),
  defineOperation({ name: 'forms.unpublish', class: 'write', single: true, input: id, run: (q, _c, i) => q(`update forms set status = 'draft' where id = $1 and archived_at is null returning id, status`, [i.id]) }),
  defineOperation({ name: 'forms.archive', class: 'write', single: true, input: id, run: (q, _c, i) => q(`update forms set archived_at = now(), status = 'draft' where id = $1 and archived_at is null returning id, archived_at`, [i.id]) }),
  defineOperation({ name: 'forms.restore', class: 'write', single: true, input: id, run: (q, _c, i) => q('update forms set archived_at = null where id = $1 and archived_at is not null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'forms.delete', class: 'write', single: true, input: id, run: (q, _c, i) => q('delete from forms where id = $1 returning id', [i.id]) }),
  defineOperation({
    name: 'forms.versions.list', class: 'read', input: { form: { type: 'uuid', required: true } },
    run: (q, _c, i) => q('select v.version, v.fields, v.created_by, v.created_at from form_versions v where v.form_id = $1 order by v.version desc', [i.form]),
  }),
  defineOperation({
    name: 'forms.submissions.list', class: 'read', input: { form: { type: 'uuid', required: true }, archived: { type: 'bool' } },
    run: (q, _c, i) => q(`${SUB} where s.form_id = $1 and ((s.archived_at is not null) = $2) order by s.created_at desc limit 200`, [i.form, i.archived ?? false]),
  }),
  defineOperation({ name: 'forms.submissions.get', class: 'read', single: true, input: id, run: (q, _c, i) => q(`${SUB} where s.id = $1`, [i.id]) }),
  defineOperation({
    name: 'forms.submissions.submit', class: 'write', single: true, input: { form: { type: 'uuid', required: true }, answers: { type: 'json', required: true, max: 100000 } },
    run: async (q, ctx, i) => {
      const [r] = await q('insert into form_submissions (workspace_id, form_id, form_version, answers) values ($1, $2, 0, $3::jsonb) returning id', [ctx.orgId, i.form, JSON.stringify(i.answers)]);
      return q(`${SUB} where s.id = $1`, [r.id]);
    },
  }),
  defineOperation({ name: 'forms.submissions.archive', class: 'write', single: true, input: id, run: (q, _c, i) => q('update form_submissions set archived_at = now() where id = $1 and archived_at is null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'forms.submissions.restore', class: 'write', single: true, input: id, run: (q, _c, i) => q('update form_submissions set archived_at = null where id = $1 and archived_at is not null returning id, archived_at', [i.id]) }),
  defineOperation({ name: 'forms.submissions.delete', class: 'write', single: true, input: id, run: (q, _c, i) => q('delete from form_submissions where id = $1 returning id', [i.id]) }),
];
