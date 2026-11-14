// Launcher (design 03): every app that exists, in the designed order, with its state taken from launcher.catalog (the real app registry
// and this person's access). Funnel Mapper (app key funnel_mapper_pro) is a normal tile: it opens in the same tab.
import { h, icon, dialog, toast, emptyState, errorState, designBadge, roleLabel } from '../ui.js';
import { hrefFor } from '../routes.js';
import { plateOf } from '../registry.js';
import { partOfDay, greeting, chipText, groupCatalog, findApps, atmosphere, weatherOff, snowOff, showSnow } from '../sky.js';

const META = {
  office: ['off', 'Home, plans, funnels, documents, team and admin for this organization.'],
  projects: ['prj', 'Tasks and project work. Your home and your work in one place.'],
  clients: ['cli', 'Your client list, delivery stages and internal notes.'],
  portal: ['por', 'What clients see and approve. Its own sign-in and address.'],
  drive: ['drv', 'Files and documents for the organization and for you.'],
  planner: ['pln', 'Strategy, goals, measures and reviews.'],
  forms: ['frm', 'Build forms and read the answers.'],
  value_ladder: ['vl', 'Map how your offers lead into each other.'],
  social_planner: ['soc', 'Draft, approve and schedule social posts.'],
  whiteboard: ['wb', 'A shared canvas for sketching and planning.'],
  layer2_agents: ['ag', 'AI helpers that draft work for you to approve.'],
  funnel_mapper_pro: ['fmp', 'Map funnels and model the numbers.'],
};
const BUILT = new Set(['office']);          // apps whose screens exist in this build

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// sky tint per atmosphere (sky.js atmosphere()): no snow class anywhere
const FXCLASS = { sun: 'clear', cool: 'cool', heat: 'hot', haze: 'haze', fog: 'fog', cloud: 'cloud', rain: 'rain' };
const FXICON = { sun: 'sun', cool: 'sun', heat: 'heat', haze: 'cloud', fog: 'cloud', cloud: 'cloud', rain: 'rain' };
/** Weather pieces behind the shelf (decorative, hidden from assistive technology; the stylesheet hides them for reduced motion). */
function particles({ effect, wind }) {
  const R = Math.random; const out = [];
  const i = (cls, style = '') => h('i', { class: cls, style });
  if (effect === 'rain') for (let n = 0; n < 70; n++) out.push(i('rdrop', `left:${R() * 110}%;animation-duration:${(0.55 + R() * 0.4).toFixed(2)}s;animation-delay:${(-R() * 2).toFixed(2)}s`));
  if (effect === 'cloud' || effect === 'rain') for (let n = 0; n < 5; n++) out.push(i('cloudp', `top:${4 + n * 9}%;width:${Math.round(260 + R() * 260)}px;height:${Math.round(70 + R() * 60)}px;animation-duration:${Math.round(60 + R() * 50)}s;animation-delay:${Math.round(-R() * 80)}s`));
  if (effect === 'heat') out.push(i('haze'));
  if (effect === 'haze') out.push(i('hazeb'), i('hazeb b2'));
  if (effect === 'fog') for (let n = 0; n < 3; n++) out.push(i('fogb', `top:${30 + n * 18}%;animation-duration:${Math.round(70 + R() * 40)}s;animation-delay:${Math.round(-R() * 60)}s`));
  if (effect === 'sun') out.push(i('sunglow'));
  if (effect === 'cool') out.push(i('coolglow'));
  return out.concat(wind ? gusts() : []);
}
function gusts() {
  const R = Math.random; const out = [];
  for (let n = 0; n < 10; n++) out.push(h('i', { class: 'windl', style: `top:${8 + R() * 70}%;width:${Math.round(120 + R() * 180)}px;animation-duration:${(2.6 + R() * 2.2).toFixed(1)}s;animation-delay:${(-R() * 5).toFixed(1)}s` }));
  return out;
}
/** Snowfall (a creative winter visual with its own switch): 3 depths of soft flakes, different sizes, speeds and sway; CSS only, ~70 elements. */
function snowfall() {
  const R = Math.random; const out = [];
  for (let n = 0; n < 72; n++) {
    const depth = n % 3; const s = [2, 3.5, 5.5][depth] + R() * 1.5;
    out.push(h('i', { class: `snowf d${depth}`, style: `left:${(R() * 104 - 2).toFixed(1)}%;width:${s.toFixed(1)}px;height:${s.toFixed(1)}px;--sway:${Math.round(20 + R() * 40)}px;animation-duration:${(9 + (2 - depth) * 5 + R() * 6).toFixed(1)}s,${(3 + R() * 3).toFixed(1)}s;animation-delay:${(-R() * 20).toFixed(1)}s,${(-R() * 6).toFixed(1)}s` }));
  }
  return out;
}
/** The sky layers on their own (the component gallery draws them inside a small `.lx` box). */
export const skyScene = () => h('div', { class: 'skyset', 'aria-hidden': 'true' }, h('div', { class: 'sky' }), h('div', { class: 'orb' }), h('div', { class: 'tint' }), h('div', { class: 'wx' }));
export const weatherChip = (w) => h('span', { class: 'wxchip', 'data-wx-chip': w.condition, title: `Weather in ${w.place ?? 'Khushab'}. You can turn this off in your profile.` }, icon(FXICON[atmosphere({ symbol: w.symbol, tempC: w.tempC, windMs: w.windMs }).effect] ?? 'sun'), chipText(w));
const GREET = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Working late' };
const LINE = { morning: 'Fresh start. ', afternoon: '', evening: 'Winding down. ', night: 'It’s late, so only what matters. ' };

