// Small hand-written validators. Each throws ApiError('invalid', message, field).
import { ApiError } from './errors.ts';

export type Obj = Record<string, unknown>;
const bad = (field: string, msg: string): never => { throw new ApiError('invalid', msg, field); };

export function object(x: unknown, field: string): Obj {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return bad(field, `${field} must be an object`);
  return x as Obj;
}

export function noUnknown(o: Obj, allowed: readonly string[], field: string): void {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) bad(k, `Unknown field "${k}" in ${field}`);
}

export function str(x: unknown, field: string, o: { min?: number; max: number; trim?: boolean }): string {
  if (typeof x !== 'string') return bad(field, `${field} must be text`);
  if (x.includes('\u0000')) bad(field, `${field} contains invalid characters`);
  const s = o.trim === false ? x : x.trim();
  const min = o.min ?? 0;
  if (s.length < min) bad(field, min === 1 ? `${field} is required` : `${field} must be at least ${min} characters`);
  if (s.length > o.max) bad(field, `${field} must be at most ${o.max} characters`);
  return s;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(x: unknown): x is string { return typeof x === 'string' && UUID.test(x); }
export function uuid(x: unknown, field: string): string {
  if (!isUuid(x)) return bad(field, `${field} must be a valid id`);
  return x.toLowerCase();
}

export function date(x: unknown, field: string): string {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return bad(field, `${field} must be a date (YYYY-MM-DD)`);
  const [y, m, d] = x.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || y > 2200 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return bad(field, `${field} is not a real date`);
  return x;
}

export function oneOf<T extends string>(x: unknown, field: string, list: readonly T[]): T {
  if (typeof x !== 'string' || !(list as readonly string[]).includes(x)) return bad(field, `${field} must be one of: ${list.join(', ')}`);
  return x as T;
}

export function int(x: unknown, field: string, min: number, max: number): number {
  if (typeof x !== 'number' || !Number.isInteger(x)) return bad(field, `${field} must be a whole number`);
  if (x < min || x > max) return bad(field, `${field} must be between ${min} and ${max}`);
  return x;
}

export function num(x: unknown, field: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x) || Math.abs(x) > 1e15) return bad(field, `${field} must be a number`);
  return x;
}

export function bool(x: unknown, field: string): boolean {
  if (typeof x !== 'boolean') return bad(field, `${field} must be true or false`);
  return x;
}

export function color(x: unknown, field: string): string {
  if (typeof x !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(x)) return bad(field, `${field} must be a hex color like #6366f1`);
  return x;
}

export function arr<T>(x: unknown, field: string, max: number, item: (v: unknown, f: string) => T, min = 0): T[] {
  if (!Array.isArray(x)) return bad(field, `${field} must be a list`);
  if (x.length < min) bad(field, `${field} needs at least ${min} item${min === 1 ? '' : 's'}`);
  if (x.length > max) bad(field, `${field} can have at most ${max} items`);
  return x.map((v, i) => item(v, `${field}[${i}]`));
}

export function uuidList(x: unknown, field: string, max: number, min = 0): string[] {
  return [...new Set(arr(x, field, max, uuid, min))];
}

export function nullable<T>(x: unknown, field: string, f: (v: unknown, field: string) => T): T | null {
  return x === null ? null : f(x, field);
}

/** Parse an optional field: undefined when absent, otherwise validated. */
export function opt<T>(src: object, key: string, f: (v: unknown, field: string) => T): T | undefined {
  const o = src as Obj;
  return o[key] === undefined ? undefined : f(o[key], key);
}

export const optNull = <T>(src: object, key: string, f: (v: unknown, field: string) => T): T | null | undefined => {
  const v = (src as Obj)[key];
  return v === undefined ? undefined : nullable(v, key, f);
};

