// One public error vocabulary for every API route (T4: denied and not-found are indistinguishable).
// Framework-neutral: call toPublicError(err) wherever a database or Supabase error is caught.
// Never forward database messages, codes or constraint names to a browser.

export const NOT_FOUND = Object.freeze({ status: 404, code: 'not_found', message: 'Not found.' });
export const CONFLICT = Object.freeze({ status: 409, code: 'conflict', message: 'This was changed or already exists. Refresh and try again.' });
export const INVALID = Object.freeze({ status: 422, code: 'invalid', message: 'Some details need fixing.' });
export const UNAVAILABLE = Object.freeze({ status: 503, code: 'unavailable', message: 'The service is waking up or busy. Try again in a minute.' });
export const RATE_LIMITED = Object.freeze({ status: 429, code: 'rate_limited', message: 'Too many requests. Wait a moment and try again.' });
export const ORG_REQUIRED = Object.freeze({ status: 400, code: 'org_required', message: 'Choose an organization first.' });
export const SESSION_EXPIRED = Object.freeze({ status: 401, code: 'session_expired', message: 'Your session has ended. Sign in again.' });
export const BAD_REQUEST = Object.freeze({ status: 400, code: 'bad_request', message: 'That request could not be read.' });
export const STORAGE_LIMIT = Object.freeze({ status: 507, code: 'storage_limit', message: 'The storage limit has been reached, so this file was not saved. Delete files you no longer need, or ask an admin.' });
export const WEATHER_OFF = Object.freeze({ status: 503, code: 'weather_unavailable', message: 'Weather is not available right now.' });
export const STORAGE_OFF = Object.freeze({ status: 503, code: 'storage_unavailable', message: 'File storage is not available right now.' });
export const IN_USE = Object.freeze({ status: 409, code: 'in_use', message: 'This is still used somewhere else (for example attached to a task, a post or a brand kit), so it can’t be deleted. Remove it from there first.' });
export const NOT_EMPTY = Object.freeze({ status: 409, code: 'not_empty', message: 'Something inside this folder could not be moved out (it may be locked or hidden). Ask an owner, then try again.' });
export const FAILED = Object.freeze({ status: 500, code: 'failed', message: 'Something went wrong. Nothing was changed.' });

// 42501 RLS/permission denied · 23503 reference not found or in another workspace · P0002 invitation invalid
// PGRST116 PostgREST "no rows" · PGRST301/PGRST302 JWT problems (treated as not-found, never "unauthorised")
const AS_NOT_FOUND = new Set(['42501', '23503', 'P0002', 'PGRST116', 'PGRST301', 'PGRST302']);
const AS_CONFLICT = new Set(['23505', '40001', '40P01']);
const AS_INVALID = new Set(['23502', '23514', '22P02', '22001', 'P0001']);
const AS_UNAVAILABLE = new Set(['57P01', '57P03', '53300', '08006', '08001', 'PGRST000', 'PGRST002']);

export function toPublicError(err) {
  if (!err) return null;
  const code = String(err.code ?? '');
  if (code === 'DRIVE_IN_USE') return IN_USE;
  if (AS_NOT_FOUND.has(code)) return NOT_FOUND;
  if (AS_CONFLICT.has(code)) return CONFLICT;
  if (code === 'P0001' && /storage limit reached/.test(String(err.message ?? ''))) return STORAGE_LIMIT;
  if (code === 'STORAGE_OFF') return STORAGE_OFF;
  if (code === 'DRIVE_IN_USE') return IN_USE;
  if (code === 'P0001' && /empty this folder first/.test(String(err.message ?? ''))) return NOT_EMPTY;
  if (code === 'WEATHER_OFF' || code === 'weather_unavailable') return WEATHER_OFF;
  if (code === 'bad_place') return INVALID;
  if (AS_INVALID.has(code)) return INVALID;
  if (AS_UNAVAILABLE.has(code)) return UNAVAILABLE;
  return FAILED;
}

// A read that returns no row is reported exactly like a denied read.
export const requireRow = (rows) => (rows && rows.length ? rows[0] : Promise.reject({ code: 'PGRST116' }));

// Log line safe for shared logs (T15): no message text, no ids, only the class and the code.
export const logSafe = (err, route) => ({ route, class: toPublicError(err)?.code, db_code: err?.code ?? null });
