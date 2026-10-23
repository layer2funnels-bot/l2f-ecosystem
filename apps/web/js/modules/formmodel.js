// Form Builder model: field types, building fields, show-if logic and answer checking. Pure functions (no DOM). The database checks the same rules again;
// these let the builder and the preview tell people what is wrong before they save or submit.
export const FIELD_TYPES = [
  ['text', 'Short text'], ['textarea', 'Long text'], ['email', 'Email'], ['phone', 'Phone'], ['url', 'Web address'], ['number', 'Number'],
  ['date', 'Date'], ['select', 'Dropdown (one choice)'], ['multi_select', 'Checkboxes (many choices)'], ['checkbox', 'Yes or no'], ['file', 'File upload'],
];
export const typeLabel = (t) => (FIELD_TYPES.find(([k]) => k === t) ?? [t, t])[1];
export const MAX_FIELDS = 60, MAX_FILES = 10, MAX_FILE_MB = 25;
export const OPS = [['eq', 'is'], ['neq', 'is not'], ['filled', 'has an answer'], ['empty', 'has no answer']];

export const keyFromLabel = (label, taken = []) => {
  const base = (String(label).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]+/, '') || 'question').slice(0, 36);
  let k = base; let n = 2; while (taken.includes(k)) { k = `${base}_${n}`.slice(0, 40); n += 1; } return k;
};
export function newField(type, fields = []) {
  const label = typeLabel(type).replace(/ \(.*\)/, '');
  const f = { key: keyFromLabel(label, fields.map((x) => x.key)), type, label, required: false };
  if (type === 'select' || type === 'multi_select') f.options = ['Option 1', 'Option 2'];
  return f;
}
export function cleanField(f) {
  const out = { key: f.key, type: f.type, label: String(f.label ?? '').trim(), required: Boolean(f.required) };
  if (f.help && String(f.help).trim()) out.help = String(f.help).trim().slice(0, 300);
  if (f.type === 'select' || f.type === 'multi_select') out.options = (f.options ?? []).map((o) => String(o).trim()).filter(Boolean).slice(0, 50);
  if (['number', 'text', 'textarea'].includes(f.type)) { for (const k of ['min', 'max']) if (f[k] !== undefined && f[k] !== null && f[k] !== '' && Number.isFinite(Number(f[k]))) out[k] = Number(f[k]); }
  if (f.type === 'file') { if (f.accept?.length) out.accept = f.accept.map((x) => String(x).toLowerCase().replace(/^\./, '').trim()).filter(Boolean).slice(0, 10); if (f.max_mb) out.max_mb = Number(f.max_mb); }
  if (f.show_if?.key) { out.show_if = { key: f.show_if.key, op: f.show_if.op }; if (['eq', 'neq'].includes(f.show_if.op)) out.show_if.value = f.show_if.value ?? ''; }
  return out;
}
/** Problems with the field list, in plain words, keyed by field key ('' = the form as a whole). Mirrors the database rules. */
export function checkFields(fields) {
  const errs = {}; const add = (k, m) => { (errs[k] ??= []).push(m); }; const seen = [];
  if (fields.length > MAX_FIELDS) add('', `A form can have at most ${MAX_FIELDS} questions.`);
  for (const f of fields) {
    if (!f.label?.trim()) add(f.key, 'Give this question a label.');
    if (seen.includes(f.key)) add(f.key, 'Two questions share the same key.');
    if (['select', 'multi_select'].includes(f.type) && !(f.options ?? []).filter((o) => String(o).trim()).length) add(f.key, 'Add at least one choice.');
    if (f.min !== undefined && f.min !== '' && f.max !== undefined && f.max !== '' && Number(f.min) > Number(f.max)) add(f.key, 'The minimum is above the maximum.');
    if (f.type === 'file' && f.max_mb && !(Number(f.max_mb) >= 1 && Number(f.max_mb) <= MAX_FILE_MB)) add(f.key, `File size limit is 1 to ${MAX_FILE_MB} MB.`);
    if (f.show_if?.key && !seen.includes(f.show_if.key)) add(f.key, 'Show-if must point at a question above this one.');
    seen.push(f.key);
  }
  return errs;
}
const empty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
/** Is this question shown, given the answers so far? */
export function visible(field, answers) {
  const s = field.show_if; if (!s?.key) return true; const v = answers[s.key];
  const hit = (x) => (Array.isArray(v) ? v.includes(x) : v === x || String(v) === String(x));
  return s.op === 'eq' ? hit(s.value) : s.op === 'neq' ? !hit(s.value) : s.op === 'filled' ? !empty(v) : empty(v);
}
export const visibleFields = (fields, answers) => fields.filter((f) => visible(f, answers));
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/, PHONE = /^[+0-9 ()\-]{5,30}$/, URL_ = /^https?:\/\/\S{1,2000}$/, DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Plain-word problems with the answers, keyed by field key. Hidden questions are skipped; their answers are dropped by `answersFor`. */
export function checkAnswers(fields, answers) {
  const errs = {};
  for (const f of fields) {
    if (!visible(f, answers)) continue; const v = answers[f.key];
    if (empty(v)) { if (f.required && f.type !== 'checkbox') errs[f.key] = 'This question is required.'; continue; }
    const bad = (m) => { errs[f.key] = m; };
    if (['text', 'textarea'].includes(f.type)) { const n = String(v).length; if (f.min !== undefined && n < f.min) bad(`Write at least ${f.min} characters.`); else if (f.max !== undefined && n > f.max) bad(`Write at most ${f.max} characters.`); else if (n > 10000) bad('That is too long.'); }
    else if (f.type === 'email' && !EMAIL.test(String(v))) bad('Enter an email address like name@example.com.');
    else if (f.type === 'phone' && !PHONE.test(String(v))) bad('Enter a phone number (digits, spaces, + ( ) -).');
    else if (f.type === 'url' && !URL_.test(String(v))) bad('Enter a web address starting with http:// or https://.');
    else if (f.type === 'number') { const n = Number(v); if (!Number.isFinite(n)) bad('Enter a number.'); else if (f.min !== undefined && n < f.min) bad(`Enter ${f.min} or more.`); else if (f.max !== undefined && n > f.max) bad(`Enter ${f.max} or less.`); }
    else if (f.type === 'date' && !DATE.test(String(v))) bad('Pick a date.');
    else if (f.type === 'select' && !(f.options ?? []).includes(v)) bad('Choose one of the options.');
    else if (f.type === 'multi_select' && !(Array.isArray(v) && v.every((x) => (f.options ?? []).includes(x)))) bad('Choose from the options.');
    else if (f.type === 'file' && !(Array.isArray(v) && v.length <= MAX_FILES)) bad(`Attach up to ${MAX_FILES} files.`);
  }
  return errs;
}
/** The answers to store: only visible questions, empty ones left out, numbers as numbers. */
export function answersFor(fields, raw) {
  const out = {};
  for (const f of fields) {
    if (!visible(f, raw)) continue; const v = raw[f.key];
    if (f.type === 'checkbox') { if (v !== undefined) out[f.key] = Boolean(v); continue; }
    if (empty(v)) continue;
    out[f.key] = f.type === 'number' ? Number(v) : v;
  }
  return out;
}
export const fileProblem = (field, file) => {
  const ext = String(file.name).split('.').pop().toLowerCase(); const mb = (field.max_mb ?? MAX_FILE_MB);
  if (field.accept?.length && !field.accept.includes(ext)) return `Only ${field.accept.join(', ')} files are accepted.`;
  if (file.size > mb * 1048576) return `Files can be at most ${mb} MB.`;
  return null;
};
