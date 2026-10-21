// Hash routes (no server rewrite rules needed on static hosting) and the mapping between routes and the page registry (app_pages).
export const FUNNEL_TYPES = [
  { key: 'avatars', label: 'Avatars', obj: 'avatar', one: 'Avatar', page: 'funnels.avatars', record: 'funnels.avatar' },
  { key: 'offers', label: 'Offers & products', obj: 'offer', one: 'Offer', page: 'funnels.offers', record: 'funnels.offer' },
  { key: 'stories', label: 'Story bank', obj: 'story', one: 'Story', page: 'funnels.stories', record: 'funnels.story' },
  { key: 'brand_kits', label: 'Brand kits', obj: 'brandkit', one: 'Brand kit', page: 'funnels.brand_kits', record: 'funnels.brand_kit' },
];
const byKey = Object.fromEntries(FUNNEL_TYPES.map((t) => [t.key, t]));

// '#/office/funnels/avatars/abc?x=1' -> { name, params, query }
export function parseRoute(hash) {
  const [path, qs = ''] = String(hash || '').replace(/^#/, '').split('?');
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
  const query = Object.fromEntries(new URLSearchParams(qs));
  const r = (name, params = {}) => ({ name, params, query });
  if (!seg.length) return r('home');
  const [a, b, c, d] = seg;
  if (['signin', 'signup', 'check-email', 'forgot', 'reset', 'invite', 'no-org', 'expired', 'launcher'].includes(a) && seg.length === 1) return r(a);
  if (a === 'app' && b && seg.length === 2) return r('app', { app: b });
  if (a === 'office' && seg.length === 1) return r('office');
  if (a === 'office' && b === 'funnels') {
    if (seg.length === 2) return r('funnels');
    if (byKey[c] && seg.length === 3) return r('funnel-list', { type: c });
    if (byKey[c] && d === 'new' && seg.length === 4) return r('funnel-record', { type: c, id: 'new' });
    if (byKey[c] && d && seg.length === 4) return r('funnel-record', { type: c, id: d });
  }
  return r('not-found');
}
export const hrefFor = {
  launcher: () => '#/launcher', office: () => '#/office', funnels: () => '#/office/funnels',
  list: (type) => `#/office/funnels/${type}`, record: (type, id) => `#/office/funnels/${type}/${id}`, app: (k) => `#/app/${k}`,
};
export const AUTH_ROUTES = new Set(['signin', 'signup', 'check-email', 'forgot', 'reset', 'invite', 'expired']);

// The page registry key for a route (what resolve_org_switch is asked about).
export function pageKeyFor(route) {
  switch (route.name) {
    case 'office': return { app: 'office', page: 'home' };
    case 'funnels': return { app: 'office', page: 'funnels' };
    case 'funnel-list': return { app: 'office', page: byKey[route.params.type].page };
    case 'funnel-record': return { app: 'office', page: route.params.id === 'new' ? byKey[route.params.type].page : byKey[route.params.type].record };
    case 'app': return { app: route.params.app, page: null };
    default: return { app: 'office', page: 'home' };
  }
}
// Where to land for a registry (app, page) after an organization switch. Never the Launcher.
export function routeForPage(app, page) {
  if (app !== 'office') return hrefFor.app(app);
  if (!page || page === 'home') return hrefFor.office();
  if (page === 'funnels') return hrefFor.funnels();
  const t = FUNNEL_TYPES.find((x) => x.page === page || x.record === page);
  if (t) return hrefFor.list(t.key);        // record pages are never carried across organizations: the list is the landing
  return hrefFor.office();
}

// No active organization yet (first sign-in): start where the person has the most authority, then by name.
const RANK = { owner: 0, admin: 1, editor: 2, viewer: 3 };
export const defaultOrg = (list) => [...list].sort((a, b) => (RANK[a.role] ?? 9) - (RANK[b.role] ?? 9) || a.name.localeCompare(b.name))[0];
