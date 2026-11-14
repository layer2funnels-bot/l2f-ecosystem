// Global search (V8 02_GLOBAL_SHELL §5; owner requirements OR-08…OR-10): Ctrl K anywhere, the rail's search button, a full-screen sheet on
// phones. Records come from the server's search operation, which runs as the signed-in person (only what they may open, never a client's
// files or client-owned records). Apps, pages and menus come from the apps this person has here. Every result is a real link.
import { h, icon, dialog } from '../ui.js';
import { hrefFor } from '../routes.js';
import { plateOf } from '../registry.js';
import { appNav } from '../appnav.js';
import { mediaHref } from '../modules/mediamodel.js';

export const SCOPES = [['all', 'Everything'], ['projects', 'Projects & tasks'], ['tasks', 'Tasks'], ['clients', 'Clients'], ['files', 'Docs & files'], ['office', 'Office'], ['planner', 'Planner'], ['funnels', 'Funnels']];
const IN = { clients: 'clients', projects: 'projects', drive: 'files', files: 'files', docs: 'files', planner: 'planner', funnels: 'funnels', office: 'office', tasks: 'tasks' };
const SCOPE_OF_APP = { projects: 'projects', clients: 'clients', drive: 'files', office: 'office', planner: 'planner', funnel_mapper_pro: 'funnels' };
const APP_OF = { projects: 'projects', clients: 'clients', drive: 'drive', office: 'office', planner: 'planner', people: 'office', pages: 'office' };
const LABEL = { pages: 'Apps and pages', projects: 'Projects', clients: 'Clients', drive: 'Drive', office: 'Office', planner: 'Planner', people: 'People' };
const SHEET = 'application/vnd.l2f.sheet+json', BOARD = 'application/vnd.excalidraw+json';

/** "@me overdue in:clients is:archived quiz" → filters + the plain text (pure; tested). */
export function parseQuery(raw, scope) {
  let s = scope; let archived = false, me = false, overdue = false;
  const words = String(raw ?? '').split(/\s+/).filter((w) => {
    const m = /^in:(\w+)$/i.exec(w); if (m && IN[m[1].toLowerCase()]) { s = IN[m[1].toLowerCase()]; return false; }
    if (/^is:archived$/i.test(w)) { archived = true; return false; }
    if (/^@me$/i.test(w)) { me = true; return false; }
    if (/^overdue$/i.test(w)) { overdue = true; return false; }
    return true;
  });
  return { q: words.join(' ').trim(), scope: s, archived, me, overdue };
}
/** The address of a search result (one routing source: the app's own link builders). */
export function resultHref(r) {
  switch (`${r.app}:${r.type}`) {
    case 'projects:project': return `#/projects/p/${r.id}`;
    case 'projects:task': return `#/projects/p/${r.extra}/list?task=${r.id}`;
    case 'clients:client': return `#/clients/c/${r.id}`;
    case 'office:strategy': return `#/office/funnels/strategy/${r.id}`;
    case 'planner:plan': return `#/planner/map?plan=${r.id}`;
    case 'planner:goal': return `#/planner/map?plan=${r.extra}&goal=${r.id}`;
    case 'people:person': return '#/office/team';
    default:
      if (r.app === 'office') return hrefFor.record(r.type, r.id);
      if (r.app === 'drive') return mediaHref({ id: r.id, kind: r.type, mime_type: r.extra }) ?? (r.extra === SHEET ? `#/sheet/${r.id}` : r.extra === BOARD ? `#/board/${r.id}` : r.type === 'document' ? `#/doc/${r.id}` : '#/drive');
      return r.href ?? '#/launcher';
  }
}
/** Apps, pages and menu entries this person can open here (the "navigation" part of search). */
export function pageEntries(catalog = [], isAdmin = false) {
  const out = [];
  for (const a of catalog.filter((x) => x.state === 'available')) {
    const href = a.app_key === 'office' ? hrefFor.office() : hrefFor.app(a.app_key);
    out.push({ app: 'pages', type: 'app', appKey: a.app_key, title: a.name, subtitle: 'App', href });
    let nav = []; try { nav = appNav(a.app_key, { name: 'search', params: {} }, { isAdmin }).items ?? []; } catch { nav = []; }
    for (const it of nav) {
      out.push({ app: 'pages', type: 'page', appKey: a.app_key, title: it.label, subtitle: a.name, href: it.href });
      for (const k of it.kids ?? []) out.push({ app: 'pages', type: 'page', appKey: a.app_key, title: k.label, subtitle: `${a.name} › ${it.label}`, href: k.href });
    }
  }
  return out;
}
const matches = (text, q) => String(text).toLowerCase().includes(q.toLowerCase());
const mark = (text, q) => { const s = String(text ?? ''); const i = q ? s.toLowerCase().indexOf(q.toLowerCase()) : -1; return i < 0 ? [s] : [s.slice(0, i), h('mark', {}, s.slice(i, i + q.length)), s.slice(i + q.length)]; };

