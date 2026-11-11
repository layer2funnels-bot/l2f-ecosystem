// Custom fields: type metadata, formatting / parsing, sorting, filtering and the optimistic write used by every surface
// (drawer, list cells, board, context menu, bulk bar). Nothing here talks to the UI primitives except the icons.
import type { ReactNode } from 'react';
import type { CustomField, FieldFilter, FieldFilterOp, FieldOption, FieldType, FieldValue, TaskDetail, TaskRow } from '../../shared/api.ts';
import { call } from '../api/client.ts';
import { invalidateWork, setQueryData } from '../api/store.ts';
import { toast } from '../ui/Toast.tsx';

// ───────────── type metadata ─────────────
export const TYPE_META: Record<FieldType, { label: string; desc: string }> = {
  text: { label: 'Text', desc: 'Free text up to 2,000 characters, like a note or a reference.' },
  number: { label: 'Number', desc: 'A plain number with 0 to 4 decimals, like a score or a count.' },
  currency: { label: 'Currency', desc: 'An amount of money in one currency, such as USD or PKR.' },
  select: { label: 'Select', desc: 'Pick one colored option from a list you define.' },
  multiselect: { label: 'Multi-select', desc: 'Pick several colored options from a list you define.' },
  date: { label: 'Date', desc: 'A calendar date, like a launch or review date.' },
  checkbox: { label: 'Checkbox', desc: 'A yes / no switch, like Approved or Invoiced.' },
  url: { label: 'Link', desc: 'A web address that opens in a new tab.' },
};

const ICON_PATHS: Record<FieldType, ReactNode> = {
  text: <path d="M3 4h10M8 4v9M6 13h4" />,
  number: <path d="M6.2 2.8L5.2 13.2M10.8 2.8l-1 10.4M2.8 6h10.4M2.6 10h10.4" />,
  currency: <path d="M8 1.8v12.4M10.8 5c0-1.1-1.2-1.7-2.8-1.7S5.2 4 5.2 5.3c0 3.1 5.6 1.9 5.6 5 0 1.2-1.2 2.4-2.8 2.4S5 12 5 10.8" />,
  select: <><circle cx="8" cy="8" r="5.6" /><path d="M5.8 7l2.2 2.3L10.2 7" /></>,
  multiselect: <path d="M2.8 4.2l1.1 1.1 1.9-2.1M2.8 9.2l1.1 1.1 1.9-2.1M8 4.6h5.2M8 9.6h5.2M2.8 13.2h0M8 13h3" />,
  date: <><rect x="2.5" y="3.5" width="11" height="10" rx="1.6" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" /></>,
  checkbox: <><rect x="2.8" y="2.8" width="10.4" height="10.4" rx="2" /><path d="M5.6 8.2l1.8 1.8 3.2-3.6" /></>,
  url: <path d="M6.8 9.2a2.5 2.5 0 0 0 3.5 0l2.2-2.2a2.5 2.5 0 0 0-3.5-3.5l-.6.6M9.2 6.8a2.5 2.5 0 0 0-3.5 0L3.5 9a2.5 2.5 0 0 0 3.5 3.5l.6-.6" />,
};
export function FieldTypeIcon({ type, size = 14 }: { type: FieldType; size?: number }) {
  return (
    <svg className="pm-icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICON_PATHS[type]}
    </svg>
  );
}

export const OPTION_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#64748b', '#f97316'];

const FALLBACK_CURRENCIES = ['USD', 'EUR', 'GBP', 'PKR', 'AED', 'SAR', 'INR', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'SGD', 'TRY', 'ZAR'];
export const CURRENCY_CODES: string[] = (() => {
  try { return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('currency'); } catch { return FALLBACK_CURRENCIES; }
})();
export const POPULAR_CURRENCIES = ['USD', 'PKR', 'EUR', 'GBP', 'AED', 'SAR', 'INR', 'CAD', 'AUD'];
export function currencyName(code: string): string {
  try { return new Intl.DisplayNames(undefined, { type: 'currency' }).of(code) ?? code; } catch { return code; }
}

// ───────────── formatting ─────────────
const nf = new Map<string, Intl.NumberFormat>();
function fmt(key: string, make: () => Intl.NumberFormat): Intl.NumberFormat {
  let f = nf.get(key);
  if (!f) { f = make(); nf.set(key, f); }
  return f;
}
export function decimalsOf(f: CustomField): number {
  if (f.type === 'number') return f.decimals ?? 0;
  return fmt(`cd:${f.currency}`, () => new Intl.NumberFormat(undefined, { style: 'currency', currency: f.currency ?? 'USD' })).resolvedOptions().maximumFractionDigits ?? 2;
}
export function formatNumber(f: CustomField, v: number): string {
  if (f.type === 'currency') {
    const code = f.currency ?? 'USD';
    return fmt(`c:${code}`, () => new Intl.NumberFormat(undefined, { style: 'currency', currency: code })).format(v);
  }
  const d = f.decimals ?? 0;
  return fmt(`n:${d}`, () => new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: d })).format(v);
}
export function currencySymbol(code: string): string {
  try { return fmt(`c:${code}`, () => new Intl.NumberFormat(undefined, { style: 'currency', currency: code })).formatToParts(0).find((p) => p.type === 'currency')?.value ?? code; } catch { return code; }
}
export const optionOf = (f: CustomField, id: string): FieldOption | undefined => f.options.find((o) => o.id === id);

