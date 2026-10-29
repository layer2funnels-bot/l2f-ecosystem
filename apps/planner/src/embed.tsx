// Planner inside the ecosystem shell (apps/web/js/modules/planner.js loads /planner/embed.js and calls mount()).
// The shell keeps its own header, organization switcher, profile menu and theme; Planner renders in a shadow root so the
// shell's class names and Planner's never style each other, while the shared design tokens (packages/ui/tokens.css on <html>)
// and the self-hosted fonts still reach it.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PlannerApp } from './PlannerApp.tsx';
import { createApiBackend, type Host } from './api/apiBackend.ts';
import cssHref from './styles/planner.css?url';

export type { Host };

/** Renders Planner for one organization into `el`. Resolves to an unmount function; the shell remounts on an organization switch. */
export async function mount(el: HTMLElement, host: Host): Promise<() => void> {
  const shadow = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = cssHref;           // a same-origin file: the page policy (style-src 'self') allows it, inline styles it would not
  const loaded = new Promise<void>((resolve) => { link.onload = () => resolve(); link.onerror = () => resolve(); setTimeout(resolve, 5000); });
  const box = document.createElement('div'); box.className = 'planner-host';
  shadow.replaceChildren(link, box);
  await loaded;                                            // no flash of unstyled Planner
  const root = createRoot(box);
  const backend = createApiBackend({ host });
  root.render(<StrictMode><PlannerApp backend={backend} me={host.me} embedded /></StrictMode>);
  return () => { root.unmount(); shadow.replaceChildren(); };
}
