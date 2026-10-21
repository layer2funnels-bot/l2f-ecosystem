// Typed input for API operations. No dependencies. Unknown fields are refused (an input can never smuggle an
// organization id or a column the operation did not declare). Failures name fields only, never values.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

export const isUuid = (v) => typeof v === 'string' && UUID.test(v);

// spec: { field: { type, required?, max?, min?, values?, items? } }; types: uuid text email int bool enum list
const rules = {
  uuid: (v) => isUuid(v),
  text: (v, f) => typeof v === 'string' && v.length >= (f.min ?? 1) && v.length <= (f.max ?? 200),
  email: (v) => typeof v === 'string' && v.length <= 320 && EMAIL.test(v),
  int: (v, f) => Number.isInteger(v) && v >= (f.min ?? -2147483648) && v <= (f.max ?? 2147483647),
  bool: (v) => typeof v === 'boolean',
  enum: (v, f) => f.values.includes(v),
  list: (v, f) => Array.isArray(v) && v.length <= (f.max ?? 50) && v.every((x) => rules[f.items](x, f)),
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
