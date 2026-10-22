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
const out = at('dist/web'); rmSync(out, { recursive: true, force: true }); mkdirSync(out + '/packages/core', { recursive: true });
cpSync(at('apps/web'), out, { recursive: true });
cpSync(at('packages/ui'), out + '/packages/ui', { recursive: true });
rmSync(out + '/gallery.html', { force: true }); rmSync(out + '/js/gallery.js', { force: true });         // the component gallery is for development and tests only
writeFileSync(out + '/app-manifests.json', JSON.stringify(loadManifests().map(({ dir, ...m }) => m)));
cpSync(at('packages/core/org-switch.mjs'), out + '/packages/core/org-switch.mjs');
writeFileSync(out + '/config.js', `window.L2F_CONFIG = ${JSON.stringify({ supabaseUrl: url, publishableKey: key, googleEnabled: process.env.GOOGLE_ENABLED === 'true', showDesignStatus: process.env.SHOW_DESIGN_STATUS === 'true' }, null, 2)};\n`);
const headers = readFileSync(out + '/_headers', 'utf8').replace('connect-src \'self\' http://127.0.0.1:54321 https://*.supabase.co', `connect-src 'self' ${new URL(url).origin}`);
writeFileSync(out + '/_headers', headers);
console.log(`built dist/web for ${new URL(url).origin}`);
