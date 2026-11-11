// Custom fields for tasks: definitions (managers), values (editors), validation per type, copy helpers.
import { randomUUID } from 'node:crypto';
import { asUser } from '../db.ts';
import type { Tx } from '../db.ts';
import { ApiError } from '../errors.ts';
import * as V from '../validate.ts';
import type { CustomField, FieldOption, FieldOptionInput, FieldType, FieldValue, Ops, OpName } from '../../shared/api.ts';
import { FIELD_TYPES } from '../../shared/api.ts';
import { activity, all, editableTask, needRole, one, run, taskRowById, type Ctx, type Row } from './util.ts';

export const MAX_FIELDS = 40;
export const MAX_OPTIONS = 50;
const OPTION_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#64748b', '#f97316'];
const CURRENCIES: ReadonlySet<string> = new Set(Intl.supportedValuesOf('currency'));
const MAX_ABS = 1e12;

// ───────────── mapping ─────────────
const FIELD_COLS = 'id, project_id, name, type, options, position, archived_at';
export function mapField(r: Row): CustomField {
  const t = r.type as FieldType;
  const o = r.options;
  return {
    id: r.id, projectId: r.project_id, name: r.name, type: t,
    options: t === 'select' || t === 'multiselect' ? (o as FieldOption[]) : [],
    currency: t === 'currency' ? String(o.code) : null,
    decimals: t === 'number' ? Number(o.decimals) : null,
    position: r.position, archivedAt: r.archived_at,
  };
}

/** Fields of a project in display order. Active only unless includeArchived. */
export async function fieldsOf(tx: Tx, projectId: string, includeArchived = false): Promise<CustomField[]> {
  return (await all(tx, `select ${FIELD_COLS} from pm_custom_fields where project_id = $1 ${includeArchived ? '' : 'and archived_at is null'} order by position, created_at, id`, [projectId])).map(mapField);
}
async function loadField(tx: Tx, id: string): Promise<CustomField> {
  const r = await one<Row>(tx, `select ${FIELD_COLS} from pm_custom_fields where id = $1`, [id]);
  if (!r) throw new ApiError('not_found', 'Field not found');
  return mapField(r);
}

// ───────────── definition parsing ─────────────
const bad = (field: string, msg: string): never => { throw new ApiError('invalid', msg, field); };

function parseOptions(x: unknown, existing: FieldOption[] = []): FieldOption[] {
  const known = new Map(existing.map((o) => [o.id, o]));
  const items = V.arr(x, 'options', MAX_OPTIONS, (v, f) => {
    const o = V.object(v, f);
    V.noUnknown(o, ['id', 'label', 'color'], f);
    return {
      id: o.id === undefined ? undefined : V.uuid(o.id, `${f}.id`),
      label: V.str(o.label, `${f}.label`, { min: 1, max: 40 }),
      color: o.color === undefined ? undefined : V.color(o.color, `${f}.color`),
    } satisfies FieldOptionInput;
  });
  const seen = new Set<string>();
  const out = items.map((o, i): FieldOption => {
    if (o.id && !known.has(o.id)) bad('options', 'Unknown option');
    const key = o.label.toLowerCase();
    if (seen.has(key)) bad('options', `The option “${o.label}” appears twice`);
    seen.add(key);
    return { id: o.id ?? randomUUID(), label: o.label, color: (o.color ?? (o.id ? known.get(o.id)!.color : OPTION_COLORS[i % OPTION_COLORS.length])).toLowerCase() };
  });
  if (new Set(out.map((o) => o.id)).size !== out.length) bad('options', 'An option was listed twice');
  return out;
}
function parseCurrency(x: unknown): string {
  const c = V.str(x, 'currency', { min: 3, max: 3 }).toUpperCase();
  if (!CURRENCIES.has(c)) bad('currency', `${c} is not a known currency code`);
  return c;
}

