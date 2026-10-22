// Light/dark follows the system unless the person chose; the organization sets the brand (data-org). Both live on <html>.
export const THEME_KEY = 'l2f.theme';
export function resolveTheme(pref, prefersDark) { return pref === 'light' || pref === 'dark' ? pref : prefersDark ? 'dark' : 'light'; }
export function orgKey(org) { return org && org.slug === 'aurj' ? 'aurj' : 'l2f'; }
function read(store) { try { return store.getItem(THEME_KEY); } catch { return null; } }
export function createTheme({ root = document.documentElement, store = localStorage, media = (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null) } = {}) {
  const apply = () => { root.dataset.theme = resolveTheme(read(store), !!media?.matches); };
  media?.addEventListener?.('change', apply);
  return {
    apply,
    pref: () => { const p = read(store); return p === 'light' || p === 'dark' ? p : 'system'; },
    set(p) { try { p === 'system' ? store.removeItem(THEME_KEY) : store.setItem(THEME_KEY, p); } catch { /* private mode: still applies for this page */ } apply(); },
    setOrg(org) { root.dataset.org = orgKey(org); },
  };
}