const RECENT = 'l2f.recent';
const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT) ?? '[]').slice(0, 5); } catch { return []; } };
const remember = (r) => { try { const list = [r, ...recent().filter((x) => x.href !== r.href)].slice(0, 5); localStorage.setItem(RECENT, JSON.stringify(list)); } catch { /* private window: not remembered */ } };
const SCOPE_APP = { projects: 'projects', tasks: 'projects', clients: 'clients', files: 'drive', office: 'office', planner: 'planner', funnels: 'funnel_mapper_pro' };
let open = null;       // one search window at a time (a second Ctrl K focuses the open one)
export function openSearch({ api, registry, catalog = [], isAdmin = false, currentApp = null, initial = '' }) {
  if (open) { open.focus(); return; }
  const prev = document.activeElement;
  let scope = SCOPE_OF_APP[currentApp] ?? 'all';
  const input = h('input', { type: 'search', id: 'gsq', autocomplete: 'off', spellcheck: 'false', value: initial, 'aria-label': 'Search', 'aria-controls': 'gsx-res', 'aria-autocomplete': 'list' });
  const chips = h('div', { class: 'gsx-scope', role: 'group', 'aria-label': 'Search in' });
  const res = h('div', { class: 'gsx-res', id: 'gsx-res', role: 'listbox', 'aria-label': 'Results' });
  const live = h('p', { class: 'sr', 'aria-live': 'polite' });
  const howBtn = h('button', { type: 'button', class: 'btn link', onclick: () => howItWorks() }, 'How search works');
  const panel = h('div', { class: 'gsx', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search everything' },
    h('div', { class: 'gsx-in' }, icon('search'), input, h('kbd', {}, 'Esc')),
    h('div', { class: 'gsx-scopes' }, h('span', { class: 'gsx-lbl' }, 'Search in'), chips), res, live,
    h('div', { class: 'gsx-foot' }, h('span', {}, h('kbd', {}, '↑'), h('kbd', {}, '↓'), ' move'), h('span', {}, h('kbd', {}, 'Enter'), ' open'), h('span', {}, h('kbd', {}, 'Ctrl'), '+', h('kbd', {}, 'Enter'), ' new tab'), h('span', {}, h('kbd', {}, 'Tab'), ' scope'), h('span', { class: 'grow' }), howBtn));
  const scrim = h('div', { class: 'gsx-scrim', onclick: (e) => { if (e.target === scrim) close(); } }, panel);
  const pages = pageEntries(catalog, isAdmin);
  let seq = 0, timer = null, sel = 0;

  const paintChips = () => {
    chips.replaceChildren(...SCOPES.map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(k === scope), onclick: () => { scope = k; paintChips(); run(); input.focus(); } },
      k === 'all' ? icon('globe') : plateOf(registry?.get(SCOPE_APP[k]) ?? { id: SCOPE_APP[k] }, 16), l)));
    input.placeholder = scope === 'all' ? 'Search everything you can open' : `Search ${SCOPES.find(([k]) => k === scope)[1]}`;
  };
  const rows = () => [...res.querySelectorAll('a.gsx-row')];
  const select = (i) => { const r = rows(); if (!r.length) return; sel = (i + r.length) % r.length; r.forEach((x, n) => x.setAttribute('aria-selected', String(n === sel))); r[sel].scrollIntoView({ block: 'nearest' }); };
  const row = (r, q) => {
    const href = r.href ?? resultHref(r);
    const a = h('a', { class: 'gsx-row', role: 'option', href, 'aria-selected': 'false', onclick: () => { remember({ ...r, href }); close(); } },
      plateOf(registry?.get(r.appKey ?? APP_OF[r.app] ?? r.app) ?? { id: r.appKey ?? APP_OF[r.app] ?? r.app }, 28),
      h('span', { class: 'gsx-main' }, h('b', {}, ...mark(r.title, q)), r.subtitle ? h('small', {}, r.subtitle) : null),
      r.archived ? h('span', { class: 'pill' }, icon('archive'), 'Archived') : null);
    return a;
  };
  const group = (key, list, q) => (list.length ? [h('h3', { class: 'gsx-h' }, LABEL[key] ?? key), ...list.map((r) => row(r, q))] : []);
  const quick = () => {
    const usable = new Set(catalog.filter((a) => a.state === 'available').map((a) => a.app_key));
    const qa = [['projects', 'New project', '#/projects/all'], ['projects', 'New task', '#/projects/mine'], ['drive', 'New document', hrefFor.app('drive')], ['clients', 'New client', '#/clients']].filter(([k]) => usable.has(k));
    const back = recent();
    res.replaceChildren(h('h3', { class: 'gsx-h' }, 'Quick actions'), ...qa.map(([k, t, href]) => row({ appKey: k, title: t, href }, '')),
      ...(back.length ? [h('h3', { class: 'gsx-h' }, 'Jump back in'), ...back.map((r) => row(r, ''))] : []),
      h('p', { class: 'gsx-hint' }, 'Type to search apps, pages, projects, tasks, clients, files, Office records, plans and people. Try “@me overdue” or “in:clients”.'));
    select(0);
  };
  async function run() {
    clearTimeout(timer);
    const p = parseQuery(input.value, scope);
    if (p.scope !== scope) { scope = p.scope; paintChips(); }
    if (!p.q && !p.me && !p.overdue) return quick();
    const mine = ++seq;
    const nav = p.q && (scope === 'all' || scope === 'office') ? pages.filter((x) => matches(x.title, p.q) || matches(x.subtitle, p.q)).slice(0, scope === 'all' ? 4 : 12) : [];
    res.replaceChildren(...group('pages', nav, p.q), h('p', { class: 'gsx-hint', role: 'status' }, 'Searching…'));
    timer = setTimeout(async () => {
      const r = scope === 'funnels' ? { ok: true, data: [] } : await api.call('search.query', { q: p.q, scope, archived: p.archived, me: p.me, overdue: p.overdue });
      if (mine !== seq || !panel.isConnected) return;     // a newer search replaced this one
      const data = r.ok ? r.data : null; const by = {};
      for (const x of data ?? []) (by[x.app] = by[x.app] ?? []).push(x);
      const cap = scope === 'all' ? 4 : 12;
      const parts = [...group('pages', nav, p.q), ...Object.entries(by).flatMap(([k, list]) => group(k, list.slice(0, cap), p.q))];
      if (data == null) parts.push(h('p', { class: 'gsx-hint' }, 'Search couldn’t reach the server. Check your connection and try again.'));
      else if (!parts.length) parts.push(h('div', { class: 'gsx-empty' }, h('b', {}, `No matches for “${p.q || input.value}”`), h('span', {}, scope === 'all' ? 'Try fewer words, or check the spelling.' : 'Try Everything instead of one app.')));
      if (scope === 'funnels') parts.push(h('p', { class: 'gsx-hint' }, 'Funnel Mapper search arrives with Funnel Mapper’s ecosystem update.'));
      parts.push(h('div', { class: 'gsx-ai', 'aria-disabled': 'true' }, icon('agents'), h('span', {}, p.q ? `Ask the assistant about “${p.q}”` : 'Ask the assistant'), h('span', { class: 'pill' }, 'Later, with approval')));
      res.replaceChildren(...parts); select(0);
      live.textContent = `${rows().length} results`;
    }, 140);
  }
  function close() { if (!open) return; open = null; clearTimeout(timer); seq++; scrim.remove(); document.removeEventListener('keydown', onKey, true); if (prev?.isConnected && !panel.contains(prev)) prev.focus?.(); }
  function onKey(e) {
    if (document.querySelector('.ovl')) return;            // a dialog opened from search (How search works) handles its own keys
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); select(sel + (e.key === 'ArrowDown' ? 1 : -1)); return; }
    if (e.key === 'Enter' && document.activeElement === input) {
      const a = rows()[sel]; if (!a) return; e.preventDefault();
      if (e.ctrlKey || e.metaKey) window.open(a.href, '_blank', 'noopener'); else a.click();
      return;
    }
    if (e.key === 'Tab' && document.activeElement === input) {
      e.preventDefault(); const i = SCOPES.findIndex(([k]) => k === scope); scope = SCOPES[(i + (e.shiftKey ? -1 : 1) + SCOPES.length) % SCOPES.length][0]; paintChips(); run();
    }
  }
  function howItWorks() {
    dialog({ title: 'How search works', body: [
      h('p', {}, 'Search looks through everything you can open in this organization: apps and pages, projects and tasks, clients, Library and Personal files, Office records, plans and people. You only ever see what you’re allowed to open, and the other organization is never included.'),
      h('p', {}, 'Client files and the client’s own strategy work are never shown in search. Open the client to see them.'),
      h('ul', {}, h('li', {}, h('b', {}, 'in:clients'), ', in:projects, in:files, in:planner, in:funnels: search one app'), h('li', {}, h('b', {}, '@me'), ': tasks assigned to you'), h('li', {}, h('b', {}, 'overdue'), ': tasks past their due date'), h('li', {}, h('b', {}, 'is:archived'), ': include archived items (they also appear once you type three letters)')),
    ], actions: [{ label: 'Got it', cls: 'primary', focus: true }] });
  }
  input.addEventListener('input', run);
  document.addEventListener('keydown', onKey, true);
  document.body.append(scrim); paintChips(); run();
  open = { focus: () => input.focus() };
  setTimeout(() => input.focus(), 0);
}