function optionsJson(type: FieldType, a: { options?: unknown; currency?: unknown; decimals?: unknown }, current?: CustomField): unknown {
  if (a.options !== undefined && type !== 'select' && type !== 'multiselect') bad('options', 'Only select and multiselect fields have options');
  if (a.currency !== undefined && type !== 'currency') bad('currency', 'Only currency fields have a currency');
  if (a.decimals !== undefined && type !== 'number') bad('decimals', 'Only number fields have decimals');
  switch (type) {
    case 'select': case 'multiselect': return a.options === undefined ? (current?.options ?? []) : parseOptions(a.options, current?.options);
    case 'currency': return { code: a.currency === undefined ? (current?.currency ?? 'USD') : parseCurrency(a.currency) };
    case 'number': return { decimals: a.decimals === undefined ? (current?.decimals ?? 0) : V.int(a.decimals, 'decimals', 0, 4) };
    default: return {};
  }
}

// ───────────── value validation ─────────────
const decimalsOf = (f: CustomField): number =>
  f.type === 'number' ? (f.decimals ?? 0) : new Intl.NumberFormat('en', { style: 'currency', currency: f.currency ?? 'USD' }).resolvedOptions().maximumFractionDigits ?? 2;

/** Validates a value for a field. Returns the value to store, or null when it means "no value" (empty text, empty list). */
export function parseFieldValue(f: CustomField, v: unknown): FieldValue | null {
  const field = 'value';
  if (v === null || v === undefined) return null;
  switch (f.type) {
    case 'text': {
      const s = V.str(v, field, { max: 2000 });
      return s === '' ? null : s;
    }
    case 'url': {
      const s = V.str(v, field, { max: 2000 });
      if (s === '') return null;
      if (!/^https?:\/\/[^\s]+$/i.test(s)) bad(field, 'Enter a web address starting with http:// or https://');
      return s;
    }
    case 'number': case 'currency': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return bad(field, `${f.name} must be a number`);
      if (Math.abs(v) > MAX_ABS) bad(field, `${f.name} must be between -1,000,000,000,000 and 1,000,000,000,000`);
      const d = decimalsOf(f);
      if (Math.abs(Number(v.toFixed(d)) - v) > 1e-9 * Math.max(1, Math.abs(v))) bad(field, d === 0 ? `${f.name} must be a whole number` : `${f.name} can have at most ${d} decimal${d === 1 ? '' : 's'}`);
      return Number(v.toFixed(d));
    }
    case 'select': {
      if (typeof v !== 'string' || !f.options.some((o) => o.id === v)) return bad(field, `That is not an option of ${f.name}`);
      return v;
    }
    case 'multiselect': {
      if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) return bad(field, `${f.name} must be a list of options`);
      if (new Set(v).size !== v.length) bad(field, 'An option was chosen twice');
      if (v.some((x) => !f.options.some((o) => o.id === x))) bad(field, `That is not an option of ${f.name}`);
      return v.length ? (v as string[]) : null;
    }
    case 'date': return V.date(v, field);
    case 'checkbox': return V.bool(v, field);
  }
}

