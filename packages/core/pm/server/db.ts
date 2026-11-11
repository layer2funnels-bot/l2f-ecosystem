// Projects V2 inside the ecosystem: the database seam. The standalone build opened its own PGlite and set its own role;
// here every request already runs in ONE transaction as app_user with the person's claims and x-org-id set by the
// ecosystem executor (packages/core/pg-executor.mjs). asUser() therefore just hands the operation that request's query
// function, wrapped so V2's helpers keep their contract: { rows, affectedRows }, dates as 'YYYY-MM-DD', timestamps as
// ISO strings, bigint/numeric as numbers.

/** The request's query function from the executor: (sql, params) -> rows (with hidden rowCount and fields). */
export type Query = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[] & { rowCount?: number; fields?: { name: string; dataTypeID: number }[] }>;

export interface Session { userId: string; orgId: string | null; q: Query; storage?: import('./files.ts').StorageAdapter | null }

export interface Tx {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[], opts?: unknown): Promise<{ rows: T[]; affectedRows: number }>;
  exec(sql: string): Promise<void>;
}

const TIMESTAMP = new Set([1184, 1114]);            // timestamptz, timestamp
const NUMBER = new Set([20, 21, 23, 700, 701, 1700]); // int8, int2, int4, float4, float8, numeric
const DATE = 1082;

const iso = (v: unknown): unknown => {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') { const d = new Date(v.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')); return Number.isNaN(d.getTime()) ? v : d.toISOString(); }
  return v;
};
const day = (v: unknown): unknown => (v instanceof Date ? v.toISOString().slice(0, 10) : v);

function convert(rows: Record<string, unknown>[], fields: { name: string; dataTypeID: number }[] | undefined): Record<string, unknown>[] {
  if (!fields?.length || !rows.length) return rows;
  const conv = fields.map((f) => [f.name, TIMESTAMP.has(f.dataTypeID) ? iso : NUMBER.has(f.dataTypeID) ? (v: unknown) => (v == null ? v : Number(v)) : f.dataTypeID === DATE ? day : null] as const)
    .filter(([, fn]) => fn !== null) as [string, (v: unknown) => unknown][];
  if (!conv.length) return rows;
  return rows.map((r) => { const o = { ...r }; for (const [k, fn] of conv) if (o[k] != null) o[k] = fn(o[k]); return o; });
}

export function txOf(q: Query): Tx {
  return {
    async query(sql, params = []) {
      const raw = await q(sql, params);
      return { rows: convert(raw, raw.fields) as never[], affectedRows: raw.rowCount ?? raw.length };
    },
    async exec(sql) { await q(sql, []); },
  };
}

/** Runs fn with the request's transaction. No new transaction, no role switch: the executor already did both. */
export async function asUser<T>(s: Session, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return fn(txOf(s.q));
}
