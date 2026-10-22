// Typed input for API operations. No dependencies. Unknown fields are refused (an input can never smuggle an
// organization id or a column the operation did not declare). Failures name fields only, never values.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

export const isUuid = (v) => typeof v === 'string' && UUID.test(v);

// lists: max = number of items, itemMax/itemMin = size of each item.
// spec: { field: { type, required?, max?, min?, values?, items? } }; types: uuid text email int number currency date timestamp hex bool enum list json
const rules = {
  uuid: (v) => isUuid(v),
  text: (v, f) => typeof v === 'string' && v.length >= (f.min ?? 1) && v.length <= (f.max ?? 200),
  email: (v) => typeof v === 'string' && v.length <= 320 && EMAIL.test(v),
  int: (v, f) => Number.isInteger(v) && v >= (f.min ?? -2147483648) && v <= (f.max ?? 2147483647),
  bool: (v) => typeof v === 'boolean',
  number: (v, f) => typeof v === 'number' && Number.isFinite(v) && v >= (f.min ?? 0) && v <= (f.max ?? 1e9),
  currency: (v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v),
  date: (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v),
  timestamp: (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v)),   // ISO 8601 with a zone
  hex: (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v),
  enum: (v, f) => f.values.includes(v),
  json: (v, f) => v !== null && typeof v === 'object' && JSON.stringify(v).length <= (f.max ?? 20000),   // an object or list; size-capped here, shape checked by the database
  list: (v, f) => Array.isArray(v) && v.length <= (f.max ?? 50) && v.every((x) => rules[f.items](x, { max: f.itemMax, min: f.itemMin })),
};

// Returns { ok: true, value } with only declared fields, or { ok: false, fields: [names] }.
export function validate(spec, input) {
  const src = input == null ? {} : input;
  if (typeof src !== 'object' || Array.isArray(src)) return { ok: false, fields: ['(input)'] };
  const bad = Object.keys(src).filter((k) => !Object.hasOwn(spec, k));
  const value = {};
  for (const [name, f] of Object.entries(spec)) {
    const v = src[name];
    if (v === undefined || v === null) { if (f.required) bad.push(name); continue; }
    if (!rules[f.type](v, f)) bad.push(name); else value[name] = v;
  }
  return bad.length ? { ok: false, fields: [...new Set(bad)].sort() } : { ok: true, value };
}