export function launcherView({ catalog, error, org, orgs, role, name, registry, loadWeather: getWeather, now = () => new Date(), onSwitch, retry }) {
  const part = partOfDay(now().getHours());
  const wxLayer = h('div', { class: 'wx', 'aria-hidden': 'true' });
  const root = h('section', { class: `launcher lx t-${part} w-clear`, 'data-part': part, 'data-wx': 'none' },
    h('div', { class: 'sky', 'aria-hidden': 'true' }), h('div', { class: 'orb', 'aria-hidden': 'true' }), h('div', { class: 'tint', 'aria-hidden': 'true' }), wxLayer);
  const chipSlot = h('div', { class: 'wxslot', 'aria-live': 'polite' });
  const first = String(name ?? '').trim().split(/\s+/)[0];
  const top = h('div', { class: 'l-top on-stage' }, h('span', { 'data-slot': 'org' }), h('span', { 'data-slot': 'who' }));
  const hero = (sub) => h('div', { class: 'l-hero' }, chipSlot,
    h('h1', { 'data-page-title': true }, GREET[part], first ? [',', h('br'), h('em', {}, `${first}.`)] : ''),
    h('p', { class: 'sub' }, sub));
  const wrap = (...kids) => { root.append(h('div', { class: 'l-wrap' }, top, ...kids)); return root; };
  if (error) return wrap(hero(''), h('div', { class: 'shelf' }, errorState(retry)));
  if (!catalog.length) return wrap(hero(''), h('div', { class: 'shelf' }, emptyState({ title: 'No apps yet', body: 'No app is switched on for you in this organization. Ask an admin. If you were invited just now, check again in a minute.', ic: 'grid', first: true })));
  const sub = `${LINE[part]}You see the apps ${role === 'owner' || role === 'admin' ? 'that are set up' : 'your access includes'} in ${org.name}.`;
  const attrib = h('p', { class: 'attrib l-foot', hidden: true }, 'Weather: ', h('a', { href: 'https://www.met.no/en', target: '_blank', rel: 'noopener noreferrer' }, 'Data from MET Norway'), ' (', h('a', { href: 'https://creativecommons.org/licenses/by/4.0/', target: '_blank', rel: 'noopener noreferrer' }, 'CC BY 4.0'), '). Shown as a summary for your area.');
  if (getWeather) getWeather().then((w) => {
    if (!root.isConnected) return;
    if (!w) {   // no weather data (offline or the service is down): the season's calm light only, never fog, rain or wind; nothing when switched off
      let off = true; try { off = weatherOff(localStorage); } catch { off = false; }
      if (!off) { const atm = atmosphere({ month: now().getMonth() }); root.dataset.fx = atm.effect; root.classList.add(`w-${FXCLASS[atm.effect]}`); if (!reduceMotion()) wxLayer.replaceChildren(...particles(atm)); }
      winter(null, null);
      return;
    }
    const atm = atmosphere({ symbol: w.symbol, tempC: w.tempC, windMs: w.windMs, month: now().getMonth() });
    root.dataset.wx = w.condition; root.dataset.fx = atm.effect; root.dataset.wind = String(atm.wind);
    root.className = `launcher lx t-${part} w-${FXCLASS[atm.effect] ?? 'clear'}`;
    wxLayer.replaceChildren(...(reduceMotion() ? [] : particles(atm))); chipSlot.replaceChildren(weatherChip(w)); attrib.hidden = false;
    winter(w.tempC, atm.effect);
  }).catch(() => {});
  // effects are light CSS layers; they stop completely while the tab is hidden (no battery or CPU use in the background)
  // snowfall: its own layer and switch, independent of the weather switch (the weather chip stays accurate)
  const snowLayer = h('div', { class: 'snowlayer', 'aria-hidden': 'true' }); root.append(snowLayer);
  function winter(tempC, effect) {
    let on = true; try { on = !snowOff(localStorage); } catch { on = true; }
    const yes = showSnow({ on, month: now().getMonth(), tempC, effect });
    root.dataset.snow = String(yes); root.classList.toggle('w-snow', yes);
    snowLayer.replaceChildren(...(yes && !reduceMotion() ? snowfall() : []));
  }
  if (!getWeather) winter(null, null);
  const onVis = () => { if (!root.isConnected) return document.removeEventListener('visibilitychange', onVis); root.classList.toggle('paused', document.hidden); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);

  const open = (a, tile) => {
    const [, desc] = META[a.app_key] ?? ['gen', ''];
    if (a.state === 'locked') {
      return dialog({ title: `${a.name} is locked`, body: [h('p', {}, 'Clients can’t sign in yet. The Portal stays off until the security tests for client access pass. ', role === 'owner' ? 'Then you switch it on here.' : 'An owner switches it on when it’s ready.'),
        h('div', { class: 'notice warn', style: 'margin-top:var(--space-3)' }, icon('lock'), h('p', {}, 'Security checks: ', h('b', {}, 'not yet passed'), '. Nothing is visible to clients.'))], actions: [{ label: 'Preview what clients will see', cls: 'primary', on: () => { location.hash = '#/portal'; } }, { label: 'Close', focus: true }] });
    }
    if (a.state === 'coming_soon') {
      return dialog({ title: `${a.name}: coming soon`, body: h('p', {}, a.app_key === 'layer2_agents' ? 'AI helpers are planned. Nothing runs yet, and nothing will without your approval of the provider, cost and data rules.' : `${a.name} is planned. ${desc}`), actions: [{ label: 'Got it', focus: true }] });
    }
    if (a.state === 'not_set_up') {
      const other = orgs.find((o) => o.name === a.other_org);
      return dialog({ title: `${a.name} isn’t set up for ${org.name}`, body: h('p', {}, `${a.name} is on in ${a.other_org ?? 'another organization'}. You’re in ${org.name}, so there’s nothing to open here.`),
        actions: [...(other ? [{ label: `Switch to ${other.name}`, cls: 'primary', on: () => onSwitch(other.org_id) }] : []), { label: 'Ask an admin', on: () => toast('Message only for now. No request was sent.', false) }, { label: 'Close', focus: true }] });
    }
    if (a.app_key === 'funnel_mapper_pro') {
      if (a.launch_url) { location.href = a.launch_url; return; }          // same tab, as a regular app
      return dialog({ title: 'Funnel Mapper isn’t connected yet', body: h('p', {}, 'Its address hasn’t been set. An owner adds it when Funnel Mapper goes live.'), actions: [{ label: 'Close', focus: true }] });
    }
    const go = () => { location.hash = BUILT.has(a.app_key) ? hrefFor.office() : hrefFor.app(a.app_key); };
    if (!tile || reduceMotion()) return go();        // opening an app zooms it out of its icon; no motion if the person asked for none
    tile.classList.add('opening'); setTimeout(go, 170);
  };
  const badge = (s) => (s === 'locked' ? h('span', { class: 'pill' }, icon('lock'), 'Locked') : s === 'coming_soon' ? h('span', { class: 'pill' }, 'Soon') : s === 'not_set_up' ? h('span', { class: 'pill' }, 'Not here') : null);
  const cls = { locked: 'locked', coming_soon: 'soon', not_set_up: 'off', available: 'ok' };
  const dataSt = { locked: 'locked', coming_soon: 'soon', not_set_up: 'notset', available: 'ok' };
  const describe = (a) => (a.state === 'not_set_up' ? `${a.name} isn’t set up for ${org.name}.` : (META[a.app_key] ?? ['gen', ''])[1]);
  const find = h('input', { type: 'search', id: 'app-find', placeholder: 'Find an app', autocomplete: 'off', 'aria-label': 'Find an app' });
  const shelf = h('div', { class: 'shelf' });
  const draw = () => {
    const shown = findApps(catalog, find.value, describe);
    shelf.replaceChildren(...(shown.length ? groupCatalog(shown, registry).map(([group, apps]) => h('div', { class: 'l-group' }, h('h2', {}, group),
      h('div', { class: 'l-grid' }, ...apps.map((a, i) => {
        const tile = h('button', { type: 'button', class: `tile ${cls[a.state] ?? 'ok'}`, style: `--i:${i}`, 'data-app': a.app_key, 'data-st': dataSt[a.state] ?? 'ok', 'aria-label': a.name, onclick: () => open(a, tile) },
          badge(a.state), h('span', { class: 'shadowf' }), plateOf(registry?.get(a.app_key) ?? { id: a.app_key }, 96, 'available'), h('span', { class: 't-name' }, a.name), h('span', { class: 't-desc' }, describe(a)));
        return tile;
      })))) : [h('p', { class: 'l-empty', role: 'status' }, `No app matches “${find.value.trim()}”. Try another word.`)]));
  };
  find.addEventListener('input', draw);
  find.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); shelf.querySelector('.tile')?.click(); } else if (e.key === 'Escape' && find.value) { find.value = ''; draw(); } });
  // "/" jumps to the search box from anywhere on the Launcher (not while typing in a field)
  const slash = (e) => { if (e.key === '/' && !e.ctrlKey && !e.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) && root.isConnected) { e.preventDefault(); find.focus(); } };
  document.addEventListener('keydown', slash);
  draw();
  return wrap(hero(sub), h('div', { class: 'l-hero', style: 'padding:0' }, h('label', { class: 'l-find' }, icon('search'), h('span', { class: 'sr' }, 'Find an app'), find, h('kbd', { 'aria-hidden': 'true' }, '/'))), shelf,
    h('p', { class: 'l-foot' }, `You see the apps you’ve been given in ${org.name}. The sky follows your time of day and local weather.`), attrib);
}

// An app that is on for this person but has no screens in this build yet (shared "not built" state, never a fake page).
export const appNotBuiltView = (name) => h('section', {}, designBadge(), h('div', { class: 'crumb' }, 'Apps'), h('h1', { 'data-page-title': true }, name),
  emptyState({ title: `${name} isn’t built yet`, body: 'Its design and screens come later. Nothing has been lost; the data layer is separate.', ic: 'clock', action: h('a', { class: 'btn primary', href: hrefFor.office() }, 'Go to Office Home') }));
export { roleLabel };