/** Plain-text form of a value (tooltips, sorting by text, exports). Empty string = no value. */
export function valueText(f: CustomField, v: FieldValue | undefined | null): string {
  if (v === undefined || v === null) return '';
  switch (f.type) {
    case 'number': case 'currency': return typeof v === 'number' ? formatNumber(f, v) : '';
    case 'select': return typeof v === 'string' ? optionOf(f, v)?.label ?? '' : '';
    case 'multiselect': return Array.isArray(v) ? v.map((id) => optionOf(f, id)?.label).filter(Boolean).join(', ') : '';
    case 'checkbox': return v === true ? 'Yes' : '';
    default: return String(v);
  }
}

// ───────────── parsing what a person types ─────────────
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
export function parseNumberText(text: string, f: CustomField): Parsed<number | null> {
  const raw = text.trim();
  if (!raw) return { ok: true, value: null };
  const cleaned = raw.replace(/[,\s_']/g, '').replace(/^[^\d+\-.]+/, '').replace(/[^\d.eE+\-]+$/, '');
  const n = Number(cleaned);
  if (!cleaned || !Number.isFinite(n)) return { ok: false, error: 'Enter a number, like 1250.50' };
  if (Math.abs(n) > 1e12) return { ok: false, error: 'That number is too large (limit: 1,000,000,000,000).' };
  const d = decimalsOf(f);
  if (Math.abs(Number(n.toFixed(d)) - n) > 1e-9 * Math.max(1, Math.abs(n))) {
    return { ok: false, error: d === 0 ? 'This field takes whole numbers only.' : `At most ${d} decimal${d === 1 ? '' : 's'} here.` };
  }
  return { ok: true, value: Number(n.toFixed(d)) };
}
export function parseUrlText(text: string): Parsed<string | null> {
  const raw = text.trim();
  if (!raw) return { ok: true, value: null };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  if (!/^https?:\/\/[^\s]+$/i.test(withScheme) || withScheme.length > 2000) return { ok: false, error: 'Enter a web address like https://example.com' };
  try { new URL(withScheme); } catch { return { ok: false, error: 'Enter a web address like https://example.com' }; }
  return { ok: true, value: withScheme };
}
export const hostLabel = (url: string): string => { try { return new URL(url).host.replace(/^www\./, '') + (new URL(url).pathname.length > 1 ? '/…' : ''); } catch { return url; } };

// ───────────── sorting ─────────────
const has = (v: unknown) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0);

/** Compares two tasks by a field. Tasks without a value always sort last (also when descending). */
export function compareByField(f: CustomField, a: TaskRow, b: TaskRow, desc: boolean): number {
  const va = a.fields[f.id], vb = b.fields[f.id];
  const ea = !has(va), eb = !has(vb);
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
  let c = 0;
  switch (f.type) {
    case 'number': case 'currency': c = (va as number) - (vb as number); break;
    case 'checkbox': c = Number(va === true) - Number(vb === true); break;
    case 'select': c = f.options.findIndex((o) => o.id === va) - f.options.findIndex((o) => o.id === vb); break;
    case 'multiselect': c = valueText(f, va).localeCompare(valueText(f, vb), undefined, { sensitivity: 'base' }); break;
    case 'date': c = String(va).localeCompare(String(vb)); break;
    default: c = String(va).localeCompare(String(vb), undefined, { sensitivity: 'base', numeric: true });
  }
  return desc ? -c : c;
}

// ───────────── filtering (client side: tasks.list already carries every value of the project) ─────────────
export const OPS_BY_TYPE: Record<FieldType, FieldFilterOp[]> = {
  text: ['contains', 'is', 'is_not', 'is_set', 'is_empty'],
  url: ['contains', 'is', 'is_not', 'is_set', 'is_empty'],
  number: ['is', 'is_not', 'gt', 'lt', 'is_set', 'is_empty'],
  currency: ['is', 'is_not', 'gt', 'lt', 'is_set', 'is_empty'],
  select: ['is', 'is_not', 'is_set', 'is_empty'],
  multiselect: ['contains', 'is_not', 'is_set', 'is_empty'],
  date: ['is', 'gt', 'lt', 'is_set', 'is_empty'],
  checkbox: ['is'],
};
export function opLabel(type: FieldType, op: FieldFilterOp): string {
  if (type === 'date') return ({ is: 'is', gt: 'is after', lt: 'is before' } as Record<string, string>)[op] ?? opBase[op];
  if (type === 'multiselect') return ({ contains: 'has', is_not: 'does not have' } as Record<string, string>)[op] ?? opBase[op];
  return opBase[op];
}
const opBase: Record<FieldFilterOp, string> = { is: 'is', is_not: 'is not', contains: 'contains', gt: 'greater than', lt: 'less than', is_set: 'is set', is_empty: 'is empty' };
export const opNeedsValue = (op: FieldFilterOp) => op !== 'is_set' && op !== 'is_empty';
export function defaultFilter(f: CustomField): FieldFilter {
  const op = OPS_BY_TYPE[f.type][0];
  return { fieldId: f.id, op, ...(f.type === 'checkbox' ? { value: true } : {}) };
}
/** A filter that still needs a value does not filter anything yet. */
export function filterIsActive(flt: FieldFilter): boolean {
  if (!opNeedsValue(flt.op)) return true;
  const v = flt.value;
  return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
}
export function matchesFieldFilter(t: TaskRow, flt: FieldFilter, f: CustomField): boolean {
  const v = t.fields[f.id];
  if (flt.op === 'is_set') return has(v);
  if (flt.op === 'is_empty') return !has(v);
  if (!filterIsActive(flt)) return true;
  const want = flt.value;
  switch (f.type) {
    case 'checkbox': return (v === true) === (want === true);
    case 'select': return flt.op === 'is' ? v === want : v !== want;
    case 'multiselect': { const hit = Array.isArray(v) && typeof want === 'string' && v.includes(want); return flt.op === 'contains' ? hit : !hit; }
    case 'number': case 'currency': {
      if (!has(v)) return flt.op === 'is_not';
      const n = v as number, w = Number(want);
      return flt.op === 'is' ? n === w : flt.op === 'is_not' ? n !== w : flt.op === 'gt' ? n > w : n < w;
    }
    case 'date': {
      if (!has(v)) return false;
      return flt.op === 'is' ? v === want : flt.op === 'gt' ? String(v) > String(want) : String(v) < String(want);
    }
    default: {
      const s = String(v ?? '').toLowerCase(), w = String(want).toLowerCase();
      return flt.op === 'contains' ? s.includes(w) : flt.op === 'is' ? s === w : s !== w;
    }
  }
}
export function describeFilter(f: CustomField, flt: FieldFilter): string {
  const value = !opNeedsValue(flt.op) ? '' : f.type === 'select' || f.type === 'multiselect' ? optionOf(f, String(flt.value))?.label ?? '…'
    : f.type === 'checkbox' ? (flt.value === true ? 'checked' : 'not checked')
      : f.type === 'number' || f.type === 'currency' ? (typeof flt.value === 'number' ? formatNumber(f, flt.value) : '…') : String(flt.value ?? '…');
  return `${f.name} ${f.type === 'checkbox' ? '' : opLabel(f.type, flt.op)} ${value}`.replace(/\s+/g, ' ').trim();
}

// ───────────── optimistic writes ─────────────
/** Applies field changes to a row (null clears). */
export function applyFieldsToRow<T extends { fields: Record<string, FieldValue> }>(t: T, changes: Record<string, FieldValue | null>): T {
  const next = { ...t.fields };
  for (const [id, v] of Object.entries(changes)) { if (v === null || (Array.isArray(v) && v.length === 0)) delete next[id]; else next[id] = v; }
  return { ...t, fields: next };
}

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');

/**
 * Saves one value: the cached task list and task detail change at once, a failure rolls both back and says why.
 * Resolves to true when the server accepted it.
 */
export async function setTaskField(task: { id: string; projectId: string }, fieldId: string, value: FieldValue | null): Promise<boolean> {
  const one = { [fieldId]: value };
  const undoList = setQueryData<TaskRow[]>(`tasks:${task.projectId}`, (old) => old.map((t) => (t.id === task.id ? applyFieldsToRow(t, one) : t)));
  const undoDetail = setQueryData<TaskDetail>(`task:${task.id}`, (d) => applyFieldsToRow(d, one));
  try {
    await call('tasks.setField', { taskId: task.id, fieldId, value });
    invalidateWork();
    return true;
  } catch (e) {
    undoList(); undoDetail();
    invalidateWork();
    toast.error(errText(e));
    return false;
  }
}

/** Field ids that exist in this project's active fields (stale ids from saved view settings are dropped). */
export const fieldMap = (fields: CustomField[]): Map<string, CustomField> => new Map(fields.map((f) => [f.id, f]));
