// Inside the Layer2Funnels ecosystem: the signed-in person comes from the shell's session, every call goes through /api.
import { useMemo } from 'react';
import { PlannerApp } from '../PlannerApp.tsx';
import { createApiBackend } from '../api/apiBackend.ts';

export default function EcosystemHost() {
  const backend = useMemo(() => createApiBackend(), []);
  const me = backend.me();
  if (!me) {
    return <main style={{ padding: 32, fontFamily: 'system-ui' }}><h1>Sign in first</h1><p>Open Planner from the Layer2Funnels launcher after signing in. <a href="/">Go to sign in</a></p></main>;
  }
  return <PlannerApp backend={backend} me={me} />;
}