// Projects inside the ecosystem shell (apps/web/js/modules/projects-v2.js loads /projects/embed.js and calls mount()), like
// Planner: the shell keeps its own header, organization switcher, profile menu and theme; Projects renders in a shadow root so
// the shell's class names and Projects' never style each other, while the shared design tokens and fonts still reach it.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { setHost, type Host } from './api/client.ts';
import { clearCache } from './api/store.ts';
import { setDomRoot } from './lib/dom.ts';
import cssHref from './styles/projects.css?url';

export type { Host };

/** Renders Projects for one organization into `el`. Resolves to an unmount function; the shell remounts on an organization switch. */
export async function mount(el: HTMLElement, host: Host): Promise<() => void> {
  const shadow = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = cssHref;   // same-origin file: allowed by the page policy (style-src 'self')
  const loaded = new Promise<void>((resolve) => { link.onload = () => resolve(); link.onerror = () => resolve(); setTimeout(resolve, 5000); });
  const box = document.createElement('div'); box.className = 'pm-host';
  shadow.replaceChildren(link, box);
  await loaded;
  // follow the shell: its light/dark theme, the active organization's accent, and where its header ends
  const html = document.documentElement;
  let layerRef: HTMLElement | null = null;
  const sync = () => {
    const dark = html.dataset.theme === 'dark' || (html.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    box.dataset.theme = dark ? 'dark' : 'light'; if (layerRef) layerRef.dataset.theme = box.dataset.theme;
    box.dataset.org = host.orgs.find((o) => o.org_id === host.org)?.slug === 'aurj' ? 'aurj' : 'l2f'; if (layerRef) layerRef.dataset.org = box.dataset.org;
    const top = `${Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY))}px`;
    box.style.setProperty('--pm-shell-top', top); layerRef?.style.setProperty('--pm-shell-top', top);
  };
  sync();
  const mo = new MutationObserver(sync); mo.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
  const mq = matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', sync);
  window.addEventListener('resize', sync);
  const ro = new ResizeObserver(sync); if (el.parentElement) ro.observe(el.parentElement);   // the shell's header or a banner changing height
  const layer = document.createElement('div'); layer.className = 'pm-host pm-layer';   // dialogs, menus, toasts
  box.after(layer); layerRef = layer; sync();
  setDomRoot(shadow, layer);
  clearCache();
  setHost(host);
  const root = createRoot(box);
  root.render(<StrictMode><App /></StrictMode>);
  return () => {
    ro.disconnect(); mo.disconnect(); mq.removeEventListener('change', sync); window.removeEventListener('resize', sync);
    root.unmount(); setDomRoot(null, null); setHost(null); clearCache(); shadow.replaceChildren();
  };
}
