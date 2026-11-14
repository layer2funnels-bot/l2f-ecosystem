// Light/dark follows the system unless the person chose; the organization sets the brand (data-org). Both live on <html>.
export const THEME_KEY = 'l2f.theme';
export function resolveTheme(pref, prefersDark) { return pref === 'light' || pref === 'dark' ? pref : prefersDark ? 'dark' : 'light'; }
export function orgKey(org) { return org && org.slug === 'aurj' ? 'aurj' : 'l2f'; }
function read(store) { try { return store.getItem(THEME_KEY); } catch { return null; } }
// V8 Appearance (02 §7): "Reduce motion" and "Compact density" are per person and per device, like the theme.
export const MOTION_KEY = 'l2f.motion'; export const DENSITY_KEY = 'l2f.density';
const readKey = (store, k) => { try { return store.getItem(k); } catch { return null; } };
export function createTheme({ root = document.documentElement, store = localStorage, media = (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null) } = {}) {
  const apply = () => {
    root.dataset.theme = resolveTheme(read(store), !!media?.matches);
    if (readKey(store, MOTION_KEY) === 'reduce') root.dataset.motion = 'reduce'; else delete root.dataset.motion;
    if (readKey(store, DENSITY_KEY) === 'compact') root.dataset.density = 'compact'; else delete root.dataset.density;
  };
  const flag = (k, v) => { try { v ? store.setItem(k, v) : store.removeItem(k); } catch { /* private mode */ } apply(); };
  media?.addEventListener?.('change', apply);
  return {
    apply,
    pref: () => { const p = read(store); return p === 'light' || p === 'dark' ? p : 'system'; },
    set(p) { try { p === 'system' ? store.removeItem(THEME_KEY) : store.setItem(THEME_KEY, p); } catch { /* private mode: still applies for this page */ } apply(); },
    setOrg(org) { root.dataset.org = orgKey(org); },
    reduceMotion: () => readKey(store, MOTION_KEY) === 'reduce',
    setReduceMotion(on) { flag(MOTION_KEY, on ? 'reduce' : null); },
    compact: () => readKey(store, DENSITY_KEY) === 'compact',
    setCompact(on) { flag(DENSITY_KEY, on ? 'compact' : null); },
  };
}
