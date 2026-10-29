// Standalone host with the local demo engine: synthetic people in two organizations, real migrations and policies.
// Switching person here is the demo equivalent of signing in as someone else; the database decides what they see.
import { useEffect, useMemo, useState } from 'react';
import { openLocalEngine, type LocalEngine } from '../api/localEngine.ts';
import { DEMO_IDS, DEMO_USERS } from '../api/demoSeed.ts';
import { PlannerApp } from '../PlannerApp.tsx';
import { ErrorState, PageLoading } from '../ui/primitives.tsx';

const KEY = 'planner.demo.user';
const readUser = () => { try { const v = window.localStorage.getItem(KEY); return DEMO_USERS.find((u) => u.id === v)?.id ?? DEMO_IDS.OLIVE; } catch { return DEMO_IDS.OLIVE; } };

export default function DemoHost() {
  const [engine, setEngine] = useState<LocalEngine | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>(readUser);

  useEffect(() => { openLocalEngine().then(setEngine).catch((e) => setFailed(String(e?.message ?? e))); }, []);
  const backend = useMemo(() => (engine ? engine.backendFor(userId) : null), [engine, userId]);
  const me = DEMO_USERS.find((u) => u.id === userId)!;

  if (failed) return <div style={{ padding: 32 }}><ErrorState title="The local demo could not start" onRetry={() => window.location.reload()}>{failed}</ErrorState></div>;
  if (!engine || !backend) return <div style={{ padding: 32 }}><PageLoading label="Starting the local demo database" /></div>;

  const banner = (
    <div className="dev-banner" role="region" aria-label="Local demo controls">
      <strong>Local demo</strong><span>Synthetic data in your browser only. Nothing is sent anywhere.</span>
      <label>Signed in as&nbsp;
        <select aria-label="Signed in as" value={userId} onChange={(e) => { try { window.localStorage.setItem(KEY, e.target.value); } catch { /* not remembered */ } setUserId(e.target.value); }}>
          {DEMO_USERS.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.note}</option>)}
        </select>
      </label>
      <button type="button" className="link-btn" onClick={async () => { if (window.confirm('Reset all demo data to the starting set?')) { await engine.reset(); window.location.reload(); } }}>Reset demo data</button>
    </div>
  );
  return <PlannerApp key={userId} backend={backend} me={{ id: me.id, name: me.name }} banner={banner} />;
}
