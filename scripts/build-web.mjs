// Produces dist/web: the static site Cloudflare Pages would serve (build only; this repository never deploys).
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_... GOOGLE_ENABLED=true node scripts/build-web.mjs
// Only browser-safe values are accepted: a privileged key stops the build.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadManifests } from '../packages/core/manifests.mjs';

const at = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const url = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const key = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
if (/service_role|sb_secret_/i.test(key) || /^eyJ/.test(key)) { console.error('Refusing: that looks like a privileged or legacy JWT key. Use the publishable key.'); process.exit(1); }
import { buildWhiteboard } from './build-whiteboard.mjs';
const out = at('dist/web'); rmSync(out, { recursive: true, force: true }); mkdirSync(out + '/packages/core', { recursive: true });
await buildWhiteboard({ quiet: true });          // the editor bundle (skipped when its build-time dependencies are not installed: the board page then says so)
cpSync(at('apps/web'), out, { recursive: true });
// Planner (React, migration 0033): built by its own Vite config into apps/planner/dist, served at /planner/ (skipped with a note if not built)
try { cpSync(at('apps/planner/dist'), out + '/planner', { recursive: true }); } catch { console.warn('Planner bundle missing: run npm --prefix apps/planner ci && npm --prefix apps/planner run build first.'); }
cpSync(at('packages/ui'), out + '/packages/ui', { recursive: true });
rmSync(out + '/gallery.html', { force: true }); rmSync(out + '/js/gallery.js', { force: true });         // the component gallery is for development and tests only
writeFileSync(out + '/app-manifests.json', JSON.stringify(loadManifests().map(({ dir, ...m }) => m)));
cpSync(at('packages/core/org-switch.mjs'), out + '/packages/core/org-switch.mjs');
writeFileSync(out + '/config.js', `window.L2F_CONFIG = ${JSON.stringify({ supabaseUrl: url, publishableKey: key, googleEnabled: process.env.GOOGLE_ENABLED === 'true', showDesignStatus: process.env.SHOW_DESIGN_STATUS === 'true' }, null, 2)};\n`);
// Files in Cloudflare R2: the browser uploads and previews straight to the bucket through short-lived signed addresses, so the page policy must allow that ONE origin
// (STORAGE_CONNECT_ORIGIN=https://<account id>.r2.cloudflarestorage.com, build-time). Anything else is refused, so a typo cannot widen the policy.
const storageOrigin = process.env.STORAGE_CONNECT_ORIGIN || '';
if (storageOrigin && !/^https:\/\/[a-z0-9]{32}\.r2\.cloudflarestorage\.com$/.test(storageOrigin)) { console.error('STORAGE_CONNECT_ORIGIN must look like https://<32-character account id>.r2.cloudflarestorage.com'); process.exit(1); }
let headers = readFileSync(out + '/_headers', 'utf8').replace('connect-src \'self\' http://127.0.0.1:54321 https://*.supabase.co', `connect-src 'self' ${new URL(url).origin}${storageOrigin ? ` ${storageOrigin}` : ''}`);
if (storageOrigin) headers = headers.replace("img-src 'self' data:", `img-src 'self' data: ${storageOrigin}`);
writeFileSync(out + '/_headers', headers);
console.log(`built dist/web for ${new URL(url).origin}`);
