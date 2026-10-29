import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';

// The real Planner lives inside the ecosystem shell at /#/planner/... (src/embed.tsx), with the shell's header, organization switcher,
// sign-in and theme. This page only keeps the local demo (?demo: synthetic data in the browser); any other visit, including an old
// /planner/#/planner/map?plan=... link, is sent to the same address inside the shell, which asks for sign-in when needed.
const demo = new URLSearchParams(window.location.search).has('demo');
if (!demo) {
  const hash = /^#\/planner(\/|$|\?)/.test(window.location.hash) ? window.location.hash : '#/planner';
  window.location.replace(`/${hash}`);
} else {
  // the demo database engine (about 1 MB of code plus 13 MB of WebAssembly) is only ever downloaded here
  const DemoHost = lazy(() => import('./host/DemoHost.tsx'));
  createRoot(document.getElementById('root')!).render(
    <StrictMode><Suspense fallback={<p style={{ padding: 24, fontFamily: 'system-ui' }}>Loading the Planner demo…</p>}><DemoHost /></Suspense></StrictMode>);
}
