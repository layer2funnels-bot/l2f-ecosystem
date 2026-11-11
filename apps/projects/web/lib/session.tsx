import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Org, Person } from '../../shared/api.ts';
import { ApiError, call, getOrgId } from '../api/client.ts';
import { clearCache } from '../api/store.ts';
import { Button } from '../ui/Button.tsx';
import { EmptyState, ErrorState } from '../ui/Feedback.tsx';
import { LogoMark } from '../ui/icons.tsx';

export interface Session {
  user: Person;
  orgs: Org[];
  org: Org;
  switchOrg: (id: string) => void;
  signOut: () => void;
  /** owner / admin / editor may create projects. */
  canCreate: boolean;
  /** owner / admin may purge. */
  isAdmin: boolean;
}

const Ctx = createContext<Session | null>(null);
export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}

type Phase = 'loading' | 'ready' | 'error' | 'noaccess';

/** Inside the ecosystem: sign-in, sign-out and the organization switcher belong to the shell. Projects only asks who the
 *  person is in the shell's active organization (pm.session.me); the shell remounts Projects on an organization switch. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [me, setMe] = useState<{ user: Person; orgs: Org[] } | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const orgId = getOrgId();

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const res = await call('session.me', {});
      clearCache();
      setMe(res);
      setPhase(res.orgs.some((o) => o.id === orgId) ? 'ready' : 'noaccess');
    } catch (e) {
      const ae = e instanceof ApiError ? e : new ApiError('internal', 'Unexpected error');
      if (ae.code === 'not_found' || ae.code === 'unauthenticated') { setPhase('noaccess'); return; }
      setErr(ae); setPhase('error');
    }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  const signOut = useCallback(() => { window.location.hash = '#/'; }, []);
  const switchOrg = useCallback((_id: string) => { /* the shell's organization switcher does this */ }, []);

  const value = useMemo<Session | null>(() => {
    if (!me || !orgId) return null;
    const org = me.orgs.find((o) => o.id === orgId);
    if (!org) return null;
    return {
      user: me.user, orgs: me.orgs, org, switchOrg, signOut,
      canCreate: org.role !== 'viewer',
      isAdmin: org.role === 'owner' || org.role === 'admin',
    };
  }, [me, orgId, switchOrg, signOut]);

  if (phase === 'loading') {
    return <div className="pm-splash" role="status" aria-label="Loading"><LogoMark size={36} /><div className="pm-splash__bar" /></div>;
  }
  if (phase === 'error') {
    return (
      <div className="pm-fullpage">
        <ErrorState title="We couldn't load Projects" message={err?.message} onRetry={() => void load()} />
      </div>
    );
  }
  if (!value) {
    return (
      <div className="pm-fullpage">
        <EmptyState icon="building" title="Projects isn't switched on for you here" text="Ask an owner or admin of this organization to give you the Projects app." action={<Button onClick={signOut} icon="arrowRight">Back to the launcher</Button>} />
      </div>
    );
  }
  return <Ctx.Provider value={value}><Fragment key={value.org.id}>{children}</Fragment></Ctx.Provider>;
}
