import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';

// Signed in to the ecosystem (the shell stored a session) -> the real Planner through the shared API.
// Otherwise, or with ?demo, the local demo with synthetic data in the browser.
// Both are loaded on demand: a signed-in person never downloads the demo database engine and its migrations (about 1 MB of code
// plus 13 MB of WebAssembly), which was the main cause of the slow first load.
const DemoHost = lazy(() => import('./host/DemoHost.tsx'));
const EcosystemHost = lazy(() => import('./host/EcosystemHost.tsx'));
const demo = new URLSearchParams(window.location.search).has('demo');
let signedIn = false; try { signedIn = !!JSON.parse(window.localStorage.getItem('l2f.session.v1') || 'null')?.access; } catch { /* no storage */ }
createRoot(document.getElementById('root')!).render(
  <StrictMode><Suspense fallback={<p style={{ padding: 24, fontFamily: 'system-ui' }}>Loading Planner…</p>}>{signedIn && !demo ? <EcosystemHost /> : <DemoHost />}</Suspense></StrictMode>);