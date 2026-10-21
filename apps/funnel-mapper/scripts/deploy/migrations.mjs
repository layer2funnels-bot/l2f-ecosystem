// Shared by deploy.mjs and the local verification: how migrations are sent to a Supabase project.
import { readdirSync, readFileSync } from "node:fs";

export const HISTORY_DDL = `create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);`;

/** supabase/migrations/*.sql in order → [{ file, version, name, body }] */
export function listMigrations(root) {
  return readdirSync(`${root}supabase/migrations`)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort()
    .map((file) => {
      const [, version, name] = file.match(/^(\d+)_(.+)\.sql$/);
      return { file, version, name, body: readFileSync(`${root}supabase/migrations/${file}`, "utf8") };
    });
}

/** One transaction per migration, recorded in the same history table the Supabase CLI uses. */
export function wrapMigration({ file, version, name, body }) {
  if (body.includes("$fm_migration$")) throw new Error(`${file} contains the reserved quote tag $fm_migration$`);
  return `begin;\n${body}\n;\ninsert into supabase_migrations.schema_migrations (version, name, statements) values ('${version}', '${name}', array[$fm_migration$${body}$fm_migration$]);\ncommit;`;
}

/**
 * Which repo migrations still need applying, given the database's migration history.
 *
 * Databases migrated through the Supabase dashboard / connector record their own timestamps and sometimes split a
 * migration into chunks (`workspaces_1_membership`, …), so a repo migration counts as applied when its version is
 * recorded, or a recorded name equals its name or starts with `<name>_`. `baseline` (a version) marks every repo
 * migration up to and including it as applied, for histories that can't be matched by name.
 *
 * Refuses (throws) when an unapplied migration is older than one already applied: re-running it would put back
 * older function definitions (e.g. handle_new_user) over newer ones. Fix the history or pass a baseline.
 * @param {{ version: string, name: string, file: string }[]} repo
 * @param {{ version: string, name?: string | null }[]} history
 * @param {string} [baseline]
 */
export function pendingMigrations(repo, history, baseline) {
  const versions = new Set(history.map((h) => String(h.version)));
  const names = history.map((h) => String(h.name ?? ""));
  const done = (m) => (baseline && m.version <= baseline) || versions.has(m.version) || names.some((n) => n === m.name || n.startsWith(`${m.name}_`));
  const flags = repo.map(done);
  const lastDone = flags.lastIndexOf(true);
  const gap = flags.findIndex((d, i) => !d && i < lastDone);
  if (gap !== -1)
    throw new Error(
      `${repo[gap].file} isn't recorded as applied, but the later ${repo[lastDone].file} is. Applying it now could undo newer changes. ` +
        `Check the database, then rerun with MIGRATIONS_BASELINE=<last version already in the database> (e.g. ${repo[lastDone].version}).`,
    );
  return repo.filter((_, i) => !flags[i]);
}