/** Readable form for the activity log. */
export function describeValue(f: CustomField, v: FieldValue | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  switch (f.type) {
    case 'select': return f.options.find((o) => o.id === v)?.label ?? null;
    case 'multiselect': return (v as string[]).map((id) => f.options.find((o) => o.id === id)?.label).filter(Boolean).join(', ') || null;
    case 'checkbox': return v ? 'Yes' : 'No';
    case 'currency': return `${f.currency} ${new Intl.NumberFormat('en', { maximumFractionDigits: 4 }).format(v as number)}`;
    case 'number': return new Intl.NumberFormat('en', { maximumFractionDigits: 4 }).format(v as number);
    default: return String(v).slice(0, 200);
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// ───────────── value writes (shared by tasks.setField and tasks.update / bulkUpdate) ─────────────
export interface FieldChange { field: CustomField; from: FieldValue | null; to: FieldValue | null }

/**
 * Validates `input` (field id -> value or null) against the task's project and returns what would change.
 * `skip` is returned when lenient is set and a field belongs to another project (the task is skipped, as for other bulk edits).
 */
export async function planFieldChanges(tx: Tx, projectId: string, taskId: string, input: Record<string, unknown>, lenient = false): Promise<FieldChange[] | 'skip'> {
  const ids = Object.keys(input);
  if (!ids.length) return [];
  const fields = new Map((await fieldsOf(tx, projectId, true)).map((f) => [f.id, f]));
  const current = new Map((await all<{ field_id: string; value: FieldValue }>(tx, 'select field_id, value from pm_task_field_values where task_id = $1', [taskId])).map((r) => [r.field_id, r.value]));
  const out: FieldChange[] = [];
  for (const id of ids) {
    const f = fields.get(id);
    if (!f) { if (lenient) return 'skip'; return bad('fields', 'That field does not belong to this task’s project'); }
    if (f.archivedAt) bad('fields', `The field “${f.name}” is archived. Restore it first.`);
    const to = parseFieldValue(f, input[id]);
    const from = current.get(id) ?? null;
    if (!same(from, to)) out.push({ field: f, from, to });
  }
  return out;
}

export async function applyFieldChanges(tx: Tx, projectId: string, taskId: string, changes: FieldChange[]): Promise<void> {
  for (const c of changes) {
    if (c.to === null) await run(tx, 'delete from pm_task_field_values where task_id = $1 and field_id = $2', [taskId, c.field.id]);
    else {
      await run(tx, `insert into pm_task_field_values (workspace_id, project_id, task_id, field_id, value, updated_by) values (pm.org(), $1, $2, $3, $4::jsonb, pm.uid())
        on conflict (task_id, field_id) do update set value = excluded.value, updated_by = excluded.updated_by`, [projectId, taskId, c.field.id, JSON.stringify(c.to)]);
    }
    await activity(tx, projectId, taskId, 'task.updated', { field: `custom:${c.field.name}`, from: describeValue(c.field, c.from), to: describeValue(c.field, c.to) });
  }
}

// ───────────── copying (duplicate task / project, template, repeat) ─────────────
/** Copies every value of one task onto another task of the same project. */
export async function copyTaskFieldValues(tx: Tx, projectId: string, fromTaskId: string, toTaskId: string): Promise<void> {
  await run(tx, `insert into pm_task_field_values (workspace_id, project_id, task_id, field_id, value, updated_by)
    select pm.org(), $1, $3, field_id, value, pm.uid() from pm_task_field_values where task_id = $2`, [projectId, fromTaskId, toTaskId]);
}

/** Copies the active fields of one project into another (new ids, same option ids). Returns old field id -> new field id. */
export async function copyProjectFields(tx: Tx, fromProjectId: string, toProjectId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const f of await all(tx, 'select * from pm_custom_fields where project_id = $1 and archived_at is null order by position, created_at, id', [fromProjectId])) {
    const r = await one<Row>(tx, `insert into pm_custom_fields (workspace_id, project_id, name, type, options, position, created_by) values (pm.org(), $1, $2, $3, $4::jsonb, $5, pm.uid()) returning id`,
      [toProjectId, f.name, f.type, JSON.stringify(f.options), f.position]);
    map.set(f.id, r!.id);
  }
  return map;
}

/** Copies a task's values onto a task of another project, mapping field ids (fields without a mapping are dropped). */
export async function copyTaskFieldValuesMapped(tx: Tx, toProjectId: string, fromTaskId: string, toTaskId: string, map: Map<string, string>): Promise<void> {
  if (!map.size) return;
  await run(tx, `insert into pm_task_field_values (workspace_id, project_id, task_id, field_id, value, updated_by)
    select pm.org(), $1, $3, m.new_id, v.value, pm.uid()
    from pm_task_field_values v join unnest($4::uuid[], $5::uuid[]) m(old_id, new_id) on m.old_id = v.field_id where v.task_id = $2`,
  [toProjectId, fromTaskId, toTaskId, [...map.keys()], [...map.values()]]);
}

// ───────────── ops ─────────────
async function assertNameFree(tx: Tx, projectId: string, name: string, exceptId?: string): Promise<void> {
  if (await one(tx, 'select 1 x from pm_custom_fields where project_id = $1 and lower(btrim(name)) = lower($2) and ($3::uuid is null or id <> $3)', [projectId, name, exceptId ?? null])) {
    bad('name', `A field named “${name}” already exists in this project`);
  }
}

export const fieldOps = {
  'fields.list': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    const includeArchived = args.includeArchived === undefined ? false : V.bool(args.includeArchived, 'includeArchived');
    return asUser(ctx, async (tx) => {
      await needRole(tx, projectId, includeArchived ? 'manager' : 'viewer');
      return fieldsOf(tx, projectId, includeArchived);
    });
  },

  'fields.create': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    const name = V.str(args.name, 'name', { min: 1, max: 60 });
    const type = V.oneOf(args.type, 'type', FIELD_TYPES);
    return asUser(ctx, async (tx) => {
      await needRole(tx, projectId, 'manager');
      const options = optionsJson(type, args);
      await assertNameFree(tx, projectId, name);
      const n = await one<Row>(tx, 'select count(*) n, coalesce(max(position), 0) + 1000 pos from pm_custom_fields where project_id = $1 and archived_at is null', [projectId]);
      if ((n!.n as number) >= MAX_FIELDS) bad('name', `A project can have at most ${MAX_FIELDS} custom fields`);
      const r = await one<Row>(tx, `insert into pm_custom_fields (workspace_id, project_id, name, type, options, position, created_by) values (pm.org(), $1, $2, $3, $4::jsonb, $5, pm.uid())
        returning ${FIELD_COLS}`, [projectId, name, type, JSON.stringify(options), n!.pos]);
      return mapField(r!);
    });
  },

  'fields.update': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    const name = V.opt(args, 'name', (x, f) => V.str(x, f, { min: 1, max: 60 }));
    const position = V.opt(args, 'position', V.num);
    return asUser(ctx, async (tx) => {
      const cur = await loadField(tx, id);
      await needRole(tx, cur.projectId, 'manager');
      if (cur.archivedAt) bad('id', 'Restore this field before changing it');
      if (name !== undefined && name.toLowerCase() !== cur.name.toLowerCase()) await assertNameFree(tx, cur.projectId, name, id);
      const options = args.options !== undefined || args.currency !== undefined || args.decimals !== undefined ? optionsJson(cur.type, args, cur) : undefined;
      await run(tx, `update pm_custom_fields set name = coalesce($2, name), position = coalesce($3, position), options = coalesce($4::jsonb, options) where id = $1`,
        [id, name ?? null, position ?? null, options === undefined ? null : JSON.stringify(options)]);
      // Options that were removed disappear from every task value, in this same transaction.
      if (args.options !== undefined && (cur.type === 'select' || cur.type === 'multiselect')) {
        const keep = new Set((options as FieldOption[]).map((o) => o.id));
        const removed = cur.options.filter((o) => !keep.has(o.id));
        if (removed.length) {
          const rm = removed.map((o) => o.id);
          const label = (v: unknown) => (Array.isArray(v) ? v : [v]).map((x) => removed.find((o) => o.id === x)?.label).filter(Boolean).join(', ');
          const hit = cur.type === 'select'
            ? await all<{ task_id: string; value: FieldValue }>(tx, `select task_id, value from pm_task_field_values where field_id = $1 and (value #>> '{}') = any($2::text[])`, [id, rm])
            : await all<{ task_id: string; value: FieldValue }>(tx, `select task_id, value from pm_task_field_values where field_id = $1 and value ?| $2::text[]`, [id, rm]);
          if (cur.type === 'select') await run(tx, `delete from pm_task_field_values where field_id = $1 and (value #>> '{}') = any($2::text[])`, [id, rm]);
          else {
            await run(tx, `update pm_task_field_values set value = coalesce((select jsonb_agg(e) from jsonb_array_elements(value) e where (e #>> '{}') <> all($2::text[])), '[]'::jsonb)
              where field_id = $1 and value ?| $2::text[]`, [id, rm]);
            await run(tx, `delete from pm_task_field_values where field_id = $1 and value = '[]'::jsonb`, [id]);
          }
          const labelsOf = (v: unknown, pick: (id: string) => boolean) => (Array.isArray(v) ? v as string[] : [v as string]).filter(pick)
            .map((x) => cur.options.find((o) => o.id === x)?.label).filter(Boolean).join(', ') || null;
          for (const h of hit) {
            await activity(tx, cur.projectId, h.task_id, 'task.updated', {
              field: `custom:${name ?? cur.name}`, from: cur.type === 'multiselect' ? labelsOf(h.value, () => true) : label(h.value), to: cur.type === 'multiselect' ? labelsOf(h.value, (x) => !rm.includes(x)) : null,
            });
          }
        }
      }
      return loadField(tx, id);
    });
  },

  'fields.archive': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, async (tx) => {
      const cur = await loadField(tx, id);
      await needRole(tx, cur.projectId, 'manager');
      await run(tx, 'update pm_custom_fields set archived_at = coalesce(archived_at, now()) where id = $1', [id]);
      return { ok: true } as const;
    });
  },

  'fields.restore': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, async (tx) => {
      const cur = await loadField(tx, id);
      await needRole(tx, cur.projectId, 'manager');
      if (cur.archivedAt) {
        const n = await one<Row>(tx, 'select count(*) n from pm_custom_fields where project_id = $1 and archived_at is null', [cur.projectId]);
        if ((n!.n as number) >= MAX_FIELDS) bad('id', `A project can have at most ${MAX_FIELDS} custom fields`);
        await run(tx, `update pm_custom_fields set archived_at = null, position = (select coalesce(max(position), 0) + 1000 from pm_custom_fields where project_id = $2 and archived_at is null) where id = $1`, [id, cur.projectId]);
      }
      return loadField(tx, id);
    });
  },

  'fields.purge': async (ctx, args) => {
    const id = V.uuid(args.id, 'id');
    return asUser(ctx, async (tx) => {
      const cur = await loadField(tx, id);
      await needRole(tx, cur.projectId, 'manager');
      if (!cur.archivedAt) bad('id', 'Archive the field before deleting it permanently');
      await run(tx, 'delete from pm_custom_fields where id = $1 and archived_at is not null', [id]); // its values go with it (cascade)
      return { ok: true } as const;
    });
  },

  'fields.reorder': async (ctx, args) => {
    const projectId = V.uuid(args.projectId, 'projectId');
    const ids = V.uuidList(args.ids, 'ids', MAX_FIELDS);
    return asUser(ctx, async (tx) => {
      await needRole(tx, projectId, 'manager');
      const active = await fieldsOf(tx, projectId);
      if (ids.length !== active.length || !active.every((f) => ids.includes(f.id))) bad('ids', 'Send every active field exactly once');
      for (let i = 0; i < ids.length; i++) await run(tx, 'update pm_custom_fields set position = $2 where id = $1', [ids[i], (i + 1) * 1000]);
      return fieldsOf(tx, projectId);
    });
  },

  'tasks.setField': async (ctx, args) => {
    const taskId = V.uuid(args.taskId, 'taskId');
    const fieldId = V.uuid(args.fieldId, 'fieldId');
    if (args.value === undefined) bad('value', 'value is required (use null to clear)');
    return asUser(ctx, async (tx) => {
      const t = await editableTask(tx, taskId);
      const changes = await planFieldChanges(tx, t.project_id, taskId, { [fieldId]: args.value });
      if (changes !== 'skip') await applyFieldChanges(tx, t.project_id, taskId, changes);
      return taskRowById(tx, taskId);
    });
  },
} satisfies Partial<{ [K in OpName]: (ctx: Ctx, args: Ops[K][0]) => Promise<Ops[K][1]> }>;
