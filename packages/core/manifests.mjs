// App registry: one apps/<dir>/app.manifest.json per app (docs/EXTERNAL_APP_ONBOARDING.md section 4). The Launcher, app switcher,
// Office > Apps and the tests read these files, so a new app does not need edits scattered across the code.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const GROUPS = ['Everyday', 'Studio'];
export const STATUSES = ['building', 'soon', 'locked', 'live'];
const STORAGE = ['drive-documents', 'storage-adapter', 'own-database', 'none'];
const ORGS = ['layer2funnels', 'aurj'];

/** Problems in one manifest, as readable sentences (empty = fine). */
export function manifestProblems(m) {
  const p = [];
  const need = (ok, msg) => { if (!ok) p.push(msg); };
  need(typeof m.id === 'string' && /^[a-z][a-z0-9_]{1,40}$/.test(m.id), 'id must be the app key (lower case, digits, underscore)');
  need(typeof m.name === 'string' && m.name.length > 0, 'name is required');
  need(GROUPS.includes(m.group), `group must be one of ${GROUPS.join(', ')}`);
  need(Array.isArray(m.plate?.colors) && m.plate.colors.length === 3 && m.plate.colors.every((c) => /^#[0-9A-Fa-f]{6}$/.test(c)), 'plate.colors must be three hex colours');
  need(typeof m.routes === 'string' && m.routes.startsWith('/') && m.routes.endsWith('/*'), 'routes must look like /name/*');
  need(Array.isArray(m.orgs) && m.orgs.length > 0 && m.orgs.every((o) => ORGS.includes(o)), 'orgs must name known organizations');
  need(Array.isArray(m.permissionPrefix), 'permissionPrefix must be a list');
  need(typeof m.grantRequired === 'boolean', 'grantRequired must be true or false');
  need(STATUSES.includes(m.status), `status must be one of ${STATUSES.join(', ')}`);
  need(['embeds', 'reuses', 'searchTypes', 'integrations'].every((k) => Array.isArray(m[k])), 'embeds, reuses, searchTypes and integrations must be lists');
  need(STORAGE.includes(m.storage), `storage must be one of ${STORAGE.join(', ')}`);
  need(Number.isInteger(m.order) && m.order > 0, 'order must be a positive whole number (position in the Launcher)');
  need(m.ai === false, 'ai must be false (no AI provider is switched on)');
  need(m.integrations?.length === 0, 'integrations must be empty (none are switched on)');
  return p;
}

const APPS_DIR = fileURLToPath(new URL('../../apps/', import.meta.url));
export function loadManifests(dir = APPS_DIR) {
  return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(`${dir}${d.name}/app.manifest.json`))
    .map((d) => ({ ...JSON.parse(readFileSync(`${dir}${d.name}/app.manifest.json`, 'utf8')), dir: d.name }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
