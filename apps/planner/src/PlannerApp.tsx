// The component Office mounts (and the standalone page runs). It needs only a backend and the signed-in person.
import { useMemo, type ReactNode } from 'react';
import type { Identity, PlannerBackend } from './api/types.ts';
import { PlannerClient } from './api/client.ts';
import { PlannerProvider } from './state/PlannerContext.tsx';
import { DialogsProvider } from './components/Dialogs.tsx';
import { Shell } from './shell/Shell.tsx';
import './styles/base.css';
import './styles/pages.css';

export function PlannerApp({ backend, me, banner, embedded = false }: { backend: PlannerBackend; me: Identity; banner?: ReactNode; embedded?: boolean }) {
  const client = useMemo(() => new PlannerClient(backend), [backend]);
  return (
    <PlannerProvider client={client} me={me}>
      <DialogsProvider><Shell banner={banner} embedded={embedded} /></DialogsProvider>
    </PlannerProvider>
  );
}

export { PlannerClient } from './api/client.ts';
export { createSupabaseBackend } from './api/supabaseAdapter.ts';
export type { PlannerBackend, Identity } from './api/types.ts';
