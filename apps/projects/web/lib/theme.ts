import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { lsGet, lsSet } from './util.ts';

export type Theme = 'light' | 'dark';
const KEY = 'pm.theme';

function systemTheme(): Theme { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
function stored(): Theme | null { const t = lsGet(KEY); return t === 'light' || t === 'dark' ? t : null; }
export function effectiveTheme(): Theme { return stored() ?? systemTheme(); }

// One shared store, so the sidebar button, the Shift+D shortcut and the palette action always agree.
const listeners = new Set<() => void>();
const emit = () => { for (const l of [...listeners]) l(); };
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

export function toggleTheme(): void {
  const next: Theme = effectiveTheme() === 'dark' ? 'light' : 'dark';
  lsSet(KEY, next);
  document.documentElement.setAttribute('data-theme', next);
  emit();
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, effectiveTheme);
  useEffect(() => {
    const m = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => { if (!stored()) emit(); };
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  const toggle = useCallback(() => toggleTheme(), []);
  return { theme, toggle };
}
