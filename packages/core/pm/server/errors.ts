// API errors and the mapping from Postgres errors to client-safe errors. SQL text is never sent to clients.
import type { ErrorCode } from '../shared/api.ts';

const STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401, forbidden: 403, not_found: 404, invalid: 400, conflict: 409, internal: 500,
};

export class ApiError extends Error {
  code: ErrorCode;
  field?: string;
  constructor(code: ErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    if (field !== undefined) this.field = field;
  }
  get status(): number { return STATUS[this.code]; }
  toJSON() { return { code: this.code, message: this.message, ...(this.field ? { field: this.field } : {}) }; }
}

interface PgLike { code: string; message: string; constraint?: string }
function isPg(e: unknown): e is PgLike {
  return typeof e === 'object' && e !== null && typeof (e as PgLike).code === 'string' && typeof (e as PgLike).message === 'string'
    && /^[0-9A-Z]{5}$/.test((e as PgLike).code);
}

const DATE_RANGE_CONSTRAINTS = new Set(['pm_projects_check', 'pm_tasks_check']);

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (isPg(e)) {
    const { code, message } = e;
    if (code === '42501' || /row-level security/i.test(message)) return new ApiError('forbidden', "You don't have permission to do that");
    if (code === '23514') {
      if (e.constraint && DATE_RANGE_CONSTRAINTS.has(e.constraint)) return new ApiError('invalid', 'The due date must be on or after the start date');
      if (/violates check constraint/i.test(message)) return new ApiError('invalid', 'That value is not allowed');
      return new ApiError('invalid', message); // our own trigger messages, e.g. "this would create a circular wait"
    }
    if (code === '23505') {
      if (e.constraint === 'pm_one_running_timer') return new ApiError('conflict', 'A timer is already running');
      return new ApiError('invalid', 'That already exists');
    }
    if (code === '23503') return new ApiError('invalid', 'A referenced item does not exist or is not available to you');
    if (code === '23502') return new ApiError('invalid', 'A required value is missing');
    if (code.startsWith('22')) {
      const m: Record<string, string> = {
        '22P02': 'A value has the wrong format', '22001': 'A value is too long', '22003': 'A number is out of range',
        '22007': 'A date is not valid', '22008': 'A date is not valid', '22021': 'Text contains characters that are not allowed',
      };
      return new ApiError('invalid', m[code] ?? 'A value is not valid');
    }
    if (code === '40001' || code === '40P01') return new ApiError('conflict', 'The data changed while saving. Please try again.');
  }
  console.error('internal error:', e instanceof Error ? e.message : String(e)); // server log only, never sent to the client
  return new ApiError('internal', 'Something went wrong on our side. Please try again.');
}

