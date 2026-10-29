// Local demo backend: PostgreSQL 17 in the browser (PGlite, persisted in IndexedDB) running the repository's real
// migrations under the same row-level policies as production. Identity is set exactly as PostgREST does.
// It exists so Planner can be used and tested without a live Supabase project; it holds synthetic data only.
import { PGlite } from '@electric-sql/pglite';
import type { PlannerBackend } from './types.ts';
import { makeBackend } from './localBackend.ts';
import { seedDemo, DEMO_IDS } from './demoSeed.ts';

const migrations = import.meta.glob('../../../../migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const SEED_VERSION = 5;

export interface LocalEngine {
  db: PGlite;
  backendFor(userId: string): PlannerBackend & { userId: string };
  asSuper<T>(fn: (db: PGlite) => Promise<T>): Promise<T>;
  reset(): Promise<void>;
}

function fingerprint(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

const sortedMigrations = () => Object.entries(migrations).sort(([a], [b]) => a.localeCompare(b));
// ?db=<name> in the address opens a separate demo database (used so parallel test tabs never overwrite each other).
const tabSuffix = () => {
  const raw = (new URLSearchParams(window.location.search).get('db') ?? '').replace(/[^a-z0-9-]/gi, '').slice(0, 24);
  return raw ? `-${raw}` : '';
};
const dbName = () => `l2f-planner-demo-${fingerprint(sortedMigrations().map(([, s]) => s).join('\n') + SEED_VERSION)}${tabSuffix()}`;

let singleton: Promise<LocalEngine> | null = null;
export function openLocalEngine(): Promise<LocalEngine> { return (singleton ??= create()); }

async function create(): Promise<LocalEngine> {
  const name = dbName();
  const db = new PGlite(`idb://${name}`);
  await db.waitReady;
  const present = (await db.query<{ t: string | null }>(`select to_regclass('public.planner_plans')::text t`)).rows[0]?.t;
  const seeded = present ? (await db.query<{ c: number }>(`select count(*)::int c from public.workspaces`)).rows[0]?.c : 0;
  if (!present || !seeded) {
    for (const [, sql] of sortedMigrations()) await db.exec(sql);
    await seedDemo(db);
  }
  const engine: LocalEngine = {
    db,
    asSuper: (fn) => fn(db),
    async reset() {
      await db.close();
      await new Promise<void>((resolve) => { const r = indexedDB.deleteDatabase(`/pglite/${name}`); r.onsuccess = r.onerror = r.onblocked = () => resolve(); });
      singleton = null;
    },
    backendFor(userId) { return makeBackend(db, userId); },
  };
  return engine;
}

export { DEMO_IDS };
