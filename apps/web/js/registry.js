// The app registry in the browser: the manifests that scripts/build-web.mjs publishes as /app-manifests.json (one per app).
// The Launcher, the app switcher and Office > Apps read them for the plate (colour, glyph), group and route.
import { h, icon } from './ui.js';

const ICON_FOR = { office: 'off', projects: 'prj', clients: 'cli', portal: 'por', drive: 'drv', planner: 'pln', forms: 'frm', value_ladder: 'vl', social_planner: 'soc', whiteboard: 'wb', layer2_agents: 'ag', funnel_mapper_pro: 'fmp' };
let cache = null;
export async function loadRegistry(fetcher = (u) => fetch(u)) {
  if (cache) return cache;
  try { const r = await fetcher('/app-manifests.json'); cache = r.ok ? new Map((await r.json()).map((m) => [m.id, m])) : new Map(); } catch { cache = new Map(); }
  return cache;
}
export const iconFor = (id) => ICON_FOR[id] ?? 'gen';
/** The rounded-square app plate. `state` greys it out for locked, soon and not-set-up apps. */
export function plateOf(manifest, size = 40, state = 'available') {
  const [c1, c2, c3] = manifest?.plate?.colors ?? ['#C9CBD3', '#9AA0AE', '#6E7483'];
  return h('span', { class: `aplate${state === 'available' ? '' : ' dim'}`, style: `--s:${size}px;--c1:${c1};--c2:${c2};--c3:${c3};--g:${manifest?.plate?.glyph ?? '#FFFEFA'}`, 'aria-hidden': 'true' }, icon(iconFor(manifest?.id)));
}
